import { NextRequest, NextResponse } from "next/server";
import { addLog, getLogs } from "./store";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.ENGINE_MONITOR_TOKEN;
  if (!token) return true; // Allow if no token configured
  
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
  return bearerToken === token;
}

// GET: Fetch logs for a runId
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const runIdParam = url.searchParams.get("runId");
    const limitParam = url.searchParams.get("limit");
    
    if (!runIdParam) {
      return NextResponse.json(
        { success: false, error: "runId is required" },
        { status: 400 }
      );
    }
    
    const runId = parseInt(runIdParam, 10);
    if (!Number.isFinite(runId)) {
      return NextResponse.json(
        { success: false, error: "Invalid runId" },
        { status: 400 }
      );
    }
    
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 500;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 150;
    const logs = await getLogs(runId, limit);

    return NextResponse.json({
      success: true,
      logs: logs || [],
    }, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[logs] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}

// POST: Receive logs from worker
export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const body = await request.json().catch(() => ({}));
    const jobId = body.jobId || body.runId;
    const rawLogs = Array.isArray(body.logs)
      ? body.logs
      : [body.log || body];
    
    if (!jobId || rawLogs.length === 0) {
      return NextResponse.json(
        { success: false, error: "jobId and log(s) are required" },
        { status: 400 }
      );
    }
    
    const runId = typeof jobId === "string" ? parseInt(jobId, 10) : jobId;
    if (!Number.isFinite(runId)) {
      return NextResponse.json(
        { success: false, error: "Invalid jobId" },
        { status: 400 }
      );
    }
    
    // Normalize and store multiple logs in one request.
    const normalizedLogs = rawLogs
      .filter((l: any) => l && typeof l === "object")
      .slice(0, 200)
      .map((log: any) => ({
        timestamp: log.timestamp || new Date().toISOString(),
        type: log.type || "LOG",
        url: log.url || log.item_url || "",
        status: log.status || "",
        timing:
          typeof log.timing === "number"
            ? `${log.timing.toFixed(2)}s`
            : log.timing,
        message: log.message || log.progress || "",
      }));

    try {
      for (const logEntry of normalizedLogs) {
        await addLog(runId, logEntry);
      }
      return NextResponse.json({ success: true, count: normalizedLogs.length });
    } catch (error: any) {
      console.error("[logs] POST error storing log:", error?.message || error);
      return NextResponse.json(
        { success: false, error: "Failed to store log" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[logs] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to store log" },
      { status: 500 }
    );
  }
}

