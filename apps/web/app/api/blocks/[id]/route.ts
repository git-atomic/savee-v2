import { NextRequest, NextResponse } from "next/server";
import { resolveCmsBaseUrl } from "@/lib/server/cms-origin";

const UPSTREAM_TIMEOUT_MS = 12_000;

function extractBlockFromResponse(data: any, id: string) {
  const blocks = Array.isArray(data?.blocks)
    ? data.blocks
    : Array.isArray(data?.docs)
      ? data.docs
      : [];

  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  const idLower = String(id).toLowerCase();
  const matched =
    blocks.find(
      (block: any) => String(block?.external_id || "").toLowerCase() === idLower
    ) ||
    blocks.find((block: any) => String(block?.id || "") === String(id)) ||
    null;

  return matched;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { status: 500 }
      );
    }

    const { id } = await params;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    // Use the custom list route to get enriched data with origin_map
    const response = await fetch(
      `${cms.baseUrl}/api/blocks?externalId=${id}&limit=1`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        next: { revalidate: 0 },
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch from CMS" },
        { status: response.status }
      );
    }

    const data = await response.json();
    let block = extractBlockFromResponse(data, id);

    // Payload docs-style fallback: custom `externalId` param is not supported there.
    if (!block && Array.isArray(data?.docs)) {
      const fallback = await fetch(
        `${cms.baseUrl}/api/blocks?where[external_id][equals]=${encodeURIComponent(
          id
        )}&limit=1`,
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
          next: { revalidate: 0 },
        }
      );
      if (fallback.ok) {
        const fallbackData = await fallback.json();
        block = extractBlockFromResponse(fallbackData, id);
      }
    }

    if (block) {
      return NextResponse.json(block);
    }

    return NextResponse.json(
      { success: false, error: "Block not found" },
      { status: 404 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        {
          success: false,
          error: "CMS request timeout",
          hint: `Upstream did not respond within ${UPSTREAM_TIMEOUT_MS}ms`,
        },
        { status: 504 }
      );
    }
    console.error("Block API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
