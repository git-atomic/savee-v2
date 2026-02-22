"use client";

import {
  useState,
  useRef,
  memo,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import type { Block } from "@/types/block";
import {
  getBlockMediaUrl,
  getBlockVideoUrl,
  getRemoteMediaProxyUrl,
} from "@/lib/api";
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

function extractAspectRatioFromMetadata(block: Block): number | null {
  const metadata = block.metadata as Record<string, unknown> | null | undefined;
  if (!metadata || typeof metadata !== "object") return null;

  const directRatio = Number(
    (metadata["aspect_ratio"] as unknown) ??
      (metadata["aspectRatio"] as unknown) ??
      (metadata["ratio"] as unknown)
  );
  if (Number.isFinite(directRatio) && directRatio > 0) return directRatio;

  const widthCandidates = [
    metadata["width"],
    metadata["image_width"],
    metadata["imageWidth"],
    metadata["video_width"],
    metadata["videoWidth"],
  ];
  const heightCandidates = [
    metadata["height"],
    metadata["image_height"],
    metadata["imageHeight"],
    metadata["video_height"],
    metadata["videoHeight"],
  ];

  for (let i = 0; i < Math.max(widthCandidates.length, heightCandidates.length); i += 1) {
    const width = Number(widthCandidates[i]);
    const height = Number(heightCandidates[i]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return width / height;
    }
  }

  return null;
}

function dedupeUrlCandidates(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = typeof value === "string" ? value.trim() : "";
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function BlockCardComponent({
  block,
  priority = false,
  aspectRatio: propAspectRatio,
}: BlockCardProps) {
  const router = useRouter();
  const wasPreviouslyLoaded = loadedBlocksCache.has(block.id);
  const imageCandidates = useMemo(() => {
    const initial = getBlockMediaUrl(block, { preferProxy: false });
    const r2Fallback = block.r2_key
      ? `/api/media?key=${encodeURIComponent(block.r2_key)}`
      : null;
    const remoteFallbacks = dedupeUrlCandidates([block.thumbnail_url, block.image_url])
      .filter(isHttpUrl)
      .map((url) => getRemoteMediaProxyUrl(url));

    return dedupeUrlCandidates([
      initial,
      block.thumbnail_url,
      block.image_url,
      r2Fallback,
      ...remoteFallbacks,
    ]);
  }, [
    block.id,
    block.media_type,
    block.video_url,
    block.thumbnail_url,
    block.image_url,
    block.r2_key,
  ]);

  // State management
  const [imageSrc, setImageSrc] = useState<string>(() => imageCandidates[0] || "");
  const [isLoaded, setIsLoaded] = useState(wasPreviouslyLoaded);
  const [isSharp, setIsSharp] = useState(wasPreviouslyLoaded);
  const [shouldLoad, setShouldLoad] = useState(priority || wasPreviouslyLoaded);
  const [isHovered, setIsHovered] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(wasPreviouslyLoaded);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [hasVideoPlayed, setHasVideoPlayed] = useState(false);
  const [localAspectRatio, setLocalAspectRatio] = useState<number | null>(
    propAspectRatio ?? extractAspectRatioFromMetadata(block)
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
  const imageRevealTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const failedImageSourcesRef = useRef<Set<string>>(new Set());

  // Computed values
  const isVideo = block.media_type === "video" || Boolean(block.video_url);
  const videoUrl = getBlockVideoUrl(block);
  const aspectRatio = localAspectRatio ?? propAspectRatio;
  const displayAspectRatio =
    aspectRatio || getDeterministicAspectRatio(block.id) || 1;
  const shouldRenderVideo = Boolean(
    isVideo && videoUrl && (isHovered || hasVideoPlayed)
  );

  // Update ref when shouldLoad changes
  useEffect(() => {
    if (shouldLoad) {
      shouldLoadRef.current = true;
    }
  }, [shouldLoad]);

  // Reset media state when card data changes.
  useEffect(() => {
    failedImageSourcesRef.current.clear();
    if (imageRevealTimeoutRef.current) {
      clearTimeout(imageRevealTimeoutRef.current);
      imageRevealTimeoutRef.current = null;
    }

    setImageSrc(imageCandidates[0] || "");
    setIsLoaded(wasPreviouslyLoaded);
    setIsSharp(wasPreviouslyLoaded);
    setIsVideoLoaded(wasPreviouslyLoaded);
    setHasVideoPlayed(false);
  }, [block.id, imageCandidates, wasPreviouslyLoaded]);

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

  // Throttled video position tracking
  useEffect(() => {
    if (!isVideo || !videoRef.current || !shouldLoad || !shouldRenderVideo) return;

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
  }, [isVideo, shouldLoad, shouldRenderVideo]);

  // Video loading timeout with better fallback
  useEffect(() => {
    if (!isVideo || !videoUrl || !shouldLoad || isVideoLoaded || !shouldRenderVideo) return;

    const timeout = setTimeout(
      () => {
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
      },
      priority ? VIDEO_LOAD_TIMEOUT_PRIORITY : VIDEO_LOAD_TIMEOUT_LAZY
    );

    return () => clearTimeout(timeout);
  }, [isVideo, videoUrl, shouldLoad, isVideoLoaded, priority, shouldRenderVideo]);

  // Video playing state tracking with optimized event listeners
  useEffect(() => {
    if (!isVideo || !videoRef.current || !shouldLoad || !shouldRenderVideo) return;

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
  }, [isVideo, shouldLoad, shouldRenderVideo]);

  // Optimized video autoplay on hover
  useEffect(() => {
    if (!isVideo || !videoRef.current || !videoUrl || !shouldLoad || !shouldRenderVideo) return;

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
            setHasVideoPlayed(true);
          }
        } else if (video.currentTime > 0) {
          // Save position even if already paused (in case it changed)
          videoPositionRef.current = video.currentTime;
          setHasVideoPlayed(true);
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
  }, [isHovered, isVideo, videoUrl, shouldLoad, shouldRenderVideo]);

  // Comprehensive video cleanup on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        video.pause();
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
      if (imageRevealTimeoutRef.current) {
        clearTimeout(imageRevealTimeoutRef.current);
      }
    };
  }, []);

  // Optimized event handlers with useCallback
  const handleImageLoad = useCallback(() => {
    if (imgRef.current && !isVideo) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      if (naturalWidth > 0 && naturalHeight > 0) {
        const naturalRatio = naturalWidth / naturalHeight;
        // Update if no ratio provided OR if provided ratio is significantly different (e.g. was a fallback)
        if (
          aspectRatio === null ||
          propAspectRatio === undefined ||
          Math.abs((aspectRatio ?? 0) - naturalRatio) > 0.01
        ) {
          setLocalAspectRatio(naturalRatio);
        }
      }
    }
    // Regardless of media type, once the thumbnail has loaded we can
    // consider the block visually loaded so the skeleton disappears.
    setIsLoaded(true);
    if (wasPreviouslyLoaded) {
      setIsSharp(true);
    } else {
      if (imageRevealTimeoutRef.current) {
        clearTimeout(imageRevealTimeoutRef.current);
      }
      imageRevealTimeoutRef.current = setTimeout(() => {
        setIsSharp(true);
      }, 45);
    }
    loadedBlocksCache.add(block.id);
  }, [isVideo, aspectRatio, propAspectRatio, block.id, wasPreviouslyLoaded]);

  const handleVideoLoadedData = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const { videoWidth, videoHeight } = video;
    if (videoWidth > 0 && videoHeight > 0) {
      if (aspectRatio === null && propAspectRatio === undefined) {
        setLocalAspectRatio(videoWidth / videoHeight);
      }
      setIsVideoLoaded(true);
      setIsLoaded(true);
      setIsSharp(true);
      loadedBlocksCache.add(block.id);
    }
  }, [aspectRatio, propAspectRatio, block.id]);

  const handleImageError = useCallback(() => {
    if (imageSrc) {
      failedImageSourcesRef.current.add(imageSrc);
    }

    const nextFallback = imageCandidates.find(
      (candidate) => !failedImageSourcesRef.current.has(candidate)
    );

    if (nextFallback && nextFallback !== imageSrc) {
      setImageSrc(nextFallback);
      setIsLoaded(false);
      setIsSharp(false);
      return;
    }

    setImageSrc("");
    setIsLoaded(false);
    setIsSharp(false);
  }, [imageCandidates, imageSrc]);

  const handleVideoError = useCallback(() => {
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

  const handleClick = useCallback(() => {
    router.push(`/b/${block.external_id}`, { scroll: false });
  }, [router, block.external_id]);

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
      className="group relative w-full rounded-[4px] break-inside-avoid cursor-pointer"
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
      onClick={handleClick}
      aria-label={block.title || "Content block"}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: displayAspectRatio,
          minHeight: 0,
        }}
      >
        <div
          className="absolute inset-0 bg-muted/60"
          style={{
            opacity: isLoaded ? 0 : 1,
            transition: "opacity 220ms ease-out",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: isLoaded ? 0 : 0.7,
            background:
              "linear-gradient(110deg, rgba(255,255,255,0.02) 8%, rgba(255,255,255,0.1) 18%, rgba(255,255,255,0.02) 33%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s linear infinite",
            transition: "opacity 220ms ease-out",
          }}
          aria-hidden="true"
        />

        {/* Media Content */}
        {(shouldLoad || wasPreviouslyLoaded) && (
          <>
            {isVideo && videoUrl ? (
              <>
                {/* Thumbnail image only visible when video hasn't been played yet */}
                {imageSrc && (
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full"
                    loading={priority ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={priority ? "high" : "auto"}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    style={{
                      opacity: hasVideoPlayed ? 0 : isLoaded ? 1 : 0.95,
                      transform: isSharp ? "scale(1)" : "scale(1.01)",
                      transition: wasPreviouslyLoaded
                        ? "none"
                        : "opacity 220ms ease-out, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
                      objectFit: "cover",
                    }}
                    aria-hidden="true"
                  />
                )}

                {/* Video stays visible when hovered, playing, or has been played (showing paused frame) */}
                {shouldRenderVideo && (
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
                      opacity:
                        isHovered || isVideoPlaying || hasVideoPlayed ? 1 : 0,
                      transition: wasPreviouslyLoaded
                        ? "none"
                        : "opacity 0.25s ease-out",
                      objectFit: "cover",
                    }}
                    aria-label={block.title || "Video content"}
                  />
                )}

                {/* Video badge - visible when not hovering */}
                {(isLoaded || hasVideoPlayed || isVideoLoaded) && (
                  <div
                    className={`pointer-events-none absolute bottom-2 left-2 z-20 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm transition-opacity duration-200 ${
                      isHovered ? "opacity-0" : "opacity-100"
                    }`}
                    aria-label="Video content"
                  >
                    {!isVideoLoaded && isHovered && (
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
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
                )}
              </>
            ) : imageSrc ? (
              <img
                ref={imgRef}
                src={imageSrc}
                alt=""
                className="absolute inset-0 h-full w-full"
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={priority ? "high" : "auto"}
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{
                  opacity: isLoaded ? 1 : 0.95,
                  transform: isSharp ? "scale(1)" : "scale(1.01)",
                  transition: wasPreviouslyLoaded
                    ? "none"
                    : "opacity 220ms ease-out, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
                  objectFit: "cover",
                }}
                aria-hidden="true"
              />
            ) : null}

            {/* Hover Overlay */}
            <div
              className="pointer-events-none absolute inset-0 z-10 bg-black/0 transition-colors duration-300 group-hover:bg-black/5"
              aria-hidden="true"
            />
          </>
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
