"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MasonryGrid } from "./MasonryGrid";
import { MasonrySkeleton } from "./MasonrySkeleton";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  fetchUserByUsername,
  fetchBlocksByUsername,
  getUserAvatarUrl,
} from "@/lib/api";
import type { Block } from "@/types/block";
import type { User } from "@/lib/api";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";
import { useFeedSort } from "./FeedSortContext";
import { sortBlocksByMode } from "@/lib/block-sort";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  dedupeBlocksByStableKey,
  mergeUniqueBlocks,
} from "@/lib/block-dedupe";
import { restoreScrollPosition, saveScrollPosition } from "@/lib/scroll-state";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

interface UserBlocksCacheEntry {
  blocks: Block[];
  cursor: string | null;
  hasMore: boolean;
}

const userProfileCache = new Map<string, User>();
const userBlocksCache = new Map<string, UserBlocksCacheEntry>();

function safeAbort(controller: AbortController | null): void {
  if (!controller || controller.signal.aborted) return;
  try {
    controller.abort();
  } catch {
    // Ignore abort errors during teardown.
  }
}

interface UserProfileProps {
  username: string;
}

export function UserProfile({ username }: UserProfileProps) {
  const cachedBlocks = userBlocksCache.get(username);
  const [user, setUser] = useState<User | null>(null);
  const [blocks, setBlocks] = useState<Block[]>(() => cachedBlocks?.blocks ?? []);
  const [cursor, setCursor] = useState<string | null>(() => cachedBlocks?.cursor ?? null);
  const [hasMore, setHasMore] = useState(() => cachedBlocks?.hasMore ?? true);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoading, setIsLoading] = useState(() => !cachedBlocks);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const userAbortControllerRef = useRef<AbortController | null>(null);
  const blocksAbortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef(false);
  const lastRequestedCursorRef = useRef<string | null | undefined>(undefined);

  const columns = useMasonryColumns();
  const { sortBy } = useFeedSort();
  const sortedBlocks = useMemo(
    () => sortBlocksByMode(blocks, sortBy),
    [blocks, sortBy]
  );

  useEffect(() => {
    const cachedUser = userProfileCache.get(username);
    if (cachedUser) {
      setUser(cachedUser);
      setIsLoadingUser(false);
      return;
    }

    const controller = new AbortController();
    userAbortControllerRef.current = controller;
    setIsLoadingUser(true);
    setError(null);

    const loadUser = async () => {
      try {
        const response = await fetchUserByUsername(username, controller.signal);
        if (controller.signal.aborted) return;

        if (response.success && response.user) {
          userProfileCache.set(username, response.user);
          setUser(response.user);
        } else {
          setUser(null);
          setError(response.error || "User not found");
        }
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load user";
        setUser(null);
        setError(errorMessage);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingUser(false);
        }
      }
    };

    loadUser();

    return () => {
      if (userAbortControllerRef.current === controller) {
        userAbortControllerRef.current = null;
      }
      safeAbort(controller);
    };
  }, [username]);

  const loadBlocks = useCallback(
    async (nextCursor?: string | null, signal?: AbortSignal, attempt = 0) => {
      const cursorKey = nextCursor ?? null;

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

        if (!nextCursor) {
          setIsLoading(true);
          setBlocks([]);
        } else {
          setIsLoadingMore(true);
        }
        setError(null);

        const response = await fetchBlocksByUsername(
          username,
          nextCursor || null,
          36,
          signal
        );

        if (signal?.aborted) return;

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
        userBlocksCache.set(username, {
          blocks: nextBlocks,
          cursor: nextCursorValue,
          hasMore: nextHasMore,
        });
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
          err instanceof Error ? err.message : "Failed to load blocks";

        if (attempt < MAX_RETRIES && !nextCursor) {
          const delay = RETRY_DELAY * Math.pow(2, attempt);
          setRetryCount(attempt + 1);

          retryTimeoutRef.current = setTimeout(() => {
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
    [username]
  );

  useEffect(() => {
    if (!user) return;
    const scrollKey = `user:${username}`;
    restoreScrollPosition(scrollKey);

    const cached = userBlocksCache.get(username);
    if (cached) {
      setBlocks(cached.blocks);
      setCursor(cached.cursor);
      setHasMore(cached.hasMore);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    blocksAbortControllerRef.current = controller;
    lastRequestedCursorRef.current = undefined;
    loadBlocks(null, controller.signal);

    return () => {
      saveScrollPosition(scrollKey);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (blocksAbortControllerRef.current === controller) {
        blocksAbortControllerRef.current = null;
      }
      safeAbort(controller);
    };
  }, [user, loadBlocks, username]);

  const handleLoadMore = useCallback(() => {
    if (
      !isLoadingRef.current &&
      !isLoadingMore &&
      !isLoading &&
      hasMore &&
      cursor &&
      cursor !== lastRequestedCursorRef.current
    ) {
      const controller = new AbortController();
      blocksAbortControllerRef.current = controller;
      loadBlocks(cursor, controller.signal);
    }
  }, [isLoadingMore, isLoading, hasMore, cursor, loadBlocks]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount(0);
    lastRequestedCursorRef.current = undefined;
    safeAbort(blocksAbortControllerRef.current);

    const controller = new AbortController();
    blocksAbortControllerRef.current = controller;
    loadBlocks(null, controller.signal);
  }, [loadBlocks]);

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading user...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Error loading user</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            aria-label="Retry loading user"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">User not found</div>
      </div>
    );
  }

  const avatarUrl = getUserAvatarUrl(user);
  const displayName = user.display_name || user.username;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <ErrorBoundary>
      <div className="min-h-screen">
        <div
          className="w-full"
          style={{
            paddingTop: "var(--page-margin)",
            paddingBottom: "calc(var(--page-margin) * 2)",
            paddingLeft: "var(--page-margin)",
            paddingRight: "var(--page-margin)",
          }}
        >
          <div className="flex flex-col items-center text-center space-y-4 max-w-2xl mx-auto">
            <Avatar className="h-24 w-24">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-muted text-muted-foreground text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-3 w-full">
              <div className="flex items-center justify-center gap-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  {displayName}
                </h1>
                {user.is_verified && (
                  <Badge variant="secondary" className="shrink-0">
                    Verified
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">@{user.username}</p>
              {user.bio && (
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {user.bio}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground pt-2">
                {user.location && (
                  <span className="flex items-center gap-1.5">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {user.location}
                  </span>
                )}
                {user.website_url && (
                  <a
                    href={user.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Website
                  </a>
                )}
                {user.block_count > 0 && (
                  <span className="font-medium text-foreground">
                    {user.block_count.toLocaleString()} block
                    {user.block_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            paddingBottom: "var(--page-margin)",
            paddingLeft: "var(--page-margin)",
            paddingRight: "var(--page-margin)",
          }}
        >
          {error && blocks.length === 0 && !isLoading ? (
            <div className="flex items-center justify-center min-h-[400px]">
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
          ) : isLoading ? (
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
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-muted-foreground">No blocks found</div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
