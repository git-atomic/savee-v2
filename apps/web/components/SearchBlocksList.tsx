"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MasonryGrid } from "./MasonryGrid";
import { MasonrySkeleton } from "./MasonrySkeleton";
import { ErrorBoundary } from "./ErrorBoundary";
import { searchBlocks } from "@/lib/api";
import type { Block } from "@/types/block";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";
import { detectColor, hexToRgb, getTextColor } from "@/lib/color-utils";
import { Search } from "lucide-react";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Helper function to safely abort a controller without throwing errors
function safeAbort(controller: AbortController | null): void {
  if (!controller) return;
  try {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  } catch {
    // Silently ignore any errors during abort - they're expected during cleanup
  }
}

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
    async (
      searchQuery: string,
      nextCursor?: string | null,
      signal?: AbortSignal,
      attempt = 0
    ) => {
      if (!searchQuery.trim()) {
        if (!signal?.aborted) {
          setIsLoading(false);
          setBlocks([]);
          setHasMore(false);
        }
        return;
      }

      try {
        if (!signal?.aborted) {
          if (!nextCursor) {
            setIsLoading(true);
            setBlocks([]);
          } else {
            setIsLoadingMore(true);
          }
          setError(null);
        }

        const response = await searchBlocks(
          searchQuery,
          nextCursor || null,
          50,
          signal
        );

        // Check if aborted before updating state
        if (signal?.aborted) return;

        // Always deduplicate blocks by ID to prevent duplicates
        if (nextCursor) {
          // Deduplicate blocks by ID to prevent duplicates from pagination overlap
          setBlocks((prev) => {
            const existingIds = new Set(prev.map((b) => b.id));
            const newBlocks = response.blocks.filter((b) => !existingIds.has(b.id));
            return [...prev, ...newBlocks];
          });
        } else {
          // Deduplicate initial load as well in case API returns duplicates
          const uniqueBlocks = response.blocks.filter(
            (block, index, self) => index === self.findIndex((b) => b.id === block.id)
          );
          setBlocks(uniqueBlocks);
        }

        setCursor(response.nextCursor || null);
        setHasMore(Boolean(response.nextCursor));
        setRetryCount(0); // Reset retry count on success
      } catch (err) {
        // Silently ignore abort errors - they're expected during cleanup
        if (
          signal?.aborted ||
          (err instanceof Error &&
            (err.name === "AbortError" ||
              err.message === "signal is aborted without reason" ||
              err.message.includes("aborted")))
        ) {
          return;
        }

        // Don't update state if signal was aborted
        if (signal?.aborted) return;

        const errorMessage =
          err instanceof Error ? err.message : "Failed to search blocks";

        // Retry logic for transient errors
        if (attempt < MAX_RETRIES && !nextCursor && !signal?.aborted) {
          const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
          setRetryCount(attempt + 1);

          retryTimeoutRef.current = setTimeout(() => {
            // Don't retry if signal was aborted
            if (!signal?.aborted) {
              loadBlocks(searchQuery, nextCursor, signal, attempt + 1);
            }
          }, delay);

          return;
        }

        setError(errorMessage);

        if (!nextCursor) {
          setHasMore(false);
        }
      } finally {
        // Only update loading state if not aborted
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
      // Clear retry timeout first
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      // Abort the controller if it's still the current one
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      
      // Safely abort the controller
      safeAbort(controller);
    };
  }, [query, loadBlocks]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && !isLoading && hasMore && cursor && query) {
      // Abort any existing request before starting a new one
      if (abortControllerRef.current) {
        safeAbort(abortControllerRef.current);
        abortControllerRef.current = null;
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      loadBlocks(query, cursor, controller.signal);
    }
  }, [isLoadingMore, isLoading, hasMore, cursor, query, loadBlocks]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount(0);
    // Abort any existing request before retrying
    if (abortControllerRef.current) {
      safeAbort(abortControllerRef.current);
      abortControllerRef.current = null;
    }
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
          <>
            <div className="mb-6">
              <div className="h-8 w-64 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            </div>
            <MasonrySkeleton
              columns={columns}
              count={columns * 6}
              blocks={undefined}
            />
          </>
        ) : blocks.length > 0 ? (
          <>
            <div className="mb-8">
              {(() => {
                const colorHex = detectColor(query);
                if (colorHex) {
                  const rgb = hexToRgb(colorHex);
                  if (rgb) {
                    const textColor = getTextColor(rgb.r, rgb.g, rgb.b);
                    return (
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-full border-2 shrink-0 shadow-sm"
                          style={{
                            backgroundColor: colorHex,
                            borderColor:
                              textColor === "white"
                                ? "rgba(255, 255, 255, 0.2)"
                                : "rgba(0, 0, 0, 0.1)",
                          }}
                          title={colorHex}
                        />
                        <div>
                          <h1 className="text-3xl font-semibold tracking-tight">
                            {colorHex}
                          </h1>
                          <p className="text-muted-foreground text-sm mt-1">
                            {blocks.length}{" "}
                            {blocks.length === 1 ? "result" : "results"}
                          </p>
                        </div>
                      </div>
                    );
                  }
                }
                return (
                  <>
                    <h1 className="text-3xl font-semibold tracking-tight mb-2">
                      Search results for &quot;{query}&quot;
                    </h1>
                    <p className="text-muted-foreground text-sm">
                      {blocks.length}{" "}
                      {blocks.length === 1 ? "result" : "results"}
                    </p>
                  </>
                );
              })()}
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
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-md">
              {(() => {
                const colorHex = detectColor(query);
                if (colorHex) {
                  const rgb = hexToRgb(colorHex);
                  if (rgb) {
                    const textColor = getTextColor(rgb.r, rgb.g, rgb.b);
                    return (
                      <>
                        <div className="flex items-center justify-center gap-4 mb-6">
                          <div
                            className="w-20 h-20 rounded-full border-2 shadow-md"
                            style={{
                              backgroundColor: colorHex,
                              borderColor:
                                textColor === "white"
                                  ? "rgba(255, 255, 255, 0.2)"
                                  : "rgba(0, 0, 0, 0.1)",
                            }}
                            title={colorHex}
                          />
                          <h2 className="text-3xl font-semibold">{colorHex}</h2>
                        </div>
                        <p className="text-muted-foreground text-lg mb-2">
                          No results found for {colorHex}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Try a different color or search term
                        </p>
                      </>
                    );
                  }
                }
                return (
                  <>
                    <div className="mb-4">
                      <Search className="w-16 h-16 mx-auto text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground text-lg mb-2">
                      No results found for &quot;{query}&quot;
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Try a different search term or browse trending content
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
