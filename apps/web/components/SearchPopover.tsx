"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useRouter } from "next/navigation";
import { Search, X, Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { searchBlocks, getBlockMediaUrl } from "@/lib/api";
import type { Block } from "@/types/block";
import Image from "next/image";
import { ColorPickerPopover } from "./ColorPickerPopover";
import { detectColor, hexToRgb, getTextColor } from "@/lib/color-utils";

const STORAGE_KEY = "search-recents";

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
    const filtered = recents.filter(
      (r) => r.toLowerCase() !== query.toLowerCase()
    );
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
    const filtered = recents.filter(
      (r) => r.toLowerCase() !== query.toLowerCase()
    );
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
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    getRecentSearches()
  );
  const [autocompleteResults, setAutocompleteResults] = useState<Block[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorElementRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTransientState = useCallback(() => {
    setAutocompleteResults([]);
    setIsSearching(false);
    setColorPickerOpen(false);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      safeAbort(abortControllerRef.current);
      abortControllerRef.current = null;
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetTransientState();
      }
      setOpen(nextOpen);
    },
    [resetTransientState]
  );

  useImperativeHandle(ref, () => ({
    close: () => handleOpenChange(false),
  }), [handleOpenChange]);

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) return;
      saveRecentSearch(searchQuery.trim());
      setRecentSearches(getRecentSearches());
      handleOpenChange(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    },
    [router, handleOpenChange]
  );

  const setSearchAnchorRef = useCallback((el: HTMLDivElement | null) => {
    anchorElementRef.current = el;
    setAnchorElement(el);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Focus input when popover opens
    focusTimerRef.current = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [open]);

  // Debounced search effect
  useEffect(() => {
    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    safeAbort(abortControllerRef.current);
    abortControllerRef.current = null;

    if (query.trim().length > 1) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Debounce search
      debounceTimeoutRef.current = setTimeout(() => {
        searchBlocks(query, null, 8, controller.signal)
          .then((response) => {
            if (
              !controller.signal.aborted &&
              abortControllerRef.current === controller
            ) {
              setAutocompleteResults(response.blocks);
              setIsSearching(false);
            }
          })
          .catch((err) => {
            // Ignore abort errors
            if (err instanceof Error && err.name === "AbortError") {
              return;
            }
            if (
              !controller.signal.aborted &&
              abortControllerRef.current === controller
            ) {
              setAutocompleteResults([]);
              setIsSearching(false);
            }
          });
      }, 300);
    }

    // Cleanup function
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        safeAbort(abortControllerRef.current);
        abortControllerRef.current = null;
      }
    };
  }, [query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.trim().length > 1) {
      setIsSearching(true);
    } else {
      setAutocompleteResults([]);
      setIsSearching(false);
    }
    setQuery(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      handleSearch(query);
    } else if (e.key === "Escape") {
      handleOpenChange(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setAutocompleteResults([]);
    setIsSearching(false);
    inputRef.current?.focus();
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div ref={setSearchAnchorRef} className="relative w-full">
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setColorPickerOpen(!colorPickerOpen);
                  }}
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
          className="w-[600px] max-w-[calc(100vw-2rem)] p-0 rounded-2xl border-border/70 shadow-2xl"
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
                    <div
                      key={recent}
                      onClick={() => handleSearch(recent)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSearch(recent);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="group relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/80 hover:bg-muted transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 text-sm"
                      title={`Search for ${recent}`}
                    >
                      <span>{recent}</span>
                      <button
                        type="button"
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
                    </div>
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
                        const mediaUrl = getBlockMediaUrl(block, { preferProxy: false });
                        const isVideo =
                          block.media_type === "video" ||
                          Boolean(block.video_url);
                        return (
                          <button
                            key={block.id}
                            onClick={() => {
                              // Extract searchable text from block
                              const searchText =
                                block.title ||
                                block.og_title ||
                                block.og_description ||
                                query;
                              handleSearch(searchText);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] text-left group hover:-translate-y-0.5"
                          >
                            {mediaUrl ? (
                              <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                                <Image
                                  src={mediaUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="48px"
                                  unoptimized={
                                    isVideo && block.thumbnail_url
                                      ? true
                                      : undefined
                                  }
                                />
                                {isVideo && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                                      <svg
                                        className="w-2.5 h-2.5 text-black ml-0.5"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                      >
                                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                      </svg>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="h-12 w-12 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                                {isVideo ? (
                                  <svg
                                    className="w-5 h-5 text-muted-foreground"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                  </svg>
                                ) : (
                                  <Search className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate flex items-center gap-2">
                                {block.title || block.og_title || "Untitled"}
                                {isVideo && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    Video
                                  </span>
                                )}
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
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2"
                      >
                        {(() => {
                          const colorHex = detectColor(query);
                          if (colorHex) {
                            const rgb = hexToRgb(colorHex);
                            if (rgb) {
                              const textColor = getTextColor(
                                rgb.r,
                                rgb.g,
                                rgb.b
                              );
                              return (
                                <>
                                  <div
                                    className="w-6 h-6 rounded-full border shrink-0"
                                    style={{
                                      backgroundColor: colorHex,
                                      borderColor:
                                        textColor === "white"
                                          ? "rgba(255, 255, 255, 0.2)"
                                          : "rgba(0, 0, 0, 0.1)",
                                    }}
                                    title={colorHex}
                                  />
                                  <span>Search for {colorHex}</span>
                                </>
                              );
                            }
                          }
                          return <span>Search for &quot;{query}&quot;</span>;
                        })()}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-4">
                    <button
                      onClick={() => handleSearch(query)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      {(() => {
                        const colorHex = detectColor(query);
                        if (colorHex) {
                          const rgb = hexToRgb(colorHex);
                          if (rgb) {
                            const textColor = getTextColor(rgb.r, rgb.g, rgb.b);
                            return (
                              <>
                                <div
                                  className="w-6 h-6 rounded-full border shrink-0"
                                  style={{
                                    backgroundColor: colorHex,
                                    borderColor:
                                      textColor === "white"
                                        ? "rgba(255, 255, 255, 0.2)"
                                        : "rgba(0, 0, 0, 0.1)",
                                  }}
                                  title={colorHex}
                                />
                                <span>Search for {colorHex}</span>
                              </>
                            );
                          }
                        }
                        return <span>Search for &quot;{query}&quot;</span>;
                      })()}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {colorPickerOpen && (
        <ColorPickerPopover
          open={colorPickerOpen}
          onOpenChange={setColorPickerOpen}
          anchorElement={anchorElement}
        />
      )}
    </>
  );
});

SearchPopover.displayName = "SearchPopover";
