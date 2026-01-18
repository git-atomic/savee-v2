"use client";

import { useLayoutSettings } from "@/components/LayoutSettingsContext";

/**
 * Get masonry columns from layout settings context
 * Columns are controlled via the settings popover
 */
export function useMasonryColumns() {
  const { columns } = useLayoutSettings();
  return columns;
}
