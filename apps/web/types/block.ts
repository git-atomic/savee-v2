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
  status: "pending" | "fetched" | "scraped" | "uploaded" | "error";
  color_hexes?: string[] | null;
  colors?: Array<{ r: number; g: number; b: number }> | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
}

export interface BlocksResponse {
  success: boolean;
  blocks: Block[];
  nextCursor?: string | null;
  count: number;
}
