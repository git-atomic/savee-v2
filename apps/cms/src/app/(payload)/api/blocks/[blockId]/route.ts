import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ blockId: string }> }
) {
  try {
    const { blockId: blockIdParam } = await params;
    const blockId = parseInt(blockIdParam, 10);
    
    if (!Number.isFinite(blockId)) {
      return NextResponse.json(
        { success: false, error: "Invalid block id" },
        { status: 400 }
      );
    }

    const payload = await getPayload({ config });
    const db = (payload.db as any).pool;

    // Query block with origin_map similar to the blocks list endpoint
    const result = await db.query(
      `SELECT 
        b.*, 
        'mixed' as origin,
        NULL as source_username,
        (
          WITH users_union AS (
            SELECT s2b.username AS uname
            FROM block_sources bs2b JOIN sources s2b ON s2b.id = bs2b.source_id
            WHERE bs2b.block_id = b.id AND s2b.source_type::text = 'user' AND s2b.username IS NOT NULL
            UNION
            SELECT u.username AS uname FROM user_blocks ub JOIN savee_users u ON u.id = ub.user_id WHERE ub.block_id = b.id
          )
          SELECT jsonb_build_object(
            'home', COALESCE((
              SELECT BOOL_OR(s2a.source_type::text = 'home')
              FROM block_sources bs2a JOIN sources s2a ON s2a.id = bs2a.source_id
              WHERE bs2a.block_id = b.id
            ), false),
            'pop', COALESCE((
              SELECT BOOL_OR(s2p.source_type::text = 'pop')
              FROM block_sources bs2p JOIN sources s2p ON s2p.id = bs2p.source_id
              WHERE bs2p.block_id = b.id
            ), false),
            'users', COALESCE((SELECT jsonb_agg(DISTINCT uname) FROM users_union), '[]'::jsonb),
            'users_count', COALESCE((SELECT COUNT(DISTINCT uname)::int FROM users_union), 0),
            'tags', COALESCE((
              SELECT jsonb_agg(DISTINCT tag)
              FROM (
                SELECT CASE WHEN s2c.source_type::text = 'user' THEN s2c.username ELSE s2c.source_type::text END AS tag
                FROM block_sources bs2c JOIN sources s2c ON s2c.id = bs2c.source_id WHERE bs2c.block_id = b.id
                UNION
                SELECT uname AS tag FROM users_union
              ) tag_src
            ), '[]'::jsonb)
          )
        ) AS origin_map
      FROM blocks b
      WHERE b.id = $1
      LIMIT 1`,
      [blockId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Block not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[blocks/:id] error", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch block" },
      { status: 500 }
    );
  }
}
