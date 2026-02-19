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
  error?: string | null;
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
      available?: boolean;
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
    secondaryConfigured?: boolean;
    secondaryUnavailableReason?: string | null;
    secondaryIgnoredAsDuplicate?: boolean;
    incomplete?: boolean;
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

function compactError(message: string | null | undefined, max = 120): string | null {
  if (!message) return null;
  const raw = String(message).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const text =
    lower.includes("eproto") || lower.includes("handshake failure")
      ? "TLS handshake failed (check endpoint/account pairing)."
      : raw;
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function UsageLine({ label, usage, hint }: { label: string; usage: R2Usage; hint?: string }) {
  const errorText = compactError(usage.error);
  const showMetrics = usage.configured && !errorText;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">
          {usage.configured
            ? showMetrics
              ? `${usage.totalSizeGb.toFixed(2)} GB / ${usage.softLimitGb.toFixed(2)} GB`
              : "Scan error"
            : "Not configured"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${showMetrics ? Math.min(100, usage.usagePercent) : 0}%`,
            backgroundColor: progressColor(usage.usagePercent, usage.nearLimit),
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{showMetrics ? `${usage.totalObjects.toLocaleString()} objects` : "-"}</span>
        <span>{showMetrics ? formatBytes(usage.totalSizeBytes) : "-"}</span>
      </div>
      {errorText ? <p className="text-xs text-red-500">Scan failed: {errorText}</p> : null}
      {!errorText && hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
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
    configured: false,
    bucket: null,
    totalObjects: 0,
    totalSizeBytes: 0,
    totalSizeGb: 0,
    usagePercent: 0,
    softLimitGb: metrics.r2.softLimitGb || 9.5,
    softLimitBytes: metrics.r2.softLimitBytes || 9.5 * 1024 * 1024 * 1024,
    nearLimit: false,
    sampled: false,
    sampledPages: 0,
    error: null,
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
      error: null,
    } as R2Usage);

  const hasSecondary = Boolean(metrics.r2.hasSecondary && secondary.configured);
  const secondaryConfigured = Boolean(metrics.r2.secondaryConfigured);
  const secondaryUnavailableReason = compactError(metrics.r2.secondaryUnavailableReason);
  const retention = metrics.maintenance?.retention;
  const retentionAvailable = retention?.available ?? true;
  const primaryError = compactError(primary.error);
  const secondaryError = compactError(secondary.error);
  const r2Incomplete = Boolean(metrics.r2.incomplete || primaryError || (hasSecondary && secondaryError));
  const primarySampleHint = primary.sampled
    ? `sampled (${primary.sampledPages} pages)`
    : undefined;
  const secondarySampleHint =
    hasSecondary && secondary.sampled
      ? `sampled (${secondary.sampledPages} pages)`
      : undefined;

  return (
    <div className="space-y-4 pb-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
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
          <p className="text-sm text-muted-foreground">Primary R2</p>
          <p className="mt-1 text-2xl font-semibold">
            {!primary.configured
              ? "Inactive"
              : primaryError
                ? "Scan error"
                : `${primary.totalSizeGb.toFixed(2)} GB`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {!primary.configured
              ? "Primary bucket not configured"
              : primaryError
                ? primaryError
                : `${primary.totalObjects.toLocaleString()} objects | ${primary.usagePercent.toFixed(1)}% used`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {primary.bucket ? `Bucket: ${primary.bucket}` : "Bucket: primary"}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Secondary R2</p>
          <p className="mt-1 text-2xl font-semibold">
            {hasSecondary
              ? secondaryError
                ? "Scan error"
                : `${secondary.totalSizeGb.toFixed(2)} GB`
              : secondaryConfigured
                ? "Unavailable"
                : "Inactive"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasSecondary
              ? secondaryError
                ? secondaryError
                : `${secondary.totalObjects.toLocaleString()} objects | ${secondary.usagePercent.toFixed(1)}% used`
              : secondaryConfigured
                ? (secondaryUnavailableReason || "Secondary bucket is configured but currently unreachable")
                : "No separate secondary target"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasSecondary && secondary.bucket
              ? `Bucket: ${secondary.bucket}`
              : secondary.bucket
                ? `Bucket: ${secondary.bucket}`
                : "Bucket: -"}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Retention</p>
          <p className="mt-1 text-2xl font-semibold">
            {retentionAvailable ? formatDate(retention?.lastRunAt ?? null) : "Never"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {retentionAvailable ? "Last maintenance run" : "Retention job not enabled yet"}
          </p>
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
            <p className="text-sm text-muted-foreground">Primary and secondary buckets shown separately</p>
          </div>

          <UsageLine
            label={`Primary${primary.bucket ? ` (${primary.bucket})` : ""}`}
            usage={primary}
            hint={primarySampleHint}
          />

          {hasSecondary ? (
            <div className="border-t border-border/60 pt-3">
              <UsageLine
                label={`Secondary${secondary.bucket ? ` (${secondary.bucket})` : ""}`}
                usage={secondary}
                hint={secondarySampleHint}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              {secondaryConfigured
                ? `Secondary bucket unavailable${secondaryUnavailableReason ? `: ${secondaryUnavailableReason}` : "."}`
                : "Secondary bucket not active."}
            </div>
          )}

          {metrics.r2.secondaryIgnoredAsDuplicate ? (
            <p className="text-xs text-amber-500">
              Secondary target matches primary, so it is ignored to prevent double-counting.
            </p>
          ) : null}

          {r2Incomplete ? (
            <p className="text-xs text-red-500">
              Some R2 metrics failed or were sampled; values above may be partial.
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            R2 scan results are cached (`R2_METRICS_CACHE_SECONDS`) to reduce API usage.
          </p>
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
                {retentionAvailable ? (retention?.prunedJobLogs7d ?? 0).toLocaleString() : "-"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Pruned Runs</p>
              <p className="mt-1 text-xl font-semibold">
                {retentionAvailable ? (retention?.prunedRuns7d ?? 0).toLocaleString() : "-"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Compacted Runs</p>
              <p className="mt-1 text-xl font-semibold">
                {retentionAvailable ? (retention?.compactedRuns7d ?? 0).toLocaleString() : "-"}
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
