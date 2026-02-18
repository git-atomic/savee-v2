import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Dev-only bypass to avoid 401s during local development
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  // Check for external monitor token first (for GitHub Actions)
  const token = process.env.ENGINE_MONITOR_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) {
      const provided = auth.slice(7).trim();
      if (provided === token) return true;
    }
    try {
      const url = new URL(req.url);
      const t = url.searchParams.get("token");
      if (t && t === token) return true;
    } catch {}
  }

  // For admin panel access, check Payload session
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    return !!user; // Allow any authenticated admin user
  } catch {
    return !token; // Allow unauthenticated access only if no token is set (dev mode)
  }
}

interface JobData {
  id: string;
  runId?: string; // Run ID for fetching logs
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
  intervalSeconds?: number; // explicit override stored on source
  disableBackoff?: boolean; // explicit setting stored on source
  effectiveIntervalSeconds?: number; // computed: override or global
  backoffMultiplier?: number; // computed from recent run outcomes
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const staleMinutes = Math.max(
      5,
      parseInt(process.env.RUN_STALE_MINUTES || "20", 10) || 20
    );
    const staleThresholdMs = staleMinutes * 60 * 1000;
    const payload = await getPayload({ config });

    // Get sources with their latest runs - OPTIMIZED: batch fetch all runs at once
    const sources = await payload.find({
      collection: "sources",
      limit: 100,
      sort: "-createdAt",
    });

    const sourceIds = sources.docs.map((s) => s.id);
    
    // Batch fetch all latest runs in a single query using raw SQL for performance
    const db = (payload.db as any).pool;
    let latestRunsMap = new Map<number, any>();
    let recentRunsMap = new Map<number, any[]>();
    let blockUrlsMap = new Map<number, string[]>(); // Cache block URLs for blocks sources
    
    if (sourceIds.length > 0) {
      try {
        // Get latest run for each source in one query
        const latestRunsQuery = await db.query(`
          SELECT DISTINCT ON (r.source_id) 
            r.id,
            r.source_id,
            r.status,
            r.counters,
            r.created_at,
            r.updated_at,
            r.started_at,
            r.completed_at,
            r.max_items,
            r.error_message
          FROM runs r
          WHERE r.source_id = ANY($1::int[])
          ORDER BY r.source_id, r.created_at DESC
        `, [sourceIds]);
        
        for (const row of latestRunsQuery.rows) {
          let counters = row.counters;
          if (typeof counters === 'string') {
            try {
              counters = JSON.parse(counters);
            } catch {
              counters = { found: 0, uploaded: 0, errors: 0, skipped: 0 };
            }
          }
          latestRunsMap.set(row.source_id, {
            id: row.id,
            source: row.source_id,
            status: row.status,
            counters: counters || { found: 0, uploaded: 0, errors: 0, skipped: 0 },
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            maxItems: row.max_items,
            errorMessage: row.error_message,
          });
        }
        
        // Get recent 3 runs per source for backoff calculation (batch)
        const recentRunsQuery = await db.query(`
          SELECT r.source_id, r.status, r.counters
          FROM (
            SELECT r.*,
                   ROW_NUMBER() OVER (PARTITION BY r.source_id ORDER BY r.created_at DESC) as rn
            FROM runs r
            WHERE r.source_id = ANY($1::int[])
          ) r
          WHERE r.rn <= 3
          ORDER BY r.source_id, r.created_at DESC
        `, [sourceIds]);
        
        for (const row of recentRunsQuery.rows) {
          if (!recentRunsMap.has(row.source_id)) {
            recentRunsMap.set(row.source_id, []);
          }
          let counters = row.counters;
          if (typeof counters === 'string') {
            try {
              counters = JSON.parse(counters);
            } catch {
              counters = {};
            }
          }
          recentRunsMap.get(row.source_id)!.push({
            status: row.status,
            counters: counters || {},
          });
        }
      } catch (dbError) {
        console.error("[jobs] Batch query error, falling back to individual queries:", dbError);
        // Fallback: if batch query fails, continue with individual queries (slower but works)
      }
      
      // Batch fetch block URLs for all blocks sources
      try {
        const blocksSources = sources.docs.filter(
          (s: any) =>
            s.sourceType === "blocks" ||
            String(s.url || "").toLowerCase().includes("bulk_import_")
        );
        if (blocksSources.length > 0) {
          const blocksSourceIds = blocksSources.map((s: any) => s.id);
          const blockUrlsQuery = await db.query(`
            SELECT source_id, url
            FROM blocks
            WHERE source_id = ANY($1::int[])
            ORDER BY source_id, url
          `, [blocksSourceIds]);
          
          for (const row of blockUrlsQuery.rows) {
            if (!blockUrlsMap.has(row.source_id)) {
              blockUrlsMap.set(row.source_id, []);
            }
            if (row.url && !blockUrlsMap.get(row.source_id)!.includes(row.url)) {
              blockUrlsMap.get(row.source_id)!.push(row.url);
            }
          }
          
          // Limit to 50 URLs per source for display
          for (const [sourceId, urls] of blockUrlsMap.entries()) {
            if (urls.length > 50) {
              blockUrlsMap.set(sourceId, urls.slice(0, 50));
            }
          }
        }
      } catch (blockError) {
        console.error("[jobs] Failed to batch fetch block URLs:", blockError);
      }
    }

    const jobs: JobData[] = await Promise.all(
      sources.docs.map(async (source) => {
        const sourceUrl = String((source as any).url || "").toLowerCase();
        const sourceUsername = String((source as any).username || "").toLowerCase();
        const normalizedSourceType =
          (source as any).sourceType === "blocks" ||
          sourceUrl.includes("bulk_import_") ||
          sourceUsername.startsWith("bulk_import_")
            ? "blocks"
            : ((source as any).sourceType as "home" | "pop" | "user" | "blocks");
        const normalizedUsername =
          normalizedSourceType === "blocks"
            ? undefined
            : (source as any).username || undefined;
        // Get latest run from map, or fallback to individual query if batch failed
        let latestRun = latestRunsMap.get(source.id);
        if (!latestRun && sourceIds.length > 0) {
          // Fallback: individual query if batch didn't work
          try {
            const runs = await payload.find({
              collection: "runs",
              where: { source: { equals: source.id } },
              limit: 1,
              sort: "-createdAt",
            });
            latestRun = runs.docs[0] as any;
          } catch {}
        }
        
        const latestUpdatedAt = latestRun?.updatedAt || latestRun?.updated_at
          ? new Date((latestRun.updatedAt || latestRun.updated_at) as any).getTime()
          : undefined;
        const isStaleRunning =
          latestRun?.status === "running" &&
          typeof latestUpdatedAt === "number" &&
          Date.now() - latestUpdatedAt > staleThresholdMs;

        // REMOVED: Auto-reconcile - this was doing a DB query for every completed run
        // This should be done via a background job or only when explicitly requested
        // The reconciliation logic is still available via the /reconcile endpoint

        // REMOVED: Backfill update - this was running on every request and slowing things down
        // This should be done via a background job or migration, not on every API call

        // Compute backoff multiplier using pre-fetched recent runs
        let backoffMultiplier = 1;
        try {
          const recent = recentRunsMap.get(source.id) || [];
          let errorCount = 0;
          let zeroUploadCount = 0;
          for (const r of recent) {
            const st = String(r.status || "").toLowerCase();
            if (st === "error") errorCount += 1;
            try {
              const c = r.counters || {};
              if (c && Number(c.uploaded) === 0) zeroUploadCount += 1;
            } catch {}
          }
          backoffMultiplier = Math.max(
            1,
            Math.pow(2, errorCount) * (1 + zeroUploadCount)
          );
        } catch {}

        // Compute nextRun using source overrides when possible
        const envMin = parseInt(
          process.env.MONITOR_MIN_INTERVAL_SECONDS || String(1 * 60 * 60),
          10
        );
        const overrideInterval =
          typeof (source as any).intervalSeconds === "number"
            ? Math.max(10, (source as any).intervalSeconds)
            : null;
        const baseInterval = overrideInterval ?? envMin;
          const completedAtMs = latestRun?.completedAt || latestRun?.completed_at
          ? new Date((latestRun.completedAt || latestRun.completed_at) as any).getTime()
          : undefined;
        const nextRunIso = completedAtMs
          ? new Date(
              Math.max(completedAtMs + baseInterval * 1000, Date.now())
            ).toISOString()
          : undefined;

        // For blocks type, use pre-fetched block URLs from batch query
        let displayUrl = source.url;
        if (normalizedSourceType === "blocks") {
          const blockUrls = blockUrlsMap.get(source.id) || [];
          if (blockUrls.length > 0) {
            // Use comma-separated URLs for blocks type so they can be parsed and displayed
            displayUrl = blockUrls.join(",");
          }
        }

        const runIdStr = latestRun?.id?.toString();
        
        return {
          id: source.id.toString(),
          runId: runIdStr, // Add run ID for logs
          url: displayUrl,
          sourceType: normalizedSourceType,
          username: normalizedUsername,
          maxItems: (typeof latestRun?.maxItems === "number"
            ? latestRun?.maxItems
            : null) as any,
          origin: (normalizedSourceType === "user"
            ? normalizedUsername || "user"
            : normalizedSourceType) as string,
          status:
            latestRun?.status === "running" && !isStaleRunning
              ? "running"
              : latestRun?.status === "pending"
                ? "queued"
                : (source.status as any) === "paused"
                  ? "paused"
                  : (source.status as any) === "stopped"
                    ? "stopped"
                    : latestRun?.status === "error"
                      ? "error"
                      : latestRun?.status === "completed"
                        ? normalizedSourceType === "blocks" ? "completed" : "active"
                        : (source.status as any),
          runStatus: isStaleRunning ? "stale" : (latestRun?.status as string), // expose stale
          counters: latestRun?.counters || { found: 0, uploaded: 0, errors: 0 },
          lastRun: latestRun?.completedAt || latestRun?.completed_at || latestRun?.startedAt || latestRun?.started_at || undefined,
          nextRun: nextRunIso,
          // Echo schedule so UI can show/edit current values
          intervalSeconds: (source as any).intervalSeconds ?? undefined,
          disableBackoff: (source as any).disableBackoff ?? undefined,
          effectiveIntervalSeconds: baseInterval,
          backoffMultiplier,
          error: latestRun?.errorMessage || latestRun?.error_message || undefined,
        };
      })
    );

    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
