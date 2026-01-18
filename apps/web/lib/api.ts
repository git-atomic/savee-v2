import type { Block, BlocksResponse } from "@/types/block";

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

  // Add cache-busting timestamp to prevent any CDN/proxy/browser caching
  params.set("_t", Date.now().toString());

  try {
    const response = await fetch(`/api/blocks?${params.toString()}`, {
      signal,
      // Force no caching at all levels
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch blocks: ${response.statusText}`);
    }

    const data = (await response.json()) as BlocksResponse;

    // Deduplicate blocks by external_id (the true unique identifier from Savee)
    // This handles any edge cases where the API returns duplicates
    const seen = new Set<string>();
    const uniqueBlocks = data.blocks.filter((block) => {
      const key = block.external_id || String(block.id);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return { ...data, blocks: uniqueBlocks };
  } catch (error) {
    throw error;
  }
}

export async function fetchBlockById(
  id: string,
  signal?: AbortSignal
): Promise<Block> {
  try {
    const response = await fetch(`/api/blocks/${id}`, {
      signal,
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch block: ${response.statusText}`);
    }

    const data = await response.json();
    return data as Block;
  } catch (error) {
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
  // For videos, prioritize thumbnail_url for better performance.
  // For images, prioritize R2 key (best quality) then image_url.
  //
  // Priority for videos:
  // 1. thumbnail_url (best for video previews)
  // 2. R2 key via our `/api/media` proxy
  // 3. image_url (if available)
  // 4. video_url (last resort)
  //
  // Priority for images:
  // 1. R2 key via our `/api/media` proxy (final uploaded asset, best quality)
  // 2. Original image URL from the source (`image_url`)
  // 3. Remote thumbnail (`thumbnail_url`) as a fallback only
  //
  // IMPORTANT:
  // - Always go through `/api/media` when using R2 so we stay on the same
  //   origin as the frontend (avoids CORS / port issues).
  const isVideo = block.media_type === "video" || Boolean(block.video_url);

  if (isVideo && block.thumbnail_url) {
    return block.thumbnail_url;
  }

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
  q?: string | null,
  signal?: AbortSignal
): Promise<UsersResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (q && typeof q === "string" && q.trim().length > 0) {
    params.set("q", q.trim());
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

export async function searchBlocks(
  q: string,
  cursor?: string | null,
  limit: number = 50,
  signal?: AbortSignal
): Promise<BlocksResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    q: q.trim(),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  try {
    const response = await fetch(`/api/blocks?${params.toString()}`, {
      signal,
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to search blocks: ${response.statusText}`);
    }

    const data = (await response.json()) as BlocksResponse;
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

export interface UserResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export async function fetchUserByUsername(
  username: string,
  signal?: AbortSignal
): Promise<UserResponse> {
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      signal,
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }

    const data = (await response.json()) as UserResponse;
    return data;
  } catch (error) {
    throw error;
  }
}

export async function fetchBlocksByUsername(
  username: string,
  cursor?: string | null,
  limit: number = 50,
  signal?: AbortSignal
): Promise<BlocksResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    origin: "user",
    username: username,
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  // Add cache-busting timestamp
  params.set("_t", Date.now().toString());

  try {
    const response = await fetch(`/api/blocks?${params.toString()}`, {
      signal,
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch blocks: ${response.statusText}`);
    }

    const data = (await response.json()) as BlocksResponse;
    return data;
  } catch (error) {
    throw error;
  }
}
