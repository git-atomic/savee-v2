"use client";

import { useMemo } from "react";
import type { Block } from "@/types/block";
import { useBlockAspectRatios } from "@/hooks/use-block-aspect-ratios";
import { getDeterministicAspectRatio } from "@/lib/masonry-utils";

interface MasonrySkeletonProps {
  columns: number;
  count: number;
  blocks?: Block[]; // Blocks to match aspect ratios - MUST match the exact blocks that will render
}

// Consistent gap size - must match MasonryGrid
const GAP_SIZE = 32; // 32px gap for improved spacing

interface SkeletonItem {
  id: string;
  aspectRatio: number;
}

function SkeletonCard({ aspectRatio }: { aspectRatio: number }) {
  return (
    <div
      className="w-full break-inside-avoid"
      style={{
        aspectRatio: aspectRatio,
        // Prevent layout shifts by ensuring consistent sizing
        minHeight: 0,
        containIntrinsicSize: `auto ${(1 / aspectRatio) * 100}%`,
      }}
    >
      <div 
        className="w-full h-full rounded-[4px] overflow-hidden relative bg-muted/50"
        style={{
          willChange: "opacity", // Optimize for fade-in
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite linear",
          }}
        />
      </div>
    </div>
  );
}

export function MasonrySkeleton({
  columns,
  count,
  blocks,
}: MasonrySkeletonProps) {
  // Get aspect ratios from blocks if provided - this will update reactively
  const blockAspectRatios = useBlockAspectRatios(blocks || []);

  // Create skeleton items that EXACTLY match the block distribution
  // This ensures skeletons align perfectly with actual content
  const skeletonItems = useMemo<SkeletonItem[]>(() => {
    // If we have blocks, create skeletons that match them exactly
    if (blocks && blocks.length > 0) {
      // Create skeletons for the exact blocks we'll render
      return blocks.slice(0, Math.min(count, blocks.length)).map((block) => {
        const aspectRatio = blockAspectRatios[block.id];

        // Use actual aspect ratio if available, otherwise use deterministic ratio based on block ID
        const finalRatio =
          aspectRatio !== undefined && aspectRatio > 0
            ? aspectRatio
            : getDeterministicAspectRatio(block.id);

        return {
          id: String(block.id),
          aspectRatio: finalRatio,
        };
      });
    }

    // No blocks available - create varied skeletons with deterministic ratios
    // Use varied ratios to create a natural masonry look
    return Array.from({ length: count }, (_, i) => {
      // Use a seed that creates varied but consistent ratios
      const seed = `skeleton-${i}`;
      const deterministicRatio = getDeterministicAspectRatio(seed);

      return {
        id: seed,
        aspectRatio: deterministicRatio,
      };
    });
  }, [count, blocks, blockAspectRatios]);

  // Distribute skeletons across columns using the SAME algorithm as MasonryGrid
  // This ensures perfect alignment with actual content
  const columnSkeletons = useMemo(() => {
    const cols: SkeletonItem[][] = Array.from({ length: columns }, () => []);

    // Use the exact same distribution as MasonryGrid: index % columns
    skeletonItems.forEach((item, index) => {
      cols[index % columns].push(item);
    });

    return cols;
  }, [columns, skeletonItems]);

  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${GAP_SIZE}px`,
        // Prevent layout shifts during skeleton loading
        minHeight: "100vh",
        containIntrinsicSize: "auto 2000px",
      }}
    >
      {columnSkeletons.map((colItems, colIndex) => (
        <div
          key={colIndex}
          className="flex flex-col"
          style={{ gap: `${GAP_SIZE}px` }}
        >
          {colItems.map((item) => (
            <SkeletonCard key={item.id} aspectRatio={item.aspectRatio} />
          ))}
        </div>
      ))}
    </div>
  );
}
