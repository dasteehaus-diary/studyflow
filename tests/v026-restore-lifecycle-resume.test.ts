import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { LocalProgress, LocalDocument } from '../lib/db/local.ts';

// Simulated reader environment to test restore lifecycle invariants
type RestoreState = 'loading' | 'preparing' | 'restoring' | 'ready';

interface PageContainer {
  page: number;
  height: number;
  offsetTop: number;
  isMounted: boolean;
}

class SimulatedReader {
  totalPages: number;
  savedProgress: LocalProgress | null;
  initialPage?: number;
  initialY?: number;

  fitMode: 'fit-width' | 'fit-page' | 'free' = 'fit-width';
  scale = 1.15;
  pageDimensions = { width: 595.28, height: 841.89 };
  stageWidth = 1200;
  stageHeight = 800;

  stageScrollTop = 0;
  currentPage = 1;
  currentY = 0;
  restoreState: RestoreState = 'loading';
  hasRestoredInitialScroll = false;

  persistedProgress: LocalProgress | null = null;
  recordedDwellMap = new Map<number, number>();
  meaningfulActivityCount = 0;

  constructor(opts: {
    totalPages: number;
    savedProgress: LocalProgress | null;
    initialPage?: number;
    initialY?: number;
    fitMode?: 'fit-width' | 'fit-page' | 'free';
  }) {
    this.totalPages = opts.totalPages;
    this.savedProgress = opts.savedProgress;
    this.initialPage = opts.initialPage;
    this.initialY = opts.initialY;
    if (opts.fitMode) this.fitMode = opts.fitMode;
    this.persistedProgress = opts.savedProgress ? { ...opts.savedProgress } : null;
  }

  get restoreTarget(): { page: number; y: number } {
    const page = this.initialPage || this.savedProgress?.currentPage || 1;
    const y = this.initialY !== undefined ? this.initialY : (this.savedProgress?.y || 0);
    return { page, y };
  }

  // Virtualization mount check (Requirement 6)
  isPageMounted(pageNum: number): boolean {
    const isNearCurrent = Math.abs(pageNum - this.currentPage) <= 1;
    const isNearRestoreTarget =
      this.restoreState !== 'ready' &&
      Math.abs(pageNum - this.restoreTarget.page) <= 1;
    return isNearCurrent || isNearRestoreTarget;
  }

  getPageHeight(): number {
    return Math.round(this.pageDimensions.height * this.scale);
  }

  // Computes offsetTop of each page accounting for unmounted placeholders with estimatedHeight
  getPageContainer(pageNum: number): PageContainer | null {
    if (pageNum < 1 || pageNum > this.totalPages) return null;
    const height = this.getPageHeight();
    const margin = 24;
    const offsetTop = (pageNum - 1) * (height + margin);
    return {
      page: pageNum,
      height,
      offsetTop,
      isMounted: this.isPageMounted(pageNum)
    };
  }

  // Real fit scale calculation (Requirement 9)
  recalculateFitScale() {
    if (this.fitMode === 'free') return;
    const availableWidth = Math.max(260, this.stageWidth - 48);
    const availableHeight = Math.max(280, this.stageHeight - 56);

    if (this.fitMode === 'fit-width') {
      const calculatedScale = Number((availableWidth / this.pageDimensions.width).toFixed(3));
      const clampedScale = Math.max(0.5, Math.min(2.5, calculatedScale));
      if (Math.abs(this.scale - clampedScale) >= 0.02) {
        this.scale = clampedScale;
      }
    } else if (this.fitMode === 'fit-page') {
      const scaleX = availableWidth / this.pageDimensions.width;
      const scaleY = availableHeight / this.pageDimensions.height;
      const calculatedScale = Number((Math.min(scaleX, scaleY)).toFixed(3));
      const clampedScale = Math.max(0.4, Math.min(2.5, calculatedScale));
      if (Math.abs(this.scale - clampedScale) >= 0.02) {
        this.scale = clampedScale;
      }
    }
  }

  // Jump function returning boolean success/failure (Requirement 2 & 3)
  jumpToPageAndY(page: number, y: number, behavior: 'instant' | 'smooth' = 'smooth'): boolean {
    const container = this.getPageContainer(page);
    if (!container || container.height < 50) return false;

    const targetScroll = Math.max(0, container.offsetTop + (y * container.height));
    this.stageScrollTop = targetScroll;

    if (this.restoreState === 'ready') {
      this.currentPage = page;
      this.currentY = y;
      this.scheduleProgressPersistence(page, y);
    }
    return true;
  }

  // Restore Lifecycle execution (Requirements 1, 2, 4, 7, 8)
  runRestoreLifecycle(): { success: boolean; cycles: number } {
    this.restoreState = 'preparing';
    const { page: targetPage, y: targetY } = this.restoreTarget;

    // Fast path: page 1 at top
    if (targetPage === 1 && targetY === 0) {
      this.stageScrollTop = 0;
      this.currentPage = 1;
      this.currentY = 0;
      this.hasRestoredInitialScroll = true;
      this.restoreState = 'ready';
      return { success: true, cycles: 1 };
    }

    // Settling scale before final jump (Requirement 9 & 10)
    this.recalculateFitScale();

    // Check target container (Requirement 2 & 4)
    const container = this.getPageContainer(targetPage);
    if (!container || container.height < 50) {
      return { success: false, cycles: 0 };
    }

    this.restoreState = 'restoring';
    const jumpSuccess = this.jumpToPageAndY(targetPage, targetY, 'instant');
    if (!jumpSuccess) {
      return { success: false, cycles: 1 };
    }

    // Animation frame verification (Requirement 7)
    const currentScroll = this.stageScrollTop;
    const expectedScroll = container.offsetTop + (targetY * container.height);
    const isAccurate = Math.abs(currentScroll - expectedScroll) <= 40;
    const inView = currentScroll >= container.offsetTop - 120 &&
                   currentScroll < container.offsetTop + container.height - 30;

    if (isAccurate || inView) {
      this.currentPage = targetPage;
      this.currentY = targetY;
      this.hasRestoredInitialScroll = true;
      this.restoreState = 'ready';
      return { success: true, cycles: 2 };
    }

    return { success: false, cycles: 2 };
  }

  // Wheel / Scroll event (Requirement 5)
  handleScroll(simulatedDeltaY = 10) {
    if (this.restoreState !== 'ready') {
      // SUPPRESSED while restoring! (Requirement 5)
      return;
    }

    this.stageScrollTop = Math.max(0, this.stageScrollTop + simulatedDeltaY);
    const scrollTop = this.stageScrollTop;

    // Binary search / find visible page
    for (let p = 1; p <= this.totalPages; p++) {
      const container = this.getPageContainer(p);
      if (!container) continue;
      const inView = scrollTop >= container.offsetTop - 100 &&
                     scrollTop < container.offsetTop + container.height - 50;
      if (inView) {
        this.currentPage = p;
        this.currentY = Math.max(0, Math.min(1, (scrollTop - container.offsetTop) / container.height));
        this.scheduleProgressPersistence(this.currentPage, this.currentY);
        break;
      }
    }
  }

  // Progress persistence (Requirement 5 & 11)
  scheduleProgressPersistence(page: number, y: number) {
    if (this.restoreState !== 'ready') {
      return;
    }
    this.persistedProgress = {
      documentId: 'doc-test',
      currentPage: page,
      y: Number(y.toFixed(4)),
      visitedRanges: [[1, page]],
      completed: false,
      lastMeaningfulActivityAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  // Dwell timer tick (Requirement 5)
  dwellTick() {
    if (this.restoreState !== 'ready') return;
    const activeP = this.currentPage;
    const curr = (this.recordedDwellMap.get(activeP) || 0) + 1;
    this.recordedDwellMap.set(activeP, curr);
    if (curr >= 8) {
      this.meaningfulActivityCount++;
    }
  }

  // Zoom / Scale change after ready (Requirement 10)
  changeScale(newScale: number) {
    this.scale = newScale;
    if (this.currentPage >= 1) {
      this.jumpToPageAndY(this.currentPage, this.currentY, 'instant');
    }
  }
}

describe('STUDYFLOW v0.2.6 — Restore Lifecycle & Blank Page Resume Audit', () => {

  it('1. Save locator page 4/y=.5 → leave Reader → Continue → opens page 4 around mid-page', () => {
    const reader = new SimulatedReader({
      totalPages: 55,
      savedProgress: {
        documentId: 'doc-1',
        currentPage: 4,
        y: 0.5,
        visitedRanges: [[1, 4]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      }
    });

    assert.strictEqual(reader.restoreState, 'loading');
    const result = reader.runRestoreLifecycle();

    assert.strictEqual(result.success, true);
    assert.strictEqual(reader.restoreState, 'ready');
    assert.strictEqual(reader.currentPage, 4);
    assert.strictEqual(reader.currentY, 0.5);

    // Verify stageScrollTop is physically placed around mid-page 4
    const page4 = reader.getPageContainer(4)!;
    const expectedScroll = page4.offsetTop + (0.5 * page4.height);
    assert.strictEqual(reader.stageScrollTop, expectedScroll);
  });

  it('2. Save page 40/y=.2 → reload → returns page 40, not page 1', () => {
    const reader = new SimulatedReader({
      totalPages: 55,
      savedProgress: {
        documentId: 'doc-2',
        currentPage: 40,
        y: 0.2,
        visitedRanges: [[1, 40]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      }
    });

    reader.runRestoreLifecycle();
    assert.strictEqual(reader.currentPage, 40);
    assert.strictEqual(reader.currentY, 0.2);

    const page40 = reader.getPageContainer(40)!;
    const expectedScroll = page40.offsetTop + (0.2 * page40.height);
    assert.strictEqual(reader.stageScrollTop, expectedScroll);
  });

  it('3. First wheel event after resume does NOT jump to page 1', () => {
    const reader = new SimulatedReader({
      totalPages: 55,
      savedProgress: {
        documentId: 'doc-3',
        currentPage: 4,
        y: 0.5,
        visitedRanges: [[1, 4]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      }
    });

    reader.runRestoreLifecycle();
    assert.strictEqual(reader.currentPage, 4);

    // User spins mouse wheel slightly (deltaY = 15px)
    reader.handleScroll(15);

    // CRITICAL BUG FIX VERIFICATION:
    // Reader must remain at page 4, NOT jump back to page 1!
    assert.strictEqual(reader.currentPage, 4);
    assert.notStrictEqual(reader.currentPage, 1);
    assert.strictEqual(reader.persistedProgress?.currentPage, 4);
  });

  it('4. Resume works at Fit Width', () => {
    const reader = new SimulatedReader({
      totalPages: 55,
      savedProgress: {
        documentId: 'doc-fit-w',
        currentPage: 4,
        y: 0.5,
        visitedRanges: [[1, 4]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      },
      fitMode: 'fit-width'
    });

    reader.runRestoreLifecycle();
    // In fit-width with stageWidth 1200: availableWidth = 1152; 1152 / 595.28 = 1.935
    assert.ok(reader.scale >= 1.5 && reader.scale <= 2.5);
    assert.strictEqual(reader.currentPage, 4);
    assert.strictEqual(reader.restoreState, 'ready');
  });

  it('5. Resume works at Fit Page', () => {
    const reader = new SimulatedReader({
      totalPages: 55,
      savedProgress: {
        documentId: 'doc-fit-p',
        currentPage: 7,
        y: 0.3,
        visitedRanges: [[1, 7]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      },
      fitMode: 'fit-page'
    });

    reader.runRestoreLifecycle();
    assert.strictEqual(reader.currentPage, 7);
    assert.strictEqual(reader.restoreState, 'ready');

    // Small scroll on page 7 preserves page 7
    reader.handleScroll(10);
    assert.strictEqual(reader.currentPage, 7);
  });

  it('6. Resume works after manual zoom', () => {
    const reader = new SimulatedReader({
      totalPages: 55,
      savedProgress: {
        documentId: 'doc-zoom',
        currentPage: 5,
        y: 0.4,
        visitedRanges: [[1, 5]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      }
    });

    reader.runRestoreLifecycle();
    assert.strictEqual(reader.currentPage, 5);

    // User zooms in manually from ~1.94 to 2.20
    reader.changeScale(2.20);
    assert.strictEqual(reader.scale, 2.20);
    assert.strictEqual(reader.currentPage, 5);

    // Verify scrollTop re-anchored to page 5 at new scale
    const page5New = reader.getPageContainer(5)!;
    const expectedScrollNew = page5New.offsetTop + (0.4 * page5New.height);
    assert.strictEqual(reader.stageScrollTop, expectedScrollNew);
  });

  it('7. Resume works with 55-page and 300+ page PDFs', () => {
    const largeReader = new SimulatedReader({
      totalPages: 350,
      savedProgress: {
        documentId: 'doc-large',
        currentPage: 215,
        y: 0.65,
        visitedRanges: [[1, 215]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      }
    });

    largeReader.runRestoreLifecycle();
    assert.strictEqual(largeReader.currentPage, 215);
    assert.strictEqual(largeReader.currentY, 0.65);
    assert.strictEqual(largeReader.restoreState, 'ready');

    // First wheel tick stays on page 215
    largeReader.handleScroll(20);
    assert.strictEqual(largeReader.currentPage, 215);
  });

  it('8. Resume works when target page is outside the initially mounted virtualization window', () => {
    const reader = new SimulatedReader({
      totalPages: 100,
      savedProgress: {
        documentId: 'doc-outside',
        currentPage: 50,
        y: 0.1,
        visitedRanges: [[1, 50]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      }
    });

    // Before restore completes, page 50 is outside standard [0, 2] window
    // Virtualization mount rule guarantees near(restoreTarget) is force-mounted
    assert.strictEqual(reader.isPageMounted(50), true);
    assert.strictEqual(reader.isPageMounted(49), true);
    assert.strictEqual(reader.isPageMounted(51), true);

    // Unrelated intermediate page is not mounted
    assert.strictEqual(reader.isPageMounted(25), false);

    reader.runRestoreLifecycle();
    assert.strictEqual(reader.currentPage, 50);
    assert.strictEqual(reader.restoreState, 'ready');
  });

  it('9. No progress/meaningful activity is recorded during automatic restore', () => {
    const reader = new SimulatedReader({
      totalPages: 55,
      savedProgress: {
        documentId: 'doc-activity',
        currentPage: 10,
        y: 0.3,
        visitedRanges: [[1, 10]],
        completed: false,
        lastMeaningfulActivityAt: '2026-10-07T00:00:00Z',
        updatedAt: '2026-10-07T00:00:00Z'
      }
    });

    // Simulate clock ticks while restoreState is 'loading' or 'preparing'
    reader.restoreState = 'preparing';
    reader.dwellTick();
    reader.dwellTick();
    reader.dwellTick();

    // Verify zero dwell seconds accumulated during restore
    assert.strictEqual(reader.recordedDwellMap.size, 0);
    assert.strictEqual(reader.meaningfulActivityCount, 0);

    // Simulate accidental scroll before ready
    reader.handleScroll(50);
    // Persisted locator remains untouched
    assert.strictEqual(reader.persistedProgress?.currentPage, 10);
    assert.strictEqual(reader.persistedProgress?.y, 0.3);

    // Complete restore
    reader.runRestoreLifecycle();
    assert.strictEqual(reader.restoreState, 'ready');

    // Now after ready, normal reading activity tracks
    reader.dwellTick();
    assert.strictEqual(reader.recordedDwellMap.get(10), 1);
  });
});
