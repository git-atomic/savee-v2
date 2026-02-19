"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

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
    blocksByStatus: Array<{ status: string; c: number }>;
    blocksByMediaType: Array<{ media_type: string; c: number }>;
    sourcesByType: Array<{ source_type: string; c: number }>;
    sourcesByStatus: Array<{ status: string; c: number }>;
    runsByStatus: Array<{ status: string; c: number }>;
    timeSeries: {
      blocks: Array<{ date: string; count: number }>;
      runs: Array<{ date: string; count: number }>;
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
  };
}

function formatDate(dateString: string | null): string {
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
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
      if (data.success) {
        setMetrics(data);
      }
    } catch (error) {
      // Silently handle errors
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
        {/* Overview Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6 border">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-3 w-32 mt-1" />
              </div>
            </Card>
          ))}
        </div>

        {/* Database Entity Counts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6 border">
            <div className="mb-6">
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex flex-col">
                  <Skeleton className="h-4 w-16 mb-1" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6 border">
            <div className="mb-4">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-[280px] w-full" />
          </Card>
        </div>

        {/* Charts Row 1 Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6 border">
              <div className="mb-4">
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-[280px] w-full" />
            </Card>
          ))}
        </div>

        {/* Charts Row 2 Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6 border">
              <div className="mb-4">
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-[280px] w-full" />
            </Card>
          ))}
        </div>

        {/* Charts Row 3 Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6 border">
              <div className="mb-4">
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-[280px] w-full" />
            </Card>
          ))}
        </div>

        {/* Time Series Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6 border">
              <div className="mb-4">
                <Skeleton className="h-5 w-56 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-[280px] w-full" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Failed to load metrics</p>
      </div>
    );
  }

  // Prepare chart data
  const runsByStatusData = metrics.db.runsByStatus.map((r) => ({
    status: r.status,
    count: r.c,
  }));

  const blocksByStatusData = metrics.db.blocksByStatus.map((b) => ({
    status: b.status,
    value: b.c,
  }));

  const blocksByMediaTypeDataRaw = metrics.db.blocksByMediaType.map((b) => ({
    mediaType: b.media_type || "unknown",
    count: b.c,
  }));

  const sourcesByTypeData = metrics.db.sourcesByType.map((s) => ({
    type: s.source_type,
    value: s.c,
  }));

  const sourcesByStatusData = metrics.db.sourcesByStatus.map((s) => ({
    status: s.status,
    count: s.c,
  }));

  // Format time series data
  const blocksTimeSeriesData = metrics.db.timeSeries.blocks.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    blocks: item.count,
  }));

  const runsTimeSeriesData = metrics.db.timeSeries.runs.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    runs: item.count,
  }));

  // Chart configurations for evilcharts with professional, visible colors
  const chartColors = {
    primary: "#3b82f6", // Professional blue
    secondary: "#10b981", // Professional green
    accent: "#f59e0b", // Professional amber
    purple: "#8b5cf6", // Professional purple
    teal: "#14b8a6", // Professional teal
    orange: "#f97316", // Professional orange
    red: "#ef4444", // Professional red
    indigo: "#6366f1", // Professional indigo
    blue: "#2563eb", // Deeper blue for variety
    emerald: "#059669", // Deeper green for variety
  };

  const runsByStatusConfig = {
    count: {
      label: "Count",
      color: chartColors.primary,
    },
  } satisfies ChartConfig;

  const blocksByStatusConfig: ChartConfig = {};
  blocksByStatusData.forEach((item, index) => {
    const colors = [
      chartColors.primary,
      chartColors.secondary,
      chartColors.accent,
      chartColors.purple,
      chartColors.teal,
      chartColors.orange,
    ];
    blocksByStatusConfig[item.status] = {
      label: item.status,
      color: colors[index % colors.length],
    };
  });

  const blocksByMediaTypeConfig: ChartConfig = {};
  blocksByMediaTypeDataRaw.forEach((item, index) => {
    const colors = [
      chartColors.primary,
      chartColors.secondary,
      chartColors.accent,
      chartColors.purple,
      chartColors.teal,
    ];
    blocksByMediaTypeConfig[item.mediaType] = {
      label: item.mediaType,
      color: colors[index % colors.length],
    };
  });

  // Add fill colors to data for bar chart
  const blocksByMediaTypeData = blocksByMediaTypeDataRaw.map((item) => ({
    ...item,
    fill: blocksByMediaTypeConfig[item.mediaType]?.color || chartColors.primary,
  }));

  const sourcesByTypeConfig: ChartConfig = {};
  sourcesByTypeData.forEach((item, index) => {
    const colors = [
      chartColors.primary,
      chartColors.secondary,
      chartColors.accent,
      chartColors.purple,
      chartColors.teal,
      chartColors.orange,
    ];
    sourcesByTypeConfig[item.type] = {
      label: item.type,
      color: colors[index % colors.length],
    };
  });

  const sourcesByStatusConfig = {
    count: {
      label: "Count",
      color: chartColors.accent,
    },
  } satisfies ChartConfig;

  const blocksTimeSeriesConfig = {
    blocks: {
      label: "Blocks",
      color: chartColors.primary,
    },
  } satisfies ChartConfig;

  const runsTimeSeriesConfig = {
    runs: {
      label: "Runs",
      color: chartColors.secondary,
    },
  } satisfies ChartConfig;

  // Database entity counts data for visualization
  const dbEntityCountsData = [
    { entity: "Blocks", count: metrics.db.total.blocks },
    { entity: "Sources", count: metrics.db.total.sources },
    { entity: "Runs", count: metrics.db.total.runs },
    { entity: "Block Sources", count: metrics.db.total.blockSources },
    { entity: "Savee Users", count: metrics.db.total.saveeUsers },
    { entity: "User Blocks", count: metrics.db.total.userBlocks },
  ];

  const dbEntityCountsConfig: ChartConfig = {};
  dbEntityCountsData.forEach((item, index) => {
    const colors = [
      chartColors.primary,
      chartColors.secondary,
      chartColors.accent,
      chartColors.purple,
      chartColors.teal,
      chartColors.orange,
    ];
    dbEntityCountsConfig[item.entity] = {
      label: item.entity,
      color: colors[index % colors.length],
    };
  });

  return (
    <div className="space-y-4 pb-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 border hover:border-primary/30 transition-all hover:shadow-sm">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Total Blocks
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {metrics.db.total.blocks.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Scraped content items
            </p>
          </div>
        </Card>

        <Card className="p-4 border hover:border-primary/30 transition-all hover:shadow-sm">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Total Sources
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {metrics.db.total.sources.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Active scraping sources
            </p>
          </div>
        </Card>

        <Card className="p-4 border hover:border-primary/30 transition-all hover:shadow-sm">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              R2 Storage
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {metrics.r2.totalSizeGb.toFixed(2)} GB
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.r2.totalObjects.toLocaleString()} objects •{" "}
              {metrics.r2.usagePercent.toFixed(1)}% used
            </p>
          </div>
        </Card>

        <Card className="p-4 border hover:border-primary/30 transition-all hover:shadow-sm">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Worker Parallelism
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {metrics.jobs.workerParallelism}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Concurrent workers
            </p>
          </div>
        </Card>
      </div>

      {/* Database Entity Counts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-1">
              Database Entity Counts
            </h3>
            <p className="text-sm text-muted-foreground">
              Total records across all database tables
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Blocks
              </p>
              <p className="text-2xl font-bold">
                {metrics.db.total.blocks.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Sources
              </p>
              <p className="text-2xl font-bold">
                {metrics.db.total.sources.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Runs
              </p>
              <p className="text-2xl font-bold">
                {metrics.db.total.runs.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Block Sources
              </p>
              <p className="text-2xl font-bold">
                {metrics.db.total.blockSources.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Savee Users
              </p>
              <p className="text-2xl font-bold">
                {metrics.db.total.saveeUsers.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                User Blocks
              </p>
              <p className="text-2xl font-bold">
                {metrics.db.total.userBlocks.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        {/* Database Entity Counts Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">
              Database Entity Distribution
            </h3>
            <p className="text-sm text-muted-foreground">
              Visual breakdown of database entities
            </p>
          </div>
          <ChartContainer
            config={dbEntityCountsConfig}
            className="h-[280px] w-full"
          >
            <BarChart
              data={dbEntityCountsData}
              accessibilityLayer
              layout="vertical"
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="entity"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
                width={100}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={4}>
                {dbEntityCountsData.map((entry, index) => {
                  const configEntry = dbEntityCountsConfig[entry.entity];
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={configEntry?.color || chartColors.primary}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Runs by Status - Bar Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">Runs by Status</h3>
            <p className="text-sm text-muted-foreground">
              Distribution of run statuses
            </p>
          </div>
          <ChartContainer
            config={runsByStatusConfig}
            className="h-[280px] w-full"
          >
            <BarChart data={runsByStatusData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="status"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill={chartColors.primary} radius={4} />
            </BarChart>
          </ChartContainer>
        </Card>

        {/* Blocks by Status - Donut Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">Blocks by Status</h3>
            <p className="text-sm text-muted-foreground">
              Status breakdown of all blocks
            </p>
          </div>
          <ChartContainer
            config={blocksByStatusConfig}
            className="h-[280px] w-full"
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={blocksByStatusData}
                dataKey="value"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={45}
                label={({ percent }) =>
                  percent && percent > 0.05
                    ? `${(percent * 100).toFixed(0)}%`
                    : ""
                }
                labelLine={false}
              >
                {blocksByStatusData.map((entry, index) => {
                  const configEntry = blocksByStatusConfig[entry.status];
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        configEntry?.color ||
                        [
                          chartColors.primary,
                          chartColors.secondary,
                          chartColors.accent,
                          chartColors.purple,
                          chartColors.teal,
                        ][index % 5]
                      }
                    />
                  );
                })}
              </Pie>
              <ChartLegend
                content={({ payload }) => (
                  <ChartLegendContent payload={payload} nameKey="status" />
                )}
                className="-translate-y-2"
              />
            </PieChart>
          </ChartContainer>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Blocks by Media Type - Bar Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">Blocks by Media Type</h3>
            <p className="text-sm text-muted-foreground">
              Content type distribution
            </p>
          </div>
          <ChartContainer
            config={blocksByMediaTypeConfig}
            className="h-[280px] w-full"
          >
            <BarChart data={blocksByMediaTypeData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="mediaType"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={4} fill="#8884d8">
                {blocksByMediaTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Card>

        {/* Sources by Type - Donut Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">Sources by Type</h3>
            <p className="text-sm text-muted-foreground">
              Source type distribution
            </p>
          </div>
          <ChartContainer
            config={sourcesByTypeConfig}
            className="h-[280px] w-full"
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={sourcesByTypeData}
                dataKey="value"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={45}
                label={({ percent }) =>
                  percent && percent > 0.05
                    ? `${(percent * 100).toFixed(0)}%`
                    : ""
                }
                labelLine={false}
              >
                {sourcesByTypeData.map((entry, index) => {
                  const configEntry = sourcesByTypeConfig[entry.type];
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        configEntry?.color ||
                        [
                          chartColors.primary,
                          chartColors.secondary,
                          chartColors.accent,
                          chartColors.purple,
                          chartColors.teal,
                        ][index % 5]
                      }
                    />
                  );
                })}
              </Pie>
              <ChartLegend
                content={({ payload }) => (
                  <ChartLegendContent payload={payload} nameKey="type" />
                )}
                className="-translate-y-2"
              />
            </PieChart>
          </ChartContainer>
        </Card>
      </div>

      {/* Charts Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sources by Status - Bar Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">Sources by Status</h3>
            <p className="text-sm text-muted-foreground">
              Status breakdown of all sources
            </p>
          </div>
          <ChartContainer
            config={sourcesByStatusConfig}
            className="h-[280px] w-full"
          >
            <BarChart data={sourcesByStatusData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="status"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill={chartColors.accent} radius={4} />
            </BarChart>
          </ChartContainer>
        </Card>

        {/* R2 Storage Usage - Progress Bar */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">R2 Storage Usage</h3>
            <p className="text-sm text-muted-foreground">
              Cloudflare R2 bucket statistics
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">
                Storage Usage
              </span>
              <span className="text-sm font-semibold">
                {metrics.r2.totalSizeGb.toFixed(2)} GB /{" "}
                {metrics.r2.softLimitGb} GB
              </span>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, metrics.r2.usagePercent)}%`,
                  backgroundColor: metrics.r2.nearLimit
                    ? chartColors.red
                    : metrics.r2.usagePercent > 80
                    ? chartColors.accent
                    : chartColors.secondary,
                }}
              />
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{metrics.r2.totalObjects.toLocaleString()} objects</span>
              <span>{formatBytes(metrics.r2.totalSizeBytes)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Time Series Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Blocks Created Over Time - Area Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">
              Blocks Created (Last 30 Days)
            </h3>
            <p className="text-sm text-muted-foreground">
              Daily block creation trend
            </p>
          </div>
          <ChartContainer
            config={blocksTimeSeriesConfig}
            className="h-[280px] w-full"
          >
            <AreaChart data={blocksTimeSeriesData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="blocks"
                fill={chartColors.primary}
                fillOpacity={0.4}
                stroke={chartColors.primary}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </Card>

        {/* Runs Completed Over Time - Area Chart */}
        <Card className="p-6 border hover:shadow-md transition-all">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">
              Runs Completed (Last 30 Days)
            </h3>
            <p className="text-sm text-muted-foreground">
              Daily run completion trend
            </p>
          </div>
          <ChartContainer
            config={runsTimeSeriesConfig}
            className="h-[280px] w-full"
          >
            <AreaChart data={runsTimeSeriesData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: "var(--foreground)", opacity: 0.7, fontSize: 12 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="runs"
                fill={chartColors.secondary}
                fillOpacity={0.4}
                stroke={chartColors.secondary}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </Card>
      </div>
    </div>
  );
}
