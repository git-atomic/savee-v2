import type { Block } from "@/types/block";

type BlockLike = Pick<
  Block,
  | "id"
  | "external_id"
  | "r2_key"
  | "video_url"
  | "image_url"
  | "thumbnail_url"
  | "og_image_url"
>;

const MEDIA_PREFIXES = [
  "original_",
  "thumb_",
  "small_",
  "medium_",
  "large_",
  "poster_",
];

function normalizeExternalId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function extractMediaFingerprint(raw: string): string | null {
  let filename = raw.trim().toLowerCase();
  if (!filename) return null;

  for (const prefix of MEDIA_PREFIXES) {
    if (filename.startsWith(prefix)) {
      filename = filename.slice(prefix.length);
      break;
    }
  }

  filename = filename.replace(/\.[a-z0-9]{2,6}$/i, "");
  const hashMatch = filename.match(/[0-9a-f]{10,}/i);
  if (hashMatch) return hashMatch[0].toLowerCase();
  return filename.length >= 8 ? filename : null;
}

function canonicalizeMedia(value: string | null | undefined): string | null {
  if (!value) return null;
  let input = value.trim();
  if (!input) return null;

  input = input.replace(/[?#].*$/, "");
  if (!input) return null;

  try {
    if (/^https?:\/\//i.test(input)) {
      const parsed = new URL(input);
      const host = parsed.hostname.toLowerCase();
      const normalizedPath = parsed.pathname
        .replace(/\/+/g, "/")
        .replace(/\/+$/, "");
      const filename = normalizedPath.split("/").pop() || normalizedPath;
      const fingerprint = extractMediaFingerprint(filename);
      if (fingerprint) return `${host}:${fingerprint}`;
      return `${host}:${normalizedPath.toLowerCase()}`;
    }
  } catch {
    // Ignore parse failures and continue with path-style normalization.
  }

  const normalized = input.replace(/\/+/g, "/").replace(/\/+$/, "");
  const filename = normalized.split("/").pop() || normalized;
  const fingerprint = extractMediaFingerprint(filename);
  if (fingerprint) return fingerprint;
  return normalized.toLowerCase();
}

export function getBlockStableKey(block: BlockLike): string {
  const external = normalizeExternalId(block.external_id);
  if (external) return `external:${external}`;

  const mediaCandidates = [
    block.r2_key,
    block.video_url,
    block.image_url,
    block.thumbnail_url,
    block.og_image_url,
  ];
  for (const candidate of mediaCandidates) {
    const media = canonicalizeMedia(candidate);
    if (media) return `media:${media}`;
  }

  return `id:${String(block.id)}`;
}

export function dedupeBlocksByStableKey<T extends BlockLike>(blocks: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const block of blocks) {
    const key = getBlockStableKey(block);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(block);
  }

  return unique;
}

export function mergeUniqueBlocks<T extends BlockLike>(
  existing: T[],
  incoming: T[]
): T[] {
  const seen = new Set(existing.map(getBlockStableKey));
  const merged = [...existing];

  for (const block of incoming) {
    const key = getBlockStableKey(block);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(block);
  }

  return merged;
}
