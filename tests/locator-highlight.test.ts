import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeClientRect, denormalizeRect } from '../lib/reader/coordinates.ts';

describe('Highlight Coordinates Normalization', () => {
  it('normalizes client rect to 0..1 relative to page bounds', () => {
    const pageRect = { left: 100, top: 200, width: 800, height: 1000 };
    const clientRect = { left: 180, top: 300, width: 400, height: 50 };

    const norm = normalizeClientRect(clientRect, pageRect);
    assert.strictEqual(norm.x, 0.1); // (180-100)/800
    assert.strictEqual(norm.y, 0.1); // (300-200)/1000
    assert.strictEqual(norm.width, 0.5); // 400/800
    assert.strictEqual(norm.height, 0.05); // 50/1000
  });

  it('denormalizes back accurately for different zoom dimensions', () => {
    const norm = { x: 0.1, y: 0.1, width: 0.5, height: 0.05 };
    const scaledPage = { width: 1200, height: 1500 };

    const denorm = denormalizeRect(norm, scaledPage.width, scaledPage.height);
    assert.strictEqual(denorm.left, 120);
    assert.strictEqual(denorm.top, 150);
    assert.strictEqual(denorm.width, 600);
    assert.strictEqual(denorm.height, 75);
  });

  it('clamps coordinates cleanly within page limits', () => {
    const pageRect = { left: 100, top: 100, width: 500, height: 500 };
    const clientRect = { left: 50, top: 50, width: 600, height: 600 };

    const norm = normalizeClientRect(clientRect, pageRect);
    assert.ok(norm.x >= 0 && norm.x <= 1);
    assert.ok(norm.y >= 0 && norm.y <= 1);
    assert.ok(norm.x + norm.width <= 1);
    assert.ok(norm.y + norm.height <= 1);
  });
});
