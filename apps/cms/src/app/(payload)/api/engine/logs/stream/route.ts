import { NextRequest } from "next/server";
import { registerSSEConnection } from "../store";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const runIdParam = url.searchParams.get("runId");
  
  if (!runIdParam) {
    return new Response("runId is required", { status: 400 });
  }
  
  const runId = parseInt(runIdParam, 10);
  if (!Number.isFinite(runId)) {
    return new Response("Invalid runId", { status: 400 });
  }
  
  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "CONNECTED", message: "Log stream connected" })}\n\n`)
      );
      
      // Register connection
      const cleanup = registerSSEConnection(runId, controller);
      
      // Keep connection alive with periodic ping
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`: ping\n\n`)
          );
        } catch (error) {
          clearInterval(pingInterval);
          cleanup();
        }
      }, 30000); // Ping every 30 seconds
      
      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
