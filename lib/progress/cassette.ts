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

export function cassetteProgress(totalPages: number, ranges: Array<[number, number]>) {
  if (!totalPages) return 0;
  const visited = ranges.reduce((sum, [a, b]) => sum + Math.max(0, b - a + 1), 0);
  return Math.min(100, (visited / totalPages) * 100);
}
