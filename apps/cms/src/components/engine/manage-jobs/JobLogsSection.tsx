"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEntry {
  timestamp: string;
  type: string;
  url: string;
  status: "success" | "error" | "pending" | string;
  timing?: string;
  message?: string;
}

interface JobLogsSectionProps {
  runId?: string;
  isOpen: boolean;
}

export const JobLogsSection = React.memo(function JobLogsSection({
  runId,
  isOpen,
}: JobLogsSectionProps) {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [autoFollow, setAutoFollow] = React.useState(true);
  const logsEndRef = React.useRef<HTMLDivElement>(null);
  const esRef = React.useRef<EventSource | null>(null);
  const pollRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectRef = React.useRef<NodeJS.Timeout | null>(null);
  const snapshotInFlightRef = React.useRef(false);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchSnapshot = React.useCallback(async (runId?: string) => {
    if (!runId) {
      return;
    }
    if (snapshotInFlightRef.current) {
      return;
    }
    const runIdNum = typeof runId === "string" ? parseInt(runId, 10) : runId;
    if (!Number.isFinite(runIdNum)) {
      return;
    }
    snapshotInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/engine/logs?runId=${encodeURIComponent(runIdNum)}&limit=500`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        const logsArray = Array.isArray(data.logs) ? data.logs : [];
        setLogs(logsArray);
      }
    } catch (error) {
      // Silently handle errors
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, []);

  const startFallbackPolling = React.useCallback(
    (targetRunId?: string) => {
      if (!targetRunId || pollRef.current) return;
      pollRef.current = setInterval(() => {
        void fetchSnapshot(targetRunId);
      }, 20000);
    },
    [fetchSnapshot]
  );

  const attachStream = React.useCallback((runId?: string) => {
    if (!runId) return;
    try {
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {}
        esRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      const es = new EventSource(
        `/api/engine/logs/stream?runId=${encodeURIComponent(runId)}`
      );
      esRef.current = es;
      stopPolling();
      const push = (p: any) => {
        if (!p || !p.type) return;
        const nextEntry = {
          timestamp: p.timestamp || new Date().toISOString(),
          type: p.type,
          url: p.url || "",
          status: p.status || "",
          timing: p.timing,
          message: p.message,
        };
        setLogs((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.timestamp === nextEntry.timestamp &&
            last.type === nextEntry.type &&
            last.url === nextEntry.url &&
            last.message === nextEntry.message
          ) {
            return prev;
          }
          return [...prev, nextEntry].slice(-500);
        });
      };
      es.onmessage = (ev) => {
        try {
          push(JSON.parse(ev.data || "{}"));
        } catch {}
      };
      es.addEventListener("log", (ev: MessageEvent) => {
        try {
          push(JSON.parse(ev.data || "{}"));
        } catch {}
      });
      es.onerror = () => {
        // Close and attempt a lightweight reconnect after a short backoff
        try {
          es.close();
        } catch {}
        esRef.current = null;
        startFallbackPolling(runId);
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current);
        }
        reconnectRef.current = setTimeout(() => attachStream(runId), 5000);
      };
    } catch (error) {
      // Silently handle errors
    }
  }, [startFallbackPolling, stopPolling]);

  const refreshLogs = React.useCallback(async () => {
    if (!runId) return;
    await fetchSnapshot(runId);
    if (!esRef.current && runId) attachStream(runId);
  }, [runId, fetchSnapshot, attachStream]);

  React.useEffect(() => {
    if (isOpen && runId) {
      setLogs([]);
      void fetchSnapshot(runId);
      attachStream(runId);
    }
    return () => {
      stopPolling();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {}
        esRef.current = null;
      }
    };
  }, [isOpen, runId, fetchSnapshot, attachStream, stopPolling]);

  React.useEffect(() => {
    if (!isOpen || !autoFollow) return;
    try {
      const el = logsEndRef.current;
      if (!el) return;
      const viewport = el.closest(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement | null;
      if (!viewport) return;
      const threshold = 80;
      const atBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        threshold;
      if (atBottom) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    } catch {}
  }, [logs, isOpen, autoFollow]);

  React.useEffect(() => {
    if (!isOpen) return;
    const el = logsEndRef.current;
    if (!el) return;
    const viewport = el.closest(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    if (!viewport) return;
    const onScroll = () => {
      const threshold = 80;
      const atBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        threshold;
      setAutoFollow(atBottom);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [isOpen]);

  if (!isOpen || !runId) return null;

  const stageStyles: Record<string, string> = {
    STARTING: "bg-muted text-muted-foreground border-border",
    FETCH: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    SCRAPE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    COMPLETE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    "WRITE/UPLOAD": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    WRITE: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    UPLOAD: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    ERROR: "bg-red-500/15 text-red-400 border-red-500/30",
    RETRY: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    CAPACITY: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 text-xs backdrop-blur supports-backdrop-filter:bg-background/75 rounded-t-lg">
        <div className="flex items-center justify-between">
          <span className="font-medium">Logs</span>
          <div className="flex items-center gap-3">
            <Label className="flex items-center gap-2 text-xs">
              <Switch checked={autoFollow} onCheckedChange={setAutoFollow} />
              Auto-follow
            </Label>
            <Button size="sm" variant="outline" onClick={refreshLogs}>
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                logsEndRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "end",
                })
              }
            >
              Jump to latest
            </Button>
          </div>
        </div>
      </div>
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/75 rounded-t-lg">
        <div className="grid grid-cols-[160px_140px_1fr_120px_120px] items-center px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <div>Time</div>
          <div>Stage</div>
          <div>URL</div>
          <div>Status</div>
          <div>Duration</div>
        </div>
      </div>
      <ScrollArea className="h-64">
        <Table>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  <div className="space-y-2">
                    <div>No logs yet for runId {runId}</div>
                    <div className="text-xs opacity-70">
                      {runId ? (
                        <>
                          The worker may not have started logging yet, or this
                          run hasn't produced any logs.
                        </>
                      ) : (
                        <>No run ID available. Start a job to see logs.</>
                      )}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log, idx) => {
                const raw = String(log.status || "").trim();
                const lower = raw.toLowerCase();
                const norm =
                  lower === "success" ||
                  lower === "completed" ||
                  lower === "ok"
                    ? "success"
                    : lower === "error" || lower === "failed"
                      ? "error"
                      : "pending";

                return (
                  <TableRow key={idx} className="border-0">
                    <TableCell className="font-mono text-xs text-muted-foreground py-2.5 px-4">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="py-2.5 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold",
                          stageStyles[log.type] ||
                            "bg-muted text-foreground/80 border-border"
                        )}
                      >
                        {log.type}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-4">
                      <code
                        className="font-mono text-sm text-muted-foreground block max-w-[420px] truncate"
                        title={log.url || log.message}
                      >
                        {log.url || log.message || "-"}
                      </code>
                    </TableCell>
                    <TableCell className="text-center py-2.5 px-4">
                      <span
                        className="inline-flex items-center justify-center"
                        aria-label={raw || "status"}
                      >
                        {norm === "success" ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : norm === "error" ? (
                          <X className="mx-auto h-4 w-4 text-red-500" />
                        ) : (
                          <Clock className="mx-auto h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground py-2.5 px-4">
                      {log.timing || "-"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div ref={logsEndRef} />
      </ScrollArea>
    </div>
  );
});

