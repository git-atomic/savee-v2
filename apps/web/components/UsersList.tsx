"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { UserCard } from "./UserCard";
import { fetchUsers } from "@/lib/api";
import type { User } from "@/lib/api";
import { ErrorBoundary } from "./ErrorBoundary";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

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

  const loadUsers = useCallback(
    async (nextCursor?: string | null, signal?: AbortSignal, attempt = 0) => {
      try {
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
          setUsers((prev) => [...prev, ...response.users]);
        } else {
          setUsers(response.users);
          setTotalCount(response.total ?? null);
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
          err instanceof Error ? err.message : "Failed to load users";

        // Retry logic for transient errors
        if (attempt < MAX_RETRIES && !nextCursor) {
          const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
          setRetryCount(attempt + 1);

          retryTimeoutRef.current = setTimeout(() => {
            loadUsers(nextCursor, signal, attempt + 1);
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

    loadUsers(null, controller.signal);

    return () => {
      // Clear the controller reference; we intentionally do NOT call abort()
      // here because some environments surface `AbortError` from cleanup,
      // which bubbles into the Next.js overlay as a runtime error.
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [loadUsers]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && !isLoading && hasMore && cursor) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      loadUsers(cursor, controller.signal);
    }
  }, [isLoadingMore, isLoading, hasMore, cursor, loadUsers]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount(0);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadUsers(cursor || null, controller.signal);
  }, [cursor, loadUsers]);

  // Infinite scroll with intersection observer
  useEffect(() => {
    if (!hasMore || isLoadingMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: "400px" }
    );

    const sentinel = document.getElementById("users-sentinel");
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [hasMore, isLoadingMore, isLoading, handleLoadMore]);

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
        {/* Total count badge */}
        {totalCount !== null && (
          <div 
            className="flex justify-start"
            style={{ marginBottom: "var(--page-margin)" }}
          >
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

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div
                id="users-sentinel"
                className="h-4 w-full"
                aria-hidden="true"
              />
            )}

            {/* Loading more indicator */}
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
