import type { Block } from "@/types/block";
import { getDeterministicAspectRatio } from "./masonry-utils";

/**
 * Enterprise-grade masonry distribution algorithm
 * Distributes blocks to columns based on height balancing (not round-robin)
 * This ensures columns are balanced and media fits exactly to dimensions
 */
export interface BlockWithHeight {
  block: Block;
  aspectRatio: number;
  estimatedHeight: number; // Height at column width
}

export interface ColumnDistribution {
  columns: Block[][];
  columnHeights: number[];
}

/**
 * Distributes blocks to columns using height-balanced algorithm
 * Each block is placed in the shortest column to maintain balance
 */
export function distributeBlocksToColumns(
  blocks: Block[],
  aspectRatios: Map<number, number>,
  columns: number,
  columnWidth: number
): ColumnDistribution {
  if (columns <= 0 || blocks.length === 0) {
    return {
      columns: Array.from({ length: columns }, () => []),
      columnHeights: Array.from({ length: columns }, () => 0),
    };
  }

  // Calculate estimated heights for each block
  const blocksWithHeights: BlockWithHeight[] = blocks.map((block) => {
    const aspectRatio =
      aspectRatios.get(block.id) ?? getDeterministicAspectRatio(block.id);
    // Height = width / aspectRatio
    const estimatedHeight = columnWidth / aspectRatio;
    return { block, aspectRatio, estimatedHeight };
  });

  // Initialize columns
  const columnBlocks: Block[][] = Array.from({ length: columns }, () => []);
  const columnHeights = Array.from({ length: columns }, () => 0);

  // Distribute blocks to shortest column
  for (const { block, estimatedHeight } of blocksWithHeights) {
    // Find shortest column
    let shortestColumnIndex = 0;
    let shortestHeight = columnHeights[0];

    for (let i = 1; i < columns; i++) {
      if (columnHeights[i] < shortestHeight) {
        shortestHeight = columnHeights[i];
        shortestColumnIndex = i;
      }
    }

    // Add block to shortest column
    columnBlocks[shortestColumnIndex].push(block);
    columnHeights[shortestColumnIndex] += estimatedHeight;
  }

  return { columns: columnBlocks, columnHeights };
}

/**
 * Optimized version that uses memoization for performance
 * Only recalculates when blocks or aspect ratios change
 */
export function createMasonryDistributor(
  columnWidth: number,
  gap: number
) {
  let cachedBlocks: Block[] = [];
  let cachedAspectRatios: Map<number, number> = new Map();
  let cachedColumns: number = 0;
  let cachedResult: ColumnDistribution | null = null;

  return (
    blocks: Block[],
    aspectRatios: Map<number, number>,
    columns: number
  ): ColumnDistribution => {
    // Check if we can use cache
    const blocksChanged =
      blocks.length !== cachedBlocks.length ||
      blocks.some((b, i) => b.id !== cachedBlocks[i]?.id);

    const ratiosChanged =
      aspectRatios.size !== cachedAspectRatios.size ||
      Array.from(aspectRatios.entries()).some(
        ([id, ratio]) => cachedAspectRatios.get(id) !== ratio
      );

    const columnsChanged = columns !== cachedColumns;

    if (!blocksChanged && !ratiosChanged && !columnsChanged && cachedResult) {
      return cachedResult;
    }

    // Recalculate
    const adjustedColumnWidth = columnWidth - gap;
    const result = distributeBlocksToColumns(
      blocks,
      aspectRatios,
      columns,
      adjustedColumnWidth
    );

    // Update cache
    cachedBlocks = [...blocks];
    cachedAspectRatios = new Map(aspectRatios);
    cachedColumns = columns;
    cachedResult = result;

    return result;
  };
}
