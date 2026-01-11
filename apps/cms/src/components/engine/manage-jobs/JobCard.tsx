"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JobLogsSection } from "./JobLogsSection";
import { JobEditDialog } from "./JobEditDialog";
import { JobDeleteDialog } from "./JobDeleteDialog";
import { IntervalEditor } from "./IntervalEditor";
import { cn } from "@/lib/utils";
import {
  Trash2,
  Pencil,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface JobCardProps {
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
  if (!dateString) return "—";
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return "—";
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
  const commaSeparated = urlString
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // If we have multiple comma-separated URLs, return them
  if (commaSeparated.length > 1) {
    return commaSeparated.filter(
      (url) => url.startsWith("http://") || url.startsWith("https://")
    );
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

// Enhanced URL list component with gradient/blur effect
function CollapsibleUrlList({ urls }: { urls: string[] }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (urls.length <= 1) {
    // Single URL
    return (
      <a
        href={urls[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-mono text-foreground hover:text-primary transition-colors flex items-center gap-1.5 group/link"
        title={urls[0]}
      >
        <span className="truncate">{urls[0]}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
      </a>
    );
  }

  const firstUrl = urls[0];
  const hasMore = urls.length > 1;

  return (
    <div className="space-y-0">
      {/* First URL - Always fully visible */}
      <div className="flex items-center gap-2">
        <a
          href={firstUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-mono text-foreground hover:text-primary transition-colors group/link"
          title={firstUrl}
        >
          <span className="truncate">{firstUrl}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
        </a>
        {!isExpanded && hasMore && (
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors group/show shrink-0 ml-2"
            type="button"
          >
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            <span>Show all</span>
          </button>
        )}
      </div>

      {!isExpanded && hasMore && (
        <div className="relative mt-1">
          {/* Second URL - Significantly faded (barely visible) */}
          {urls[1] && (
            <a
              href={urls[1]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground/40 hover:text-foreground transition-colors group/link"
              title={urls[1]}
              style={{ opacity: 0.3 }}
            >
              <span className="truncate">{urls[1]}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-20" />
            </a>
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
              className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors group/link py-1"
              title={url}
            >
              <span className="truncate">{url}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
            </a>
          ))}
          <button
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1.5 group/show"
            type="button"
          >
            <ChevronUp className="h-3 w-3 shrink-0" />
            <span>Show less</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function JobCard({
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
}: JobCardProps) {
  const sourceTypeLabel =
    job.sourceType === "home"
      ? "Home"
      : job.sourceType === "pop"
      ? "Pop"
      : job.sourceType === "user"
      ? "User"
      : "Blocks";

  // Get badge color classes based on source type
  const getBadgeColors = (sourceType: string) => {
    switch (sourceType) {
      case "blocks":
        return "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      case "home":
        return "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800";
      case "pop":
        return "bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800";
      case "user":
        return "bg-gray-50 dark:bg-gray-950/30 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800";
      default:
        return "bg-muted text-foreground border-border";
    }
  };
  const isStale = job.runStatus === "stale";
  const hasErrors = (job.counters?.errors || 0) > 0;
  const isCompletedWithErrors = job.status === "completed" && hasErrors;
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [forceRunToggle, setForceRunToggle] = React.useState(false);

  // Parse URLs for all jobs (not just blocks)
  const parsedUrls = parseBulkUrls(job.url);
  const hasMultipleUrls = parsedUrls.length > 1;

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

  const handleRunNow = async () => {
    if (onRunNow) {
      onRunNow(job.id);
    }
  };

  const handleForceRun = async () => {
    if (onForceRun) {
      onForceRun(job.id);
    }
  };

  const handleReconcile = async () => {
    if (isStale && onReconcile && job.runId) {
      onReconcile(job.runId);
    }
  };

  const statusColor = getStatusDotColor(job.status);
  const isRunning = job.status === "running";

  return (
    <>
      <Card
        className={cn(
          "relative flex flex-col overflow-hidden bg-card text-sm transition-all duration-200",
          "hover:shadow-sm hover:ring-1 hover:ring-border",
          isExpanded && "ring-2 ring-primary/20",
          isRunning && "ring-1 ring-emerald-500/20"
        )}
      >
        <CardHeader className="px-6 py-4 bg-foreground/2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {/* Status circle - fixed position, won't shift */}
              <div className="flex-shrink-0 pt-0.5">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full shrink-0 block transition-all",
                          statusColor,
                          isRunning && "animate-pulse"
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="capitalize">{job.status}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* URL and badges section */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  {/* URL list - takes available space */}
                  <div className="flex-1 min-w-0">
                    {hasMultipleUrls ? (
                      <CollapsibleUrlList urls={parsedUrls} />
                    ) : (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono truncate hover:text-primary transition-colors flex items-center gap-1.5 group/link"
                        title={job.url}
                      >
                        <span className="truncate">{job.url}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                      </a>
                    )}
                  </div>

                  {/* Badges - right next to URLs, won't shift */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs shrink-0 font-medium px-2.5 py-0.5",
                        getBadgeColors(job.sourceType)
                      )}
                    >
                      {sourceTypeLabel}
                    </Badge>
                    {job.username && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs shrink-0 font-medium px-2.5 py-0.5",
                          getBadgeColors("user")
                        )}
                      >
                        @{job.username}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons - fixed position */}
            <div className="flex items-center gap-1 shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={handleEditClick}
                      disabled={isProcessing}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit job</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 hover:text-destructive"
                      onClick={handleDeleteClick}
                      disabled={isProcessing}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete job</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pt-6 pb-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Statistics
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="text-xs font-medium px-2.5 py-0.5"
                >
                  {job.counters.uploaded} uploaded
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs font-medium px-2.5 py-0.5"
                >
                  {job.counters.found} processed
                </Badge>
                {(job.counters.skipped ?? 0) > 0 && (
                  <Badge
                    variant="outline"
                    className="text-xs font-medium px-2.5 py-0.5"
                  >
                    {job.counters.skipped} skipped
                  </Badge>
                )}
                {job.counters.errors > 0 && (
                  <Badge
                    variant="destructive"
                    className="text-xs font-medium px-2.5 py-0.5"
                  >
                    {job.counters.errors} errors
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Schedule
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Last:</span>
                  <span className="text-foreground font-medium">
                    {job.lastRun ? formatDate(job.lastRun) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Next:</span>
                  <span className="text-foreground font-medium">
                    {job.nextRun ? formatDate(job.nextRun) : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Interval
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Base:</span>
                  <span className="text-foreground font-medium">
                    {job.effectiveIntervalSeconds ?? job.intervalSeconds ?? 0}s
                  </span>
                </div>
                {job.backoffMultiplier && job.backoffMultiplier > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Backoff:</span>
                    <span className="text-foreground font-medium">
                      x{job.backoffMultiplier}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Settings
              </div>
              <div className="flex flex-col gap-2.5">
                <Badge
                  variant="outline"
                  className="text-xs font-medium w-fit px-2.5 py-0.5"
                >
                  Max {typeof job.maxItems === "number" ? job.maxItems : "∞"}
                </Badge>
                {onUpdated && (
                  <IntervalEditor
                    jobId={job.id}
                    intervalSeconds={job.intervalSeconds}
                    disableBackoff={job.disableBackoff}
                    effectiveIntervalSeconds={job.effectiveIntervalSeconds}
                    backoffMultiplier={job.backoffMultiplier}
                    onUpdated={onUpdated}
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter
          className={cn(
            "px-6 pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border/50",
            isExpanded ? "pb-0" : "pb-4"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "running" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPause(job.id)}
                disabled={isProcessing}
              >
                {isProcessing && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Pause
              </Button>
            )}
            {(isStale || isCompletedWithErrors) && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleReconcile}
                disabled={isProcessing}
              >
                {isProcessing && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Reconcile
              </Button>
            )}
            {(job.status === "paused" || job.runStatus === "paused") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onResume(job.id)}
                disabled={isProcessing}
              >
                {isProcessing && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Resume
              </Button>
            )}
            {job.status !== "running" && (
              <>
                <Button
                  size="sm"
                  onClick={handleRunNow}
                  disabled={isProcessing}
                >
                  {isProcessing && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Run Now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleForceRun}
                  disabled={isProcessing}
                >
                  {isProcessing && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Force Run
                </Button>
              </>
            )}
            {(job.status === "running" ||
              job.runStatus === "running" ||
              job.status === "queued") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPause(job.id)}
                disabled={isProcessing}
              >
                {isProcessing && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Cancel Run
              </Button>
            )}
            {(job.status === "running" ||
              job.status === "active" ||
              job.status === "queued") && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onStop(job.id)}
                disabled={isProcessing}
              >
                {isProcessing && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Stop
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <Switch
                checked={forceRunToggle}
                onCheckedChange={(v) => setForceRunToggle(Boolean(v))}
                disabled={isProcessing}
              />
              <span className="text-muted-foreground">Force</span>
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleExpanded?.(job.id)}
              disabled={isProcessing}
            >
              {isExpanded ? "Hide Logs" : "View Logs"}
            </Button>
          </div>
        </CardFooter>
        {isExpanded && onToggleExpanded && (
          <CardContent className="px-6 pb-5">
            <div className="border-t border-border/50 pt-5 animate-in slide-in-from-top-2 duration-200">
              {job.runId ? (
                <JobLogsSection runId={job.runId} isOpen={isExpanded} />
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No run ID available. Start a job to see logs.
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
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
