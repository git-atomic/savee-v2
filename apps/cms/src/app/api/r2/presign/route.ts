import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

function resolveR2ConfigForKey(rawKey: string) {
  const isSecondary = rawKey.startsWith("secondary://");
  const key = isSecondary ? rawKey.replace(/^secondary:\/\//, "") : rawKey;

  const endpoint = isSecondary
    ? process.env.SECONDARY_R2_ENDPOINT_URL || process.env.R2_ENDPOINT_URL
    : process.env.R2_ENDPOINT_URL;
  const accessKeyId = isSecondary
    ? process.env.SECONDARY_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID
    : process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = isSecondary
    ? process.env.SECONDARY_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY
    : process.env.R2_SECRET_ACCESS_KEY;
  const bucket = isSecondary
    ? process.env.SECONDARY_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME
    : process.env.R2_BUCKET_NAME;

  return { isSecondary, key, endpoint, accessKeyId, secretAccessKey, bucket };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawKey = searchParams.get("key");
    if (!rawKey)
      return NextResponse.json(
        { success: false, error: "key required" },
        { status: 400 }
      );

    const { isSecondary, key, endpoint, accessKeyId, secretAccessKey, bucket } =
      resolveR2ConfigForKey(rawKey);
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return NextResponse.json(
        { success: false, error: "R2 env missing" },
        { status: 500 }
      );
    }

    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, cmd, { expiresIn: 300 }); // 5 min

    const mode = searchParams.get("mode") || "json";
    if (mode === "redirect") {
      return NextResponse.redirect(url, 302);
    }
    if (mode === "proxy") {
      const fallback = searchParams.get("fallback");
      try {
        const res = await client.send(cmd);
        const headers = new Headers();
        if (res.ContentType) headers.set("Content-Type", res.ContentType);
        headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
        if (res.ETag) headers.set("ETag", res.ETag.replace(/\"/g, ""));
        return new NextResponse(res.Body as any, { status: 200, headers });
      } catch (e) {
        // If not found and fallback provided, mirror the fallback into R2 then return it
        if (fallback) {
          try {
            const upstream = await fetch(fallback, { cache: "no-store" });
            if (!upstream.ok) {
              return NextResponse.json(
                { success: false, error: `fallback ${upstream.status}` },
                { status: 404 }
              );
            }
            const contentType = upstream.headers.get("content-type") || "image/jpeg";
            const arrayBuf = await upstream.arrayBuffer();
            const body = Buffer.from(arrayBuf);
            // Store into R2 for subsequent hits
            await client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
                CacheControl: "public, max-age=31536000",
              })
            );
            const headers = new Headers({
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=300, s-maxage=300",
            });
            return new NextResponse(body, { status: 200, headers });
          } catch (mirrorErr) {
            return NextResponse.json(
              { success: false, error: `mirror failed: ${String(mirrorErr)}` },
              { status: 500 }
            );
          }
        }
        return NextResponse.json({ success: false, error: String(e) }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: true, url, storage: isSecondary ? "secondary" : "primary" },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 }
    );
  }
}
