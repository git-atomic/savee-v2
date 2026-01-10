"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { JobTextarea } from "./JobTextarea";
import { JobConfigPanel } from "./JobConfigPanel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  parseSaveeUrl,
  detectBulkUrls,
  type SourceType,
} from "@/lib/url-utils";

export function AddJobForm() {
  const [input, setInput] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("user");
  const [maxItems, setMaxItems] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

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
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: validation.error,
      });
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

      const data = await response.json();

      if (!response.ok) {
        // Handle HTTP errors
        const errorMessage =
          data.error ||
          data.message ||
          `Server error: ${response.status} ${response.statusText}`;

        // Handle capacity limit errors
        if (response.status === 429 && data.details) {
          toast({
            variant: "destructive",
            title: "Capacity Limit Reached",
            description: errorMessage,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Failed to Start Job",
            description: errorMessage,
          });
        }
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

        toast({
          title: "Job Started",
          description: successMessage,
        });

        // Reset form
        setInput("");
        setMaxItems(0);
        setSourceType("user");
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Start Job",
          description: data.error || "An unexpected error occurred",
        });
      }
    } catch (error) {
      // Network or parsing errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Network error. Please check your connection and try again.";

      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
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
        {/* Left Panel - NOT scrollable */}
        <div className="flex flex-col flex-1 border-r border-border overflow-hidden bg-background min-w-0">
          <div className="flex-1 flex flex-col p-6 gap-6">
            <div className="flex-1 flex flex-col min-h-0">
              <JobTextarea
                value={input}
                onChange={setInput}
                className="flex-1"
                disabled={isSubmitting}
              />
            </div>
            <div className="flex justify-center shrink-0">
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
