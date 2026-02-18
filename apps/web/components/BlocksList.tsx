"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MasonryGrid } from "./MasonryGrid";
import { MasonrySkeleton } from "./MasonrySkeleton";
import { ErrorBoundary } from "./ErrorBoundary";
import { fetchBlocks } from "@/lib/api";
import type { Block } from "@/types/block";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";
import {
  dedupeBlocksByStableKey,
  mergeUniqueBlocks,
} from "@/lib/block-dedupe";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

interface BlocksListProps {
  origin?: string | null;
}

export function BlocksList(
  { origin }: BlocksListProps = {} as BlocksListProps
) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef(false); // Guard against concurrent loads
  const lastRequestedCursorRef = useRef<string | null>(undefined as any); // Track cursors being loaded
  
  // Track mounted state to prevent SSR/hydration issues
  const isMountedRef = useRef(false);

  const columns = useMasonryColumns();

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

        const response = await fetchBlocks(nextCursor || null, 50, origin, signal);

        if (signal?.aborted) {
          return;
        }

        if (nextCursor) {
          setBlocks((prev) => mergeUniqueBlocks(prev, response.blocks ?? []));
        } else {
          setBlocks(dedupeBlocksByStableKey(response.blocks ?? []));
        }

        setCursor(response.nextCursor || null);
        setHasMore(Boolean(response.nextCursor));
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
    [origin] // Removed isLoadingMore to make this function stable
  );

  useEffect(() => {
    // Mark as mounted
    isMountedRef.current = true;
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset cursor tracking when origin changes
    lastRequestedCursorRef.current = undefined as any;
    loadBlocks(null, controller.signal);

    return () => {
      isMountedRef.current = false;
      controller.abort();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [loadBlocks]); // Now stable, will only run once or when origin changes

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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadBlocks(cursor || null, controller.signal);
  }, [cursor, loadBlocks]);

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
        ) : blocks.length > 0 ? (
          <MasonryGrid
            blocks={blocks}
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
