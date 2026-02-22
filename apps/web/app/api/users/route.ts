import { NextRequest, NextResponse } from "next/server";

// Server-side CMS base URL
const CMS_URL = process.env.CMS_URL || "http://localhost:3000";
const CACHE_MAX_AGE = 10; // 10 seconds

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
      const response = await fetch(`${CMS_URL}/api/users?${cmsParams.toString()}`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        next: { revalidate: 0 },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to fetch users",
            status: response.status,
          },
          {
            status: response.status,
            headers: {
              "Cache-Control": "no-store",
            },
          }
        );
      }

      const data = await response.json();

      return NextResponse.json(data, {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=120`,
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
    console.error("Users API error:", error);
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
