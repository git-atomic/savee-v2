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
import {
  Select,
  SelectContent,
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
  const [maxItems, setMaxItems] = React.useState(String(currentMaxItems || ""));
  const [sourceType, setSourceType] = React.useState<SourceType>(currentSourceType);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUrl(currentUrl);
      setMaxItems(String(currentMaxItems || ""));
      setSourceType(currentSourceType);
    }
  }, [open, currentUrl, currentMaxItems, currentSourceType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Update URL and type via control endpoint (creates new source)
      if (url.trim() !== currentUrl || sourceType !== currentSourceType) {
        const controlResponse = await fetch("/api/engine/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            action: "edit",
            newUrl: url.trim(),
          }),
        });

        if (!controlResponse.ok) {
          const data = await controlResponse.json();
          throw new Error(data.error || "Failed to update job URL");
        }
      }

      // Update max items via PATCH endpoint
      if (maxItems.trim() !== String(currentMaxItems || "")) {
        const maxItemsValue = maxItems.trim() === "" ? null : parseInt(maxItems.trim(), 10);
        const patchResponse = await fetch(`/api/engine/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim() !== currentUrl ? url.trim() : undefined,
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
      toast.error(
        error instanceof Error ? error.message : "Update Failed"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
          <DialogDescription>
            Update the job URL, max items, or type.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-url">URL</Label>
            <Input
              id="edit-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://savee.it/..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-max-items">Max Items</Label>
              <Input
                id="edit-max-items"
                type="number"
                value={maxItems}
                onChange={(e) => setMaxItems(e.target.value)}
                placeholder="0 = unlimited"
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Type</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="pop">Pop</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="blocks">Blocks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
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
