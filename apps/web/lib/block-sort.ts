import type { Block } from "@/types/block";
import type { FeedSort } from "@/components/FeedSortContext";

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortBlocksByMode(blocks: Block[], sortBy: FeedSort): Block[] {
  if (blocks.length <= 1) {
    return blocks;
  }

  const sorted = [...blocks];
  sorted.sort((a, b) => {
    const aTime = toTimestamp(a.saved_at);
    const bTime = toTimestamp(b.saved_at);
    if (aTime !== bTime) {
      return sortBy === "oldest" ? aTime - bTime : bTime - aTime;
    }
    return sortBy === "oldest" ? a.id - b.id : b.id - a.id;
  });
  return sorted;
}

