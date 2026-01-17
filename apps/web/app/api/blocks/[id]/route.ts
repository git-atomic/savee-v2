import { NextRequest, NextResponse } from "next/server";

const CMS_URL = process.env.CMS_URL || "http://localhost:3000";

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
    
    if (data.success && data.blocks && data.blocks.length > 0) {
        return NextResponse.json(data.blocks[0]);
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
