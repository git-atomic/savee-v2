"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MasonryGrid } from "./MasonryGrid";
import { MasonrySkeleton } from "./MasonrySkeleton";
import { ErrorBoundary } from "./ErrorBoundary";
import { searchBlocks } from "@/lib/api";
import type { Block } from "@/types/block";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export function SearchBlocksList() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const columns = useMasonryColumns();

  const loadBlocks = useCallback(
    async (searchQuery: string, nextCursor?: string | null, signal?: AbortSignal, attempt = 0) => {
      if (!searchQuery.trim()) {
        setIsLoading(false);
        setBlocks([]);
        setHasMore(false);
        return;
      }

      try {
        if (!nextCursor) {
          setIsLoading(true);
          setBlocks([]);
        } else {
          setIsLoadingMore(true);
        }
        setError(null);

        const response = await searchBlocks(searchQuery, nextCursor || null, 50, signal);

        if (signal?.aborted) return;

        if (nextCursor) {
          setBlocks((prev) => [...prev, ...response.blocks]);
        } else {
          setBlocks(response.blocks);
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

        const errorMessage =
          err instanceof Error ? err.message : "Failed to search blocks";

        // Retry logic for transient errors
        if (attempt < MAX_RETRIES && !nextCursor) {
          const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
          setRetryCount(attempt + 1);

          retryTimeoutRef.current = setTimeout(() => {
            loadBlocks(searchQuery, nextCursor, signal, attempt + 1);
          }, delay);

          return;
        }

        setError(errorMessage);

        if (!nextCursor) {
          setHasMore(false);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadBlocks(query, null, controller.signal);

    return () => {
      controller.abort();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [query, loadBlocks]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && !isLoading && hasMore && cursor && query) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      loadBlocks(query, cursor, controller.signal);
    }
  }, [isLoadingMore, isLoading, hasMore, cursor, query, loadBlocks]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount(0);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadBlocks(query, cursor || null, controller.signal);
  }, [cursor, query, loadBlocks]);

  if (!query.trim()) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Enter a search query</p>
          <p className="text-muted-foreground text-sm">
            Use the search bar in the navigation to find blocks
          </p>
        </div>
      </div>
    );
  }

  if (error && blocks.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Error searching blocks</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          {retryCount > 0 && (
            <p className="text-muted-foreground text-xs mb-4">
              Retry attempt {retryCount}/{MAX_RETRIES}
            </p>
          )}
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            aria-label="Retry search"
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
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold mb-2">
                Search results for &quot;{query}&quot;
              </h1>
              <p className="text-muted-foreground text-sm">
                {blocks.length} {blocks.length === 1 ? "result" : "results"}
              </p>
            </div>
            <MasonryGrid
              blocks={blocks}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              columns={columns}
            />
          </>
        ) : (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">
                No results found for &quot;{query}&quot;
              </p>
              <p className="text-muted-foreground text-sm">
                Try a different search term
              </p>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
