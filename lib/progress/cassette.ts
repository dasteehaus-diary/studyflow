export function mergePagesIntoRanges(pages: number[]): Array<[number, number]> {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  for (const page of sorted) {
    const last = ranges.at(-1);
    if (!last || page > last[1] + 1) ranges.push([page, page]);
    else last[1] = page;
  }
  return ranges;
}

/**
 * Calculates the total number of qualified/meaningfully visited pages
 * from non-overlapping ranges [start, end].
 */
export function countQualifiedPages(ranges: Array<[number, number]>): number {
  if (!ranges || !Array.isArray(ranges)) return 0;
  return ranges.reduce((sum, [a, b]) => sum + Math.max(0, b - a + 1), 0);
}

/**
 * Meaningful Coverage Percentage — the single source of truth for StudyFlow.
 * Represents the percentage of the document where the reader has actually
 * dwelled (>=8s) or interacted (notes, highlights, questions).
 */
export function meaningfulCoveragePercent(totalPages: number, ranges: Array<[number, number]>): number {
  if (!totalPages || totalPages <= 0) return 0;
  const qualified = countQualifiedPages(ranges);
  return Math.min(100, Math.max(0, Math.round((qualified / totalPages) * 100)));
}

/** Backward-compatible alias for existing imports and test assertions */
export const cassetteProgress = meaningfulCoveragePercent;
