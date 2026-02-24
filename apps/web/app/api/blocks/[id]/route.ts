import { NextRequest, NextResponse } from "next/server";

const CMS_URL = process.env.CMS_URL || "http://localhost:3000";

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
    const { id } = await params;

    // Use the custom list route to get enriched data with origin_map
    const response = await fetch(`${CMS_URL}/api/blocks?externalId=${id}&limit=1`, {
      headers: {
        Accept: "application/json",
      },
    });

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
        `${CMS_URL}/api/blocks?where[external_id][equals]=${encodeURIComponent(
          id
        )}&limit=1`,
        {
          headers: {
            Accept: "application/json",
          },
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
    console.error("Block API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
