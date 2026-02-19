"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface R2Usage {
  configured: boolean;
  bucket: string | null;
  totalObjects: number;
  totalSizeBytes: number;
  totalSizeGb: number;
  usagePercent: number;
  softLimitGb: number;
  softLimitBytes: number;
  nearLimit: boolean;
  sampled: boolean;
  sampledPages: number;
}

interface MetricsData {
  jobs: {
    queued: number;
    running: number;
    paused: number;
    completed: number;
    error: number;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    workerParallelism: number;
  };
  db: {
    total: {
      blocks: number;
      sources: number;
      runs: number;
      blockSources: number;
      saveeUsers: number;
      userBlocks: number;
    };
    blocksByMediaType: Array<{ media_type: string; c: number }>;
    runsByStatus: Array<{ status: string; c: number }>;
  };
  maintenance?: {
    retention?: {
      lastRunAt: string | null;
      prunedJobLogs7d: number;
      prunedRuns7d: number;
      compactedRuns7d: number;
    };
  };
  r2: {
    totalObjects: number;
    totalSizeBytes: number;
    totalSizeGb: number;
    usagePercent: number;
    softLimitGb: number;
    softLimitBytes: number;
    nearLimit: boolean;
    sampled?: boolean;
    sampledPages?: number;
    hasSecondary?: boolean;
    secondaryIgnoredAsDuplicate?: boolean;
    primary?: R2Usage;
    secondary?: R2Usage;
  };
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  try {
    const date = new Date(value);
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

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function progressColor(percent: number, nearLimit: boolean) {
  if (nearLimit) return "#ef4444";
  if (percent > 80) return "#f59e0b";
  return "#10b981";
}

function UsageLine({ label, usage, hint }: { label: string; usage: R2Usage; hint?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">
          {usage.totalSizeGb.toFixed(2)} GB / {usage.softLimitGb.toFixed(2)} GB
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, usage.usagePercent)}%`,
            backgroundColor: progressColor(usage.usagePercent, usage.nearLimit),
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{usage.totalObjects.toLocaleString()} objects</span>
        <span>{formatBytes(usage.totalSizeBytes)}</span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function MetricsDashboard() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlightRef = React.useRef(false);

  const fetchMetrics = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const response = await fetch("/api/engine/metrics", { cache: "no-store" });
      const data = await response.json();
      if (data.success) setMetrics(data);
    } catch {
      // Ignore transient fetch errors; next poll will recover.
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const onVisibility = () => {
      if (!document.hidden) {
        void fetchMetrics();
        if (interval) clearInterval(interval);
        interval = setInterval(() => {
          void fetchMetrics();
        }, 180000);
      } else if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Card key={n} className="p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-8 w-24" />
              <Skeleton className="mt-2 h-3 w-32" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-[240px] w-full" />
          </Card>
          <Card className="p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-[240px] w-full" />
          </Card>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Failed to load metrics</p>
      </div>
    );
  }

  const chartColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#14b8a6", "#f97316"];

  const runsByStatusData = metrics.db.runsByStatus.map((r) => ({
    status: r.status,
    count: r.c,
  }));

  const mediaTypeData = metrics.db.blocksByMediaType
    .map((m) => ({ mediaType: m.media_type || "unknown", count: m.c }))
    .sort((a, b) => b.count - a.count);

  const mediaTypeConfig: ChartConfig = {};
  mediaTypeData.forEach((item, index) => {
    mediaTypeConfig[item.mediaType] = {
      label: item.mediaType,
      color: chartColors[index % chartColors.length],
    };
  });

  const runsStatusConfig = {
    count: {
      label: "Count",
      color: "#3b82f6",
    },
  } satisfies ChartConfig;

  const fallbackPrimary: R2Usage = {
    configured: true,
    bucket: null,
    totalObjects: metrics.r2.totalObjects,
    totalSizeBytes: metrics.r2.totalSizeBytes,
    totalSizeGb: metrics.r2.totalSizeGb,
    usagePercent: metrics.r2.usagePercent,
    softLimitGb: metrics.r2.softLimitGb,
    softLimitBytes: metrics.r2.softLimitBytes,
    nearLimit: metrics.r2.nearLimit,
    sampled: Boolean(metrics.r2.sampled),
    sampledPages: metrics.r2.sampledPages ?? 0,
  };

  const primary = metrics.r2.primary ?? fallbackPrimary;
  const secondary =
    metrics.r2.secondary ??
    ({
      configured: false,
      bucket: null,
      totalObjects: 0,
      totalSizeBytes: 0,
      totalSizeGb: 0,
      usagePercent: 0,
      softLimitGb: primary.softLimitGb,
      softLimitBytes: primary.softLimitBytes,
      nearLimit: false,
      sampled: false,
      sampledPages: 0,
    } as R2Usage);

  const hasSecondary = Boolean(metrics.r2.hasSecondary && secondary.configured);
  const retention = metrics.maintenance?.retention;

  return (
    <div className="space-y-4 pb-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Blocks</p>
          <p className="mt-1 text-2xl font-semibold">{metrics.db.total.blocks.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">Stored content items</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Sources</p>
          <p className="mt-1 text-2xl font-semibold">{metrics.db.total.sources.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">Tracked jobs</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Run Queue</p>
          <p className="mt-1 text-2xl font-semibold">
            {metrics.jobs.running} running
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics.jobs.queued} queued | {metrics.jobs.error} error
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">R2 Total Usage</p>
          <p className="mt-1 text-2xl font-semibold">{metrics.r2.totalSizeGb.toFixed(2)} GB</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics.r2.totalObjects.toLocaleString()} objects | {metrics.r2.usagePercent.toFixed(1)}% used
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Retention</p>
          <p className="mt-1 text-2xl font-semibold">{formatDate(retention?.lastRunAt ?? null)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last maintenance run</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-semibold">Runs by Status</h3>
          <p className="text-sm text-muted-foreground">Live run-state distribution</p>
          <ChartContainer config={runsStatusConfig} className="mt-3 h-[260px] w-full">
            <BarChart data={runsByStatusData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="#3b82f6" radius={4} />
            </BarChart>
          </ChartContainer>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold">Blocks by Media Type</h3>
          <p className="text-sm text-muted-foreground">What you are actually storing</p>
          <ChartContainer config={mediaTypeConfig} className="mt-3 h-[260px] w-full">
            <BarChart data={mediaTypeData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mediaType" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={4}>
                {mediaTypeData.map((entry, index) => (
                  <Cell
                    key={`${entry.mediaType}-${index}`}
                    fill={mediaTypeConfig[entry.mediaType]?.color || "#3b82f6"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">R2 Storage Breakdown</h3>
            <p className="text-sm text-muted-foreground">Accurate primary/secondary usage</p>
          </div>

          <UsageLine label="Total" usage={{ ...primary, totalObjects: metrics.r2.totalObjects, totalSizeBytes: metrics.r2.totalSizeBytes, totalSizeGb: metrics.r2.totalSizeGb, usagePercent: metrics.r2.usagePercent, softLimitGb: metrics.r2.softLimitGb, softLimitBytes: metrics.r2.softLimitBytes, nearLimit: metrics.r2.nearLimit }} />

          <div className="border-t border-border/60 pt-3">
            <UsageLine
              label={`Primary${primary.bucket ? ` (${primary.bucket})` : ""}`}
              usage={primary}
            />
          </div>

          {hasSecondary ? (
            <div className="border-t border-border/60 pt-3">
              <UsageLine
                label={`Secondary${secondary.bucket ? ` (${secondary.bucket})` : ""}`}
                usage={secondary}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              Secondary bucket not active.
            </div>
          )}

          {metrics.r2.secondaryIgnoredAsDuplicate ? (
            <p className="text-xs text-amber-500">
              Secondary target matches primary, so it is ignored in totals to prevent double-counting.
            </p>
          ) : null}

          {metrics.r2.sampled ? (
            <p className="text-xs text-muted-foreground">
              Scan is sampled ({metrics.r2.sampledPages ?? 0} pages). Increase `R2_METRICS_MAX_PAGES` for full-bucket counts.
            </p>
          ) : null}
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Maintenance (Last 7 Days)</h3>
            <p className="text-sm text-muted-foreground">Free-tier cleanup impact</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Pruned Logs</p>
              <p className="mt-1 text-xl font-semibold">
                {(retention?.prunedJobLogs7d ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Pruned Runs</p>
              <p className="mt-1 text-xl font-semibold">
                {(retention?.prunedRuns7d ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Compacted Runs</p>
              <p className="mt-1 text-xl font-semibold">
                {(retention?.compactedRuns7d ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Last success: {formatDate(metrics.jobs.lastSuccessAt)}</p>
            <p>Last error: {formatDate(metrics.jobs.lastErrorAt)}</p>
            <p>Worker parallelism: {metrics.jobs.workerParallelism}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
