import type { Block, BlocksResponse } from "@/types/block";

// Cache for API responses (simple in-memory cache)
const cache = new Map<string, { data: BlocksResponse; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

// Public CMS URL for client-side calls (baked at build time)
const CMS_PUBLIC_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CMS_URL) ||
  "http://localhost:3000";

// Normalize CMS base URL once to avoid repeat work
const CMS_BASE = CMS_PUBLIC_URL.replace(/\/+$/, "");

// Use relative URL to call our own API route which proxies to CMS
export async function fetchBlocks(
  cursor?: string | null,
  limit: number = 50,
  origin?: string | null,
  signal?: AbortSignal
): Promise<BlocksResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (origin) {
    params.set("origin", origin);
  }

  const cacheKey = `blocks-${cursor || "initial"}-${limit}-${origin || "all"}`;
  const cached = cache.get(cacheKey);

  // Return cached data if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`/api/blocks?${params.toString()}`, {
      signal,
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch blocks: ${response.statusText}`);
    }

    const data = (await response.json()) as BlocksResponse;

    // Cache the response
    cache.set(cacheKey, { data, timestamp: Date.now() });

    return data;
  } catch (error) {
    // Return cached data on error if available
    if (cached) {
      return cached.data;
    }
    throw error;
  }
}

export async function getPresignedUrl(r2Key: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${CMS_BASE}/api/r2/presign?key=${encodeURIComponent(r2Key)}&mode=json`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data && data.success && typeof data.url === "string"
      ? data.url
      : null;
  } catch {
    return null;
  }
}

export function getBlockMediaUrl(block: Block): string {
  // High‑quality thumbnail selection for grid blocks.
  //
  // Priority (highest → lowest quality / reliability):
  // 1. R2 key via our `/api/media` proxy (final uploaded asset, best quality)
  // 2. Original image URL from the source (`image_url`)
  // 3. Remote thumbnail (`thumbnail_url`) as a fallback only
  // 4. Video URL (last‑resort thumbnail for video‑only items)
  //
  // IMPORTANT:
  // - Always go through `/api/media` when using R2 so we stay on the same
  //   origin as the frontend (avoids CORS / port issues).
  if (block.r2_key) {
    return `/api/media?key=${encodeURIComponent(block.r2_key)}`;
  }

  if (block.image_url) {
    return block.image_url;
  }

  if (block.thumbnail_url) {
    return block.thumbnail_url;
  }

  if (block.video_url) {
    return block.video_url;
  }

  return "";
}

export function getBlockVideoUrl(block: Block): string | null {
  // For video playback, prioritize explicit video_url
  if (block.video_url) {
    return block.video_url;
  }

  // Fallback to R2 via our Next.js media proxy if it's marked as video
  if (block.media_type === "video" && block.r2_key) {
    return `/api/media?key=${encodeURIComponent(block.r2_key)}`;
  }

  return null;
}

export interface User {
  id: number;
  username: string;
  display_name?: string | null;
  avatar_r2_key?: string | null;
  profile_image_url?: string | null;
  profile_url: string;
  bio?: string | null;
  location?: string | null;
  website_url?: string | null;
  follower_count?: number | null;
  following_count?: number | null;
  saves_count?: number | null;
  collections_count?: number | null;
  is_verified?: boolean | null;
  is_active?: boolean | null;
  block_count: number;
}

export interface UsersResponse {
  success: boolean;
  users: User[];
  nextCursor?: string | null;
  total?: number | null;
}

export async function fetchUsers(
  cursor?: string | null,
  limit: number = 50,
  signal?: AbortSignal
): Promise<UsersResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  try {
    const response = await fetch(`/api/users?${params.toString()}`, {
      signal,
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`);
    }

    const data = (await response.json()) as UsersResponse;
    return data;
  } catch (error) {
    throw error;
  }
}

export function getUserAvatarUrl(user: User): string {
  if (user.avatar_r2_key) {
    return `/api/media?key=${encodeURIComponent(user.avatar_r2_key)}`;
  }
  if (user.profile_image_url) {
    return user.profile_image_url;
  }
  return "";
}
