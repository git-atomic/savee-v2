"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JobCard } from "./JobCard";
import { StatusFilter } from "./StatusFilter";
import { Search, RefreshCw, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type StatusKey =
  | "running"
  | "queued"
  | "active"
  | "paused"
  | "stopped"
  | "error"
  | "completed";

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

interface JobsStats {
  running: number;
  queued: number;
  active: number;
  paused: number;
  stopped: number;
  error: number;
  completed: number;
  total: number;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="border border-border bg-card rounded-2xl p-6 animate-pulse"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                <div className="h-4 w-96 bg-muted-foreground/20 rounded" />
              </div>
              <div className="flex items-center gap-6">
                <div className="h-3 w-20 bg-muted-foreground/20 rounded" />
                <div className="h-3 w-24 bg-muted-foreground/20 rounded" />
                <div className="h-3 w-32 bg-muted-foreground/20 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-20 bg-muted-foreground/20 rounded" />
              <div className="h-9 w-9 bg-muted-foreground/20 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  searchQuery: string;
  selectedStatuses: Set<StatusKey>;
  onClearSearch: () => void;
  onResetFilters: () => void;
}

function EmptyState({
  searchQuery,
  selectedStatuses,
  onClearSearch,
  onResetFilters,
}: EmptyStateProps) {
  const hasFilters = searchQuery || selectedStatuses.size < 7;

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center border border-border bg-card/50 backdrop-blur-sm">
      <div className="h-20 w-20 rounded-full bg-linear-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-6 ring-4 ring-muted/20">
        <Inbox className="h-10 w-10 text-muted-foreground/70" />
      </div>
      <h3 className="text-xl font-semibold mb-2 text-foreground">
        {hasFilters ? "No jobs match your filters" : "No jobs yet"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        {hasFilters
          ? "Try adjusting your search query or filter criteria to see more results."
          : "Start by adding a new scraping job from the Add Jobs page."}
      </p>
      {hasFilters && (
        <div className="flex items-center gap-3">
          {searchQuery && (
            <Button variant="outline" size="default" onClick={onClearSearch}>
              Clear search
            </Button>
          )}
          {selectedStatuses.size < 7 && (
            <Button variant="outline" size="default" onClick={onResetFilters}>
              Reset filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface StatBadgeProps {
  label: string;
  value: number;
  color: string;
}

function StatBadge({ label, value, color }: StatBadgeProps) {
  return (
    <div className="flex flex-col justify-between border border-border bg-card p-4 flex-1 h-[100px] rounded-xl relative">
      <div className="absolute top-4 left-4">
        <span className={cn("h-2 w-2 rounded-full shrink-0 block", color)} />
      </div>
      <div className="absolute bottom-4 left-4 flex flex-col gap-1">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
    </div>
  );
}

export function JobsList() {
  const [jobs, setJobs] = React.useState<JobData[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedStatuses, setSelectedStatuses] = React.useState<
    Set<StatusKey>
  >(
    new Set([
      "running",
      "queued",
      "active",
      "paused",
      "stopped",
      "error",
      "completed",
    ])
  );
  const [expandedJobs, setExpandedJobs] = React.useState<Set<string>>(
    new Set()
  );
  const [processingJobs, setProcessingJobs] = React.useState<Set<string>>(
    new Set()
  );
  const isFetchingRef = React.useRef(false);
  const jobsRef = React.useRef<JobData[]>([]);

  React.useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Calculate stats
  const stats = React.useMemo<JobsStats>(() => {
    const running = jobs.filter(
      (j) => j.status === "running" || j.runStatus === "running"
    ).length;
    const queued = jobs.filter((j) => j.status === "queued").length;
    const active = jobs.filter((j) => j.status === "active").length;
    const paused = jobs.filter((j) => j.status === "paused").length;
    const stopped = jobs.filter((j) => j.status === "stopped").length;
    const error = jobs.filter(
      (j) => j.status === "error" || j.runStatus === "error"
    ).length;
    const completed = jobs.filter((j) => j.status === "completed").length;

    return {
      running,
      queued,
      active,
      paused,
      stopped,
      error,
      completed,
      total: jobs.length,
    };
  }, [jobs]);

  // Fetch jobs
  const fetchJobs = React.useCallback(
    async (showRefreshIndicator = false) => {
      if (isFetchingRef.current) {
        return;
      }
      isFetchingRef.current = true;
      if (showRefreshIndicator) {
        setIsRefreshing(true);
      }

      try {
        const response = await fetch("/api/engine/jobs", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          setJobs(data.jobs || []);
        } else {
          throw new Error("Failed to fetch jobs");
        }
      } catch (error) {
        if (showRefreshIndicator) {
          toast.error(
            error instanceof Error ? error.message : "Failed to fetch jobs"
          );
        }
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
        if (showRefreshIndicator) {
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  // Initial load and adaptive polling (slower when idle, paused in background)
  React.useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const runTick = async () => {
      if (stopped || document.hidden) {
        return;
      }
      await fetchJobs();
      const hasActive = jobsRef.current.some(
        (j) => j.status === "running" || j.status === "queued" || j.runStatus === "running"
      );
      const nextMs = hasActive ? 25000 : 120000;
      timeout = setTimeout(() => {
        void runTick();
      }, nextMs);
    };

    // Initial load
    void fetchJobs();
    timeout = setTimeout(() => {
      void runTick();
    }, 25000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          void runTick();
        }, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchJobs]);

  // Filter jobs
  const filteredJobs = React.useMemo(() => {
    return jobs.filter((job) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        job.url.toLowerCase().includes(query) ||
        job.username?.toLowerCase().includes(query) ||
        false;

      const matchesStatus = selectedStatuses.has(job.status as StatusKey);

      return matchesSearch && matchesStatus;
    });
  }, [jobs, searchQuery, selectedStatuses]);

  // Job action handlers
  const handlePause = React.useCallback(
    async (jobId: string) => {
      setProcessingJobs((prev) => new Set(prev).add(jobId));
      try {
        const response = await fetch("/api/engine/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pause", jobId }),
        });
        if (!response.ok) throw new Error("Failed to pause job");
        await fetchJobs();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to pause job"
        );
      } finally {
        setProcessingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [fetchJobs, toast]
  );

  const handleResume = React.useCallback(
    async (jobId: string) => {
      setProcessingJobs((prev) => new Set(prev).add(jobId));
      try {
        const response = await fetch("/api/engine/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resume", jobId }),
        });
        if (!response.ok) throw new Error("Failed to resume job");
        await fetchJobs();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to resume job"
        );
      } finally {
        setProcessingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [fetchJobs, toast]
  );

  const handleStop = React.useCallback(
    async (jobId: string) => {
      setProcessingJobs((prev) => new Set(prev).add(jobId));
      try {
        const response = await fetch("/api/engine/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", jobId }),
        });
        if (!response.ok) throw new Error("Failed to stop job");
        await fetchJobs();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to stop job"
        );
      } finally {
        setProcessingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [fetchJobs, toast]
  );

  const handleDelete = React.useCallback(
    async (jobId: string) => {
      setProcessingJobs((prev) => new Set(prev).add(jobId));
      try {
        // The JobDeleteDialog handles the actual deletion
        await fetchJobs();
      } finally {
        setProcessingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [fetchJobs]
  );

  const handleRunNow = React.useCallback(
    async (jobId: string) => {
      setProcessingJobs((prev) => new Set(prev).add(jobId));
      try {
        const response = await fetch("/api/engine/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run_now", jobId }),
        });
        if (!response.ok) throw new Error("Failed to run job");
        await fetchJobs();
        toast.success("Job started", {
          description: "The job has been queued for execution",
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to run job"
        );
      } finally {
        setProcessingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [fetchJobs, toast]
  );

  const handleForceRun = React.useCallback(
    async (jobId: string) => {
      setProcessingJobs((prev) => new Set(prev).add(jobId));
      try {
        const response = await fetch("/api/engine/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run_now", jobId, force: true }),
        });
        if (!response.ok) throw new Error("Failed to force run job");
        await fetchJobs();
        toast.success("Job force started", {
          description: "The job has been forced to run",
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to force run job"
        );
      } finally {
        setProcessingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [fetchJobs, toast]
  );

  const handleReconcile = React.useCallback(
    async (runId: string) => {
      try {
        const response = await fetch(`/api/engine/runs/${runId}/reconcile`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("Failed to reconcile run");
        await fetchJobs();
        toast.success("Run reconciled", {
          description: "The stale run has been reconciled",
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to reconcile run"
        );
      }
    },
    [fetchJobs, toast]
  );

  const handleToggleExpanded = React.useCallback((jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }, []);

  const handleClearSearch = () => setSearchQuery("");
  const handleResetFilters = () => {
    setSelectedStatuses(
      new Set([
        "running",
        "queued",
        "active",
        "paused",
        "stopped",
        "error",
        "completed",
      ])
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Section */}
      <div className="flex flex-wrap items-stretch gap-3">
        <StatBadge
          label="Running"
          value={stats.running}
          color="bg-emerald-500"
        />
        <StatBadge label="Queued" value={stats.queued} color="bg-amber-500" />
        <StatBadge label="Active" value={stats.active} color="bg-blue-500" />
        <StatBadge label="Paused" value={stats.paused} color="bg-zinc-500" />
        <StatBadge
          label="Completed"
          value={stats.completed}
          color="bg-sky-500"
        />
        <StatBadge label="Errors" value={stats.error} color="bg-red-500" />
        <StatBadge label="Total" value={stats.total} color="bg-slate-500" />
      </div>

      {/* Search and Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs by URL or username..."
              className="pl-10 h-10"
            />
          </div>
          <Button
            variant="outline"
            size="default"
            onClick={() => fetchJobs(true)}
            disabled={isRefreshing}
            className="h-10"
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {/* Status Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              Filter by status
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredJobs.length} of {jobs.length} jobs
          </div>
        </div>
        <StatusFilter
          selected={selectedStatuses}
          onChange={setSelectedStatuses}
        />
      </div>

      {/* Jobs List */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          searchQuery={searchQuery}
          selectedStatuses={selectedStatuses}
          onClearSearch={handleClearSearch}
          onResetFilters={handleResetFilters}
        />
      ) : (
        <div className="space-y-2.5">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
            >
              <JobCard
                job={job}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
                onDelete={handleDelete}
                onRunNow={handleRunNow}
                onForceRun={handleForceRun}
                onReconcile={handleReconcile}
                onToggleExpanded={handleToggleExpanded}
                onUpdated={() => fetchJobs()}
                isProcessing={processingJobs.has(job.id)}
                isExpanded={expandedJobs.has(job.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
