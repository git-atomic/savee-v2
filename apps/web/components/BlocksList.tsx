"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MasonryGrid } from "./MasonryGrid";
import { MasonrySkeleton } from "./MasonrySkeleton";
import { ErrorBoundary } from "./ErrorBoundary";
import { fetchBlocks } from "@/lib/api";
import type { Block } from "@/types/block";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";
import { useFeedSort } from "./FeedSortContext";
import { sortBlocksByMode } from "@/lib/block-sort";
import {
  dedupeBlocksByStableKey,
  mergeUniqueBlocks,
} from "@/lib/block-dedupe";
import { restoreScrollPosition, saveScrollPosition } from "@/lib/scroll-state";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

interface FeedCacheEntry {
  blocks: Block[];
  cursor: string | null;
  hasMore: boolean;
}

const feedCache = new Map<string, FeedCacheEntry>();

interface BlocksListProps {
  origin?: string | null;
}

export function BlocksList(
  { origin }: BlocksListProps = {} as BlocksListProps
) {
  const cacheKey = origin || "home";
  const cached = feedCache.get(cacheKey);
  const [blocks, setBlocks] = useState<Block[]>(() => cached?.blocks ?? []);
  const [cursor, setCursor] = useState<string | null>(() => cached?.cursor ?? null);
  const [hasMore, setHasMore] = useState(() => cached?.hasMore ?? true);
  const [isLoading, setIsLoading] = useState(() => !cached);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef(false); // Guard against concurrent loads
  const lastRequestedCursorRef = useRef<string | null>(undefined as any); // Track cursors being loaded
  
  const hasCachedStateRef = useRef(Boolean(cached));

  const columns = useMasonryColumns();
  const { sortBy } = useFeedSort();
  const sortedBlocks = useMemo(
    () => sortBlocksByMode(blocks, sortBy),
    [blocks, sortBy]
  );

  const loadBlocks = useCallback(
    async (nextCursor?: string | null, signal?: AbortSignal, attempt = 0) => {
      // Prevent fetching the same cursor multiple times (race condition)
      if (nextCursor === lastRequestedCursorRef.current && lastRequestedCursorRef.current !== undefined) {
        return;
      }
      
      // Prevent concurrent loads
      if (isLoadingRef.current) {
        return;
      }
      
      try {
        isLoadingRef.current = true;
        lastRequestedCursorRef.current = nextCursor || null;
        
        if (!nextCursor) {
          setIsLoading(true);
          setBlocks([]);
        } else {
          setIsLoadingMore(true);
        }
        setError(null);

        const response = await fetchBlocks(nextCursor || null, 36, origin, signal);

        if (signal?.aborted) {
          return;
        }

        let nextBlocks: Block[] = [];
        setBlocks((prev) => {
          nextBlocks = nextCursor
            ? mergeUniqueBlocks(prev, response.blocks ?? [])
            : dedupeBlocksByStableKey(response.blocks ?? []);
          return nextBlocks;
        });

        const nextCursorValue = response.nextCursor || null;
        const nextHasMore = Boolean(response.nextCursor);
        setCursor(nextCursorValue);
        setHasMore(nextHasMore);
        feedCache.set(cacheKey, {
          blocks: nextBlocks,
          cursor: nextCursorValue,
          hasMore: nextHasMore,
        });
        setRetryCount(0); // Reset retry count on success
      } catch (err) {
        if (
          signal?.aborted ||
          (err instanceof Error && err.name === "AbortError")
        )
          return;

        // Reset the last requested cursor on error so we can retry
        lastRequestedCursorRef.current = undefined as any;

        const errorMessage =
          err instanceof Error ? err.message : "Failed to load blocks";

        // Retry logic for transient errors
        if (attempt < MAX_RETRIES && !nextCursor) {
          const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
          setRetryCount(attempt + 1);

          retryTimeoutRef.current = setTimeout(() => {
            // Reset loading ref so retry can proceed
            isLoadingRef.current = false;
            loadBlocks(nextCursor, signal, attempt + 1);
          }, delay);

          return;
        }

        setError(errorMessage);

        if (!nextCursor) {
          setHasMore(false);
        }
      } finally {
        isLoadingRef.current = false;
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [origin, cacheKey] // Removed isLoadingMore to make this function stable
  );

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    restoreScrollPosition(cacheKey);

    lastRequestedCursorRef.current = undefined as any;
    if (!hasCachedStateRef.current) {
      loadBlocks(null, controller.signal);
    } else {
      setIsLoading(false);
    }

    return () => {
      saveScrollPosition(cacheKey);
      controller.abort();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [loadBlocks, cacheKey]); // Now stable, will only run once or when origin changes

  const handleLoadMore = useCallback(() => {
    // Only proceed if not already loading and we have a valid cursor that isn't already being loaded
    if (!isLoadingRef.current && hasMore && cursor && cursor !== lastRequestedCursorRef.current) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      loadBlocks(cursor, controller.signal);
    }
  }, [hasMore, cursor, loadBlocks]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount(0);
    hasCachedStateRef.current = false;
    feedCache.delete(cacheKey);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadBlocks(null, controller.signal);
  }, [loadBlocks, cacheKey]);

  if (error && blocks.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Error loading blocks</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          {retryCount > 0 && (
            <p className="text-muted-foreground text-xs mb-4">
              Retry attempt {retryCount}/{MAX_RETRIES}
            </p>
          )}
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            aria-label="Retry loading blocks"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div
        className="min-h-screen"
        style={{
          paddingTop: "var(--page-margin)",
          paddingBottom: "var(--page-margin)",
          paddingLeft: "var(--page-margin)",
          paddingRight: "var(--page-margin)",
          // Prevent layout shifts during transitions
          containIntrinsicSize: "auto 2000px",
        }}
      >
        {isLoading ? (
          <MasonrySkeleton
            columns={columns}
            count={columns * 6}
            blocks={undefined}
          />
        ) : sortedBlocks.length > 0 ? (
          <MasonryGrid
            blocks={sortedBlocks}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            columns={columns}
          />
        ) : (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-muted-foreground">No blocks found</div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
