"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useLayoutSettings } from "./LayoutSettingsContext";
import { useFeedSort } from "./FeedSortContext";
import { Settings } from "lucide-react";
import { SearchPopover, type SearchPopoverRef } from "./SearchPopover";
import { ThemeToggle } from "./ThemeToggle";

export function Navigation() {
  const pathname = usePathname();
  const { columns, gap, setColumns, setGap } = useLayoutSettings();
  const { sortBy, setSortBy } = useFeedSort();
  
  // Always start with true to match server render, then update after hydration
  const [isVisible, setIsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastScrollY = useRef(0);
  const scrollThreshold = 10; // Minimum scroll distance to trigger hide/show
  const searchPopoverRef = useRef<SearchPopoverRef>(null);
  const isVisibleRef = useRef(true);
  
  // Hide navigation when viewing block details
  const isBlockDetail = pathname?.startsWith("/b/");

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/pop", label: "Pop" },
    { href: "/users", label: "Users" },
  ];

  const setVisibleIfChanged = useCallback((nextVisible: boolean) => {
    if (isVisibleRef.current !== nextVisible) {
      isVisibleRef.current = nextVisible;
      setIsVisible(nextVisible);
    }
  }, []);

  useEffect(() => {
    // Don't set up scroll handlers if we're on a block detail page
    if (isBlockDetail) {
      return;
    }
    // Set initial scroll position after hydration
    lastScrollY.current = window.scrollY;

    // Throttle scroll handler using requestAnimationFrame for smooth performance
    const handleScroll = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - lastScrollY.current;

        // Always show nav at the top
        if (currentScrollY < scrollThreshold) {
          setVisibleIfChanged(true);
          lastScrollY.current = currentScrollY;
          return;
        }

        // Only update if scroll position changed significantly
        if (Math.abs(scrollDelta) > 5) {
          // Scrolling down: hide nav and close popovers
          if (scrollDelta > 0) {
            setVisibleIfChanged(false);
            setSettingsOpen(false);
            searchPopoverRef.current?.close();
          }
          // Scrolling up: show nav
          else if (scrollDelta < 0) {
            setVisibleIfChanged(true);
          }

          lastScrollY.current = currentScrollY;
        }
      });
    };

    // Trigger once after mount to sync visibility.
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isBlockDetail, setVisibleIfChanged]);

  // Don't render navigation on block detail pages
  if (isBlockDetail) {
    return null;
  }

  return (
    <>
      {/* Spacer to push content below fixed nav */}
      <div style={{ height: "var(--nav-height)" }} />

      {/* Fixed navigation */}
      <nav
        className="fixed left-0 right-0 top-0 transition-transform duration-300 ease-in-out"
        style={{
          zIndex: "var(--z-index-nav)",
          transform: isVisible ? "translateY(0)" : "translateY(-100%)",
          willChange: "transform",
          overflow: "visible", // Ensure popover isn't clipped
        }}
      >
        <div className="relative" style={{ minHeight: "var(--nav-height)" }}>
          {/* Solid background - always opaque */}
          <div
            className="absolute inset-0 w-full"
            style={{
              backgroundColor: "var(--background)",
            }}
          />

          {/* Desktop Navigation */}
          <div
            className="relative hidden md:flex items-center justify-between w-full"
            style={{
              height: "var(--nav-height)",
              paddingLeft: "var(--page-margin)",
              paddingRight: "var(--page-margin)",
              overflow: "visible",
            }}
          >
            <ul className="flex shrink-0 items-center gap-x-6 md:gap-x-4">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li
                    key={item.href}
                    className="relative grow flex items-center"
                  >
                    <div className="transition-opacity duration-300 ease-out">
                      <Link
                        href={item.href}
                        className={cn(
                          "relative box-border block font-normal leading-none transition-colors duration-300 ease-out",
                          "text-muted-foreground hover:text-foreground",
                          isActive && "text-foreground"
                        )}
                        title={item.label}
                      >
                        <div className="whitespace-nowrap max-w-[12vw] md:max-w-[8.8vw] cursor-pointer truncate">
                          {item.label}
                        </div>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Search in the middle */}
            <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-2xl px-4">
              <SearchPopover ref={searchPopoverRef} />
            </div>

            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              {/* Settings button */}
              <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Layout settings"
                  >
                    <Settings className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={8}
                  className="w-80"
                  style={{ zIndex: 101 }}
                >
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Sort</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSortBy("recent")}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm transition-colors",
                            sortBy === "recent"
                              ? "border-foreground/30 bg-accent text-foreground"
                              : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          Recent
                        </button>
                        <button
                          type="button"
                          onClick={() => setSortBy("oldest")}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm transition-colors",
                            sortBy === "oldest"
                              ? "border-foreground/30 bg-accent text-foreground"
                              : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          Oldest
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">Columns</label>
                        <span className="text-sm text-muted-foreground">
                          {columns}
                        </span>
                      </div>
                      <Slider
                        value={[columns]}
                        onValueChange={(value) => setColumns(value[0])}
                        min={1}
                        max={10}
                        step={1}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">Padding</label>
                        <span className="text-sm text-muted-foreground">
                          {gap}px
                        </span>
                      </div>
                      <Slider
                        value={[gap]}
                        onValueChange={(value) => setGap(value[0])}
                        min={0}
                        max={64}
                        step={4}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div
            className="relative flex md:hidden flex-col gap-2 py-2"
            style={{
              paddingLeft: "var(--page-margin)",
              paddingRight: "var(--page-margin)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <ul className="flex shrink-0 items-center gap-x-4">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={`mobile-${item.href}`} className="relative flex items-center">
                      <Link
                        href={item.href}
                        className={cn(
                          "text-sm font-medium leading-none transition-colors duration-200",
                          "text-muted-foreground hover:text-foreground",
                          isActive && "text-foreground"
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label="Layout settings"
                    >
                      <Settings className="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    sideOffset={8}
                    className="w-[min(92vw,22rem)]"
                    style={{ zIndex: 101 }}
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Sort</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSortBy("recent")}
                            className={cn(
                              "rounded-md border px-3 py-2 text-sm transition-colors",
                              sortBy === "recent"
                                ? "border-foreground/30 bg-accent text-foreground"
                                : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            Recent
                          </button>
                          <button
                            type="button"
                            onClick={() => setSortBy("oldest")}
                            className={cn(
                              "rounded-md border px-3 py-2 text-sm transition-colors",
                              sortBy === "oldest"
                                ? "border-foreground/30 bg-accent text-foreground"
                                : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            Oldest
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium">Columns</label>
                          <span className="text-sm text-muted-foreground">
                            {columns}
                          </span>
                        </div>
                        <Slider
                          value={[columns]}
                          onValueChange={(value) => setColumns(value[0])}
                          min={1}
                          max={10}
                          step={1}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium">Padding</label>
                          <span className="text-sm text-muted-foreground">
                            {gap}px
                          </span>
                        </div>
                        <Slider
                          value={[gap]}
                          onValueChange={(value) => setGap(value[0])}
                          min={0}
                          max={64}
                          step={4}
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="w-full pb-1">
              <SearchPopover ref={searchPopoverRef} />
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
