import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getPayload } from "payload";
import config from "@payload-config";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";
const BYTES_PER_DECIMAL_GB = 1_000_000_000;

interface R2BucketConfig {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
}

interface R2ScanStats {
  configured: boolean;
  totalObjects: number;
  totalSizeBytes: number;
  bucket: string | null;
  error: string | null;
}

function normalizeR2Token(v?: string) {
  return String(v || "").trim().toLowerCase().replace(/\/+$/, "");
}

function hasNonEmptyValue(v?: string) {
  return String(v || "").trim() !== "";
}

function isR2ConfigComplete(config: R2BucketConfig) {
  return (
    hasNonEmptyValue(config.endpoint) &&
    hasNonEmptyValue(config.accessKeyId) &&
    hasNonEmptyValue(config.secretAccessKey) &&
    hasNonEmptyValue(config.bucket)
  );
}

function isSameR2Target(a: R2BucketConfig, b: R2BucketConfig) {
  return (
    normalizeR2Token(a.endpoint) !== "" &&
    normalizeR2Token(a.endpoint) === normalizeR2Token(b.endpoint) &&
    normalizeR2Token(a.bucket) !== "" &&
    normalizeR2Token(a.bucket) === normalizeR2Token(b.bucket)
  );
}

function getR2Config(prefix = ""): R2BucketConfig {
  return {
    endpoint: process.env[`${prefix}R2_ENDPOINT_URL`],
    accessKeyId: process.env[`${prefix}R2_ACCESS_KEY_ID`],
    secretAccessKey: process.env[`${prefix}R2_SECRET_ACCESS_KEY`],
    bucket: process.env[`${prefix}R2_BUCKET_NAME`],
  };
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function emptyR2Stats(
  bucket: string | null = null,
  configured = false,
  error: string | null = null
): R2ScanStats {
  return {
    configured,
    totalObjects: 0,
    totalSizeBytes: 0,
    bucket,
    error,
  };
}

function normalizeR2ErrorMessage(raw: string | null): string | null {
  if (!raw) return null;
  const msg = String(raw).trim();
  if (!msg) return null;
  const lower = msg.toLowerCase();
  if (
    lower.includes("eproto") ||
    lower.includes("handshake failure") ||
    lower.includes("ssl/tls alert")
  ) {
    return "TLS handshake failed (check R2 endpoint/account key pairing).";
  }
  if (
    lower.includes("invalidaccesskeyid") ||
    lower.includes("signaturedoesnotmatch")
  ) {
    return "R2 credentials are invalid for this endpoint/bucket.";
  }
  if (lower.includes("nodename") || lower.includes("enotfound")) {
    return "R2 endpoint DNS lookup failed.";
  }
  return msg;
}

async function getDbStats() {
  const payload = await getPayload({ config });
  const db = (payload.db as any).pool;
  const q = async (sql: string, params: any[] = []) => {
    try {
      return await db.query(sql, params);
    } catch (e) {
      console.error("[limits] DB query failed", sql, e);
      return { rows: [] } as any;
    }
  };
  const blocks = await q("SELECT COUNT(*)::int AS c FROM blocks");
  const sources = await q("SELECT COUNT(*)::int AS c FROM sources");
  const runs = await q("SELECT COUNT(*)::int AS c FROM runs");
  return {
    blocks: blocks.rows?.[0]?.c ?? 0,
    sources: sources.rows?.[0]?.c ?? 0,
    runs: runs.rows?.[0]?.c ?? 0,
  };
}

async function getR2Stats(config: R2BucketConfig): Promise<R2ScanStats> {
  if (!isR2ConfigComplete(config)) {
    return emptyR2Stats(config.bucket ?? null);
  }

  const endpoint = config.endpoint;
  const accessKeyId = config.accessKeyId;
  const secretAccessKey = config.secretAccessKey;
  const bucket = config.bucket;
  try {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    let continuationToken: string | undefined = undefined;
    let totalObjects = 0;
    let totalSizeBytes = 0;
    let safety = 0;
    do {
      const resp = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );
      const contents = resp.Contents || [];
      for (const obj of contents) {
        totalObjects += 1;
        totalSizeBytes += obj.Size || 0;
      }
      continuationToken = resp.IsTruncated
        ? (resp.NextContinuationToken as string | undefined)
        : undefined;
      safety += 1;
    } while (continuationToken && safety < 1000);
    return {
      configured: true,
      totalObjects,
      totalSizeBytes,
      bucket: bucket || null,
      error: null,
    };
  } catch (e) {
    console.error("[limits] R2 stats error", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    return emptyR2Stats(bucket || null, true, errorMessage);
  }
}

function buildR2Usage(stats: R2ScanStats, softLimitGb: number) {
  const safeSoftLimitGb =
    Number.isFinite(softLimitGb) && softLimitGb > 0 ? softLimitGb : 9.5;
  const softLimitBytes = safeSoftLimitGb * BYTES_PER_DECIMAL_GB;
  const usagePercent =
    softLimitBytes > 0
      ? Math.min(100, (stats.totalSizeBytes / softLimitBytes) * 100)
      : 0;
  return {
    configured: stats.configured,
    bucket: stats.bucket,
    totalObjects: stats.totalObjects,
    totalSizeBytes: stats.totalSizeBytes,
    usagePercent,
    totalSizeGb: stats.totalSizeBytes / BYTES_PER_DECIMAL_GB,
    softLimitGb: safeSoftLimitGb,
    softLimitBytes,
    nearLimit: softLimitBytes > 0 && stats.totalSizeBytes >= softLimitBytes,
    error: normalizeR2ErrorMessage(stats.error),
  };
}

export async function GET(_req: NextRequest) {
  try {
    const db = await getDbStats();

    const primaryR2Config = getR2Config("");
    const secondaryR2Config = getR2Config("SECONDARY_");
    const secondarySameAsPrimary = isSameR2Target(
      primaryR2Config,
      secondaryR2Config
    );
    const secondaryConfigured =
      isR2ConfigComplete(secondaryR2Config) && !secondarySameAsPrimary;

    const primarySoftLimitGb = readNumberEnv("R2_SOFT_LIMIT_GB", 9.5);
    const secondarySoftLimitGb = readNumberEnv(
      "SECONDARY_R2_SOFT_LIMIT_GB",
      primarySoftLimitGb
    );

    const primaryR2Stats = await getR2Stats(primaryR2Config);
    const primary = buildR2Usage(primaryR2Stats, primarySoftLimitGb);

    // Secondary listing is expensive; only probe it when primary is at/over soft cap.
    const shouldProbeSecondary = secondaryConfigured && primary.nearLimit;
    const secondaryR2Stats = shouldProbeSecondary
      ? await getR2Stats(secondaryR2Config)
      : secondarySameAsPrimary
        ? emptyR2Stats(
            secondaryR2Config.bucket ?? null,
            false,
            "Secondary R2 target matches primary."
          )
        : emptyR2Stats(
            secondaryR2Config.bucket ?? null,
            secondaryConfigured,
            null
          );
    const secondary = buildR2Usage(secondaryR2Stats, secondarySoftLimitGb);

    const secondaryHealthy =
      secondaryConfigured &&
      shouldProbeSecondary &&
      !secondary.error &&
      Number.isFinite(secondary.totalSizeBytes);
    const canFailoverToSecondary =
      primary.nearLimit && secondaryHealthy && !secondary.nearLimit;
    const r2NearLimit = primary.nearLimit && !canFailoverToSecondary;

    const totalObjects =
      primary.totalObjects + (secondaryHealthy ? secondary.totalObjects : 0);
    const totalSizeBytes =
      primary.totalSizeBytes + (secondaryHealthy ? secondary.totalSizeBytes : 0);
    const totalSoftLimitBytes =
      primary.softLimitBytes + (secondaryHealthy ? secondary.softLimitBytes : 0);
    const totalUsagePercent =
      totalSoftLimitBytes > 0
        ? Math.min(100, (totalSizeBytes / totalSoftLimitBytes) * 100)
        : 0;

    const dbSoftBlocks = readNumberEnv("DB_SOFT_LIMIT_BLOCKS", 100000);
    const dbNearLimit = db.blocks >= dbSoftBlocks;

    const secondaryUnavailableReason =
      !secondaryConfigured
        ? null
        : secondarySameAsPrimary
          ? "Secondary R2 target matches primary."
          : shouldProbeSecondary && secondary.error
            ? secondary.error
            : shouldProbeSecondary && secondary.nearLimit
              ? "Secondary R2 near limit."
              : null;

    return NextResponse.json({
      success: true,
      r2: {
        totalObjects,
        totalSizeBytes,
        usagePercent: totalUsagePercent,
        softLimitGb: totalSoftLimitBytes / BYTES_PER_DECIMAL_GB,
        nearLimit: r2NearLimit,
        primaryNearLimit: primary.nearLimit,
        secondaryNearLimit: secondaryHealthy ? secondary.nearLimit : null,
        canFailoverToSecondary,
        shouldSwitchToSecondary: primary.nearLimit && canFailoverToSecondary,
        hasSecondary: secondaryHealthy,
        secondaryConfigured,
        secondaryUnavailableReason,
        primary,
        secondary: secondaryHealthy
          ? secondary
          : {
              ...secondary,
              configured: false,
              totalObjects: 0,
              totalSizeBytes: 0,
              totalSizeGb: 0,
              usagePercent: 0,
              nearLimit: false,
            },
      },
      db: {
        blocks: db.blocks,
        sources: db.sources,
        runs: db.runs,
        softLimitBlocks: dbSoftBlocks,
        nearLimit: dbNearLimit,
      },
    });
  } catch (e) {
    console.error("[limits] error", e);
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 }
    );
  }
}
