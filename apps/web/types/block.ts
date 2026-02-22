export interface Block {
  id: number;
  external_id: string;
  url: string;
  title?: string | null;
  description?: string | null;
  media_type?: "image" | "video" | "gif" | "unknown" | null;
  image_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  r2_key?: string | null;
  saved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sort_ts?: string | null;
  status: "pending" | "fetched" | "scraped" | "uploaded" | "error";
  color_hexes?: string[] | null;
  colors?: Array<{ r: number; g: number; b: number }> | null;
  ai_tags?: string[] | null;
  saved_by_usernames?: string | null;
  links?: Array<{ url: string; title: string }> | null;
  metadata?: Record<string, unknown> | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  origin_map?: {
    home: boolean;
    pop: boolean;
    users: Array<{
      username: string;
      display_name?: string | null;
      avatar_r2_key?: string | null;
      profile_image_url?: string | null;
    }>;
    users_count: number;
    tags: string[];
  } | null;
}

export interface BlocksResponse {
  success: boolean;
  blocks: Block[];
  nextCursor?: string | null;
  count: number;
}
