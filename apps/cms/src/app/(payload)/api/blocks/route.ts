import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

const MEDIA_PREFIXES = [
  "original_",
  "thumb_",
  "small_",
  "medium_",
  "large_",
  "poster_",
];
const EDGE_CACHE_SECONDS = 20;
const EDGE_STALE_SECONDS = 120;

function normalizeExternalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function extractMediaFingerprint(raw: string): string | null {
  let filename = raw.trim().toLowerCase();
  if (!filename) return null;

  for (const prefix of MEDIA_PREFIXES) {
    if (filename.startsWith(prefix)) {
      filename = filename.slice(prefix.length);
      break;
    }
  }

  filename = filename.replace(/\.[a-z0-9]{2,6}$/i, "");
  const hashMatch = filename.match(/[0-9a-f]{10,}/i);
  if (hashMatch) return hashMatch[0].toLowerCase();
  return filename.length >= 8 ? filename : null;
}

function canonicalizeMedia(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let input = value.trim();
  if (!input) return null;

  input = input.replace(/[?#].*$/, "");
  if (!input) return null;

  try {
    if (/^https?:\/\//i.test(input)) {
      const parsed = new URL(input);
      const host = parsed.hostname.toLowerCase();
      const normalizedPath = parsed.pathname
        .replace(/\/+/g, "/")
        .replace(/\/+$/, "");
      const filename = normalizedPath.split("/").pop() || normalizedPath;
      const fingerprint = extractMediaFingerprint(filename);
      if (fingerprint) return `${host}:${fingerprint}`;
      return `${host}:${normalizedPath.toLowerCase()}`;
    }
  } catch {
    // Fall through to non-URL normalization.
  }

  const normalized = input.replace(/\/+/g, "/").replace(/\/+$/, "");
  const filename = normalized.split("/").pop() || normalized;
  const fingerprint = extractMediaFingerprint(filename);
  if (fingerprint) return fingerprint;
  return normalized.toLowerCase();
}

function getBlockDedupKey(block: any): string {
  const external = normalizeExternalId(block?.external_id);
  if (external) return `external:${external}`;

  const mediaCandidates = [
    block?.r2_key,
    block?.video_url,
    block?.image_url,
    block?.thumbnail_url,
    block?.og_image_url,
  ];
  for (const candidate of mediaCandidates) {
    const media = canonicalizeMedia(candidate);
    if (media) return `media:${media}`;
  }

  return `id:${String(block?.id ?? "")}`;
}

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const { searchParams } = new URL(req.url);

    // Parse query parameters
    const externalId = searchParams.get("externalId");
    const origin = searchParams.get("origin"); // 'home', 'pop', 'user'
    const username = searchParams.get("username");
    const sourceId = searchParams.get("sourceId");
    const runId = searchParams.get("runId");
    const q = searchParams.get("q");
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");

    // Flexible limit: supports numeric, "all" or "*" (safety-capped)
    const limitRaw = (() => {
      const lp = (limitParam || "").trim().toLowerCase();
      if (lp === "all" || lp === "*") return 1000; // safety cap
      const n = parseInt(limitParam || "", 10);
      if (Number.isFinite(n) && n > 0) return n;
      return 100; // larger default for feeds
    })();
    const limit = Math.min(limitRaw, 1000);
    const shouldUseEdgeCache =
      !cursor &&
      !(q && q.trim().length > 0) &&
      !externalId &&
      !sourceId &&
      !runId &&
      !(origin === "user" || Boolean(username));
    const responseCacheControl = shouldUseEdgeCache
      ? `public, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`
      : "private, no-cache, no-store, must-revalidate";

    // Parse cursor for pagination
    let cursorSavedAt: string | null = null;
    let cursorId: string | null = null;
    let cursorPop: number | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString();
        const parsed = JSON.parse(decoded);
        cursorSavedAt = parsed.saved_at;
        cursorId = String(parsed.id);
        cursorPop = parsed.pop_count !== undefined ? Number(parsed.pop_count) : null;
      } catch (e) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
    }

    const params: any[] = [];
    const blockWhere: string[] = [];

    // Filters that apply to blocks themselves
    if (externalId) {
      blockWhere.push("b.external_id = $" + (params.length + 1));
      params.push(externalId);
    }
    if (q && q.trim().length > 1) {
      const like = `%${q.trim()}%`;
      const searchParamIndex = params.length + 1;
      blockWhere.push(
        `(b.title ILIKE $${searchParamIndex} OR b.og_title ILIKE $${searchParamIndex} OR b.og_description ILIKE $${searchParamIndex} OR b.description ILIKE $${searchParamIndex} OR b.color_hexes::text ILIKE $${searchParamIndex} OR b.ai_tags::text ILIKE $${searchParamIndex} OR EXISTS (
          SELECT 1 FROM block_sources bs_search
          JOIN sources s_search ON s_search.id = bs_search.source_id
          WHERE bs_search.block_id = b.id AND s_search.username ILIKE $${searchParamIndex}
        ) OR EXISTS (
          SELECT 1 FROM user_blocks ub_search
          JOIN savee_users u_search ON u_search.id = ub_search.user_id
          WHERE ub_search.block_id = b.id AND u_search.username ILIKE $${searchParamIndex}
        ))`
      );
      params.push(like);
    }

    // Stable pagination based on sorting
    if (origin === "pop") {
      if (cursorPop !== null && cursorSavedAt && cursorId) {
        // Sort order for pop: count DESC, saved_at DESC, id DESC
        params.push(cursorPop);
        params.push(cursorSavedAt);
        params.push(cursorId);
        const p1 = params.length - 2; // cursorPop
        const p2 = params.length - 1; // cursorSavedAt
        const p3 = params.length;     // cursorId
        
        // We need to calculate the count in the WHERE clause for stable pagination
        // This is expensive but necessary for stable pagination on a dynamic field
        const countSQL = `(
          SELECT COUNT(DISTINCT uname)::int
          FROM (
            SELECT s2b.username AS uname
            FROM block_sources bs2b JOIN sources s2b ON s2b.id = bs2b.source_id
            WHERE bs2b.block_id = b.id AND s2b.source_type::text = 'user' AND s2b.username IS NOT NULL
            UNION
            SELECT u.username AS uname FROM user_blocks ub JOIN savee_users u ON u.id = ub.user_id WHERE ub.block_id = b.id
          ) users_union
        )`;
        
        blockWhere.push(
          `(${countSQL} < $${p1} OR (${countSQL} = $${p1} AND (b.saved_at < $${p2} OR (b.saved_at = $${p2} AND b.id < $${p3}))))`
        );
      }
    } else {
      if (cursorSavedAt && cursorId) {
        // Default sort order: saved_at DESC, id DESC
        params.push(cursorSavedAt);
        params.push(cursorId);
        blockWhere.push(
          `(b.saved_at < $${params.length - 1} OR (b.saved_at = $${params.length - 1} AND b.id < $${params.length}))`
        );
      }
    }

    // NEW APPROACH: Use EXISTS to find blocks that INCLUDE the requested origin
    let originFilter = "";
    if (origin === "home" || origin === "pop") {
      params.push(origin);
      originFilter = `
        AND EXISTS (
          SELECT 1 FROM block_sources bs_filter
          JOIN sources s_filter ON s_filter.id = bs_filter.source_id
          WHERE bs_filter.block_id = b.id AND s_filter.source_type::text = $${params.length}
        )`;
    } else if (origin === "user") {
      // When username provided -> specific user; otherwise any user origin
      params.push("user");
      if (username) {
        params.push(username);
        originFilter = `
          AND EXISTS (
            SELECT 1 FROM block_sources bs_filter
            JOIN sources s_filter ON s_filter.id = bs_filter.source_id
            WHERE bs_filter.block_id = b.id 
            AND s_filter.source_type::text = $${params.length - 1}
            AND s_filter.username = $${params.length}
          )`;
      } else {
        originFilter = `
          AND EXISTS (
            SELECT 1 FROM block_sources bs_filter
            JOIN sources s_filter ON s_filter.id = bs_filter.source_id
            WHERE bs_filter.block_id = b.id 
            AND s_filter.source_type::text = $${params.length}
          )`;
      }
    }

    // Additional filters
    if (sourceId) {
      params.push(parseInt(sourceId));
      originFilter += ` AND EXISTS (
        SELECT 1 FROM block_sources bs_src WHERE bs_src.block_id = b.id AND bs_src.source_id = $${params.length}
      )`;
    }
    if (runId) {
      params.push(parseInt(runId));
      originFilter += ` AND EXISTS (
        SELECT 1 FROM block_sources bs_run WHERE bs_run.block_id = b.id AND bs_run.run_id = $${params.length}
      )`;
    }

    const blockWhereSQL = blockWhere.length
      ? `WHERE ${blockWhere.join(" AND ")}`
      : "";

    // Build WHERE safely to avoid leading AND
    const normalizedBlock = blockWhereSQL.replace(/^\s*WHERE\s+/i, "").trim();
    const normalizedOrigin = originFilter.replace(/^\s*AND\s+/i, "").trim();
    const whereParts = [normalizedBlock, normalizedOrigin].filter(Boolean);
    const whereSQL = whereParts.length
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";

    // Calculate popularity count for ORDER BY and NEXT CURSOR
    const popCountSQL = `(
      SELECT COUNT(DISTINCT uname)::int
      FROM (
        SELECT s2b.username AS uname
        FROM block_sources bs2b JOIN sources s2b ON s2b.id = bs2b.source_id
        WHERE bs2b.block_id = b.id AND s2b.source_type::text = 'user' AND s2b.username IS NOT NULL
        UNION
        SELECT u.username AS uname FROM user_blocks ub JOIN savee_users u ON u.id = ub.user_id WHERE ub.block_id = b.id
      ) users_union
    )`;

    const query = `
      SELECT 
        b.*, 
        '${origin || "mixed"}' as origin,
        ${popCountSQL} as pop_count,
        NULL as source_username,
        (
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
            'users', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'username', u.username,
                'display_name', u.display_name,
                'avatar_r2_key', u.avatar_r2_key,
                'profile_image_url', u.profile_image_url
              ))
              FROM (
                SELECT DISTINCT ON (u.username)
                  u.username, u.display_name, u.avatar_r2_key, u.profile_image_url
                FROM (
                  SELECT s2b.username
                  FROM block_sources bs2b 
                  JOIN sources s2b ON s2b.id = bs2b.source_id
                  WHERE bs2b.block_id = b.id AND s2b.source_type::text = 'user' AND s2b.username IS NOT NULL
                  UNION
                  SELECT u2.username FROM user_blocks ub JOIN savee_users u2 ON u2.id = ub.user_id WHERE ub.block_id = b.id
                ) u_names
                JOIN savee_users u ON u.username = u_names.username
              ) u
            ), '[]'::jsonb),
            'users_count', COALESCE((
              SELECT COUNT(DISTINCT uname)::int 
              FROM (
                SELECT s2b.username AS uname
                FROM block_sources bs2b JOIN sources s2b ON s2b.id = bs2b.source_id
                WHERE bs2b.block_id = b.id AND s2b.source_type::text = 'user' AND s2b.username IS NOT NULL
                UNION
                SELECT u.username AS uname FROM user_blocks ub JOIN savee_users u ON u.id = ub.user_id WHERE ub.block_id = b.id
              ) users_union
            ), 0),
            'tags', COALESCE((
              SELECT jsonb_agg(DISTINCT tag)
              FROM (
                SELECT CASE WHEN s2c.source_type::text = 'user' THEN s2c.username ELSE s2c.source_type::text END AS tag
                FROM block_sources bs2c JOIN sources s2c ON s2c.id = bs2c.source_id WHERE bs2c.block_id = b.id
                UNION
                SELECT u.username AS tag 
                FROM user_blocks ub JOIN savee_users u ON u.id = ub.user_id WHERE ub.block_id = b.id
                UNION
                SELECT s2b.username AS tag
                FROM block_sources bs2b JOIN sources s2b ON s2b.id = bs2b.source_id
                WHERE bs2b.block_id = b.id AND s2b.source_type::text = 'user' AND s2b.username IS NOT NULL
              ) tag_src
            ), '[]'::jsonb)
          )
        ) AS origin_map
      FROM blocks b
      ${whereSQL}
      ORDER BY ${
        origin === "pop"
          ? `pop_count DESC NULLS LAST, `
          : ""
      }b.saved_at DESC NULLS LAST, b.id DESC NULLS LAST
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await payload.db.pool.query(query, params);
    
    // Deduplicate with normalized keys so we collapse logical duplicates
    // even when URLs differ only by query params, hashes, or CDN sizing paths.
    const blocksMap = new Map<string, any>();
    for (const block of result.rows) {
      const key = getBlockDedupKey(block);
      if (!blocksMap.has(key)) {
        blocksMap.set(key, block);
      }
    }
    const blocks = Array.from(blocksMap.values()).slice(0, limit);

    let nextCursor: string | null = null;
    // Cursor must advance using the raw page boundary, not deduped length,
    // otherwise duplicates can prevent pagination from progressing.
    if (result.rows.length === limit) {
      const lastBlock = result.rows[result.rows.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          saved_at: lastBlock.saved_at,
          id: lastBlock.id,
          pop_count: lastBlock.pop_count,
        })
      ).toString("base64");
    }

    return NextResponse.json(
      {
        success: true,
        blocks,
        nextCursor,
        count: blocks.length,
        filters: { origin, username, sourceId, runId, q },
      },
      {
        headers: {
          "Cache-Control": responseCacheControl,
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Error in /api/blocks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
