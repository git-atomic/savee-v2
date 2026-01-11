import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

async function getR2Stats() {
  const endpoint = process.env.R2_ENDPOINT_URL;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return { totalObjects: 0, totalSizeBytes: 0, usagePercent: 0 };
  }
  try {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    let continuationToken: string | undefined = undefined;
    let totalObjects = 0;
    let totalSizeBytes = 0;
    let safety = 0;
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
      safety += 1;
    } while (continuationToken && safety < 1000);
    const tenGb = 10 * 1024 * 1024 * 1024;
    const usagePercent = Math.min(100, (totalSizeBytes / tenGb) * 100);
    return { totalObjects, totalSizeBytes, usagePercent };
  } catch (e) {
    console.error("[metrics] R2 stats error", e);
    return { totalObjects: 0, totalSizeBytes: 0, usagePercent: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
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

    // Job/Run metrics
    const queued = await q(
      `SELECT COUNT(*)::int AS c FROM runs WHERE status = 'pending'`
    );
    const running = await q(
      `SELECT COUNT(*)::int AS c FROM runs WHERE status = 'running'`
    );
    const paused = await q(
      `SELECT COUNT(*)::int AS c FROM runs WHERE status = 'paused'`
    );
    const completed = await q(
      `SELECT COUNT(*)::int AS c FROM runs WHERE status = 'completed'`
    );
    const error = await q(
      `SELECT COUNT(*)::int AS c FROM runs WHERE status = 'error'`
    );
    const lastSuccess = await q(
      `SELECT MAX(completed_at) AS t FROM runs WHERE status = 'completed'`
    );
    const lastError = await q(
      `SELECT MAX(updated_at) AS t FROM runs WHERE status = 'error'`
    );

    // Database entity counts
    const blocks = await q("SELECT COUNT(*)::int AS c FROM blocks");
    const sources = await q("SELECT COUNT(*)::int AS c FROM sources");
    const runs = await q("SELECT COUNT(*)::int AS c FROM runs");
    const blockSources = await q("SELECT COUNT(*)::int AS c FROM block_sources");
    const saveeUsers = await q("SELECT COUNT(*)::int AS c FROM savee_users");
    const userBlocks = await q("SELECT COUNT(*)::int AS c FROM user_blocks");

    // Blocks breakdown by status
    const blocksByStatus = await q(
      `SELECT status, COUNT(*)::int AS c FROM blocks GROUP BY status ORDER BY status`
    );

    // Blocks breakdown by media_type
    const blocksByMediaType = await q(
      `SELECT media_type, COUNT(*)::int AS c FROM blocks WHERE media_type IS NOT NULL GROUP BY media_type ORDER BY media_type`
    );

    // Sources breakdown by type
    const sourcesByType = await q(
      `SELECT source_type, COUNT(*)::int AS c FROM sources GROUP BY source_type ORDER BY source_type`
    );

    // Sources breakdown by status
    const sourcesByStatus = await q(
      `SELECT status, COUNT(*)::int AS c FROM sources GROUP BY status ORDER BY status`
    );

    // Runs breakdown by status
    const runsByStatus = await q(
      `SELECT status, COUNT(*)::int AS c FROM runs GROUP BY status ORDER BY status`
    );

    // Time-series: Blocks created per day (last 30 days)
    const blocksTimeSeries = await q(
      `SELECT 
        DATE(created_at) AS date,
        COUNT(*)::int AS count
      FROM blocks
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC`
    );

    // Time-series: Runs completed per day (last 30 days)
    const runsTimeSeries = await q(
      `SELECT 
        DATE(completed_at) AS date,
        COUNT(*)::int AS count
      FROM runs
      WHERE completed_at >= NOW() - INTERVAL '30 days'
        AND status = 'completed'
      GROUP BY DATE(completed_at)
      ORDER BY date ASC`
    );

    // R2 Storage metrics
    const r2Stats = await getR2Stats();
    const r2SoftGb = Number(process.env.R2_SOFT_LIMIT_GB || 9.5);
    const r2LimitBytes = r2SoftGb * 1024 * 1024 * 1024;

    const workerParallelism = parseInt(
      process.env.WORKER_PARALLELISM || "2",
      10
    );

    return NextResponse.json({
      success: true,
      // Job metrics
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
      // Database metrics
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
      // R2 Storage metrics
      r2: {
        totalObjects: r2Stats.totalObjects,
        totalSizeBytes: r2Stats.totalSizeBytes,
        totalSizeGb: r2Stats.totalSizeBytes / (1024 * 1024 * 1024),
        usagePercent: r2Stats.usagePercent,
        softLimitGb: r2SoftGb,
        softLimitBytes: r2LimitBytes,
        nearLimit: r2Stats.totalSizeBytes >= r2LimitBytes,
      },
    });
  } catch (error) {
    console.error("[metrics] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get metrics" },
      { status: 500 }
    );
  }
}
