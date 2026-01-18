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
import { PrimaryControls } from "./PrimaryControls";
import { cn } from "@/lib/utils";
import { ExternalLink, FileText, ChevronDown, ChevronUp } from "lucide-react";

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

// Helper function to parse bulk URLs
function parseBulkUrls(urlString: string): string[] {
  if (!urlString) return [];

  // If it's a bulk_import placeholder URL, return empty (API should provide actual URLs)
  // But if the API has already fetched and joined the URLs with commas, parse them
  if (urlString.includes("bulk_import_") && !urlString.includes(",")) {
    return [];
  }

  // Split by comma first (API joins URLs with commas)
  const commaSeparated = urlString.split(",").map((p) => p.trim()).filter(Boolean);
  
  // If we have multiple comma-separated URLs, return them
  if (commaSeparated.length > 1) {
    return commaSeparated.filter((url) => url.startsWith("http://") || url.startsWith("https://"));
  }

  // If only one part, try splitting by space or newline
  const parts = urlString
    .split(/[\s\n]+/)
    .map((p) => p.trim())
    .filter((p) => p && (p.startsWith("http://") || p.startsWith("https://")));

  // If we found multiple URLs, return them
  if (parts.length > 1) {
    return parts;
  }

  // If only one URL found, check if it contains multiple URLs in the string
  if (parts.length === 1 && urlString.includes("http")) {
    // Try splitting by "https://" or "http://" to find multiple URLs
    const urlMatches = urlString.match(/https?:\/\/[^\s,]+/g);
    if (urlMatches && urlMatches.length > 1) {
      return urlMatches;
    }
  }

  return parts.length > 0 ? parts : [urlString]; // Fallback to original if no valid URLs found
}

// Simple URL list component for bulk/blocks jobs - matches image design
function CollapsibleUrlList({ urls }: { urls: string[] }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  if (urls.length <= 1) {
    // Single URL
    return (
      <a
        href={urls[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium truncate hover:text-primary transition-colors flex items-center gap-1.5"
        title={urls[0]}
      >
        {urls[0]}
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </a>
    );
  }

  const firstUrl = urls[0];
  const secondUrl = urls[1];
  const remainingUrls = urls.slice(2);
  const hasMore = urls.length > 1; // Show collapse/expand when there are 2+ URLs

  return (
    <div className="space-y-0">
      {/* First URL - Bright/Prominent */}
      <a
        href={firstUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors group/link py-1"
        title={firstUrl}
      >
        <span className="truncate">{firstUrl}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </a>

      {/* Collapsed URLs with gradient fade */}
      {!isExpanded && hasMore && (
        <div className="relative">
          {/* Second URL - Significantly faded */}
          {secondUrl && (
            <a
              href={secondUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground/30 hover:text-foreground transition-colors group/link py-1"
              title={secondUrl}
            >
              <span className="truncate">{secondUrl}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-30" />
            </a>
          )}
          
          {/* Additional URLs with progressive fade and gradient mask */}
          {remainingUrls.length > 0 && (
            <div className="relative max-h-[120px] overflow-hidden">
              <div className="space-y-0">
                {remainingUrls.map((url, idx) => {
                  // Progressive opacity: each URL gets more faded - more aggressive fade
                  const opacity = Math.max(0.1, 0.25 - (idx * 0.08));
                  return (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group/link py-1"
                      style={{ opacity }}
                      title={url}
                    >
                      <span className="truncate">{url}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-30" />
                    </a>
                  );
                })}
              </div>
              {/* Gradient mask overlay for smooth progressive fade effect */}
              <div 
                className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, transparent 30%, hsl(var(--background)) 100%)',
                }}
              />
            </div>
          )}

          {/* Show all button - matches image style */}
          {remainingUrls.length > 0 && (
            <button
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors group/show py-1 relative z-10"
              type="button"
            >
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              <span>Show all</span>
            </button>
          )}
        </div>
      )}

      {/* Expanded state - show all URLs */}
      {isExpanded && hasMore && (
        <div className="space-y-0 mt-1.5">
          {urls.slice(1).map((url, idx) => (
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group/link py-1"
              title={url}
            >
              <span className="truncate">{url}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </a>
          ))}
          <button
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors mt-1.5 group/show"
            type="button"
          >
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
            <span>Show less</span>
          </button>
        </div>
      )}
    </div>
  );
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

  // Parse URLs for blocks/bulk jobs
  const isBulkJob = job.sourceType === "blocks";
  const bulkUrls = isBulkJob ? parseBulkUrls(job.url) : [];

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
      {/* Row 1: status | url | (empty) | primary controls | menu */}
      <TableRow
        className={cn(
          "hover:bg-muted/50 transition-colors group",
          isExpanded && "bg-muted/30"
        )}
      >
        {/* Status */}
        <TableCell className="py-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full shrink-0",
                getStatusDotColor(job.status)
              )}
            />
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

        {/* URL */}
        <TableCell className="py-2">
          <div className="flex items-center gap-2 min-w-0">
            {isBulkJob && bulkUrls.length > 1 ? (
              <CollapsibleUrlList urls={bulkUrls} />
            ) : (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium truncate hover:text-primary transition-colors flex items-center gap-1.5"
                title={job.url}
              >
                {job.url}
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </a>
            )}
          </div>
        </TableCell>

        {/* Empty column for spacing */}
        <TableCell className="py-2 w-4"></TableCell>

        {/* Primary Controls */}
        <TableCell className="py-2">
          <PrimaryControls
            status={job.status}
            onPause={() => onPause(job.id)}
            onResume={() => onResume(job.id)}
            onStop={() => onStop(job.id)}
            onRunNow={onRunNow ? () => onRunNow(job.id) : undefined}
            isProcessing={isProcessing}
          />
        </TableCell>

        {/* Menu */}
        <TableCell className="text-right py-2">
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
        </TableCell>
      </TableRow>

      {/* Row 2: stats badges | (empty) | Interval(switch) */}
      <TableRow
        className={cn(
          "hover:bg-muted/50 transition-colors group",
          isExpanded && "bg-muted/30"
        )}
      >
        {/* Stats Badges */}
        <TableCell className="py-2" colSpan={2}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <span className="font-medium">{job.counters.found}</span> found
            </Badge>
            <Badge variant="outline" className="text-xs">
              <span className="font-medium">{job.counters.uploaded}</span>{" "}
              uploaded
            </Badge>
            {job.counters.errors > 0 && (
              <Badge variant="destructive" className="text-xs">
                <span className="font-medium">{job.counters.errors}</span>{" "}
                errors
              </Badge>
            )}
            {job.counters.skipped && job.counters.skipped > 0 && (
              <Badge variant="outline" className="text-xs">
                <span className="font-medium">{job.counters.skipped}</span>{" "}
                skipped
              </Badge>
            )}
          </div>
        </TableCell>

        {/* Empty column for spacing */}
        <TableCell className="py-2 w-4"></TableCell>

        {/* Interval Editor */}
        <TableCell className="py-2">
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

        {/* Empty column for alignment */}
        <TableCell className="py-2"></TableCell>
      </TableRow>

      {/* Row 3: lastrun | nextrun | etc. | (empty) | btn logs */}
      <TableRow
        className={cn(
          "hover:bg-muted/50 transition-colors border-b-2 group",
          isExpanded && "bg-muted/30"
        )}
      >
        {/* Last Run */}
        <TableCell className="py-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Last run</span>
            <span className="text-xs font-medium text-foreground">
              {formatDate(job.lastRun)}
            </span>
          </div>
        </TableCell>

        {/* Next Run */}
        <TableCell className="py-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Next run</span>
            <span className="text-xs font-medium text-foreground">
              {job.nextRun ? formatDate(job.nextRun) : "—"}
            </span>
          </div>
        </TableCell>

        {/* Additional Metadata */}
        <TableCell className="py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {sourceTypeLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Max: {job.maxItems}
            </span>
            {job.error && (
              <Badge variant="destructive" className="text-xs">
                Error
              </Badge>
            )}
          </div>
        </TableCell>

        {/* Empty column for spacing */}
        <TableCell className="py-2 w-4"></TableCell>

        {/* Logs Button */}
        <TableCell className="text-right py-2">
          {onToggleExpanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleExpanded(job.id)}
              className="h-7 px-2"
              title={isExpanded ? "Hide Logs" : "View Logs"}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              <span className="text-xs">{isExpanded ? "Hide" : "Logs"}</span>
            </Button>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded Row with Logs */}
      {isExpanded && onToggleExpanded && (
        <TableRow>
          <TableCell colSpan={5} className="p-0">
            <div className="border-t bg-muted/30 p-6">
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
        sourceType={job.sourceType}
        onSuccess={() => {
          setDeleteOpen(false);
          onUpdated?.();
        }}
      />
    </>
  );
}
