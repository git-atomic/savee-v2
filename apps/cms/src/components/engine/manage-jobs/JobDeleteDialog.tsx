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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface JobDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobUrl: string;
  sourceType: "home" | "pop" | "user" | "blocks";
  onSuccess: () => void;
}

export function JobDeleteDialog({
  open,
  onOpenChange,
  jobId,
  jobUrl,
  sourceType,
  onSuccess,
}: JobDeleteDialogProps) {
  const [confirmText, setConfirmText] = React.useState("");
  const [deleteFromDb, setDeleteFromDb] = React.useState(true);
  const [deleteFromR2, setDeleteFromR2] = React.useState(false);
  const [deleteUsers, setDeleteUsers] = React.useState(false);
  const [deleteBlocks, setDeleteBlocks] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setConfirmText("");
      // For blocks type, check deleteBlocks, deleteFromR2, and deleteFromDb by default
      if (sourceType === "blocks") {
        setDeleteFromDb(true);
        setDeleteFromR2(true);
        setDeleteUsers(false);
        setDeleteBlocks(true);
      } else {
        setDeleteFromDb(true);
        setDeleteFromR2(false);
        setDeleteUsers(false);
        setDeleteBlocks(false);
      }
    }
  }, [open, sourceType]);

  // Parse URLs for blocks type (comma-separated)
  const parseJobUrls = React.useMemo(() => {
    if (sourceType === "blocks") {
      return jobUrl.split(",").map(u => u.trim()).filter(Boolean);
    }
    return [jobUrl];
  }, [jobUrl, sourceType]);

  const canDelete = React.useMemo(() => {
    return confirmText.trim().toLowerCase() === "delete";
  }, [confirmText]);

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/engine/jobs/${jobId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleteFromDb,
          deleteFromR2,
          deleteUsers,
          deleteBlocks,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Job Deleted", {
          description: "Job has been deleted successfully",
        });
        onOpenChange(false);
        onSuccess();
      } else {
        throw new Error(data.error || "Failed to delete job");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Delete Failed"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete Job</DialogTitle>
          <DialogDescription>
            This action cannot be undone
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="confirm-url" className="text-sm font-medium">
              Type "delete" to confirm
            </Label>
            <Input
              id="confirm-url"
              placeholder="delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="delete-db"
                checked={deleteFromDb}
                onCheckedChange={(checked) => setDeleteFromDb(checked === true)}
              />
              <Label htmlFor="delete-db" className="text-sm cursor-pointer">
                Database
              </Label>
            </div>
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="delete-r2"
                checked={deleteFromR2}
                onCheckedChange={(checked) => setDeleteFromR2(checked === true)}
              />
              <Label htmlFor="delete-r2" className="text-sm cursor-pointer">
                R2 Storage
              </Label>
            </div>
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="delete-users"
                checked={deleteUsers}
                onCheckedChange={(checked) => setDeleteUsers(checked === true)}
              />
              <Label htmlFor="delete-users" className="text-sm cursor-pointer">
                Related Users
              </Label>
            </div>
            {sourceType === "blocks" && (
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="delete-blocks"
                  checked={deleteBlocks}
                  onCheckedChange={(checked) => setDeleteBlocks(checked === true)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="delete-blocks" className="text-sm cursor-pointer">
                    All Blocks ({parseJobUrls.length} URL{parseJobUrls.length !== 1 ? 's' : ''})
                  </Label>
                </div>
              </div>
            )}
          </div>
          {!canDelete && confirmText && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              Type "delete" to enable deletion
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
