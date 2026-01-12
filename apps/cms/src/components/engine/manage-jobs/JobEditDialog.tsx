"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { SourceType } from "@/lib/url-utils";

interface JobEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  currentUrl: string;
  currentMaxItems: number;
  currentSourceType: SourceType;
  onSuccess: () => void;
}

export function JobEditDialog({
  open,
  onOpenChange,
  jobId,
  currentUrl,
  currentMaxItems,
  currentSourceType,
  onSuccess,
}: JobEditDialogProps) {
  const [url, setUrl] = React.useState(currentUrl);
  const [urlTextarea, setUrlTextarea] = React.useState("");
  const [maxItems, setMaxItems] = React.useState(String(currentMaxItems || ""));
  const [sourceType, setSourceType] =
    React.useState<SourceType>(currentSourceType);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Helper to parse URLs for display in textarea
  const parseUrlsForTextarea = (urlString: string): string => {
    if (!urlString) return "";
    // If it's a comma-separated list (from API), split into lines
    const urls = urlString
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u);
    return urls.join("\n");
  };

  // Helper to format URLs for API submission
  const formatUrlsForApi = (urlString: string): string => {
    if (!urlString) return "";
    // Split by newlines or commas, filter empty lines, and join with commas
    const urls = urlString
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u);
    return urls.join(",");
  };

  React.useEffect(() => {
    if (open) {
      setUrl(currentUrl);
      // For blocks type, parse URLs for textarea display (one per line)
      if (currentSourceType === "blocks") {
        setUrlTextarea(parseUrlsForTextarea(currentUrl));
      } else {
        setUrlTextarea(currentUrl);
      }
      setMaxItems(String(currentMaxItems || ""));
      setSourceType(currentSourceType);
    }
  }, [open, currentUrl, currentMaxItems, currentSourceType]);

  // Update urlTextarea when sourceType changes (user manually changes type)
  const prevSourceTypeRef = React.useRef(currentSourceType);
  React.useEffect(() => {
    if (open && sourceType !== prevSourceTypeRef.current) {
      if (sourceType === "blocks") {
        // If switching to blocks, parse current URL
        setUrlTextarea(parseUrlsForTextarea(currentUrl));
      } else {
        // If switching from blocks, use the first URL or current URL
        const currentValue = urlTextarea || currentUrl;
        const urls = currentValue
          .split(/[\n,]+/)
          .map((u) => u.trim())
          .filter((u) => u);
        setUrlTextarea(urls[0] || currentUrl);
      }
      prevSourceTypeRef.current = sourceType;
    }
  }, [sourceType, open, currentUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Format URL based on job type
      const formattedUrl =
        sourceType === "blocks"
          ? formatUrlsForApi(urlTextarea)
          : urlTextarea.trim();

      // Update URL and type via control endpoint (creates new source)
      if (formattedUrl !== currentUrl || sourceType !== currentSourceType) {
        const controlResponse = await fetch("/api/engine/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            action: "edit",
            newUrl: formattedUrl,
          }),
        });

        if (!controlResponse.ok) {
          const data = await controlResponse.json();
          throw new Error(data.error || "Failed to update job URL");
        }
      }

      // Update max items via PATCH endpoint
      if (maxItems.trim() !== String(currentMaxItems || "")) {
        const maxItemsValue =
          maxItems.trim() === "" ? null : parseInt(maxItems.trim(), 10);
        const patchResponse = await fetch(`/api/engine/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url:
              urlTextarea.trim() !== currentUrl
                ? sourceType === "blocks"
                  ? formatUrlsForApi(urlTextarea)
                  : urlTextarea.trim()
                : undefined,
            maxItems: maxItemsValue,
          }),
        });

        if (!patchResponse.ok) {
          const data = await patchResponse.json();
          throw new Error(data.error || "Failed to update max items");
        }
      }

      toast.success("Job Updated", {
        description: "Job has been updated successfully",
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
          <DialogDescription>Update job settings</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="edit-url" className="text-sm font-medium">
              {sourceType === "blocks" ? "URLs" : "URL"}
            </Label>
            {sourceType === "blocks" ? (
              <Textarea
                id="edit-url"
                value={urlTextarea}
                onChange={(e) => setUrlTextarea(e.target.value)}
                placeholder="https://savee.it/i/abc123&#10;https://savee.it/i/def456"
                required
                rows={6}
                className="font-mono text-sm resize-none"
              />
            ) : (
              <Input
                id="edit-url"
                value={urlTextarea}
                onChange={(e) => setUrlTextarea(e.target.value)}
                placeholder="https://savee.it/..."
                required
                className="font-mono text-sm"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-max-items" className="text-sm font-medium">
                Max Items
              </Label>
              <Input
                id="edit-max-items"
                type="number"
                value={maxItems}
                onChange={(e) => setMaxItems(e.target.value)}
                placeholder="Unlimited"
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type" className="text-sm font-medium">
                Type
              </Label>
              <Select
                value={sourceType}
                onValueChange={(v) => setSourceType(v as SourceType)}
              >
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="pop">Pop</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="blocks">Blocks</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
