// Database-backed log storage for serverless environments
// Works with Neon Postgres (free tier) for persistent storage

import { getPayload } from "payload";
import config from "@payload-config";
import { detectJobLogsSchema } from "./schema-detector";

interface LogEntry {
  timestamp: string;
  type: string;
  url: string;
  status: string;
  timing?: string;
  message?: string;
}

// SSE connections for real-time streaming (in-memory, per-instance)
// Note: In serverless, SSE is limited but we use it for best-effort real-time updates
export const sseConnections = new Map<number, Set<ReadableStreamDefaultController>>();

async function getDbConnection() {
  const payload = await getPayload({ config });
  return (payload.db as any).pool;
}

export async function addLog(runId: number, entry: LogEntry) {
  try {
    const db = await getDbConnection();
    if (!db) {
      console.error("[logs] No database connection available");
      return;
    }
    
    // Detect actual schema
    const schema = await detectJobLogsSchema();
    
    // Build INSERT query based on detected schema
    if (schema.hasLogType) {
      // Old schema: log_type, no timestamp/timing/message
      await db.query(
        `INSERT INTO job_logs (run_id, log_type, url, status)
         VALUES ($1, $2, $3, $4)`,
        [
          runId,
          entry.type || "LOG",
          entry.url || null,
          entry.status || null,
        ]
      );
    } else if (schema.hasType) {
      // New schema: type, timestamp, timing, message
      const columns = ['run_id', 'type', 'url', 'status'];
      const values = [runId, entry.type || "LOG", entry.url || null, entry.status || null];
      
      if (schema.hasTimestamp) {
        columns.push('timestamp');
        values.push(entry.timestamp || new Date().toISOString());
      }
      if (schema.hasTiming) {
        columns.push('timing');
        values.push(entry.timing || null);
      }
      if (schema.hasMessage) {
        columns.push('message');
        values.push(entry.message || null);
      }
      
      await db.query(
        `INSERT INTO job_logs (${columns.join(', ')})
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
        values
      );
    } else {
      throw new Error(`[addLog] Unknown schema: neither 'type' nor 'log_type' column found`);
    }
    
    // Clean up old logs (keep last 1000 per run) - run in background, don't block
    // Reuse schema from above (already detected)
    const orderBy = schema.hasTimestamp ? 'timestamp DESC' : 'id DESC';
    
    db.query(
      `DELETE FROM job_logs
       WHERE run_id = $1
       AND id NOT IN (
         SELECT id FROM job_logs
         WHERE run_id = $1
         ORDER BY ${orderBy}
         LIMIT 1000
       )`,
      [runId]
    ).catch(() => {}); // Ignore cleanup errors
    
    // Broadcast to SSE connections (best-effort, may not work in all serverless environments)
    const connections = sseConnections.get(runId);
    if (connections) {
      const data = `data: ${JSON.stringify(entry)}\n\n`;
      for (const controller of connections) {
        try {
          controller.enqueue(new TextEncoder().encode(data));
        } catch (error) {
          // Connection closed, remove it
          connections.delete(controller);
        }
      }
    }
  } catch (error: any) {
    // Log error but don't fail - logs are non-critical
    console.error("[logs] Failed to add log:", error?.message || error);
  }
}

export async function getLogs(runId: number, limit: number = 500): Promise<LogEntry[]> {
  try {
    const db = await getDbConnection();
    if (!db) {
      return [];
    }

    // Detect actual schema
    const schema = await detectJobLogsSchema();
    
    // Build SELECT query based on detected schema
    let selectColumns: string[];
    let orderBy: string;
    
    if (schema.hasLogType) {
      // Old schema: log_type, no timestamp
      selectColumns = ['id', 'run_id', 'log_type', 'url', 'status'];
      orderBy = 'id ASC';
    } else if (schema.hasType) {
      // New schema: type, timestamp, timing, message
      selectColumns = ['type', 'url', 'status'];
      if (schema.hasTimestamp) selectColumns.unshift('timestamp');
      if (schema.hasTiming) selectColumns.push('timing');
      if (schema.hasMessage) selectColumns.push('message');
      orderBy = schema.hasTimestamp ? 'timestamp ASC' : 'id ASC';
    } else {
      console.error(`[getLogs] Unknown schema: neither 'type' nor 'log_type' column found`);
      return [];
    }
    
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const result = await db.query(
      `SELECT ${selectColumns.join(', ')}
       FROM job_logs
       WHERE run_id = $1
       ORDER BY ${orderBy}
       LIMIT $2`,
      [runId, safeLimit]
    );

    // Map to consistent format
    return result.rows.map((row: any) => ({
      timestamp: row.timestamp instanceof Date 
        ? row.timestamp.toISOString() 
        : (typeof row.timestamp === 'string' ? row.timestamp : (row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString())),
      type: row.type || row.log_type || "LOG",
      url: row.url || "",
      status: row.status || "",
      timing: row.timing || undefined,
      message: row.message || undefined,
    }));
  } catch (error: any) {
    // If table doesn't exist, that's okay - return empty array
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation') || error?.code === '42P01') {
      return [];
    }
    console.error("[logs] Failed to get logs:", error?.message || error);
    return [];
  }
}

export function registerSSEConnection(runId: number, controller: ReadableStreamDefaultController) {
  if (!sseConnections.has(runId)) {
    sseConnections.set(runId, new Set());
  }
  sseConnections.get(runId)!.add(controller);
  
  // Cleanup on close
  const cleanup = () => {
    const conns = sseConnections.get(runId);
    if (conns) {
      conns.delete(controller);
      if (conns.size === 0) {
        sseConnections.delete(runId);
      }
    }
  };
  
  return cleanup;
}
