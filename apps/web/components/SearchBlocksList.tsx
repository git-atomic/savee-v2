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
import {
  dedupeBlocksByStableKey,
  mergeUniqueBlocks,
} from "@/lib/block-dedupe";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

function safeAbort(controller: AbortController | null): void {
  if (!controller || controller.signal.aborted) return;
  try {
    controller.abort();
  } catch {
    // Ignore abort errors during teardown.
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
  const isLoadingRef = useRef(false);
  const activeQueryRef = useRef("");
  const lastRequestedCursorRef = useRef<string | null | undefined>(undefined);

  const columns = useMasonryColumns();

  const loadBlocks = useCallback(
    async (
      searchQuery: string,
      nextCursor?: string | null,
      signal?: AbortSignal,
      attempt = 0
    ) => {
      const normalizedQuery = searchQuery.trim();

      if (!normalizedQuery) {
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
          setBlocks([]);
          setCursor(null);
          setHasMore(false);
        }
        return;
      }

      const cursorKey = `${normalizedQuery}::${nextCursor ?? "__root__"}`;
      if (isLoadingRef.current) {
        return;
      }
      if (
        lastRequestedCursorRef.current !== undefined &&
        lastRequestedCursorRef.current === cursorKey
      ) {
        return;
      }

      try {
        isLoadingRef.current = true;
        lastRequestedCursorRef.current = cursorKey;
        activeQueryRef.current = normalizedQuery;

        if (!nextCursor) {
          setIsLoading(true);
          setBlocks([]);
        } else {
          setIsLoadingMore(true);
        }
        setError(null);

        const response = await searchBlocks(
          normalizedQuery,
          nextCursor || null,
          36,
          signal
        );

        if (
          signal?.aborted ||
          activeQueryRef.current !== normalizedQuery
        ) {
          return;
        }

        if (nextCursor) {
          setBlocks((prev) => mergeUniqueBlocks(prev, response.blocks ?? []));
        } else {
          setBlocks(dedupeBlocksByStableKey(response.blocks ?? []));
        }

        setCursor(response.nextCursor || null);
        setHasMore(Boolean(response.nextCursor));
        setRetryCount(0);
      } catch (err) {
        if (
          signal?.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }

        lastRequestedCursorRef.current = undefined;

        const errorMessage =
          err instanceof Error ? err.message : "Failed to search blocks";

        if (attempt < MAX_RETRIES && !nextCursor) {
          const delay = RETRY_DELAY * Math.pow(2, attempt);
          setRetryCount(attempt + 1);

          retryTimeoutRef.current = setTimeout(() => {
            isLoadingRef.current = false;
            loadBlocks(normalizedQuery, nextCursor, signal, attempt + 1);
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
    []
  );

  useEffect(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    safeAbort(abortControllerRef.current);
    abortControllerRef.current = null;
    lastRequestedCursorRef.current = undefined;
    activeQueryRef.current = query.trim();

    if (!query.trim()) {
      setBlocks([]);
      setCursor(null);
      setHasMore(false);
      setError(null);
      setRetryCount(0);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadBlocks(query, null, controller.signal);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      safeAbort(controller);
    };
  }, [query, loadBlocks]);

  const handleLoadMore = useCallback(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    const cursorKey = `${normalizedQuery}::${cursor ?? "__root__"}`;
    if (
      !isLoadingRef.current &&
      !isLoadingMore &&
      !isLoading &&
      hasMore &&
      cursor &&
      cursorKey !== lastRequestedCursorRef.current
    ) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      loadBlocks(normalizedQuery, cursor, controller.signal);
    }
  }, [isLoadingMore, isLoading, hasMore, cursor, query, loadBlocks]);

  const handleRetry = useCallback(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    setError(null);
    setRetryCount(0);
    lastRequestedCursorRef.current = undefined;
    safeAbort(abortControllerRef.current);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadBlocks(normalizedQuery, null, controller.signal);
  }, [query, loadBlocks]);

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

