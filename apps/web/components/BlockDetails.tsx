"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Search, ArrowLeft } from "lucide-react";
import type { Block } from "@/types/block";
import {
  getBlockMediaUrl,
  getBlockVideoUrl,
  getRemoteMediaProxyUrl,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { hexToRgb, getTextColor } from "@/lib/color-utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface BlockDetailsProps {
  block: Block;
  isModal?: boolean;
}

export function BlockDetails({ block, isModal = false }: BlockDetailsProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollLockYRef = useRef(0);

  const isVideo = block.media_type === "video" || !!block.video_url;
  const [mediaUrl, setMediaUrl] = useState(() =>
    getBlockMediaUrl(block, { preferProxy: false })
  );
  const videoUrl = getBlockVideoUrl(block);
  const [triedProxyFallback, setTriedProxyFallback] = useState(false);

  const navigateTo = useCallback(
    (href: string) => {
      if (isModal) {
        router.push(href, { scroll: false });
        return;
      }
      router.push(href, { scroll: false });
    },
    [isModal, router]
  );

  const handleClose = useCallback(() => {
    if (isModal) {
      if (window.history.length > 1) {
        router.back();
        return;
      }
      router.replace("/");
      return;
    }
    router.push("/", { scroll: false });
  }, [isModal, router]);

  const handleTagClick = useCallback(
    (tag: string) => {
      navigateTo(`/search?q=${encodeURIComponent(tag)}`);
    },
    [navigateTo]
  );

  const handleColorClick = useCallback(
    (hex: string) => {
      navigateTo(`/search?q=${encodeURIComponent(hex)}`);
    },
    [navigateTo]
  );

  const handleUserClick = useCallback(
    (username: string) => {
      navigateTo(`/users/${username}`);
    },
    [navigateTo]
  );

  const getColorPillStyles = useCallback((hex: string) => {
    const rgb = hexToRgb(hex);
    const readableText =
      rgb && getTextColor(rgb.r, rgb.g, rgb.b) === "black"
        ? "rgba(0, 0, 0, 0.86)"
        : "rgba(255, 255, 255, 0.94)";
    const readableIcon =
      rgb && getTextColor(rgb.r, rgb.g, rgb.b) === "black"
        ? "rgba(0, 0, 0, 0.72)"
        : "rgba(255, 255, 255, 0.86)";
    const borderColor =
      rgb && getTextColor(rgb.r, rgb.g, rgb.b) === "black"
        ? "rgba(0, 0, 0, 0.18)"
        : "rgba(255, 255, 255, 0.2)";

    return { readableText, readableIcon, borderColor };
  }, []);

  const saveeDomain = useMemo(() => {
    try {
      const url = new URL(block.url);
      return url.hostname.replace("www.", "");
    } catch {
      return "";
    }
  }, [block.url]);

  // Extract API source URL from links
  const apiSourceUrl = useMemo(() => {
    if (!block.links || block.links.length === 0) return null;

    const normalizedLinks = block.links
      .map((link) => {
        if (!link || typeof link !== "object" || !("url" in link)) return null;
        return {
          url: String(link.url || "").trim(),
          title: String(("title" in link ? link.title : "") || "").trim(),
        };
      })
      .filter((link): link is { url: string; title: string } => Boolean(link?.url));

    if (normalizedLinks.length === 0) {
      return null;
    }

    const explicitSource = normalizedLinks.find((link) =>
      /source/i.test(link.title)
    );
    if (explicitSource) {
      return explicitSource.url;
    }

    const sourcePattern = normalizedLinks.find((link) =>
      /\/source\/?$/i.test(link.url) ||
      /\/api\/items\/[^/]+\/source\/?$/i.test(link.url)
    );
    if (sourcePattern) {
      return sourcePattern.url;
    }

    const nonPrimaryLink = normalizedLinks.find((link) => link.url !== block.url);
    return nonPrimaryLink?.url ?? null;
  }, [block.links, block.url]);

  // Helper to get user avatar URL from partial user data
  const getUserAvatarUrlFromPartial = (
    user: {
      avatar_r2_key?: string | null;
      profile_image_url?: string | null;
      username: string;
    }
  ) => {
    if (user.avatar_r2_key) {
      return `/api/media?key=${encodeURIComponent(user.avatar_r2_key)}`;
    }
    if (user.profile_image_url) {
      return user.profile_image_url;
    }
    return `https://avatar.vercel.sh/${user.username}`;
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isModal) {
      scrollLockYRef.current = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollLockYRef.current}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollLockYRef.current);
      };
    }
  }, [isModal]);

  useEffect(() => {
    setMediaUrl(getBlockMediaUrl(block, { preferProxy: false }));
    setTriedProxyFallback(false);
  }, [block.id, block.image_url, block.thumbnail_url, block.r2_key, block.video_url]);

  const handleImageError = useCallback(() => {
    if (!triedProxyFallback && mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
      setTriedProxyFallback(true);
      setMediaUrl(getRemoteMediaProxyUrl(mediaUrl));
      return;
    }
    const fallback = block.r2_key
      ? `/api/media?key=${encodeURIComponent(block.r2_key)}`
      : "";
    if (fallback && fallback !== mediaUrl) {
      setMediaUrl(fallback);
    }
  }, [triedProxyFallback, mediaUrl, block.r2_key]);

  return (
    <div
      className={cn(
        "relative flex w-full bg-background overflow-hidden",
        isModal ? "h-full" : "h-[100dvh]"
      )}
    >
      {/* Main Content Area */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-2 md:p-4 lg:p-6 min-h-0 bg-[#0a0a0a]">
        {/* Top Left Controls - Back Button and Avatar Stack */}
        <div className="absolute top-6 left-6 z-50 flex items-center gap-2">
          {/* Back Button */}
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-full bg-black/20 hover:bg-black/40 transition-colors text-white backdrop-blur-md"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>

          {/* Avatar Stack Overlay */}
          {block.origin_map?.users && block.origin_map.users.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex items-center gap-2 group">
                  <div className="flex -space-x-2">
                    {block.origin_map.users.slice(0, 5).map((user, i) => (
                      <div
                        key={user.username}
                        className="w-8 h-8 rounded-full border-2 border-[#111] overflow-hidden bg-muted transition-transform group-hover:scale-110"
                        style={{ zIndex: 10 - i }}
                        title={user.display_name || user.username}
                      >
                        <img
                          src={getUserAvatarUrlFromPartial(user)}
                          alt={user.username}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {block.origin_map.users_count > 5 && (
                      <div
                        className="w-8 h-8 rounded-full border-2 border-[#111] bg-[#222] flex items-center justify-center text-[10px] font-bold text-white z-0 transition-transform group-hover:scale-110"
                        title={`${block.origin_map.users_count} users saved this`}
                      >
                        +{block.origin_map.users_count - 5}
                      </div>
                    )}
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                alignOffset={-8}
                className="w-80 max-h-96 overflow-y-auto"
              >
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">
                    {block.origin_map.users_count}{" "}
                    {block.origin_map.users_count === 1 ? "user" : "users"} saved
                    this
                  </div>
                  <div className="space-y-2">
                    {block.origin_map.users.map((user) => (
                      <button
                        key={user.username}
                        type="button"
                        className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                        onClick={() => handleUserClick(user.username)}
                      >
                        <div className="w-10 h-10 rounded-full border-2 border-[#111] overflow-hidden bg-muted shrink-0">
                          <img
                            src={getUserAvatarUrlFromPartial(user)}
                            alt={user.username}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {user.display_name || user.username}
                          </div>
                          {user.display_name && (
                            <div className="text-xs text-muted-foreground truncate">
                              @{user.username}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Media Container */}
        <div className="relative w-full flex-1 max-h-[calc(100dvh-3.5rem)] md:max-h-[calc(100dvh-5rem)] flex items-center justify-center max-w-6xl">
          {isVideo ? (
            <video
              ref={videoRef}
              src={videoUrl || ""}
              poster={mediaUrl || undefined}
              autoPlay
              loop
              muted
              controls
              playsInline
              className="h-full w-full object-contain rounded-sm"
            />
          ) : (
            <img
              src={mediaUrl}
              alt={block.title || "Block content"}
              className="h-full w-full object-contain rounded-sm"
              onError={handleImageError}
            />
          )}
        </div>

        {/* Mobile Info Panel */}
        <div className="mt-3 w-full max-w-6xl rounded-xl border border-white/10 bg-black/50 p-3 backdrop-blur-md lg:hidden">
          <div className="flex flex-col gap-3">
            <h1 className="text-base font-semibold leading-tight text-white">
              {block.title || block.og_title || "Untitled"}
            </h1>
            <div className="flex items-center gap-3 text-sm">
              {saveeDomain && (
                <a
                  href={block.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground hover:text-white transition-colors"
                >
                  <span>link</span>
                  <ExternalLink size={12} className="opacity-60" />
                </a>
              )}
              {apiSourceUrl && (
                <a
                  href={apiSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground hover:text-white transition-colors"
                >
                  <span>source</span>
                  <ExternalLink size={12} className="opacity-60" />
                </a>
              )}
            </div>
            {block.ai_tags && block.ai_tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {block.ai_tags.slice(0, 10).map((tag) => (
                  <button
                    key={`mobile-tag-${tag}`}
                    type="button"
                    onClick={() => handleTagClick(tag)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/90"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar - Info Panel */}
      <aside className="relative h-full max-h-full w-[420px] border-l border-white/5 bg-background p-8 flex-col gap-8 overflow-y-auto hidden lg:flex">
        {/* Close Button - Top Right of Sidebar */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/20 hover:bg-black/40 transition-colors text-white backdrop-blur-md"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Info Section */}
        <div className="flex flex-col gap-4">
          {/* Title */}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-white">
            {block.title || block.og_title || "Untitled"}
          </h1>

          {/* Source Info - Savee Link and API Source */}
          <div className="flex flex-col items-start gap-2">
            {saveeDomain && (
              <a
                href={block.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-muted-foreground text-sm font-medium hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-gray-950 rounded"
              >
                <span>link</span>
                <ExternalLink size={12} className="opacity-60" />
              </a>
            )}
            {apiSourceUrl && (
              <a
                href={apiSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-muted-foreground text-sm font-medium hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-gray-950 rounded"
              >
                <span>source</span>
                <ExternalLink size={12} className="opacity-60" />
              </a>
            )}
          </div>
        </div>

        {/* Color Palette */}
        {block.color_hexes && block.color_hexes.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Color Palette
            </h3>
            <div className="flex flex-wrap gap-3">
              {block.color_hexes.map((hex) => {
                const { readableText, readableIcon, borderColor } =
                  getColorPillStyles(hex);
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => handleColorClick(hex)}
                    className="group flex h-10 w-10 hover:w-[126px] min-w-[40px] cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap rounded-[20px] border transition-[width,transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-gray-950"
                    style={{
                      backgroundColor: hex,
                      borderColor,
                    }}
                    title={`Search by ${hex}`}
                    aria-label={`Search by trending color ${hex}`}
                  >
                    <Search
                      size={12}
                      className="mr-2 h-3 w-3 opacity-0 -translate-x-1 transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-85 group-hover:translate-x-0 shrink-0"
                      style={{ color: readableIcon }}
                    />
                    <span
                      className="truncate text-[14px] font-medium opacity-0 -translate-x-1 transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-90 group-hover:translate-x-0"
                      style={{ color: readableText }}
                    >
                      {hex}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Tags */}
        {block.ai_tags && block.ai_tags.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
              AI Tags
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {block.ai_tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagClick(tag)}
                  className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-[13px] font-medium transition-colors border border-white/5 active:bg-white/15 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-gray-950"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
