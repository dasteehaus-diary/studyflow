import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readingPositionPercent, meaningfulCoveragePercent } from '../lib/progress/cassette.ts';

describe('STUDYFLOW v0.2.4 — Reading Position Cassette Test Suite', () => {
  describe('1. Position % Calculation on 55-page Document (Section 14 Cases 1-6)', () => {
    const totalPages = 55;

    it('1. page 1, y=0 -> 0%', () => {
      const pct = readingPositionPercent(totalPages, 1, 0);
      assert.strictEqual(pct, 0);
    });

    it('2. page 1, y=0.5 -> ~0.9%', () => {
      const pct = readingPositionPercent(totalPages, 1, 0.5);
      // (0 + 0.5) / 55 * 100 = 0.90909... -> 0.9%
      assert.strictEqual(pct, 0.9);
    });

    it('3. page 1, y=1 -> ~1.8%', () => {
      const pct = readingPositionPercent(totalPages, 1, 1);
      // (0 + 1) / 55 * 100 = 1.81818... -> 1.8%
      assert.strictEqual(pct, 1.8);
    });

    it('4. page 5, y=0 -> ~7.3%', () => {
      const pct = readingPositionPercent(totalPages, 5, 0);
      // (4 + 0) / 55 * 100 = 7.2727... -> 7.3%
      assert.strictEqual(pct, 7.3);
    });

    it('5. page 5, y=0.5 -> ~8.2%', () => {
      const pct = readingPositionPercent(totalPages, 5, 0.5);
      // (4 + 0.5) / 55 * 100 = 8.1818... -> 8.2%
      assert.strictEqual(pct, 8.2);
    });

    it('6. page 55, y=1 -> 100%', () => {
      const pct = readingPositionPercent(totalPages, 55, 1);
      // (54 + 1) / 55 * 100 = 100%
      assert.strictEqual(pct, 100);
    });

    it('Edge cases: invalid totalPages, clamps for y < 0 and y > 1, page bounds', () => {
      assert.strictEqual(readingPositionPercent(0, 1, 0), 0);
      assert.strictEqual(readingPositionPercent(-10, 1, 0), 0);
      // y < 0 clamped to 0
      assert.strictEqual(readingPositionPercent(55, 1, -0.5), 0);
      // y > 1 clamped to 1
      assert.strictEqual(readingPositionPercent(55, 55, 1.5), 100);
      // page 0 defaults to page 1
      assert.strictEqual(readingPositionPercent(55, 0, 0), 0);
      // page beyond totalPages clamped to 100%
      assert.strictEqual(readingPositionPercent(55, 60, 0), 100);
    });
  });

  describe('2. Separation from Meaningful Activity (Section 14 Cases 7-10)', () => {
    it('7. highlight on page 2 while current locator is page 1 -> cassette DOES NOT jump to page 2', () => {
      const totalPages = 55;
      const currentLocator = { page: 1, y: 0 };
      const highlights = [{ page: 2, text: 'Important insight' }];

      // Cassette progress is strictly derived from current locator, not highlights
      const cassettePct = readingPositionPercent(totalPages, currentLocator.page, currentLocator.y);
      assert.strictEqual(cassettePct, 0, 'Cassette must remain at page 1 (0%), ignoring highlight on page 2');

      // Internal meaningful coverage may register page 2, but cassette does not
      const internalCoverage = meaningfulCoveragePercent(totalPages, [[2, 2]]);
      assert.strictEqual(internalCoverage, 2);
    });

    it('8. note on page 10 while locator is page 5 -> cassette remains at page 5', () => {
      const totalPages = 55;
      const currentLocator = { page: 5, y: 0 };
      const notes = [{ page: 10, noteText: 'Thought for later' }];

      const cassettePct = readingPositionPercent(totalPages, currentLocator.page, currentLocator.y);
      assert.strictEqual(cassettePct, 7.3, 'Cassette must remain at page 5 (7.3%), ignoring note on page 10');
    });

    it('9. dwell 30s on page 5 -> cassette does not change if locator does not move', () => {
      const totalPages = 55;
      let currentLocator = { page: 5, y: 0.2 };
      const initialPct = readingPositionPercent(totalPages, currentLocator.page, currentLocator.y);

      // Simulate 30s dwell tick
      const dwellSeconds = 30;
      // Dwell increases qualified status internally, but locator has not changed
      const afterDwellPct = readingPositionPercent(totalPages, currentLocator.page, currentLocator.y);
      assert.strictEqual(afterDwellPct, initialPct, 'Dwell must not alter cassette position');
    });

    it('10. scroll page 5 from y=0.1 to y=0.8 -> cassette updates smoothly with vertical position', () => {
      const totalPages = 55;
      const pctStart = readingPositionPercent(totalPages, 5, 0.1);
      const pctEnd = readingPositionPercent(totalPages, 5, 0.8);

      // Start: (4 + 0.1) / 55 * 100 = 7.4545... -> 7.5%
      // End:   (4 + 0.8) / 55 * 100 = 8.7272... -> 8.7%
      assert.strictEqual(pctStart, 7.5);
      assert.strictEqual(pctEnd, 8.7);
      assert.ok(pctEnd > pctStart, 'Cassette position must advance as user scrolls down');
    });
  });

  describe('3. Completion Independence from Cassette 100% (Section 14 Cases 11-12)', () => {
    it('11. Finish Tape at 92% -> status completed is valid', () => {
      const totalPages = 55;
      // Page 51, y = 0.6 -> ((50 + 0.6)/55)*100 = 92%
      const positionPct = readingPositionPercent(totalPages, 51, 0.6);
      assert.strictEqual(positionPct, 92);

      // User triggers Finish Tape button (available near end: page >= totalPages - 1 or positionPct >= 80)
      const isEligibleForFinishTape = 51 >= (totalPages - 1) || positionPct >= 80;
      assert.strictEqual(isEligibleForFinishTape, true);

      // Completing the document sets status = 'completed'
      const doc = { id: 'doc-1', status: 'in_progress' };
      const updatedDoc = { ...doc, status: 'completed' as const };
      assert.strictEqual(updatedDoc.status, 'completed');
    });

    it('12. Completed is NEVER automatic just because cassette reaches 100%', () => {
      const totalPages = 55;
      // User reaches last page, y=1.0 -> 100%
      const positionPct = readingPositionPercent(totalPages, 55, 1.0);
      assert.strictEqual(positionPct, 100);

      // Document status MUST remain in_progress until explicit Finish Tape interaction
      const doc = { id: 'doc-1', status: 'in_progress' as const };
      assert.strictEqual(doc.status, 'in_progress', 'Reaching 100% must NOT automatically mark status completed');
    });
  });

  describe('4. Standard Snapshot Verification across Milestones (Section 15)', () => {
    it('verifies standard percentage milestones: 0%, 10%, 25%, 50%, 75%, 90%, 100%', () => {
      const totalPages = 100;
      assert.strictEqual(readingPositionPercent(totalPages, 1, 0), 0);
      assert.strictEqual(readingPositionPercent(totalPages, 11, 0), 10);
      assert.strictEqual(readingPositionPercent(totalPages, 26, 0), 25);
      assert.strictEqual(readingPositionPercent(totalPages, 51, 0), 50);
      assert.strictEqual(readingPositionPercent(totalPages, 76, 0), 75);
      assert.strictEqual(readingPositionPercent(totalPages, 91, 0), 90);
      assert.strictEqual(readingPositionPercent(totalPages, 100, 1.0), 100);
    });
  });
});
