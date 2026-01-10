"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";

interface MetricsData {
  queued: number;
  running: number;
  paused: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  workerParallelism: number;
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

export function MetricsDashboard() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const response = await fetch("/api/engine/metrics");
      const data = await response.json();
      if (data.success) {
        setMetrics(data);
      }
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading metrics...</p>
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card className="p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Queued Jobs</p>
          <p className="text-3xl font-bold">{metrics.queued}</p>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Running Jobs</p>
          <p className="text-3xl font-bold">{metrics.running}</p>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Paused Jobs</p>
          <p className="text-3xl font-bold">{metrics.paused}</p>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Last Success</p>
          <p className="text-lg font-medium">{formatDate(metrics.lastSuccessAt)}</p>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Last Error</p>
          <p className="text-lg font-medium">{formatDate(metrics.lastErrorAt)}</p>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Worker Parallelism</p>
          <p className="text-3xl font-bold">{metrics.workerParallelism}</p>
        </div>
      </Card>
    </div>
  );
}








