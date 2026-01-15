"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Enterprise-grade responsive column calculation
 * Uses ResizeObserver for better performance than window resize events
 */
export function useMasonryColumns(defaultColumns = 5) {
  const [columns, setColumns] = useState(defaultColumns);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      let newColumns: number;
      if (width < 640) newColumns = 1;
      else if (width < 1024) newColumns = 2;
      else if (width < 1280) newColumns = 3;
      else if (width < 1400) newColumns = 4;
      else newColumns = 5;

      setColumns((prev) => (prev !== newColumns ? newColumns : prev));
    };

    // Initial check
    updateColumns();

    // Use ResizeObserver for viewport changes (more efficient than window resize)
    const resizeObserver = new ResizeObserver(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(updateColumns);
    });

    // Observe document body for viewport changes
    resizeObserver.observe(document.body);

    // Fallback to window resize for older browsers
    const handleResize = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(updateColumns);
    };

    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return columns;
}
