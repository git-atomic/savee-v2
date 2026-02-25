import { NextRequest, NextResponse } from "next/server";
import { resolveCmsBaseUrl } from "@/lib/server/cms-origin";

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

async function streamResponse(upstream: Response, cacheControl: string) {
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch media from upstream",
        status: upstream.status,
      },
      { status: 502 }
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("content-length", contentLength);
  }
  headers.set("Cache-Control", cacheControl);

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}

async function handleR2Key(key: string, cmsBaseUrl: string) {
  const presignUrl = `${cmsBaseUrl.replace(
    /\/+$/,
    ""
  )}/api/r2/presign?key=${encodeURIComponent(key)}&mode=json`;

  const jsonResponse = await fetch(presignUrl);
  if (!jsonResponse.ok) {
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

  const mediaResponse = await fetch(data.url);
  return streamResponse(
    mediaResponse,
    "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
  );
}

async function handleRemoteUrl(urlParam: string) {
  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid media URL" },
      { status: 400 }
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json(
      { success: false, error: "Only HTTP(S) media URLs are supported" },
      { status: 400 }
    );
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    return NextResponse.json(
      { success: false, error: "Blocked media host" },
      { status: 400 }
    );
  }

  const upstream = await fetch(parsed.toString(), {
    headers: {
      // Some image hosts reject requests without a browser-like UA.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
      Referer: `${parsed.protocol}//${parsed.host}`,
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
  });

  return streamResponse(
    upstream,
    "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
  );
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
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    const urlParam = searchParams.get("url");

    if (!key && !urlParam) {
      return NextResponse.json(
        { success: false, error: "key or url required" },
        { status: 400 }
      );
    }

    if (key) {
      return handleR2Key(key, cms.baseUrl);
    }

    return handleRemoteUrl(urlParam as string);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
