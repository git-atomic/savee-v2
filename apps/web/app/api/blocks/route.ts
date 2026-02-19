import { NextRequest, NextResponse } from "next/server";
import { dedupeBlocksByStableKey } from "@/lib/block-dedupe";

// Force dynamic rendering - prevent Next.js from caching this route
export const dynamic = "force-dynamic";
export const revalidate = 0;
const EDGE_CACHE_SECONDS = 45;
const EDGE_STALE_SECONDS = 300;

// Server-side CMS base URL. This should always be the Payload CMS origin,
// not the frontend, so we only use CMS_URL here.
const CMS_URL = process.env.CMS_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hasCursor = Boolean(searchParams.get("cursor"));
    const hasSearch = Boolean(searchParams.get("q"));
    const isUserFeed = Boolean(searchParams.get("username"));
    const shouldUseEdgeCache = !hasCursor && !hasSearch && !isUserFeed;
    const responseCacheControl = shouldUseEdgeCache
      ? `public, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`
      : "private, no-cache, no-store, must-revalidate";
    const upstreamCacheMode: RequestCache = shouldUseEdgeCache
      ? "force-cache"
      : "no-store";

    // Forward all query params to CMS
    const cmsParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      cmsParams.set(key, value);
    });

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(
        `${CMS_URL}/api/blocks?${cmsParams.toString()}`,
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
          cache: upstreamCacheMode,
          next: shouldUseEdgeCache
            ? { revalidate: EDGE_CACHE_SECONDS }
            : { revalidate: 0 },
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
      const dedupedBlocks =
        data && Array.isArray(data.blocks)
          ? dedupeBlocksByStableKey(data.blocks)
          : null;
      const normalizedData =
        dedupedBlocks !== null
          ? {
              ...data,
              blocks: dedupedBlocks,
              count: dedupedBlocks.length,
            }
          : data;

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
          { success: false, error: "Request timeout" },
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
