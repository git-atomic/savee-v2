"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Block } from "@/types/block";
import { getBlockMediaUrl, getBlockVideoUrl } from "@/lib/api";

interface AspectRatioMap {
  [blockId: number]: number;
}

const aspectRatioCache = new Map<number, number>();
const loadingPromises = new Map<number, Promise<number>>();

export function useBlockAspectRatios(blocks: Block[]): AspectRatioMap {
  const [aspectRatios, setAspectRatios] = useState<AspectRatioMap>({});
  const loadingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const loadImageDimensions = (url: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          img.onload = null;
          img.onerror = null;
          reject(new Error("Timeout"));
        }, 5000); // Increased timeout for slower connections

        img.onload = () => {
          clearTimeout(timeout);
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            resolve(img.naturalWidth / img.naturalHeight);
          } else {
            reject(new Error("Invalid dimensions"));
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Load error"));
        };

        img.src = url;
      });
    };

    const loadVideoDimensions = (url: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;

        const timeout = setTimeout(() => {
          video.onloadedmetadata = null;
          video.onerror = null;
          video.src = "";
          reject(new Error("Timeout"));
        }, 5000); // Increased timeout for slower connections

        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            const ratio = video.videoWidth / video.videoHeight;
            video.src = "";
            resolve(ratio);
          } else {
            video.src = "";
            reject(new Error("Invalid dimensions"));
          }
        };

        video.onerror = () => {
          clearTimeout(timeout);
          video.src = "";
          reject(new Error("Load error"));
        };

        video.src = url;
      });
    };

    const loadBlockDimensions = async (block: Block) => {
      if (aspectRatioCache.has(block.id) || loadingRef.current.has(block.id)) {
        return;
      }

      // Check if already loading
      const existingPromise = loadingPromises.get(block.id);
      if (existingPromise) {
        try {
          const ratio = await existingPromise;
          aspectRatioCache.set(block.id, ratio);
          setAspectRatios((prev) => ({ ...prev, [block.id]: ratio }));
        } catch {
          // Ignore errors, will fallback
        }
        return;
      }

      loadingRef.current.add(block.id);

      const isVideo = block.media_type === "video" || Boolean(block.video_url);
      const mediaUrl = isVideo
        ? getBlockVideoUrl(block)
        : getBlockMediaUrl(block);

      if (!mediaUrl) {
        loadingRef.current.delete(block.id);
        return;
      }

      const loadPromise = isVideo
        ? loadVideoDimensions(mediaUrl)
        : loadImageDimensions(mediaUrl);

      loadingPromises.set(block.id, loadPromise);

      try {
        const ratio = await loadPromise;
        aspectRatioCache.set(block.id, ratio);
        setAspectRatios((prev) => ({ ...prev, [block.id]: ratio }));
      } catch {
        // Fallback to 1:1 on error
        aspectRatioCache.set(block.id, 1);
        setAspectRatios((prev) => ({ ...prev, [block.id]: 1 }));
      } finally {
        loadingRef.current.delete(block.id);
        loadingPromises.delete(block.id);
      }
    };

    // Load dimensions for blocks that don't have cached ratios
    const blocksToLoad = blocks.filter(
      (block) =>
        !aspectRatioCache.has(block.id) && !loadingRef.current.has(block.id)
    );

    // Load ALL blocks in parallel immediately (no batching delay)
    // This ensures skeletons get aspect ratios as fast as possible
    blocksToLoad.forEach((block) => {
      loadBlockDimensions(block);
    });
  }, [blocks]);

  // Return all cached ratios for the blocks
  // Memoize to prevent unnecessary re-renders
  const result = useMemo(() => {
    const ratios: AspectRatioMap = {};
    blocks.forEach((block) => {
      // Prioritize state over cache to ensure reactivity
      if (aspectRatios[block.id] !== undefined) {
        ratios[block.id] = aspectRatios[block.id];
      } else if (aspectRatioCache.has(block.id)) {
        ratios[block.id] = aspectRatioCache.get(block.id)!;
      }
    });
    return ratios;
  }, [blocks, aspectRatios]);

  return result;
}
