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
import { cn } from "@/lib/utils";

interface JobDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobUrl: string;
  onSuccess: () => void;
}

export function JobDeleteDialog({
  open,
  onOpenChange,
  jobId,
  jobUrl,
  onSuccess,
}: JobDeleteDialogProps) {
  const [confirmText, setConfirmText] = React.useState("");
  const [deleteFromDb, setDeleteFromDb] = React.useState(true);
  const [deleteFromR2, setDeleteFromR2] = React.useState(false);
  const [deleteUsers, setDeleteUsers] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setConfirmText("");
      setDeleteFromDb(true);
      setDeleteFromR2(false);
      setDeleteUsers(false);
    }
  }, [open]);

  const normalizeUrl = (url: string): string => {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return `${u.hostname}${u.pathname}`.replace(/\/+$/, "");
    } catch {
      return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    }
  };

  const canDelete = React.useMemo(() => {
    return normalizeUrl(confirmText) === normalizeUrl(jobUrl);
  }, [confirmText, jobUrl]);

  const confirmHost = React.useMemo(() => {
    try {
      return new URL(jobUrl).hostname;
    } catch {
      return jobUrl.replace(/^https?:\/\//, "").split("/")[0] || "this job";
    }
  }, [jobUrl]);

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
            This will permanently delete the job and related resources like database records,
            storage files, and user data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirm-url" className="text-sm font-medium">
              To confirm, type "{jobUrl}"
            </Label>
            <Input
              id="confirm-url"
              placeholder={jobUrl}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-db"
                checked={deleteFromDb}
                onCheckedChange={(checked) => setDeleteFromDb(checked === true)}
              />
              <Label htmlFor="delete-db" className="text-sm">
                Delete from Database
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-r2"
                checked={deleteFromR2}
                onCheckedChange={(checked) => setDeleteFromR2(checked === true)}
              />
              <Label htmlFor="delete-r2" className="text-sm">
                Delete from R2 Storage
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-users"
                checked={deleteUsers}
                onCheckedChange={(checked) => setDeleteUsers(checked === true)}
              />
              <Label htmlFor="delete-users" className="text-sm">
                Delete related Users
              </Label>
            </div>
          </div>
          {!canDelete && confirmText && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <span className="text-lg">!</span>
              <span>Deleting {confirmHost} cannot be undone.</span>
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
            {isDeleting ? "Deleting..." : "Delete Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
