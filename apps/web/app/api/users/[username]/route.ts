import { NextRequest, NextResponse } from "next/server";

// Server-side CMS base URL
const CMS_URL = process.env.CMS_URL || "http://localhost:3000";
const CACHE_MAX_AGE = 60; // 60 seconds

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { success: false, error: "Username is required" },
        { status: 400 }
      );
    }

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      // Fetch user by username from CMS
      const response = await fetch(
        `${CMS_URL}/api/users?q=${encodeURIComponent(username)}&limit=1`,
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to fetch user",
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

      // Find exact username match (case-insensitive)
      const user = data.users?.find(
        (u: any) => u.username.toLowerCase() === username.toLowerCase()
      );

      if (!user) {
        return NextResponse.json(
          { success: false, error: "User not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: true, user },
        {
          headers: {
            "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=120`,
          },
        }
      );
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
    console.error("User API error:", error);
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
