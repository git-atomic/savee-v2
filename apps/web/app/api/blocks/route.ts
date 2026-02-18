import { NextRequest, NextResponse } from "next/server";
import { dedupeBlocksByStableKey } from "@/lib/block-dedupe";

// Force dynamic rendering - prevent Next.js from caching this route
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server-side CMS base URL. This should always be the Payload CMS origin,
// not the frontend, so we only use CMS_URL here.
const CMS_URL = process.env.CMS_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

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
          // Disable Next.js fetch caching
          cache: "no-store",
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
              "Cache-Control": "private, no-cache, no-store, must-revalidate",
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
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
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
