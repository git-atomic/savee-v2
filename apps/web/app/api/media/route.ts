import { NextRequest, NextResponse } from "next/server";

// Server-side CMS base URL. This should always point at the Payload CMS,
// not the frontend, so we *only* look at CMS_URL here.
const CMS_URL = process.env.CMS_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { success: false, error: "key required" },
        { status: 400 }
      );
    }

    // 1) Ask CMS for a presigned URL (JSON mode so we can inspect it).
    const presignUrl = `${CMS_URL.replace(
      /\/+$/,
      ""
    )}/api/r2/presign?key=${encodeURIComponent(key)}&mode=json`;

    const jsonResponse = await fetch(presignUrl);

    if (!jsonResponse.ok) {
      // Return the actual status code from CMS to help debug 404s
      return NextResponse.json(
        {
          success: false,
          error: `Failed to get presigned URL from CMS: ${jsonResponse.status} ${jsonResponse.statusText}`,
          cmsUrl: presignUrl,
          status: jsonResponse.status,
        },
        { status: jsonResponse.status === 404 ? 404 : 502 }
      );
    }

    const data = await jsonResponse.json();
    if (!data?.success || !data.url) {
      return NextResponse.json(
        { success: false, error: "Presign endpoint did not return a URL" },
        { status: 502 }
      );
    }

    // 2) Stream the media bytes back to the client with a 200,
    // so <img>/<video> see a direct media response (no visible 302s).
    const mediaResponse = await fetch(data.url);

    if (!mediaResponse.ok || !mediaResponse.body) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch media from storage",
          status: mediaResponse.status,
        },
        { status: 502 }
      );
    }

    const headers = new Headers();
    const contentType = mediaResponse.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }
    const contentLength = mediaResponse.headers.get("content-length");
    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    headers.set(
      "Cache-Control",
      "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
    );

    return new NextResponse(mediaResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
