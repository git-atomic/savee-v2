"use client";

import { useMemo } from "react";
import type { Block } from "@/types/block";
import { getDeterministicAspectRatio } from "@/lib/masonry-utils";

interface AspectRatioMap {
  [blockId: number]: number;
}

const aspectRatioCache = new Map<number, number>();

function fromMetadata(block: Block): number | null {
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

export function useBlockAspectRatios(blocks: Block[]): AspectRatioMap {
  return useMemo(() => {
    const ratios: AspectRatioMap = {};

    for (const block of blocks) {
      const cached = aspectRatioCache.get(block.id);
      if (cached !== undefined) {
        ratios[block.id] = cached;
        continue;
      }

      const fromMeta = fromMetadata(block);
      const ratio =
        fromMeta && Number.isFinite(fromMeta) && fromMeta > 0
          ? fromMeta
          : getDeterministicAspectRatio(block.id);

      aspectRatioCache.set(block.id, ratio);
      ratios[block.id] = ratio;
    }

    return ratios;
  }, [blocks]);
}
