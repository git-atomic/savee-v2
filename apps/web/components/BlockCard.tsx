"use client";

import { useState, useRef, memo, useEffect, useCallback, useMemo, startTransition } from "react";
import type { Block } from "@/types/block";
import { getBlockMediaUrl, getBlockVideoUrl } from "@/lib/api";
import { getDeterministicAspectRatio } from "@/lib/masonry-utils";
import { useIntersectionObserverPool } from "@/hooks/use-intersection-observer-pool";

interface BlockCardProps {
  block: Block;
  priority?: boolean;
  aspectRatio?: number | null;
}

// Global cache to track loaded images to prevent re-animation on remount
const loadedBlocksCache = new Set<number>();

// Constants for performance optimization
const HOVER_DELAY = 150; // Reduced from 200ms for faster response
const TIMEUPDATE_THROTTLE = 250; // Throttle timeupdate events
const VIDEO_LOAD_TIMEOUT_PRIORITY = 2000; // Timeout for priority videos
const VIDEO_LOAD_TIMEOUT_LAZY = 5000; // Timeout for lazy-loaded videos
const LOOP_DELAY = 300; // Delay between video loops in milliseconds

function getDominantColor(block: Block): string | null {
  if (
    block.color_hexes &&
    Array.isArray(block.color_hexes) &&
    block.color_hexes.length > 0
  ) {
    const firstColor = block.color_hexes[0];
    if (typeof firstColor === "string" && firstColor.startsWith("#")) {
      return firstColor;
    }
  }

  if (block.colors && Array.isArray(block.colors) && block.colors.length > 0) {
    const firstColor = block.colors[0];
    if (
      typeof firstColor === "object" &&
      firstColor !== null &&
      "r" in firstColor
    ) {
      const r = (firstColor as { r: number }).r;
      const g = (firstColor as { g: number }).g ?? r;
      const b = (firstColor as { b: number }).b ?? r;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return null;
}

function BlockCardComponent({
  block,
  priority = false,
  aspectRatio: propAspectRatio,
}: BlockCardProps) {
  const wasPreviouslyLoaded = loadedBlocksCache.has(block.id);

  // State management
  const [imageSrc, setImageSrc] = useState<string>(() =>
    getBlockMediaUrl(block)
  );
  const [isLoaded, setIsLoaded] = useState(wasPreviouslyLoaded);
  const [hasError, setHasError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority || wasPreviouslyLoaded);
  const [isHovered, setIsHovered] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(wasPreviouslyLoaded);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [hasVideoPlayed, setHasVideoPlayed] = useState(false);
  const [localAspectRatio, setLocalAspectRatio] = useState<number | null>(
    propAspectRatio ?? null
  );

  // Refs
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoPositionRef = useRef<number>(0);
  const shouldLoadRef = useRef(priority || wasPreviouslyLoaded);
  const timeUpdateRafRef = useRef<number | null>(null);
  const lastTimeUpdateRef = useRef<number>(0);
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Computed values
  const isVideo = block.media_type === "video" || Boolean(block.video_url);
  const videoUrl = getBlockVideoUrl(block);
  const dominantColor = getDominantColor(block);
  const skeletonColor = dominantColor || "var(--muted)";
  const aspectRatio = localAspectRatio ?? propAspectRatio;
  const displayAspectRatio =
    aspectRatio || getDeterministicAspectRatio(block.id) || 1;

  // Update ref when shouldLoad changes
  useEffect(() => {
    if (shouldLoad) {
      shouldLoadRef.current = true;
    }
  }, [shouldLoad]);

  // Intersection observer for lazy loading
  const handleIntersection = useCallback(
    (isIntersecting: boolean) => {
      if (isIntersecting && !shouldLoadRef.current && !wasPreviouslyLoaded) {
        setShouldLoad(true);
        shouldLoadRef.current = true;
      }
    },
    [wasPreviouslyLoaded]
  );

  const setElement = useIntersectionObserverPool(handleIntersection, {
    rootMargin: "200px",
    threshold: 0.01,
  });

  const containerCallbackRef = useCallback(
    (node: HTMLElement | null) => {
      containerRef.current = node;
      if (priority || shouldLoadRef.current || wasPreviouslyLoaded) {
        setElement(null);
      } else if (node) {
        setElement(node);
      } else {
        setElement(null);
      }
    },
    [priority, wasPreviouslyLoaded, setElement]
  );

  // Optimized aspect ratio loading for images
  useEffect(() => {
    if (
      isVideo ||
      !imageSrc ||
      aspectRatio !== null ||
      propAspectRatio !== undefined
    )
      return;

    const img = new Image();
    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };

    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setLocalAspectRatio(img.naturalWidth / img.naturalHeight);
      }
      cleanup();
    };

    img.onerror = () => {
      if (!cancelled) {
        const thumbnail = block.thumbnail_url || block.image_url;
        if (thumbnail && thumbnail !== imageSrc) {
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            if (
              !cancelled &&
              fallbackImg.naturalWidth > 0 &&
              fallbackImg.naturalHeight > 0
            ) {
              setLocalAspectRatio(
                fallbackImg.naturalWidth / fallbackImg.naturalHeight
              );
            } else if (!cancelled) {
              setLocalAspectRatio(1);
            }
          };
          fallbackImg.onerror = () => {
            if (!cancelled) setLocalAspectRatio(1);
          };
          fallbackImg.src = thumbnail;
        } else {
          setLocalAspectRatio(1);
        }
      }
      cleanup();
    };

    img.src = imageSrc;

    return cleanup;
  }, [isVideo, imageSrc, aspectRatio, propAspectRatio, block]);

  // Optimized aspect ratio loading for videos
  useEffect(() => {
    if (
      !isVideo ||
      !videoUrl ||
      aspectRatio !== null ||
      propAspectRatio !== undefined
    )
      return;

    let cancelled = false;
    let video: HTMLVideoElement | null = null;

    const cleanup = () => {
      cancelled = true;
      if (video) {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.src = "";
        video.load();
        video = null;
      }
    };

    // Try thumbnail first (faster)
    if (imageSrc) {
      const thumbnailImg = new Image();
      thumbnailImg.onload = () => {
        if (
          !cancelled &&
          thumbnailImg.naturalWidth > 0 &&
          thumbnailImg.naturalHeight > 0
        ) {
          setLocalAspectRatio(
            thumbnailImg.naturalWidth / thumbnailImg.naturalHeight
          );
        }
      };
      thumbnailImg.onerror = () => {
        // Fall through to video loading
      };
      thumbnailImg.src = imageSrc;
    }

    // Load video metadata in parallel
    video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    video.onloadedmetadata = () => {
      if (!cancelled && video && video.videoWidth > 0 && video.videoHeight > 0) {
        setLocalAspectRatio(video.videoWidth / video.videoHeight);
      }
      cleanup();
    };

    video.onerror = () => {
      if (!cancelled && localAspectRatio === null) {
        setLocalAspectRatio(1);
      }
      cleanup();
    };

    video.src = videoUrl;

    return cleanup;
  }, [
    isVideo,
    videoUrl,
    imageSrc,
    aspectRatio,
    propAspectRatio,
    localAspectRatio,
  ]);

  // Throttled video position tracking
  useEffect(() => {
    if (!isVideo || !videoRef.current || !shouldLoad) return;

    const video = videoRef.current;

    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastTimeUpdateRef.current < TIMEUPDATE_THROTTLE) {
        return;
      }
      lastTimeUpdateRef.current = now;

      if (timeUpdateRafRef.current) {
        cancelAnimationFrame(timeUpdateRafRef.current);
      }

      timeUpdateRafRef.current = requestAnimationFrame(() => {
        if (video && !video.paused) {
          videoPositionRef.current = video.currentTime;
        }
      });
    };

    video.addEventListener("timeupdate", handleTimeUpdate, { passive: true });

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      if (timeUpdateRafRef.current) {
        cancelAnimationFrame(timeUpdateRafRef.current);
      }
    };
  }, [isVideo, shouldLoad]);

  // Video loading timeout with better fallback
  useEffect(() => {
    if (!isVideo || !videoUrl || !shouldLoad || isVideoLoaded) return;

    const timeout = setTimeout(() => {
      if (videoRef.current && !isVideoLoaded) {
        const video = videoRef.current;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setIsVideoLoaded(true);
          setIsLoaded(true);
        } else if (video.readyState >= 2) {
          setIsVideoLoaded(true);
          setIsLoaded(true);
        } else if (video.readyState >= 1) {
          setIsVideoLoaded(true);
          setIsLoaded(true);
        }
      }
    }, priority ? VIDEO_LOAD_TIMEOUT_PRIORITY : VIDEO_LOAD_TIMEOUT_LAZY);

    return () => clearTimeout(timeout);
  }, [isVideo, videoUrl, shouldLoad, isVideoLoaded, priority]);

  // Video playing state tracking with optimized event listeners
  useEffect(() => {
    if (!isVideo || !videoRef.current || !shouldLoad) return;

    const video = videoRef.current;

    const handlePlaying = () => setIsVideoPlaying(true);
    const handlePause = () => setIsVideoPlaying(false);
    const handleEnded = () => setIsVideoPlaying(false);

    video.addEventListener("playing", handlePlaying, { passive: true });
    video.addEventListener("pause", handlePause, { passive: true });
    video.addEventListener("ended", handleEnded, { passive: true });

    return () => {
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [isVideo, shouldLoad]);

  // Optimized video autoplay on hover
  useEffect(() => {
    if (!isVideo || !videoRef.current || !videoUrl || !shouldLoad) return;

    const video = videoRef.current;

    if (isHovered) {
      hoverTimeoutRef.current = setTimeout(() => {
        if (video && isHovered && !video.paused) {
          // Already playing, no action needed
          return;
        }

        if (video && isHovered) {
          // Restore position if we have a saved one
          if (videoPositionRef.current > 0 && video.duration > 0) {
            video.currentTime = Math.min(
              videoPositionRef.current,
              video.duration - 0.1
            );
          }

          const playVideo = async () => {
            try {
              // Ensure position is set before playing
              if (videoPositionRef.current > 0 && video.duration > 0) {
                video.currentTime = Math.min(
                  videoPositionRef.current,
                  video.duration - 0.1
                );
              }
              await video.play();
            } catch (err) {
              // Autoplay prevented - this is expected in some browsers
              console.debug("Video autoplay prevented:", err);
            }
          };

          // Optimized ready state checking
          if (video.readyState >= 3) {
            // HAVE_FUTURE_DATA - enough data to play
            playVideo();
          } else if (video.readyState >= 2) {
            // HAVE_METADATA - try to play
            playVideo();
          } else {
            // Wait for metadata
            const handleCanPlay = () => {
              playVideo();
              video.removeEventListener("canplay", handleCanPlay);
              video.removeEventListener("loadedmetadata", handleCanPlay);
            };
            video.addEventListener("canplay", handleCanPlay, { once: true });
            video.addEventListener("loadedmetadata", handleCanPlay, {
              once: true,
            });
          }
        }
      }, HOVER_DELAY);
    } else {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      // Clear loop timeout when unhovering
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
      if (video) {
        // Always save the current position when unhovering, whether playing or paused
        if (!video.paused) {
          videoPositionRef.current = video.currentTime;
          video.pause();
          // Mark that video has been played so we show paused frame instead of thumbnail
          if (video.currentTime > 0) {
            startTransition(() => {
              setHasVideoPlayed(true);
            });
          }
        } else if (video.currentTime > 0) {
          // Save position even if already paused (in case it changed)
          videoPositionRef.current = video.currentTime;
          startTransition(() => {
            setHasVideoPlayed(true);
          });
        }
        // Ensure video stays at current position and doesn't reset
        if (videoPositionRef.current > 0 && video.duration > 0) {
          video.currentTime = Math.min(
            videoPositionRef.current,
            video.duration - 0.1
          );
        }
      }
    }

    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, [isHovered, isVideo, videoUrl, shouldLoad]);

  // Comprehensive video cleanup on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.src = "";
        video.load();
        // Clear all event listeners
        const newVideo = video.cloneNode(false) as HTMLVideoElement;
        video.replaceWith(newVideo);
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
      }
      if (timeUpdateRafRef.current) {
        cancelAnimationFrame(timeUpdateRafRef.current);
      }
    };
  }, []);

  // Optimized event handlers with useCallback
  const handleImageLoad = useCallback(() => {
    if (imgRef.current && !isVideo) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      if (
        naturalWidth > 0 &&
        naturalHeight > 0 &&
        aspectRatio === null &&
        propAspectRatio === undefined
      ) {
        setLocalAspectRatio(naturalWidth / naturalHeight);
      }
    }
    // Regardless of media type, once the thumbnail has loaded we can
    // consider the block visually loaded so the skeleton disappears.
    setIsLoaded(true);
    loadedBlocksCache.add(block.id);
  }, [isVideo, aspectRatio, propAspectRatio, block.id]);

  const handleVideoLoadedData = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const { videoWidth, videoHeight } = video;
    if (videoWidth > 0 && videoHeight > 0) {
      if (
        aspectRatio === null &&
        propAspectRatio === undefined
      ) {
        setLocalAspectRatio(videoWidth / videoHeight);
      }
      setIsVideoLoaded(true);
      setIsLoaded(true);
      loadedBlocksCache.add(block.id);
    }
  }, [aspectRatio, propAspectRatio, block.id]);

  const handleImageError = useCallback(() => {
    setHasError(true);
    const fallback =
      block.thumbnail_url || block.image_url || block.video_url || "";
    if (fallback && fallback !== imageSrc) {
      setImageSrc(fallback);
      setIsLoaded(false);
    }
  }, [block, imageSrc]);

  const handleVideoError = useCallback(() => {
    setHasError(true);
    if (imageSrc && !isLoaded) {
      setIsLoaded(true);
    }
  }, [imageSrc, isLoaded]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Memoized video event handlers
  const videoEventHandlers = useMemo(
    () => ({
      onCanPlay: () => {
        const video = videoRef.current;
        if (
          video &&
          video.videoWidth > 0 &&
          video.videoHeight > 0 &&
          !isVideoLoaded
        ) {
          setIsVideoLoaded(true);
          setIsLoaded(true);
          loadedBlocksCache.add(block.id);
        }
      },
      onPlaying: () => {
        const video = videoRef.current;
        if (video && !isVideoLoaded) {
          setIsVideoLoaded(true);
          setIsLoaded(true);
          loadedBlocksCache.add(block.id);
        }
        setIsVideoPlaying(true);
        // Mark that video has been played
        if (video && video.currentTime > 0) {
          setHasVideoPlayed(true);
        }
      },
      onEnded: () => {
        // Wait a bit before looping to prevent merge effect
        // Only loop if still hovered
        if (isHovered && videoRef.current) {
          // Clear any existing loop timeout
          if (loopTimeoutRef.current) {
            clearTimeout(loopTimeoutRef.current);
          }
          
          // Wait before restarting
          loopTimeoutRef.current = setTimeout(() => {
            const video = videoRef.current;
            if (video && isHovered) {
              video.currentTime = 0;
              video.play().catch(() => {
                // Ignore play errors
              });
            }
            loopTimeoutRef.current = null;
          }, LOOP_DELAY);
        }
      },
      onProgress: () => {
        const video = videoRef.current;
        if (video && !isVideoLoaded) {
          if (
            video.buffered.length > 0 &&
            video.buffered.end(0) > 0 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            setIsVideoLoaded(true);
            setIsLoaded(true);
            loadedBlocksCache.add(block.id);
          }
        }
      },
    }),
    [isVideoLoaded, isHovered, block.id]
  );

  if (!imageSrc && !isVideo) {
    return null;
  }

  return (
    <article
      ref={containerCallbackRef}
      className="group relative w-full break-inside-avoid"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: displayAspectRatio
          ? `auto ${(1 / displayAspectRatio) * 100}%`
          : "auto 100%",
        opacity: wasPreviouslyLoaded ? 1 : undefined,
        transform: wasPreviouslyLoaded ? "translateY(0)" : undefined,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={block.title || "Content block"}
    >
      <div
        className="relative w-full overflow-hidden rounded-[4px]"
        style={{
          // Use aspect-ratio to reserve space and prevent layout shifts
          aspectRatio: displayAspectRatio,
          minHeight: 0,
          backgroundColor: !isLoaded ? skeletonColor : "transparent",
        }}
      >
        {/* Media Content */}
        {(shouldLoad || wasPreviouslyLoaded) && (
          <div className="relative w-full h-full">
            {/* Skeleton placeholder */}
            {!isLoaded && !hasError && (
              <div
                className="absolute inset-0 z-0"
                style={{
                  backgroundColor: skeletonColor,
                  opacity: 0.25,
                }}
                aria-hidden="true"
              >
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)`,
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s infinite linear",
                  }}
                />
              </div>
            )}

            {isVideo && videoUrl ? (
              <>
                {/* Thumbnail image only visible when video hasn't been played yet */}
                {imageSrc && (
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt={block.title || "Video thumbnail"}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={priority ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={priority ? "high" : "auto"}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    style={{
                      opacity: hasVideoPlayed ? 0 : 1,
                      transition: wasPreviouslyLoaded
                        ? "none"
                        : "opacity 0.25s ease-out",
                    }}
                    aria-hidden={hasVideoPlayed}
                  />
                )}

                {/* Video stays visible when hovered, playing, or has been played (showing paused frame) */}
                <video
                  ref={videoRef}
                  src={videoUrl}
                  poster={imageSrc || undefined}
                  className="absolute inset-0 h-full w-full"
                  muted
                  playsInline
                  preload={priority ? "auto" : "metadata"}
                  crossOrigin="anonymous"
                  onLoadedData={handleVideoLoadedData}
                  onLoadedMetadata={handleVideoLoadedData}
                  onError={handleVideoError}
                  onCanPlay={videoEventHandlers.onCanPlay}
                  onPlaying={videoEventHandlers.onPlaying}
                  onEnded={videoEventHandlers.onEnded}
                  onProgress={videoEventHandlers.onProgress}
                  style={{
                    opacity: isHovered || isVideoPlaying || hasVideoPlayed ? 1 : 0,
                    transition: wasPreviouslyLoaded
                      ? "none"
                      : "opacity 0.25s ease-out",
                    objectFit: "cover",
                  }}
                  aria-label={block.title || "Video content"}
                />

                {/* Video badge - only show when video hasn't been played yet */}
                <div
                  className={`pointer-events-none absolute bottom-2 left-2 z-20 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm transition-opacity duration-200 ${
                    hasVideoPlayed ? "opacity-0" : "opacity-100"
                  }`}
                  aria-label="Video content"
                >
                  {/* Shimmer overlay */}
                  {!isVideoLoaded && isHovered && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)`,
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite linear",
                      }}
                    />
                  )}
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="relative z-10 shrink-0"
                    aria-hidden="true"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span className="relative z-10">VIDEO</span>
                </div>
              </>
            ) : imageSrc ? (
              <img
                ref={imgRef}
                src={imageSrc}
                alt={block.title || "Block image"}
                className="absolute inset-0 h-full w-full object-cover"
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={priority ? "high" : "auto"}
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{
                  opacity: isLoaded ? 1 : 0,
                  transition: wasPreviouslyLoaded
                    ? "none"
                    : "opacity 0.3s ease-out",
                  objectFit: "contain",
                }}
              />
            ) : null}

            {/* Hover Overlay */}
            <div
              className="pointer-events-none absolute inset-0 z-10 bg-black/0 transition-colors duration-300 group-hover:bg-black/5"
              aria-hidden="true"
            />
          </div>
        )}
      </div>
    </article>
  );
}

// Optimized memoization
export const BlockCard = memo(BlockCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.block.id === nextProps.block.id &&
    prevProps.block.video_url === nextProps.block.video_url &&
    prevProps.block.image_url === nextProps.block.image_url &&
    prevProps.block.thumbnail_url === nextProps.block.thumbnail_url &&
    prevProps.priority === nextProps.priority &&
    prevProps.aspectRatio === nextProps.aspectRatio
  );
});
