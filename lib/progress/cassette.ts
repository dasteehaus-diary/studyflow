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
 * Used internally for reading session dwell qualification & activity triggers.
 */
export function countQualifiedPages(ranges: Array<[number, number]>): number {
  if (!ranges || !Array.isArray(ranges)) return 0;
  return ranges.reduce((sum, [a, b]) => sum + Math.max(0, b - a + 1), 0);
}

/**
 * Meaningful Coverage Percentage — internal metric for dwell analytics and migration.
 * NOTE: This is NOT used for the visual cassette progress (the cassette strictly
 * represents reading position, not learning/comprehension percentage).
 */
export function meaningfulCoveragePercent(totalPages: number, ranges: Array<[number, number]>): number {
  if (!totalPages || totalPages <= 0) return 0;
  const qualified = countQualifiedPages(ranges);
  return Math.min(100, Math.max(0, Math.round((qualified / totalPages) * 100)));
}

/**
 * Calculates reading position percentage from locator (1-indexed page, normalized y 0..1).
 * Cassette strictly represents current reading position in the document, NOT "learning progress".
 *
 * Formula:
 *   positionFraction = ((currentPage - 1) + clamp(y, 0, 1)) / totalPages
 *   positionPercent = clamp(positionFraction * 100, 0, 100)
 */
export function readingPositionPercent(
  totalPages: number,
  currentPage: number,
  y: number = 0
): number {
  if (!totalPages || totalPages <= 0) return 0;
  const page = Math.max(1, currentPage || 1);
  const clampedY = Math.max(0, Math.min(1, Number.isFinite(y) ? y : 0));
  const fraction = ((page - 1) + clampedY) / totalPages;
  const percent = Math.max(0, Math.min(100, fraction * 100));
  return Math.round(percent * 10) / 10;
}

/** Backward-compatible alias for existing imports and test assertions */
export const cassetteProgress = meaningfulCoveragePercent;
