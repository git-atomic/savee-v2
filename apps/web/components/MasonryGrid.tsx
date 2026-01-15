"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { BlockCard } from "./BlockCard";
import { MasonrySkeleton } from "./MasonrySkeleton";
import type { Block } from "@/types/block";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";
import { useBlockAspectRatios } from "@/hooks/use-block-aspect-ratios";
import { createMasonryDistributor } from "@/lib/masonry-distribution";
import { useIntersectionObserverPool } from "@/hooks/use-intersection-observer-pool";

interface MasonryGridProps {
  blocks: Block[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  columns?: number;
}

// Consistent gap size across all components
const GAP_SIZE = 32; // 32px gap for improved spacing

export function MasonryGrid({
  blocks,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  columns: propColumns,
}: MasonryGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Use prop columns or internal hook
  const internalColumns = useMasonryColumns();
  const columns = propColumns ?? internalColumns;

  // Get aspect ratios for all blocks (cached and optimized)
  const aspectRatiosMap = useBlockAspectRatios(blocks);

  // Convert aspect ratios map to Map for distribution
  const aspectRatios = useMemo(() => {
    const map = new Map<number, number>();
    Object.entries(aspectRatiosMap).forEach(([id, ratio]) => {
      map.set(Number(id), ratio);
    });
    return map;
  }, [aspectRatiosMap]);

  // Measure container width for accurate column width calculation
  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width);
      }
    };

    // Initial measurement
    updateWidth();

    // Use ResizeObserver for efficient width tracking
    const resizeObserver = new ResizeObserver(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        updateWidth();
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Create distributor with memoization
  const distributor = useMemo(() => {
    const columnWidth = containerWidth > 0 ? containerWidth / columns : 0;
    return createMasonryDistributor(columnWidth, GAP_SIZE);
  }, [containerWidth, columns]);

  // Distribute blocks to columns using height-balanced algorithm
  const columnDistribution = useMemo(() => {
    if (blocks.length === 0 || containerWidth === 0) {
      return {
        columns: Array.from({ length: columns }, () => []),
        columnHeights: Array.from({ length: columns }, () => 0),
      };
    }

    return distributor(blocks, aspectRatios, columns);
  }, [blocks, aspectRatios, columns, containerWidth, distributor]);

  // Optimized load more handler
  const handleLoadMore = useCallback(() => {
    if (!isLoadingRef.current && onLoadMore && hasMore && !isLoadingMore) {
      isLoadingRef.current = true;
      onLoadMore();
    }
  }, [onLoadMore, hasMore, isLoadingMore]);

  // Reset loading flag when loading completes
  useEffect(() => {
    if (!isLoadingMore) {
      isLoadingRef.current = false;
    }
  }, [isLoadingMore]);

  // Intersection observer for infinite scroll (using shared pool)
  const setLoadMoreElement = useIntersectionObserverPool(
    useCallback(
      (isIntersecting) => {
        if (isIntersecting) {
          handleLoadMore();
        }
      },
      [handleLoadMore]
    ),
    {
      rootMargin: "1200px", // Load 1.5 screens ahead for smooth scrolling
      threshold: 0,
    }
  );

  useEffect(() => {
    if (loadMoreRef.current && hasMore && !isLoadingMore) {
      setLoadMoreElement(loadMoreRef.current);
    } else {
      setLoadMoreElement(null);
    }
  }, [hasMore, isLoadingMore, setLoadMoreElement]);

  // Determine which blocks should have priority loading (first batch)
  const priorityCount = Math.min(columns * 2, blocks.length);

  return (
    <div 
      ref={containerRef} 
      className="w-full"
      style={{
        containIntrinsicSize: "auto 1000px", // Hint for better layout stability
      }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${GAP_SIZE}px`,
          willChange: "contents", // Optimize for layout changes
        }}
      >
        {columnDistribution.columns.map((colBlocks, colIndex) => (
          <div
            key={`col-${colIndex}`}
            className="flex flex-col"
            style={{ gap: `${GAP_SIZE}px` }}
          >
            {colBlocks.map((block, blockIndex) => {
              // Calculate global index for priority determination
              // Find block's position in original array
              const globalIndex = blocks.findIndex((b) => b.id === block.id);
              const isPriority = globalIndex < priorityCount;

              return (
                <BlockCard
                  key={`block-${block.id}-col-${colIndex}-idx-${blockIndex}`}
                  block={block}
                  priority={isPriority}
                  aspectRatio={aspectRatios.get(block.id)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Infinite Scroll Loader */}
      {hasMore && (
        <div
          ref={loadMoreRef}
          className="w-full"
          style={{ 
            marginTop: `${GAP_SIZE}px`,
            minHeight: "200px", // Reserve space to prevent layout shift
          }}
        >
          {isLoadingMore && (
            <MasonrySkeleton
              columns={columns}
              count={columns * 3}
              blocks={blocks.slice(-columns * 3)} // Use last blocks for aspect ratio matching
            />
          )}
        </div>
      )}
    </div>
  );
}
