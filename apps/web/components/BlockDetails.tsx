"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Search, ArrowLeft } from "lucide-react";
import type { Block } from "@/types/block";
import { getBlockMediaUrl, getBlockVideoUrl, getUserAvatarUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);

  const isVideo = block.media_type === "video" || !!block.video_url;
  const mediaUrl = getBlockMediaUrl(block);
  const videoUrl = getBlockVideoUrl(block);

  const handleClose = () => {
    if (isModal) {
      router.back();
    } else {
      router.push("/");
    }
  };

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
    
    // Look for API endpoint link matching /api/items/.../source pattern
    for (const link of block.links) {
      const url = (link as any).url || (link as any).href || "";
      
      // Check if it's an API source endpoint
      if (/\/api\/items\/[^/]+\/source\/?$/i.test(url)) {
        return url;
      }
    }
    
    return null;
  }, [block.links]);


  const handleTagClick = (tag: string) => {
    router.push(`/search?q=${encodeURIComponent(tag)}`);
  };

  const handleColorClick = (hex: string) => {
    router.push(`/search?q=${encodeURIComponent(hex)}`);
  };


  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isModal) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isModal]);

  return (
    <div className={cn(
      "relative flex h-full w-full bg-background overflow-hidden"
    )}>
      {/* Main Content Area */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 md:p-8 lg:p-12 min-h-0 bg-[#0a0a0a]">
        {/* Top Left Controls - Back Button and Avatar Stack */}
        <div className="absolute top-6 left-6 z-50 flex items-center gap-2">
          {/* Back Button */}
          <button
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
                <button
                  className="flex items-center gap-2 group"
                >
                  <div className="flex -space-x-2">
                    {block.origin_map.users.slice(0, 5).map((user, i) => (
                      <div 
                        key={user.username} 
                        className="w-8 h-8 rounded-full border-2 border-[#111] overflow-hidden bg-muted transition-transform group-hover:scale-110"
                        style={{ zIndex: 10 - i }}
                        title={user.display_name || user.username}
                      >
                        <img 
                          src={getUserAvatarUrl(user as any) || `https://avatar.vercel.sh/${user.username}`} 
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
                    {block.origin_map.users_count} {block.origin_map.users_count === 1 ? 'user' : 'users'} saved this
                  </div>
                  <div className="space-y-2">
                    {block.origin_map.users.map((user) => (
                      <div
                        key={user.username}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                        onClick={() => router.push(`/users/${user.username}`)}
                      >
                        <div className="w-10 h-10 rounded-full border-2 border-[#111] overflow-hidden bg-muted shrink-0">
                          <img 
                            src={getUserAvatarUrl(user as any) || `https://avatar.vercel.sh/${user.username}`} 
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
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Media Container */}
        <div className="relative w-full h-full flex items-center justify-center max-w-5xl">
          {isVideo ? (
            <video
              ref={videoRef}
              src={videoUrl || ""}
              autoPlay
              loop
              muted
              controls
              playsInline
              className="max-h-full max-w-full object-contain rounded-sm"
              onLoadedData={() => setIsVideoLoaded(true)}
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
            />
          ) : (
            <img
              src={mediaUrl}
              alt={block.title || "Block content"}
              className="max-h-full max-w-full object-contain rounded-sm"
            />
          )}
        </div>
      </div>

      {/* Sidebar - Info Panel */}
      <aside className="relative w-[450px] border-l border-white/5 bg-background p-10 flex flex-col gap-10 overflow-y-auto hidden lg:flex">
        {/* Close Button - Top Right of Sidebar */}
        <button
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
          <div className="flex items-center gap-4 flex-wrap">
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
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Color Palette</h3>
            <div className="flex flex-wrap gap-3">
              {block.color_hexes.map((hex) => (
                <button
                  key={hex}
                  onClick={() => handleColorClick(hex)}
                  className="group flex h-10 w-10 min-w-[40px] max-w-[130px] cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap rounded-[20px] border transition-all duration-300 delay-100 hover:w-auto hover:px-3 hover:delay-0 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-gray-950"
                  style={{ 
                    backgroundColor: hex,
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                  title={`Search by ${hex}`}
                  aria-label={`Search by trending color ${hex}`}
                >
                  <Search 
                    size={12} 
                    className="mr-2 h-3 w-3 opacity-0 transition-opacity duration-300 group-hover:opacity-80 text-black shrink-0" 
                  />
                  <span className="truncate text-[14px] font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-80 text-black">
                    {hex}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Tags */}
        {block.ai_tags && block.ai_tags.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">AI Tags</h3>
            <div className="flex flex-wrap gap-2.5">
              {block.ai_tags.map((tag) => (
                <button
                  key={tag}
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
