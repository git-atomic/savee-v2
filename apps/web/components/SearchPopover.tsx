"use client";

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Grid3x3, Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchBlocks, getBlockMediaUrl, type Block } from "@/lib/api";
import Image from "next/image";

const STORAGE_KEY = "search-recents";

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  try {
    const recents = getRecentSearches();
    const filtered = recents.filter((r) => r.toLowerCase() !== query.toLowerCase());
    const updated = [query, ...filtered].slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

function removeRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  try {
    const recents = getRecentSearches();
    const filtered = recents.filter((r) => r.toLowerCase() !== query.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore storage errors
  }
}

export interface SearchPopoverRef {
  close: () => void;
}

export const SearchPopover = forwardRef<SearchPopoverRef>((props, ref) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [autocompleteResults, setAutocompleteResults] = useState<Block[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useImperativeHandle(ref, () => ({
    close: () => setOpen(false),
  }));

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) return;
      saveRecentSearch(searchQuery.trim());
      setRecentSearches(getRecentSearches());
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    },
    [router]
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setAutocompleteResults([]);
      setIsSearching(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    // Focus input when popover opens
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Cancel previous search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (value.trim().length > 1) {
      setIsSearching(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Debounce search
      const timeoutId = setTimeout(() => {
        searchBlocks(value, null, 8, controller.signal)
          .then((response) => {
            if (!controller.signal.aborted) {
              setAutocompleteResults(response.blocks);
              setIsSearching(false);
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setAutocompleteResults([]);
              setIsSearching(false);
            }
          });
      }, 300);

      return () => {
        clearTimeout(timeoutId);
        controller.abort();
      };
    } else {
      setAutocompleteResults([]);
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      handleSearch(query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              className="pl-9 pr-20 h-9 rounded-full bg-muted/50 border-muted focus-visible:bg-background"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query && (
                <button
                  onClick={handleClear}
                  className="p-1 hover:bg-muted rounded-full transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              <button
                className="p-1 hover:bg-muted rounded-full transition-colors"
                aria-label="Layout options"
              >
                <Grid3x3 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                className="p-1 hover:bg-muted rounded-full transition-colors"
                aria-label="Color filter"
              >
                <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={8}
        className="w-[600px] max-w-[calc(100vw-2rem)] p-0"
        style={{ zIndex: 101 }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-[600px] overflow-y-auto">
          {/* Recent Searches - shown when no query */}
          {!query && recentSearches.length > 0 && (
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold mb-3">Recents</h3>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((recent) => (
                  <button
                    key={recent}
                    onClick={() => handleSearch(recent)}
                    className="group relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-sm"
                    title={`Search for ${recent}`}
                  >
                    <span>{recent}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentSearch(recent);
                        setRecentSearches(getRecentSearches());
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove ${recent} from recents`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Autocomplete Results - shown when typing */}
          {query.trim().length > 1 && (
            <div className="p-2">
              {isSearching ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Searching...
                </div>
              ) : autocompleteResults.length > 0 ? (
                <>
                  <div className="px-2 py-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Suggestions
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {autocompleteResults.map((block) => {
                      const mediaUrl = getBlockMediaUrl(block);
                      return (
                        <button
                          key={block.id}
                          onClick={() => {
                            // Extract searchable text from block
                            const searchText = block.title || block.og_title || block.og_description || query;
                            handleSearch(searchText);
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left group"
                        >
                          {mediaUrl && (
                            <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                              <Image
                                src={mediaUrl}
                                alt={block.title || "Block"}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {block.title || block.og_title || "Untitled"}
                            </div>
                            {block.og_description && (
                              <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {block.og_description}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-2 py-2 border-t mt-2">
                    <button
                      onClick={() => handleSearch(query)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium"
                    >
                      Search for &quot;{query}&quot;
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-4">
                  <button
                    onClick={() => handleSearch(query)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium"
                  >
                    Search for &quot;{query}&quot;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

SearchPopover.displayName = "SearchPopover";
