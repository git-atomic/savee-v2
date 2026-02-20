"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { UserCard } from "./UserCard";
import { fetchUsers } from "@/lib/api";
import type { User } from "@/lib/api";
import { ErrorBoundary } from "./ErrorBoundary";
import { useIntersectionObserverPool } from "@/hooks/use-intersection-observer-pool";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

function mergeUniqueUsers(prev: User[], next: User[]): User[] {
  const deduped = new Map<string, User>();

  for (const user of prev) {
    deduped.set(`id:${user.id}`, user);
    deduped.set(`username:${user.username.toLowerCase()}`, user);
  }

  for (const user of next) {
    const byId = deduped.get(`id:${user.id}`);
    const byUsername = deduped.get(`username:${user.username.toLowerCase()}`);
    if (byId || byUsername) {
      continue;
    }
    deduped.set(`id:${user.id}`, user);
    deduped.set(`username:${user.username.toLowerCase()}`, user);
  }

  const uniqueUsers: User[] = [];
  const seenIds = new Set<number>();
  for (const user of deduped.values()) {
    if (seenIds.has(user.id)) continue;
    seenIds.add(user.id);
    uniqueUsers.push(user);
  }
  return uniqueUsers;
}

export function UsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);
  const lastRequestedCursorRef = useRef<string | null | undefined>(undefined);

  const loadUsers = useCallback(
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
          setUsers([]);
        } else {
          setIsLoadingMore(true);
        }
        setError(null);

        const response = await fetchUsers(nextCursor || null, 50, null, signal);

        if (signal?.aborted) return;

        if (nextCursor) {
          setUsers((prev) => mergeUniqueUsers(prev, response.users ?? []));
        } else {
          setUsers(mergeUniqueUsers([], response.users ?? []));
          setTotalCount(response.total ?? null);
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
          err instanceof Error ? err.message : "Failed to load users";

        if (attempt < MAX_RETRIES && !nextCursor) {
          const delay = RETRY_DELAY * Math.pow(2, attempt);
          setRetryCount(attempt + 1);

          retryTimeoutRef.current = setTimeout(() => {
            isLoadingRef.current = false;
            loadUsers(nextCursor, signal, attempt + 1);
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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    lastRequestedCursorRef.current = undefined;

    loadUsers(null, controller.signal);

    return () => {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      controller.abort();
    };
  }, [loadUsers]);

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
      abortControllerRef.current = controller;
      loadUsers(cursor, controller.signal);
    }
  }, [isLoadingMore, isLoading, hasMore, cursor, loadUsers]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount(0);
    lastRequestedCursorRef.current = undefined;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadUsers(null, controller.signal);
  }, [loadUsers]);

  const setSentinelElement = useIntersectionObserverPool(
    useCallback(
      (isIntersecting) => {
        if (isIntersecting) {
          handleLoadMore();
        }
      },
      [handleLoadMore]
    ),
    { rootMargin: "400px", threshold: 0 }
  );

  useEffect(() => {
    if (sentinelRef.current && hasMore && !isLoadingMore && !isLoading) {
      setSentinelElement(sentinelRef.current);
    } else {
      setSentinelElement(null);
    }
  }, [hasMore, isLoadingMore, isLoading, setSentinelElement]);

  if (error && users.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Error loading users</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          {retryCount > 0 && (
            <p className="text-muted-foreground text-xs mb-4">
              Retry attempt {retryCount}/{MAX_RETRIES}
            </p>
          )}
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            aria-label="Retry loading users"
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
        className="min-h-screen w-full max-w-full"
        style={{
          paddingTop: "var(--page-margin)",
          paddingBottom: "var(--page-margin)",
          paddingLeft: "var(--page-margin)",
          paddingRight: "var(--page-margin)",
        }}
      >
        {totalCount !== null && (
          <div className="flex justify-start" style={{ marginBottom: "var(--page-margin)" }}>
            <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {totalCount.toLocaleString()}
              </span>{" "}
              {totalCount === 1 ? "user" : "users"}
            </div>
          </div>
        )}

        {isLoading && users.length === 0 ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: "var(--page-margin)" }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4 animate-pulse"
              >
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-muted rounded" />
                    <div className="h-3 w-1/2 bg-muted rounded" />
                    <div className="h-3 w-full bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : users.length > 0 ? (
          <>
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              style={{ gap: "var(--page-margin)" }}
            >
              {users.map((user) => (
                <UserCard key={user.id} user={user} />
              ))}
            </div>

            {hasMore && (
              <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" />
            )}

            {isLoadingMore && (
              <div
                className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                style={{ gap: "var(--page-margin)" }}
              >
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card p-4 animate-pulse"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-muted rounded" />
                        <div className="h-3 w-1/2 bg-muted rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-muted-foreground">No users found</div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
