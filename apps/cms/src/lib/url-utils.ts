export type SourceType = "home" | "pop" | "user" | "blocks";

export interface ParsedSaveeUrl {
  isValid: boolean;
  sourceType: SourceType;
  username?: string;
  href?: string;
}

const RESERVED_SEGMENTS = new Set([
  "pop",
  "popular",
  "trending",
  "boards",
  "followers",
  "following",
  "i",
]);

function safeUrl(input: string): URL | null {
  try {
    // Prepend protocol if missing
    const normalized = /^(https?:)?\/\//i.test(input)
      ? input
      : `https://${input}`;
    return new URL(normalized);
  } catch {
    return null;
  }
}

function extractSaveeItemIdFromPath(pathname: string): string | null {
  const itemPath = pathname.match(/\/i\/([A-Za-z0-9_-]{5,50})(?:\/|$)/i);
  if (itemPath?.[1]) {
    return itemPath[1];
  }

  const sourceApiPath = pathname.match(
    /\/api\/items\/([A-Za-z0-9_-]{5,50})\/source(?:\/|$)/i
  );
  if (sourceApiPath?.[1]) {
    return sourceApiPath[1];
  }

  return null;
}

function canonicalSaveeItemUrl(origin: string, itemId: string): string {
  return `${origin}/i/${itemId}`;
}

export function parseSaveeUrl(input: string): ParsedSaveeUrl {
  const url = safeUrl(String(input || "").trim());
  if (!url) return { isValid: false, sourceType: "user" };

  const host = url.hostname.toLowerCase();
  const isSavee = host.endsWith("savee.it") || host.endsWith("savee.com");
  if (!isSavee) return { isValid: false, sourceType: "user" };

  // Normalize path
  const path = url.pathname.replace(/\/+$/g, "");
  const segs = path.split("/").filter(Boolean);

  const maybeItemId = extractSaveeItemIdFromPath(url.pathname);
  if (maybeItemId) {
    return {
      isValid: true,
      sourceType: "blocks",
      href: canonicalSaveeItemUrl(url.origin, maybeItemId),
    };
  }

  // Home page
  if (segs.length === 0) {
    return { isValid: true, sourceType: "home", href: url.href };
  }

  // Pop / Trending
  if (segs.length >= 1) {
    const s0 = segs[0].toLowerCase();
    if (s0 === "pop" || s0 === "popular" || s0 === "trending") {
      return { isValid: true, sourceType: "pop", href: url.href };
    }
    if (s0 === "api") {
      return { isValid: false, sourceType: "user" };
    }
    if (s0 === "i" && segs.length >= 2) {
      return { isValid: true, sourceType: "blocks", href: url.href };
    }
  }

  // Otherwise treat first segment as username unless it is reserved
  const candidate = segs[0]?.toLowerCase();
  if (candidate?.startsWith("bulk_import_")) {
    return { isValid: true, sourceType: "blocks", href: url.href };
  }
  if (candidate && !RESERVED_SEGMENTS.has(candidate)) {
    return {
      isValid: true,
      sourceType: "user",
      username: candidate,
      href: url.href,
    };
  }

  // Fallback: still valid savee URL but unknown segment — default to home
  return { isValid: true, sourceType: "home", href: url.href };
}

export function validateSaveeUrl(url: string): boolean {
  return parseSaveeUrl(url).isValid;
}

export interface BulkUrlDetection {
  isBulk: boolean;
  urls: string[];
  count: number;
}

export function detectBulkUrls(input: string): BulkUrlDetection {
  if (!input || !input.trim()) {
    return { isBulk: false, urls: [], count: 0 };
  }

  // Split by newlines, commas, spaces
  const rawParts = input.split(/[,\s\n]+/).map((p) => p.trim()).filter(Boolean);
  
  // Filter for URLs with /i/ pattern (item URLs)
  const seen = new Set<string>();
  const urls: string[] = [];
  
  for (const part of rawParts) {
    if (part.startsWith("http://") || part.startsWith("https://")) {
      if (part.includes("/i/") || part.includes("/api/items/")) {
        try {
          const url = new URL(part);
          const host = url.hostname.toLowerCase();
          const isSavee = host.endsWith("savee.it") || host.endsWith("savee.com");
          if (!isSavee) {
            continue;
          }

          const itemId = extractSaveeItemIdFromPath(url.pathname);
          if (!itemId) {
            continue;
          }

          const normalized = canonicalSaveeItemUrl(url.origin, itemId);
          if (!seen.has(normalized)) {
            seen.add(normalized);
            urls.push(normalized);
          }
        } catch {
          continue;
        }
      }
    }
  }

  return {
    isBulk: urls.length > 1,
    urls,
    count: urls.length,
  };
}
