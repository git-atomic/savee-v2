import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId: runIdParam } = await params;
    const runId = parseInt(runIdParam, 10);
    if (!Number.isFinite(runId)) {
      return NextResponse.json(
        { success: false, error: "Invalid run id" },
        { status: 400 }
      );
    }

    const payload = await getPayload({ config });
    const db = (payload.db as any).pool;

    // If run is still marked running but stale, reconcile counters and mark completed
    const runRes = await db.query(
      `SELECT id, status, updated_at FROM runs WHERE id = $1`,
      [runId]
    );
    const run = runRes.rows?.[0];
    if (!run) {
      return NextResponse.json(
        { success: false, error: "Run not found" },
        { status: 404 }
      );
    }

    // Get current run counters to preserve tracked values
    const currentRun = await db.query(
      `SELECT counters FROM runs WHERE id = $1`,
      [runId]
    );
    const currentCounters = currentRun.rows?.[0]?.counters 
      ? (typeof currentRun.rows[0].counters === 'string' 
          ? JSON.parse(currentRun.rows[0].counters) 
          : currentRun.rows[0].counters)
      : { found: 0, uploaded: 0, errors: 0, skipped: 0 };

    // Count uploaded from blocks table (source of truth)
    const up = await db.query(
      `SELECT COUNT(*)::int AS c FROM blocks WHERE run_id = $1`,
      [runId]
    );
    const uploaded = up.rows?.[0]?.c ?? 0;

    // Use found from current counters if available, otherwise use uploaded as conservative estimate
    const found = currentCounters.found || uploaded;
    const trackedSkipped = currentCounters.skipped || 0;
    
    // Recalculate errors based on actual results: found = uploaded + skipped + errors
    // So: errors = found - uploaded - skipped
    // This ensures errors only reflect items that were actually not uploaded and not skipped
    // If items succeeded after errors were counted, this will correct the error count
    const errors = Math.max(0, found - uploaded - trackedSkipped);
    
    // Recalculate skipped to ensure consistency: found = uploaded + skipped + errors
    // So: skipped = found - uploaded - errors
    const skipped = Math.max(0, found - uploaded - errors);

    const counters = { found, uploaded, errors, skipped };

    await db.query(
      `UPDATE runs SET status = 'completed', counters = $1::jsonb, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(counters), runId]
    );

    return NextResponse.json({ success: true, counters });
  } catch (e) {
    console.error("[reconcile] error", e);
    return NextResponse.json(
      { success: false, error: "Failed to reconcile" },
      { status: 500 }
    );
  }
}
