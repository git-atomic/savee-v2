import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface MetricsResponsePayload {
  success: boolean;
  jobs: any;
  db: any;
  r2: any;
}

interface R2BucketConfig {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
}

interface R2ScanStats {
  configured: boolean;
  totalObjects: number;
  totalSizeBytes: number;
  sampled: boolean;
  sampledPages: number;
  bucket: string | null;
  error: string | null;
}

interface CachedR2StatsEntry {
  expiresAt: number;
  stats: R2ScanStats;
}

function normalizeR2Token(v?: string) {
  return String(v || "").trim().toLowerCase().replace(/\/+$/, "");
}

function hasNonEmptyValue(v?: string) {
  return String(v || "").trim() !== "";
}

function isR2ConfigComplete(config: R2BucketConfig) {
  return (
    hasNonEmptyValue(config.endpoint) &&
    hasNonEmptyValue(config.accessKeyId) &&
    hasNonEmptyValue(config.secretAccessKey) &&
    hasNonEmptyValue(config.bucket)
  );
}

function isSameR2Target(a: R2BucketConfig, b: R2BucketConfig) {
  return (
    normalizeR2Token(a.endpoint) !== "" &&
    normalizeR2Token(a.endpoint) === normalizeR2Token(b.endpoint) &&
    normalizeR2Token(a.bucket) !== "" &&
    normalizeR2Token(a.bucket) === normalizeR2Token(b.bucket)
  );
}

let metricsCache: { expiresAt: number; payload: MetricsResponsePayload } | null =
  null;
let metricsInflight: Promise<MetricsResponsePayload> | null = null;
const r2StatsCache = new Map<string, CachedR2StatsEntry>();

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const n = parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readOptionalPositiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getR2Config(prefix = ""): R2BucketConfig {
  return {
    endpoint: process.env[`${prefix}R2_ENDPOINT_URL`],
    accessKeyId: process.env[`${prefix}R2_ACCESS_KEY_ID`],
    secretAccessKey: process.env[`${prefix}R2_SECRET_ACCESS_KEY`],
    bucket: process.env[`${prefix}R2_BUCKET_NAME`],
  };
}

function buildR2CacheKey(config: R2BucketConfig) {
  return [
    normalizeR2Token(config.endpoint),
    normalizeR2Token(config.bucket),
    normalizeR2Token(config.accessKeyId),
  ].join("|");
}

function pruneR2StatsCache(now = Date.now()) {
  for (const [key, value] of r2StatsCache) {
    if (value.expiresAt <= now) {
      r2StatsCache.delete(key);
    }
  }

  // Keep memory bounded for long-running instances.
  const maxEntries = 16;
  if (r2StatsCache.size <= maxEntries) return;

  const entries = [...r2StatsCache.entries()].sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt
  );
  for (const [key] of entries.slice(0, r2StatsCache.size - maxEntries)) {
    r2StatsCache.delete(key);
  }
}

function emptyR2Stats(
  bucket: string | null = null,
  configured = false,
  error: string | null = null
): R2ScanStats {
  return {
    configured,
    totalObjects: 0,
    totalSizeBytes: 0,
    sampled: false,
    sampledPages: 0,
    bucket,
    error,
  };
}

function buildR2Usage(stats: R2ScanStats, softLimitGb: number) {
  const safeSoftLimitGb = Number.isFinite(softLimitGb) && softLimitGb > 0
    ? softLimitGb
    : 9.5;
  const softLimitBytes = safeSoftLimitGb * 1024 * 1024 * 1024;
  const usagePercent =
    softLimitBytes > 0
      ? Math.min(100, (stats.totalSizeBytes / softLimitBytes) * 100)
      : 0;

  return {
    configured: stats.configured,
    bucket: stats.bucket,
    totalObjects: stats.totalObjects,
    totalSizeBytes: stats.totalSizeBytes,
    totalSizeGb: stats.totalSizeBytes / (1024 * 1024 * 1024),
    usagePercent,
    softLimitGb: safeSoftLimitGb,
    softLimitBytes,
    nearLimit: softLimitBytes > 0 && stats.totalSizeBytes >= softLimitBytes,
    sampled: stats.sampled,
    sampledPages: stats.sampledPages,
    error: stats.error,
  };
}

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

async function getR2Stats(config: R2BucketConfig) {
  const endpoint = config.endpoint;
  const accessKeyId = config.accessKeyId;
  const secretAccessKey = config.secretAccessKey;
  const bucket = config.bucket;
  if (!isR2ConfigComplete(config)) {
    return emptyR2Stats(bucket ?? null);
  }
  try {
    // Default to exact scans (no page cap) unless R2_METRICS_MAX_PAGES is set.
    const configuredPageLimit = readOptionalPositiveIntEnv("R2_METRICS_MAX_PAGES");
    const pageLimit = configuredPageLimit ?? Number.MAX_SAFE_INTEGER;
    const maxScanMs = readIntEnv("R2_METRICS_MAX_SCAN_MS", 25000, 1000, 120000);
    const deadline = Date.now() + maxScanMs;
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    let continuationToken: string | undefined = undefined;
    let totalObjects = 0;
    let totalSizeBytes = 0;
    let pagesRead = 0;
    let truncatedByTimeBudget = false;
    do {
      const resp = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );
      const contents = resp.Contents || [];
      for (const obj of contents) {
        totalObjects += 1;
        totalSizeBytes += obj.Size || 0;
      }
      continuationToken = resp.IsTruncated
        ? (resp.NextContinuationToken as string | undefined)
        : undefined;
      pagesRead += 1;

      if (continuationToken && Date.now() >= deadline) {
        truncatedByTimeBudget = true;
        break;
      }
    } while (continuationToken && pagesRead < pageLimit);

    const sampled = Boolean(continuationToken);
    if (sampled) {
      const reason = truncatedByTimeBudget
        ? `time budget (${maxScanMs}ms)`
        : configuredPageLimit
          ? `page limit (${configuredPageLimit})`
          : "unknown cap";
      console.warn(
        `[metrics] R2 scan sampled for bucket=${bucket} pages=${pagesRead} reason=${reason}`
      );
    }
    return {
      configured: true,
      totalObjects,
      totalSizeBytes,
      sampled,
      sampledPages: pagesRead,
      bucket,
      error: null,
    };
  } catch (e) {
    console.error("[metrics] R2 stats error", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    return emptyR2Stats(bucket ?? null, true, errorMessage);
  }
}

async function getR2StatsCached(config: R2BucketConfig) {
  if (!isR2ConfigComplete(config)) {
    return emptyR2Stats(config.bucket ?? null);
  }

  const cacheSeconds = readIntEnv("R2_METRICS_CACHE_SECONDS", 1800, 60, 86400);
  const cacheKey = buildR2CacheKey(config);
  const now = Date.now();
  const cached = r2StatsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.stats;
  }

  const stats = await getR2Stats(config);
  r2StatsCache.set(cacheKey, {
    stats,
    expiresAt: now + cacheSeconds * 1000,
  });
  pruneR2StatsCache(now);
  return stats;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const url = new URL(request.url);
    const forceRefresh =
      url.searchParams.get("refresh") === "1" ||
      url.searchParams.get("refresh") === "true";
    const cacheSeconds = readIntEnv("ENGINE_METRICS_CACHE_SECONDS", 120, 15, 600);
    const now = Date.now();

    if (!forceRefresh && metricsCache && metricsCache.expiresAt > now) {
      return NextResponse.json(metricsCache.payload, {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Metrics-Cache": "HIT",
        },
      });
    }

    if (!forceRefresh && metricsInflight) {
      const cachedPayload = await metricsInflight;
      return NextResponse.json(cachedPayload, {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Metrics-Cache": "INFLIGHT",
        },
      });
    }

    metricsInflight = (async () => {
      const payload = await getPayload({ config });
      const db = (payload.db as any).pool;

      const q = async (sql: string, params: any[] = []) => {
        try {
          return await db.query(sql, params);
        } catch (e) {
          console.error("[metrics] query failed", sql, e);
          return { rows: [] } as any;
        }
      };

      const primaryR2Config = getR2Config("");
      const secondaryR2Config = getR2Config("SECONDARY_");
      const secondarySameAsPrimary = isSameR2Target(
        primaryR2Config,
        secondaryR2Config
      );
      const secondaryConfigured =
        isR2ConfigComplete(secondaryR2Config) && !secondarySameAsPrimary;

      const retentionTableExistsResult = await q(
        `SELECT to_regclass('engine_metrics_daily') IS NOT NULL AS exists`
      );
      const retentionTableExists = Boolean(
        retentionTableExistsResult.rows?.[0]?.exists
      );

      const [
        queued,
        running,
        paused,
        completed,
        error,
        lastSuccess,
        lastError,
        blocks,
        sources,
        runs,
        blockSources,
        saveeUsers,
        userBlocks,
        blocksByStatus,
        blocksByMediaType,
        sourcesByType,
        sourcesByStatus,
        runsByStatus,
        blocksTimeSeries,
        runsTimeSeries,
        retentionLastRunAt,
        retentionPrunedLogs7d,
        retentionPrunedRuns7d,
        retentionCompactedRuns7d,
        primaryR2Stats,
        secondaryR2Stats,
      ] = await Promise.all([
        q(`SELECT COUNT(*)::int AS c FROM runs WHERE status = 'pending'`),
        q(`SELECT COUNT(*)::int AS c FROM runs WHERE status = 'running'`),
        q(`SELECT COUNT(*)::int AS c FROM runs WHERE status = 'paused'`),
        q(`SELECT COUNT(*)::int AS c FROM runs WHERE status = 'completed'`),
        q(`SELECT COUNT(*)::int AS c FROM runs WHERE status = 'error'`),
        q(`SELECT MAX(completed_at) AS t FROM runs WHERE status = 'completed'`),
        q(`SELECT MAX(updated_at) AS t FROM runs WHERE status = 'error'`),
        q("SELECT COUNT(*)::int AS c FROM blocks"),
        q("SELECT COUNT(*)::int AS c FROM sources"),
        q("SELECT COUNT(*)::int AS c FROM runs"),
        q("SELECT COUNT(*)::int AS c FROM block_sources"),
        q("SELECT COUNT(*)::int AS c FROM savee_users"),
        q("SELECT COUNT(*)::int AS c FROM user_blocks"),
        q(`SELECT status, COUNT(*)::int AS c FROM blocks GROUP BY status ORDER BY status`),
        q(
          `SELECT media_type, COUNT(*)::int AS c FROM blocks WHERE media_type IS NOT NULL GROUP BY media_type ORDER BY media_type`
        ),
        q(
          `SELECT source_type, COUNT(*)::int AS c FROM sources GROUP BY source_type ORDER BY source_type`
        ),
        q(`SELECT status, COUNT(*)::int AS c FROM sources GROUP BY status ORDER BY status`),
        q(`SELECT status, COUNT(*)::int AS c FROM runs GROUP BY status ORDER BY status`),
        q(
          `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
           FROM blocks
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY DATE(created_at)
           ORDER BY date ASC`
        ),
        q(
          `SELECT DATE(completed_at) AS date, COUNT(*)::int AS count
           FROM runs
           WHERE completed_at >= NOW() - INTERVAL '30 days' AND status = 'completed'
           GROUP BY DATE(completed_at)
           ORDER BY date ASC`
        ),
        retentionTableExists
          ? q(`SELECT MAX(updated_at) AS t FROM engine_metrics_daily`)
          : Promise.resolve({ rows: [{ t: null }] } as any),
        retentionTableExists
          ? q(
              `SELECT COALESCE(SUM(pruned_job_logs), 0)::int AS c
               FROM engine_metrics_daily
               WHERE day >= CURRENT_DATE - INTERVAL '7 days'`
            )
          : Promise.resolve({ rows: [{ c: 0 }] } as any),
        retentionTableExists
          ? q(
              `SELECT COALESCE(SUM(pruned_runs), 0)::int AS c
               FROM engine_metrics_daily
               WHERE day >= CURRENT_DATE - INTERVAL '7 days'`
            )
          : Promise.resolve({ rows: [{ c: 0 }] } as any),
        retentionTableExists
          ? q(
              `SELECT COALESCE(SUM(compacted_runs), 0)::int AS c
               FROM engine_metrics_daily
               WHERE day >= CURRENT_DATE - INTERVAL '7 days'`
            )
          : Promise.resolve({ rows: [{ c: 0 }] } as any),
        getR2StatsCached(primaryR2Config),
        secondarySameAsPrimary
          ? Promise.resolve(emptyR2Stats(secondaryR2Config.bucket ?? null))
          : getR2StatsCached(secondaryR2Config),
      ]);

      const primarySoftLimitGb = readNumberEnv("R2_SOFT_LIMIT_GB", 9.5);
      const secondarySoftLimitGb = readNumberEnv(
        "SECONDARY_R2_SOFT_LIMIT_GB",
        primarySoftLimitGb
      );
      const primaryR2 = buildR2Usage(primaryR2Stats, primarySoftLimitGb);
      const secondaryR2 = buildR2Usage(secondaryR2Stats, secondarySoftLimitGb);
      const hasSecondary = secondaryConfigured;
      const combinedLimitBytes =
        primaryR2.softLimitBytes +
        (hasSecondary ? secondaryR2.softLimitBytes : 0);
      const combinedSizeBytes =
        primaryR2.totalSizeBytes + (hasSecondary ? secondaryR2.totalSizeBytes : 0);
      const combinedUsagePercent =
        combinedLimitBytes > 0
          ? Math.min(100, (combinedSizeBytes / combinedLimitBytes) * 100)
          : 0;
      const incompleteR2 =
        Boolean(primaryR2.error) ||
        Boolean(hasSecondary && secondaryR2.error) ||
        primaryR2.sampled ||
        Boolean(hasSecondary && secondaryR2.sampled);
      const workerParallelism = parseInt(process.env.WORKER_PARALLELISM || "2", 10);

      return {
        success: true,
        jobs: {
          queued: queued.rows?.[0]?.c ?? 0,
          running: running.rows?.[0]?.c ?? 0,
          paused: paused.rows?.[0]?.c ?? 0,
          completed: completed.rows?.[0]?.c ?? 0,
          error: error.rows?.[0]?.c ?? 0,
          lastSuccessAt: lastSuccess.rows?.[0]?.t ?? null,
          lastErrorAt: lastError.rows?.[0]?.t ?? null,
          workerParallelism: Number.isFinite(workerParallelism)
            ? workerParallelism
            : 2,
        },
        db: {
          total: {
            blocks: blocks.rows?.[0]?.c ?? 0,
            sources: sources.rows?.[0]?.c ?? 0,
            runs: runs.rows?.[0]?.c ?? 0,
            blockSources: blockSources.rows?.[0]?.c ?? 0,
            saveeUsers: saveeUsers.rows?.[0]?.c ?? 0,
            userBlocks: userBlocks.rows?.[0]?.c ?? 0,
          },
          blocksByStatus: blocksByStatus.rows || [],
          blocksByMediaType: blocksByMediaType.rows || [],
          sourcesByType: sourcesByType.rows || [],
          sourcesByStatus: sourcesByStatus.rows || [],
          runsByStatus: runsByStatus.rows || [],
          timeSeries: {
            blocks: blocksTimeSeries.rows || [],
            runs: runsTimeSeries.rows || [],
          },
        },
        maintenance: {
          retention: {
            available: retentionTableExists,
            lastRunAt: retentionLastRunAt.rows?.[0]?.t ?? null,
            prunedJobLogs7d: retentionPrunedLogs7d.rows?.[0]?.c ?? 0,
            prunedRuns7d: retentionPrunedRuns7d.rows?.[0]?.c ?? 0,
            compactedRuns7d: retentionCompactedRuns7d.rows?.[0]?.c ?? 0,
          },
        },
        r2: {
          totalObjects:
            primaryR2.totalObjects + (hasSecondary ? secondaryR2.totalObjects : 0),
          totalSizeBytes: combinedSizeBytes,
          totalSizeGb: combinedSizeBytes / (1024 * 1024 * 1024),
          usagePercent: combinedUsagePercent,
          softLimitGb: combinedLimitBytes / (1024 * 1024 * 1024),
          softLimitBytes: combinedLimitBytes,
          nearLimit: combinedLimitBytes > 0 && combinedSizeBytes >= combinedLimitBytes,
          sampled: primaryR2.sampled || (hasSecondary ? secondaryR2.sampled : false),
          sampledPages:
            primaryR2.sampledPages + (hasSecondary ? secondaryR2.sampledPages : 0),
          hasSecondary,
          secondaryIgnoredAsDuplicate: secondarySameAsPrimary,
          incomplete: incompleteR2,
          primary: primaryR2,
          secondary: hasSecondary
            ? secondaryR2
            : { ...secondaryR2, configured: false },
        },
      } satisfies MetricsResponsePayload;
    })();

    const computed = await metricsInflight;
    metricsCache = {
      payload: computed,
      expiresAt: Date.now() + cacheSeconds * 1000,
    };
    metricsInflight = null;

    return NextResponse.json(computed, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Metrics-Cache": "MISS",
      },
    });
  } catch (error) {
    metricsInflight = null;
    console.error("[metrics] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get metrics" },
      { status: 500 }
    );
  }
}
