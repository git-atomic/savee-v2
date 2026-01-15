"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";

export function Navigation() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window !== "undefined") {
      return window.scrollY < 10;
    }
    return true;
  });
  const rafRef = useRef<number | null>(null);
  const lastScrollY = useRef(0);
  const scrollThreshold = 10; // Minimum scroll distance to trigger hide/show

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/pop", label: "Pop" },
    { href: "/users", label: "Users" },
  ];

  useEffect(() => {
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
          setIsVisible(true);
          lastScrollY.current = currentScrollY;
          return;
        }

        // Only update if scroll position changed significantly
        if (Math.abs(scrollDelta) > 5) {
          // Scrolling down: hide nav
          if (scrollDelta > 0) {
            setIsVisible(false);
          }
          // Scrolling up: show nav
          else if (scrollDelta < 0) {
            setIsVisible(true);
          }

          lastScrollY.current = currentScrollY;
        }
      });
    };

    // Check initial scroll position
    lastScrollY.current = window.scrollY;
    // Initial visibility is set via useState initializer, no need to set here

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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
        }}
      >
        <div
          className="relative flex items-center"
          style={{ height: "var(--nav-height)" }}
        >
          {/* Solid background - always opaque */}
          <div
            className="absolute inset-0 h-full w-full"
            style={{
              backgroundColor: "var(--background)",
            }}
          />

          {/* Navigation content */}
          <div
            className="relative flex items-center w-full"
            style={{
              paddingLeft: "var(--page-margin)",
              paddingRight: "var(--page-margin)",
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
          </div>
        </div>
      </nav>
    </>
  );
}
