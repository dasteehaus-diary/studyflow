export interface NormalizedRect {
  x: number; // 0..1
  y: number; // 0..1
  width: number; // 0..1
  height: number; // 0..1
}

export function normalizeClientRect(
  clientRect: { left: number; top: number; width: number; height: number },
  pageRect: { left: number; top: number; width: number; height: number }
): NormalizedRect {
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const x = Math.max(0, Math.min(1, (clientRect.left - pageRect.left) / pageRect.width));
  const y = Math.max(0, Math.min(1, (clientRect.top - pageRect.top) / pageRect.height));
  const width = Math.max(0, Math.min(1 - x, clientRect.width / pageRect.width));
  const height = Math.max(0, Math.min(1 - y, clientRect.height / pageRect.height));

  return {
    x: Number(x.toFixed(5)),
    y: Number(y.toFixed(5)),
    width: Number(width.toFixed(5)),
    height: Number(height.toFixed(5))
  };
}

export function denormalizeRect(
  norm: NormalizedRect,
  pageWidth: number,
  pageHeight: number
) {
  return {
    left: norm.x * pageWidth,
    top: norm.y * pageHeight,
    width: norm.width * pageWidth,
    height: norm.height * pageHeight
  };
}
