"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { JobActions } from "./JobActions";
import { JobLogsSection } from "./JobLogsSection";
import { JobEditDialog } from "./JobEditDialog";
import { JobDeleteDialog } from "./JobDeleteDialog";
import { IntervalEditor } from "./IntervalEditor";
import { cn } from "@/lib/utils";
import { ChevronDown, ExternalLink } from "lucide-react";

interface JobData {
  id: string;
  runId?: string;
  url: string;
  sourceType: "home" | "pop" | "user" | "blocks";
  username?: string;
  maxItems: number;
  status:
    | "active"
    | "running"
    | "paused"
    | "queued"
    | "stopped"
    | "error"
    | "completed";
  runStatus?: string;
  counters: {
    found: number;
    uploaded: number;
    errors: number;
    skipped?: number;
  };
  lastRun?: string;
  nextRun?: string;
  error?: string;
  origin?: string;
  intervalSeconds?: number;
  disableBackoff?: boolean;
  effectiveIntervalSeconds?: number;
  backoffMultiplier?: number;
}

interface JobRowProps {
  job: JobData;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onStop: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onRunNow?: (jobId: string) => void;
  onForceRun?: (jobId: string) => void;
  onReconcile?: (runId: string) => void;
  onToggleExpanded?: (jobId: string) => void;
  onEdit?: (jobId: string) => void;
  onUpdated?: () => void;
  isProcessing?: boolean;
  isExpanded?: boolean;
}

function getStatusColor(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "running":
      return "default";
    case "paused":
      return "secondary";
    case "queued":
      return "outline";
    case "stopped":
    case "error":
      return "destructive";
    case "completed":
      return "outline";
    default:
      return "outline";
  }
}

function getStatusDotColor(status: string): string {
  switch (status) {
    case "running":
      return "bg-emerald-500";
    case "queued":
      return "bg-amber-500";
    case "active":
      return "bg-blue-500";
    case "paused":
      return "bg-zinc-500";
    case "stopped":
      return "bg-purple-500";
    case "error":
      return "bg-red-500";
    case "completed":
      return "bg-sky-500";
    default:
      return "bg-muted";
  }
}

function formatDate(dateString?: string): string {
  if (!dateString) return "Never";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "Invalid";
  }
}

export function JobRow({
  job,
  onPause,
  onResume,
  onStop,
  onDelete,
  onRunNow,
  onForceRun,
  onReconcile,
  onToggleExpanded,
  onEdit,
  onUpdated,
  isProcessing = false,
  isExpanded = false,
}: JobRowProps) {
  const sourceTypeLabel =
    job.sourceType === "home"
      ? "Home"
      : job.sourceType === "pop"
      ? "Pop"
      : job.sourceType === "user"
      ? "User"
      : "Blocks";
  const isStale = job.runStatus === "stale";
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const handleEditClick = () => {
    if (onEdit) {
      onEdit(job.id);
    } else {
      setEditOpen(true);
    }
  };

  const handleDeleteClick = () => {
    setDeleteOpen(true);
  };

  return (
    <>
      <TableRow
        className={cn(
          "hover:bg-muted/50 transition-colors",
          isExpanded && "bg-muted/30"
        )}
      >
        {/* Job URL */}
        <TableCell>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                getStatusDotColor(job.status)
              )}
            />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium truncate hover:text-primary transition-colors flex items-center gap-1"
                  title={job.url}
                >
                  {job.url}
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                </a>
              </div>
              {job.username && (
                <span className="text-xs text-muted-foreground">
                  @{job.username}
                </span>
              )}
            </div>
          </div>
        </TableCell>

        {/* Type */}
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {sourceTypeLabel}
          </Badge>
        </TableCell>

        {/* Status */}
        <TableCell>
          <div className="flex items-center gap-2">
            <Badge variant={getStatusColor(job.status)} className="text-xs">
              {job.status}
            </Badge>
            {isStale && (
              <Badge variant="outline" className="text-xs">
                Stale
              </Badge>
            )}
          </div>
        </TableCell>

        {/* Statistics */}
        <TableCell>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {job.counters.found}
              </span>{" "}
              found
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {job.counters.uploaded}
              </span>{" "}
              uploaded
            </span>
            {job.counters.errors > 0 && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-destructive">
                  <span className="font-medium">{job.counters.errors}</span>{" "}
                  errors
                </span>
              </>
            )}
            {job.counters.skipped && job.counters.skipped > 0 && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium">{job.counters.skipped}</span>{" "}
                  skipped
                </span>
              </>
            )}
          </div>
        </TableCell>

        {/* Interval */}
        <TableCell>
          {job.intervalSeconds !== undefined ||
          job.effectiveIntervalSeconds !== undefined ? (
            onUpdated ? (
              <IntervalEditor
                jobId={job.id}
                intervalSeconds={job.intervalSeconds}
                disableBackoff={job.disableBackoff}
                effectiveIntervalSeconds={job.effectiveIntervalSeconds}
                backoffMultiplier={job.backoffMultiplier}
                onUpdated={onUpdated}
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                {job.effectiveIntervalSeconds ?? job.intervalSeconds}s
              </div>
            )
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Last Run */}
        <TableCell>
          <span className="text-xs text-muted-foreground">
            {formatDate(job.lastRun)}
          </span>
        </TableCell>

        {/* Actions */}
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {onToggleExpanded && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onToggleExpanded(job.id)}
                className="h-7 w-7"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    isExpanded && "rotate-180"
                  )}
                />
              </Button>
            )}
            <JobActions
              jobId={job.id}
              status={job.status}
              runStatus={job.runStatus}
              runId={job.runId}
              onPause={onPause}
              onResume={onResume}
              onStop={onStop}
              onDelete={handleDeleteClick}
              onRunNow={onRunNow}
              onForceRun={onForceRun}
              onReconcile={onReconcile}
              onToggleLogs={
                onToggleExpanded ? () => onToggleExpanded(job.id) : undefined
              }
              onEdit={handleEditClick}
              isProcessing={isProcessing}
              showLogs={isExpanded}
            />
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded Row with Logs */}
      {isExpanded && onToggleExpanded && (
        <TableRow>
          <TableCell colSpan={7} className="p-0">
            <div className="border-t bg-muted/30 p-4">
              <JobLogsSection runId={job.runId} isOpen={isExpanded} />
            </div>
          </TableCell>
        </TableRow>
      )}

      {/* Dialogs */}
      <JobEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        jobId={job.id}
        currentUrl={job.url}
        currentMaxItems={job.maxItems}
        currentSourceType={job.sourceType}
        onSuccess={() => {
          setEditOpen(false);
          onUpdated?.();
        }}
      />
      <JobDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        jobId={job.id}
        jobUrl={job.url}
        onSuccess={() => {
          setDeleteOpen(false);
          onUpdated?.();
        }}
      />
    </>
  );
}
