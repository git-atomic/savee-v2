// Schema detector for job_logs table
// Detects whether the table uses 'type' (new) or 'log_type' (old) column

import { getPayload } from "payload";
import config from "@payload-config";

export interface JobLogsSchema {
  hasType: boolean; // New schema: 'type' column
  hasLogType: boolean; // Old schema: 'log_type' column
  hasTimestamp: boolean;
  hasTiming: boolean;
  hasMessage: boolean;
  columns: string[];
}

let cachedSchema: JobLogsSchema | null = null;

export async function detectJobLogsSchema(): Promise<JobLogsSchema> {
  if (cachedSchema) {
    return cachedSchema;
  }

  try {
    const payload = await getPayload({ config });
    const db = (payload.db as any).pool;
    
    const columnCheck = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'job_logs' 
      ORDER BY ordinal_position
    `);
    
    const columns = columnCheck.rows.map((r: any) => r.column_name);
    
    const schema: JobLogsSchema = {
      hasType: columns.includes('type'),
      hasLogType: columns.includes('log_type'),
      hasTimestamp: columns.includes('timestamp'),
      hasTiming: columns.includes('timing'),
      hasMessage: columns.includes('message'),
      columns,
    };
    
    console.log(`[schema-detector] Detected job_logs schema:`, {
      columns: schema.columns,
      usesNewSchema: schema.hasType,
      usesOldSchema: schema.hasLogType,
    });
    
    cachedSchema = schema;
    return schema;
  } catch (error: any) {
    // Table doesn't exist or error - return default (new schema)
    console.warn(`[schema-detector] Could not detect schema, assuming new schema:`, error?.message);
    return {
      hasType: true,
      hasLogType: false,
      hasTimestamp: true,
      hasTiming: true,
      hasMessage: true,
      columns: ['id', 'run_id', 'timestamp', 'type', 'url', 'status', 'timing', 'message'],
    };
  }
}

export function clearSchemaCache() {
  cachedSchema = null;
}
