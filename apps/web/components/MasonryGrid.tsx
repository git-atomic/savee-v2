"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { BlockCard } from "./BlockCard";
import { MasonrySkeleton } from "./MasonrySkeleton";
import type { Block } from "@/types/block";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";
import { useBlockAspectRatios } from "@/hooks/use-block-aspect-ratios";
import { createMasonryDistributor } from "@/lib/masonry-distribution";
import { useIntersectionObserverPool } from "@/hooks/use-intersection-observer-pool";
import { useLayoutSettings } from "./LayoutSettingsContext";

interface MasonryGridProps {
  blocks: Block[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  columns?: number;
}

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

  // Get gap from context
  const { gap } = useLayoutSettings();

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

  // Calculate column width accounting for gaps to keep total width constant
  // Formula: columnWidth = (containerWidth - gap * (columns - 1)) / columns
  // This ensures the total width stays constant when gap changes
  const columnWidth = useMemo(() => {
    if (containerWidth === 0 || columns === 0) return 0;
    const totalGapSpace = gap * (columns - 1);
    return (containerWidth - totalGapSpace) / columns;
  }, [containerWidth, columns, gap]);

  // Create distributor with memoization
  const distributor = useMemo(() => {
    return createMasonryDistributor(columnWidth, gap);
  }, [columnWidth, gap]);

  // Stable block IDs string - only changes when block IDs actually change
  // This prevents unnecessary recalculations when blocks array reference changes but IDs are the same
  const blockIdsKey = useMemo(() => blocks.map(b => b.id).join(','), [blocks]);
  
  // Cache the last distribution to prevent recalculation when only aspect ratios change
  const cachedDistributionRef = useRef<{ blockIdsKey: string; distribution: ReturnType<typeof distributor> } | null>(null);
  
  // Distribute blocks to columns using height-balanced algorithm
  // CRITICAL FIX: Only recalculate when block IDs change, not when aspect ratios update
  // This prevents rapid re-renders that cause visual duplicates in production
  const columnDistribution = useMemo(() => {
    if (blocks.length === 0 || containerWidth === 0) {
      return {
        columns: Array.from({ length: columns }, () => []),
        columnHeights: Array.from({ length: columns }, () => 0),
      };
    }

    // Check if we can use cached distribution (block IDs haven't changed)
    if (cachedDistributionRef.current?.blockIdsKey === blockIdsKey && cachedDistributionRef.current.blockIdsKey !== '') {
      // Block IDs haven't changed - return cached distribution
      // This prevents recalculation when only aspect ratios update
      return cachedDistributionRef.current.distribution;
    }

    // Block IDs changed - recalculate and cache
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0bd1e67a-ac8e-48fc-8c1d-3171e04f078b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MasonryGrid.tsx:107',message:'Before distribution',data:{blockCount:blocks.length,blockIds:blocks.map(b=>b.id),duplicateIds:blocks.map(b=>b.id).filter((id,i,arr)=>arr.indexOf(id)!==i)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const result = distributor(blocks, aspectRatios, columns);
    cachedDistributionRef.current = { blockIdsKey, distribution: result };
    // #region agent log
    const allDistributedIds:number[]=[];
    result.columns.forEach((col,idx)=>{col.forEach(b=>allDistributedIds.push(b.id));});
    fetch('http://127.0.0.1:7242/ingest/0bd1e67a-ac8e-48fc-8c1d-3171e04f078b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MasonryGrid.tsx:119',message:'After distribution',data:{totalDistributed:allDistributedIds.length,distributedIds:allDistributedIds,duplicateIds:allDistributedIds.filter((id,i,arr)=>arr.indexOf(id)!==i),columnCounts:result.columns.map((col,idx)=>({col:idx,count:col.length,ids:col.map(b=>b.id)}))},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return result;
  }, [blockIdsKey, blocks, aspectRatios, columns, containerWidth, distributor]);

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
          // Use fixed column widths instead of 1fr to prevent width expansion when gap changes
          gridTemplateColumns: `repeat(${columns}, ${columnWidth}px)`,
          gap: `${gap}px`,
          willChange: "contents", // Optimize for layout changes
        }}
      >
        {columnDistribution.columns.map((colBlocks, colIndex) => (
          <div
            key={`col-${colIndex}`}
            className="flex flex-col"
            style={{ gap: `${gap}px` }}
          >
            {colBlocks.map((block, blockIndex) => {
              // Calculate global index for priority determination
              // Find block's position in original array
              const globalIndex = blocks.findIndex((b) => b.id === block.id);
              const isPriority = globalIndex < priorityCount;

              // #region agent log
              if(blockIndex===0&&colIndex===0){fetch('http://127.0.0.1:7242/ingest/0bd1e67a-ac8e-48fc-8c1d-3171e04f078b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MasonryGrid.tsx:178',message:'Rendering blocks',data:{totalBlocks:blocks.length,renderedBlockIds:columnDistribution.columns.flat().map(b=>b.id),duplicateRenderedIds:columnDistribution.columns.flat().map(b=>b.id).filter((id,i,arr)=>arr.indexOf(id)!==i)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});}
              // #endregion

              return (
                <BlockCard
                  key={`block-${block.id}`}
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
            marginTop: `${gap}px`,
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
