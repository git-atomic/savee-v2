import { NextRequest, NextResponse } from "next/server";
import { dedupeBlocksByStableKey } from "@/lib/block-dedupe";
import { resolveCmsBaseUrl } from "@/lib/server/cms-origin";

// Force dynamic rendering - prevent Next.js from caching this route
export const dynamic = "force-dynamic";
export const revalidate = 0;
const EDGE_CACHE_SECONDS = 5;
const EDGE_STALE_SECONDS = 20;

const UPSTREAM_TIMEOUT_MS = 12_000;

function parsePageCursor(cursor: string | null): number | null {
  if (!cursor || !cursor.startsWith("page:")) return null;
  const raw = cursor.slice("page:".length).trim();
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 1) return null;
  return Math.floor(page);
}

function normalizeBlocksResponseShape(data: any) {
  if (data && Array.isArray(data.blocks)) {
    const dedupedBlocks = dedupeBlocksByStableKey(data.blocks);
    return {
      ...data,
      success: data.success ?? true,
      blocks: dedupedBlocks,
      nextCursor:
        typeof data.nextCursor === "string" ? data.nextCursor : null,
      count: dedupedBlocks.length,
    };
  }

  // Payload collection response fallback:
  // { docs, hasNextPage, nextPage, ... }
  if (data && Array.isArray(data.docs)) {
    const dedupedBlocks = dedupeBlocksByStableKey(data.docs);
    const hasNextPage = Boolean(data.hasNextPage);
    const nextPage =
      typeof data.nextPage === "number" && Number.isFinite(data.nextPage)
        ? data.nextPage
        : null;
    return {
      success: true,
      blocks: dedupedBlocks,
      nextCursor:
        hasNextPage && nextPage !== null ? `page:${nextPage}` : null,
      count: dedupedBlocks.length,
    };
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    const cms = resolveCmsBaseUrl(req);
    if (!cms.ok) {
      return NextResponse.json(
        {
          success: false,
          code: "cms_url_misconfigured",
          error: cms.error,
          hint: cms.hint,
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const { searchParams } = new URL(req.url);
    const pageCursor = parsePageCursor(searchParams.get("cursor"));
    const hasCursor = Boolean(searchParams.get("cursor"));
    const hasSearch = Boolean(searchParams.get("q"));
    const isUserFeed = Boolean(searchParams.get("username"));
    const shouldUseEdgeCache = !hasCursor && !hasSearch && !isUserFeed;
    const responseCacheControl = shouldUseEdgeCache
      ? `public, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`
      : "private, no-cache, no-store, must-revalidate";
    const upstreamCacheMode: RequestCache = "no-store";

    // Forward all query params to CMS
    const cmsParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      // page:N cursor is a fallback cursor for Payload docs-style pagination.
      // Do not forward it as a custom cursor to CMS.
      if (pageCursor !== null && key === "cursor") return;
      cmsParams.set(key, value);
    });
    if (pageCursor !== null) {
      cmsParams.set("page", String(pageCursor));
    }

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${cms.baseUrl}/api/blocks?${cmsParams.toString()}`,
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
          cache: upstreamCacheMode,
          next: { revalidate: 0 },
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to fetch blocks",
            status: response.status,
          },
          {
            status: response.status,
            headers: {
              "Cache-Control": responseCacheControl,
              Pragma: "no-cache",
              Expires: "0",
            },
          }
        );
      }

      const data = await response.json();
      const normalizedData = normalizeBlocksResponseShape(data);

      // NO CACHING - prevents duplicate blocks from stale edge responses
      return NextResponse.json(normalizedData, {
        headers: {
          "Cache-Control": responseCacheControl,
          Pragma: "no-cache",
          Expires: "0",
        },
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            success: false,
            error: "CMS request timeout",
            hint: `Upstream did not respond within ${UPSTREAM_TIMEOUT_MS}ms`,
          },
          { status: 504 }
        );
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("Blocks API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
