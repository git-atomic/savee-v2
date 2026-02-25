"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { JobTextarea } from "./JobTextarea";
import { JobConfigPanel } from "./JobConfigPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  parseSaveeUrl,
  detectBulkUrls,
  type SourceType,
} from "@/lib/url-utils";

interface StartJobErrorPayload {
  success?: boolean;
  code?: string;
  reason?: string;
  error?: string;
  message?: string;
  hint?: string;
  details?: any;
}

interface ToastCopy {
  title: string;
  description?: string;
}

function getCapacityDescription(
  details: any,
  fallback: string
): string {
  const reasons: string[] = [];
  const dbNear = Boolean(details?.db?.nearLimit);
  const r2Near = Boolean(details?.r2?.nearLimit);
  const primaryR2Near = Boolean(details?.r2?.primaryNearLimit);
  const canFailover = Boolean(details?.r2?.canFailoverToSecondary);
  const secondaryUnavailableReason = details?.r2?.secondaryUnavailableReason;

  if (dbNear) reasons.push("DB is near soft limit");
  if (r2Near || primaryR2Near) {
    if (canFailover) {
      reasons.push("Primary R2 is near soft limit, but secondary failover is available");
    } else {
      reasons.push("R2 is near soft limit and secondary failover is unavailable");
      if (secondaryUnavailableReason) {
        reasons.push(`Secondary status: ${secondaryUnavailableReason}`);
      }
    }
  }

  return reasons.length > 0 ? reasons.join(" | ") : fallback;
}

function withHint(message?: string, hint?: string): string | undefined {
  const base = (message || "").trim();
  const extra = (hint || "").trim();
  if (!base && !extra) return undefined;
  if (!base) return extra;
  if (!extra) return base;
  return `${base} ${extra}`;
}

function getErrorToast(data: StartJobErrorPayload, status: number): ToastCopy {
  const message =
    data.error ||
    data.message ||
    `Server error: ${status}`;

  if (status === 429 || data.code === "capacity_limit") {
    const description = data.details
      ? getCapacityDescription(data.details, data.message || message)
      : data.message || message;
    return {
      title: "Capacity Limit Reached",
      description: withHint(description, data.hint),
    };
  }

  if (data.code === "github_dispatch_failed") {
    if (data.reason === "billing_blocked") {
      return {
        title: "GitHub Actions Billing Blocked",
        description: withHint(
          "GitHub refused to start the workflow because billing/spending is blocked.",
          data.hint
        ),
      };
    }
    return {
      title: "GitHub Monitor Dispatch Failed",
      description: withHint(message, data.hint),
    };
  }

  if (status === 409 || data.code === "run_already_active") {
    return {
      title: "Run Already Active",
      description: data.message || message,
    };
  }

  if (data.code === "database_error") {
    return {
      title: "Database Error",
      description: withHint(message, data.hint),
    };
  }

  if (data.code === "r2_error") {
    return {
      title: "R2 Storage Error",
      description: withHint(message, data.hint),
    };
  }

  if (status === 400 || data.code === "invalid_input" || data.code === "invalid_url") {
    return {
      title: "Invalid Request",
      description: data.message || message,
    };
  }

  return {
    title: "Failed to Start Job",
    description: withHint(message, data.hint),
  };
}

export function AddJobForm() {
  const [input, setInput] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("user");
  const [maxItems, setMaxItems] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detect bulk URLs and single URL type
  const detection = useMemo(() => {
    const bulk = detectBulkUrls(input);

    if (bulk.isBulk) {
      return {
        detectedType: "blocks" as SourceType,
        isBulk: true,
        urlCount: bulk.count,
      };
    }

    // Try to parse as single URL
    const parsed = parseSaveeUrl(input.trim());
    if (parsed.isValid) {
      return {
        detectedType: parsed.sourceType,
        isBulk: false,
        urlCount: 0,
      };
    }

    return {
      detectedType: "user" as SourceType,
      isBulk: false,
      urlCount: 0,
    };
  }, [input]);

  // Auto-update source type when detection changes
  React.useEffect(() => {
    if (input.trim()) {
      setSourceType(detection.detectedType);
    }
  }, [detection.detectedType, input]);

  const validateInput = (): { isValid: boolean; error?: string } => {
    const trimmed = input.trim();

    if (!trimmed) {
      return {
        isValid: false,
        error: "Please enter a savee.it URL or paste item URLs",
      };
    }

    // Check if it's bulk URLs
    const bulk = detectBulkUrls(trimmed);
    if (bulk.isBulk && bulk.count === 0) {
      return {
        isValid: false,
        error: "No valid item URLs detected. Please paste URLs containing /i/",
      };
    }

    // Check if it's a single URL
    if (!bulk.isBulk) {
      const parsed = parseSaveeUrl(trimmed);
      if (!parsed.isValid) {
        return {
          isValid: false,
          error: "Invalid savee.it URL. Please enter a valid URL",
        };
      }
    }

    return { isValid: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const validation = validateInput();
    if (!validation.isValid) {
      toast.error(validation.error || "Validation Error");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/engine/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: input.trim(),
          maxItems: maxItems || 0,
        }),
      });

      let data: StartJobErrorPayload = {};
      try {
        data = (await response.json()) as StartJobErrorPayload;
      } catch {}

      if (!response.ok) {
        const toastCopy = getErrorToast(data, response.status);
        toast.error(toastCopy.title, {
          description: toastCopy.description,
        });
        return;
      }

      if (data.success) {
        // Success message
        const successMessage =
          data.message ||
          (detection.isBulk
            ? `Job started successfully for ${detection.urlCount} items`
            : `Job started successfully for ${detection.detectedType} content${
                data.username ? ` from user ${data.username}` : ""
              }`);

        toast.success("Job Started", {
          description: successMessage,
        });

        // Reset form
        setInput("");
        setMaxItems(0);
        setSourceType("user");
      } else {
        toast.error(data.error || "Failed to Start Job");
      }
    } catch (error) {
      // Network or parsing errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Network error. Please check your connection and try again.";

      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = useMemo(() => {
    const validation = validateInput();
    return validation.isValid;
  }, [input]);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full w-full">
      <div className="flex flex-1 overflow-hidden border-t border-border">
        {/* Left Panel */}
        <div className="flex flex-col flex-1 border-r border-border overflow-hidden bg-background min-w-0 min-h-0">
          <div className="flex-1 min-h-0 p-6 pb-3">
            <JobTextarea
              value={input}
              onChange={setInput}
              className="h-full min-h-0 max-h-full overflow-y-auto"
              disabled={isSubmitting}
            />
          </div>
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-border/60 bg-background p-6 pt-4">
            <div className="flex justify-center">
              <Button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                variant="default"
                size="lg"
                className="min-w-[140px] font-medium"
              >
                {isSubmitting ? "Starting..." : "Start Job"}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Panel - Fixed width */}
        <div className="w-[320px] shrink-0 overflow-hidden">
          <JobConfigPanel
            sourceType={sourceType}
            onSourceTypeChange={setSourceType}
            maxItems={maxItems}
            onMaxItemsChange={setMaxItems}
            urlCount={detection.urlCount}
            showUrlCount={detection.isBulk}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </form>
  );
}
