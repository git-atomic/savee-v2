import type { Block } from "@/types/block";
import type { FeedSort } from "@/components/FeedSortContext";

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSortTimestamp(block: Block): number {
  // Prefer backend-computed ingestion timestamp for deterministic sorting.
  return (
    toTimestamp(block.sort_ts) ||
    toTimestamp(block.updated_at) ||
    toTimestamp(block.created_at) ||
    toTimestamp(block.saved_at)
  );
}

export function sortBlocksByMode(blocks: Block[], sortBy: FeedSort): Block[] {
  if (blocks.length <= 1) {
    return blocks;
  }
  if (sortBy === "recent") {
    // Backend returns recent-first. Keep stable order to avoid extra client CPU and jitter.
    return blocks;
  }

  const sorted = [...blocks];
  sorted.sort((a, b) => {
    const aTime = getSortTimestamp(a);
    const bTime = getSortTimestamp(b);
    if (aTime !== bTime) {
      return sortBy === "oldest" ? aTime - bTime : bTime - aTime;
    }
    return sortBy === "oldest" ? a.id - b.id : b.id - a.id;
  });
  return sorted;
}
