"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";

export type FeedSort = "recent" | "oldest";

interface FeedSortContextValue {
  sortBy: FeedSort;
  setSortBy: (sortBy: FeedSort) => void;
}

const FEED_SORT_STORAGE_KEY = "feed-sort";
const defaultSort: FeedSort = "recent";

const FeedSortContext = createContext<FeedSortContextValue | undefined>(
  undefined
);

export function FeedSortProvider({ children }: { children: React.ReactNode }) {
  const [sortBy, setSortByState] = useState<FeedSort>(() => {
    if (typeof window === "undefined") {
      return defaultSort;
    }
    const stored = window.localStorage.getItem(FEED_SORT_STORAGE_KEY);
    return stored === "oldest" ? "oldest" : defaultSort;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FEED_SORT_STORAGE_KEY, sortBy);
    }
  }, [sortBy]);

  const setSortBy = useCallback((next: FeedSort) => {
    setSortByState((prev) => (prev === next ? prev : next));
  }, []);

  const value = useMemo(
    () => ({
      sortBy,
      setSortBy,
    }),
    [sortBy, setSortBy]
  );

  return (
    <FeedSortContext.Provider value={value}>
      {children}
    </FeedSortContext.Provider>
  );
}

export function useFeedSort() {
  const context = useContext(FeedSortContext);
  if (!context) {
    throw new Error("useFeedSort must be used within FeedSortProvider");
  }
  return context;
}

