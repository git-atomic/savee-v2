"use client";

import { useEffect, useState } from "react";
import { useLayoutSettings } from "@/components/LayoutSettingsContext";

/**
 * Get masonry columns from layout settings context
 * Columns are controlled via the settings popover
 */
export function useMasonryColumns() {
  const { columns } = useLayoutSettings();
  const [viewportWidth, setViewportWidth] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      setViewportWidth(window.innerWidth);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  // Clamp columns by viewport to keep cards readable on mobile/tablet.
  if (viewportWidth > 0 && viewportWidth < 640) {
    return Math.min(columns, 2);
  }
  if (viewportWidth > 0 && viewportWidth < 1024) {
    return Math.min(columns, 3);
  }
  if (viewportWidth > 0 && viewportWidth < 1280) {
    return Math.min(columns, 4);
  }

  return columns;
}
