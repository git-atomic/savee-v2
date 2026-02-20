import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

async function getDbConnection() {
  const payload = await getPayload({ config });
  return (payload.db as any).pool;
}

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.ENGINE_MONITOR_TOKEN;
  if (!token) return true; // allow in dev if not set
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const provided = auth.slice(7).trim();
    if (provided === token) return true;
  }
  try {
    const u = new URL(req.url);
    const qp = u.searchParams.get("token");
    if (qp && qp === token) return true;
  } catch {}
  return false;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const db = await getDbConnection();
    const url = new URL(request.url);
    const defaultLimit = parseInt(process.env.PENDING_DEFAULT_LIMIT || "20", 10);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(url.searchParams.get("limit") || String(defaultLimit), 10))
    );

    const res = await db.query(
      `SELECT r.id as run_id, r.max_items, s.url, s.id as source_id, s.source_type, s.username
       FROM runs r
       JOIN sources s ON r.source_id = s.id
       WHERE r.status = 'pending'
          AND COALESCE(s.status::text, '') != 'paused'
       ORDER BY r.created_at ASC
       LIMIT $1`,
      [limit]
    );

    const pending: Array<{
      sourceId: number;
      runId: number;
      url: string;
      maxItems: number | null;
      sourceType?: string;
      username?: string;
    }> = [];
    for (const row of res.rows as Array<{
      source_id: number;
      run_id: number;
      max_items: number | null;
      url: string | null;
      source_type: string | null;
      username: string | null;
    }>) {
      let effectiveUrl = String(row.url || "").trim();
      const sourceType = String(row.source_type || "").toLowerCase();
      const username = String(row.username || "").trim();
      if (!effectiveUrl) {
        if (sourceType === "home") effectiveUrl = "https://savee.com/";
        else if (sourceType === "pop") effectiveUrl = "https://savee.com/pop/";
        else if (sourceType === "user" && username)
          effectiveUrl = `https://savee.com/${username}/`;
      }
      if (!effectiveUrl) {
        try {
          await db.query(
            `UPDATE runs
             SET status = 'error',
                 error_message = $1,
                 completed_at = now(),
                 updated_at = now()
             WHERE id = $2`,
            ["No usable source URL for pending run", Number(row.run_id)]
          );
        } catch {}
        continue;
      }
      if (!/^https?:\/\//i.test(effectiveUrl)) {
        effectiveUrl = `https://${effectiveUrl.replace(/^\/+/, "")}`;
      }
      pending.push({
        sourceId: Number(row.source_id),
        runId: Number(row.run_id),
        url: effectiveUrl,
        maxItems: row.max_items === null ? null : Number(row.max_items),
        sourceType: sourceType || undefined,
        username: username || undefined,
      });
    }

    return NextResponse.json({ success: true, pending });
  } catch (error) {
    console.error("[pending] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // alias to GET for convenience
  return GET(request);
}
