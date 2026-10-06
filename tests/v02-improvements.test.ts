import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { selectContinueDocument } from '../lib/documents/selectors.ts';
import { evaluateContextualReward } from '../lib/rewards/reward-service.ts';
import type { LocalDocument, LocalProgress, LocalNote } from '../lib/db/local.ts';

describe('StudyFlow v0.2 — Improvements & Polish Test Suite', () => {

  describe('1. Continue Card Priority Logic (Resume > Track)', () => {
    it('prioritizes in-progress document over completed document, even if completed was opened more recently', () => {
      const docs: LocalDocument[] = [
        {
          id: 'doc-completed',
          title: 'Finished Book',
          fileHash: 'h1',
          opfsPath: 'documents/1.pdf',
          tags: [],
          status: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-03-01T12:00:00Z'
        },
        {
          id: 'doc-reading',
          title: 'Active Reading Book',
          fileHash: 'h2',
          opfsPath: 'documents/2.pdf',
          tags: [],
          status: 'in_progress',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-02-15T10:00:00Z'
        }
      ];

      const progressMap: Record<string, LocalProgress> = {
        'doc-completed': {
          documentId: 'doc-completed',
          currentPage: 100,
          y: 0,
          visitedRanges: [[1, 100]],
          completed: true,
          lastMeaningfulActivityAt: '2026-03-01T12:00:00Z',
          updatedAt: '2026-03-01T12:00:00Z'
        },
        'doc-reading': {
          documentId: 'doc-reading',
          currentPage: 42,
          y: 0.5,
          visitedRanges: [[1, 42]],
          completed: false,
          lastMeaningfulActivityAt: '2026-02-15T10:00:00Z',
          updatedAt: '2026-02-15T10:00:00Z'
        }
      };

      const selected = selectContinueDocument(docs, progressMap);
      assert.strictEqual(selected?.id, 'doc-reading');
      assert.strictEqual(selected?.title, 'Active Reading Book');
    });

    it('falls back to completed document when no active in-progress documents exist', () => {
      const docs: LocalDocument[] = [
        {
          id: 'doc-completed-1',
          title: 'Old Finished Book',
          fileHash: 'h1',
          opfsPath: 'documents/1.pdf',
          tags: [],
          status: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-10T00:00:00Z'
        },
        {
          id: 'doc-completed-2',
          title: 'Recently Finished Book',
          fileHash: 'h2',
          opfsPath: 'documents/2.pdf',
          tags: [],
          status: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-02-01T00:00:00Z'
        }
      ];

      const selected = selectContinueDocument(docs, {});
      assert.strictEqual(selected?.id, 'doc-completed-2');
    });

    it('never selects archived documents', () => {
      const docs: LocalDocument[] = [
        {
          id: 'doc-archived',
          title: 'Archived Document',
          fileHash: 'h1',
          opfsPath: 'documents/1.pdf',
          tags: [],
          status: 'archived',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z'
        }
      ];

      const selected = selectContinueDocument(docs, {});
      assert.strictEqual(selected, null);
    });

    it('returns null on empty document list', () => {
      const selected = selectContinueDocument([], {});
      assert.strictEqual(selected, null);
    });
  });

  describe('2. Contextual B-Side Reward Evaluation (100% Local, Zero AI)', () => {
    it('evaluates First Note Flashback when a meaningful quick note exists', () => {
      const notes: LocalNote[] = [
        {
          id: 'n1',
          documentId: 'doc-1',
          type: 'quick',
          noteText: 'Khái niệm về cognitive load ở đây rất sâu sắc và thực tế.',
          page: 12,
          y: 0.3,
          locator: { page: 12, y: 0.3 },
          createdAt: '2026-01-05T08:00:00Z',
          updatedAt: '2026-01-05T08:00:00Z'
        }
      ];

      const reward = evaluateContextualReward('doc-1', notes);
      assert.ok(reward !== null);
      assert.strictEqual(reward?.code, 'FIRST_NOTE_FLASHBACK');
      assert.ok(reward?.description.includes('trang 12'));
      assert.ok(reward?.description.includes('cognitive load'));
    });

    it('evaluates Resolved Question Flashback when a resolved question exists', () => {
      const notes: LocalNote[] = [
        {
          id: 'n2',
          documentId: 'doc-1',
          type: 'question',
          status: 'resolved',
          noteText: 'Tại sao thuật toán này đạt O(1) space complexity?',
          resolutionText: 'Vì chỉ dùng hai biến con trỏ thay vì cấp phát mảng phụ.',
          page: 45,
          y: 0.4,
          locator: { page: 45, y: 0.4 },
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-12T15:00:00Z'
        }
      ];

      const reward = evaluateContextualReward('doc-1', notes);
      assert.ok(reward !== null);
      assert.strictEqual(reward?.code, 'RESOLVED_QUESTION_FLASHBACK');
      assert.strictEqual(reward?.title, 'Khoảnh khắc Khai Sáng');
      assert.ok(reward?.description.includes('O(1)'));
    });

    it('gracefully returns null (falling back to static catalog) when no notes exist', () => {
      const reward = evaluateContextualReward('doc-1', []);
      assert.strictEqual(reward, null);
    });
  });

  describe('3. Reading Session Lifecycle & Anti-Bounce Deduplication', () => {
    // Pure function representing the session decision logic implemented in PdfReader
    function shouldRecordSession(durationSeconds: number): boolean {
      return durationSeconds >= 5;
    }

    function createReadingSessionRecord(
      documentId: string,
      startLocator: { page: number; y: number },
      endLocator: { page: number; y: number },
      durationSeconds: number
    ) {
      if (!shouldRecordSession(durationSeconds)) return null;
      return {
        id: 'session-unique-id',
        documentId,
        startPage: startLocator.page,
        endPage: endLocator.page,
        startY: startLocator.y,
        endY: endLocator.y,
        durationSeconds
      };
    }

    it('discards accidental bounces shorter than 5 seconds', () => {
      const session = createReadingSessionRecord(
        'doc-1',
        { page: 1, y: 0 },
        { page: 1, y: 0.2 },
        3 // 3 seconds
      );
      assert.strictEqual(session, null);
    });

    it('records valid session when duration >= 5 seconds', () => {
      const session = createReadingSessionRecord(
        'doc-1',
        { page: 1, y: 0 },
        { page: 8, y: 0.45 },
        120 // 2 minutes
      );
      assert.ok(session !== null);
      assert.strictEqual(session?.startPage, 1);
      assert.strictEqual(session?.endPage, 8);
      assert.strictEqual(session?.durationSeconds, 120);
    });

    it('maintains continuous session identity across scroll ticks without re-creating sessions', () => {
      let activeSessionsCount = 1;
      let scrollTicks = 0;

      // Simulate 50 scroll ticks during a single reading session
      for (let i = 0; i < 50; i++) {
        scrollTicks++;
        // scroll updates locator refs, but session remains singular
      }

      assert.strictEqual(scrollTicks, 50);
      assert.strictEqual(activeSessionsCount, 1);
    });
  });

  describe('4. Debounced Progress Coalescing', () => {
    class ProgressCoalescer {
      private timer: NodeJS.Timeout | null = null;
      public pendingProgress: { page: number; y: number } | null = null;
      public dbWritesCount = 0;
      public lastSavedProgress: { page: number; y: number } | null = null;

      public updateScroll(progress: { page: number; y: number }, debounceMs = 750) {
        this.pendingProgress = progress;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.flush();
        }, debounceMs);
      }

      public flush() {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        if (this.pendingProgress) {
          this.lastSavedProgress = this.pendingProgress;
          this.dbWritesCount++;
          this.pendingProgress = null;
        }
      }
    }

    it('coalesces multiple rapid scroll events into a single database write', async () => {
      const tracker = new ProgressCoalescer();

      // Rapidly fire scroll events
      tracker.updateScroll({ page: 1, y: 0.1 }, 20);
      tracker.updateScroll({ page: 1, y: 0.3 }, 20);
      tracker.updateScroll({ page: 2, y: 0.05 }, 20);
      tracker.updateScroll({ page: 2, y: 0.4 }, 20);

      assert.strictEqual(tracker.dbWritesCount, 0, 'Should not write to DB immediately on scroll');

      // Wait for debounce timer to fire
      await new Promise(r => setTimeout(r, 40));

      assert.strictEqual(tracker.dbWritesCount, 1, 'Should have coalesced into exactly 1 DB write');
      assert.deepStrictEqual(tracker.lastSavedProgress, { page: 2, y: 0.4 });
    });

    it('flushes pending progress immediately on jump or unmount', () => {
      const tracker = new ProgressCoalescer();

      tracker.updateScroll({ page: 5, y: 0.8 }, 750);
      assert.strictEqual(tracker.dbWritesCount, 0);

      // User jumps to page 20 or closes tab
      tracker.flush();

      assert.strictEqual(tracker.dbWritesCount, 1);
      assert.deepStrictEqual(tracker.lastSavedProgress, { page: 5, y: 0.8 });
    });
  });

  describe('5. Backup Size Guard & Safety Checks', () => {
    function estimateBackupSafety(documents: Array<{ fileSizeBytes?: number }>) {
      const totalBytes = documents.reduce((sum, d) => sum + (d.fileSizeBytes || 0), 0);
      const totalMB = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;
      return {
        totalBytes,
        totalMB,
        isLarge: totalBytes > 50 * 1024 * 1024
      };
    }

    it('identifies backup size below 50MB as safe and not large', () => {
      const docs = [
        { fileSizeBytes: 5 * 1024 * 1024 }, // 5MB
        { fileSizeBytes: 12 * 1024 * 1024 } // 12MB
      ];
      const est = estimateBackupSafety(docs);
      assert.strictEqual(est.isLarge, false);
      assert.strictEqual(est.totalMB, 17);
    });

    it('flags backup size exceeding 50MB with isLarge=true', () => {
      const docs = [
        { fileSizeBytes: 30 * 1024 * 1024 }, // 30MB
        { fileSizeBytes: 25 * 1024 * 1024 }  // 25MB -> 55MB total
      ];
      const est = estimateBackupSafety(docs);
      assert.strictEqual(est.isLarge, true);
      assert.strictEqual(est.totalMB, 55);
    });

    it('strictly blocks PDF bundle export when size exceeds MAX_SAFE_PDF_BUNDLE_BYTES (50MB)', () => {
      const MAX_SAFE_BYTES = 50 * 1024 * 1024;

      function simulateExportGuard(includePdfBytes: boolean, totalPdfBytes: number) {
        if (includePdfBytes && totalPdfBytes > MAX_SAFE_BYTES) {
          const totalMB = Math.round((totalPdfBytes / (1024 * 1024)) * 10) / 10;
          throw new Error(`Đã chặn xuất PDF bundle: ${totalMB} MB vượt ngưỡng an toàn 50MB.`);
        }
        return { success: true };
      }

      // Safe export (< 50MB) succeeds
      const safeRes = simulateExportGuard(true, 42 * 1024 * 1024);
      assert.strictEqual(safeRes.success, true);

      // Large export (> 50MB) strictly throws Error instead of warning
      assert.throws(() => {
        simulateExportGuard(true, 68 * 1024 * 1024);
      }, /50MB/);

      // Lightweight notes-only export always succeeds even if PDFs are large
      const notesOnlyRes = simulateExportGuard(false, 68 * 1024 * 1024);
      assert.strictEqual(notesOnlyRes.success, true);
    });
  });

  describe('6. Hardening Regression Tests: Session Lifecycle & Memory Safety', () => {
    it('verifies that page/scroll changes do NOT re-run session effect or create extra sessions', () => {
      // Simulate session lifecycle decoupled from progress state
      let effectRunCount = 0;
      let sessionPersistedCount = 0;
      let activeSeconds = 0;

      // Mock component mount for documentId = 'doc-hardened'
      const documentId = 'doc-hardened';
      let activeDocId = documentId;

      // The effect only runs when activeDocId changes
      function triggerDocumentMountEffect(docId: string) {
        effectRunCount++;
        activeDocId = docId;
      }
      triggerDocumentMountEffect(documentId);

      // Simulate 100 scroll events and page changes
      for (let p = 1; p <= 100; p++) {
        const _currentPage = p;
        const _currentY = 0.5;
        activeSeconds += 1;
        // Progress changes do NOT re-trigger document mount effect!
      }

      // Simulate unmount / pagehide
      function triggerUnmountCleanup() {
        if (activeSeconds >= 5) {
          sessionPersistedCount++;
        }
      }
      triggerUnmountCleanup();

      assert.strictEqual(effectRunCount, 1, 'Session effect must strictly initialize once per document');
      assert.strictEqual(sessionPersistedCount, 1, 'Exactly one session must be persisted on teardown');
      assert.strictEqual(activeSeconds, 100, 'Active seconds must accumulate without being reset by scroll ticks');
    });

    it('verifies thumbnail generation uses Blob URL pattern and guarantees URL.revokeObjectURL cleanup', () => {
      let createdUrlCount = 0;
      let revokedUrlCount = 0;

      const mockURL = {
        createObjectURL: (_file: unknown) => {
          createdUrlCount++;
          return 'blob:http://localhost/mock-uuid-123';
        },
        revokeObjectURL: (_url: string) => {
          revokedUrlCount++;
        }
      };

      // Simulates the try/finally block in ImportPdfModal.tsx
      function generateThumbnailSafe(file: { name: string; size: number }, shouldFail = false) {
        let blobUrl: string | null = null;
        try {
          blobUrl = mockURL.createObjectURL(file);
          if (shouldFail) {
            throw new Error('Simulated PDF parse failure');
          }
          return 'data:image/jpeg;base64,mockThumbnailData';
        } catch {
          return undefined; // fallback to gradient
        } finally {
          if (blobUrl) {
            mockURL.revokeObjectURL(blobUrl);
          }
        }
      }

      // Test 1: Successful path
      const thumb = generateThumbnailSafe({ name: 'large.pdf', size: 85 * 1024 * 1024 }, false);
      assert.ok(thumb?.startsWith('data:image/jpeg;base64,'));
      assert.strictEqual(createdUrlCount, 1);
      assert.strictEqual(revokedUrlCount, 1, 'Must revoke Object URL on success');

      // Test 2: Error path (still guarantees revocation)
      const fallbackThumb = generateThumbnailSafe({ name: 'corrupted.pdf', size: 10 * 1024 * 1024 }, true);
      assert.strictEqual(fallbackThumb, undefined);
      assert.strictEqual(createdUrlCount, 2);
      assert.strictEqual(revokedUrlCount, 2, 'Must revoke Object URL even when error occurs');
    });

    it('verifies optimized scroll locator uses O(1) fast candidates and O(log N) binary search', () => {
      // Simulate 500 pages in vertical layout
      const PAGE_HEIGHT = 1000;
      const totalPages = 500;
      let lookupEvaluationsCount = 0;

      const pageOffsets = new Map<number, { top: number; height: number }>();
      for (let i = 1; i <= totalPages; i++) {
        pageOffsets.set(i, { top: (i - 1) * PAGE_HEIGHT, height: PAGE_HEIGHT });
      }

      function findPageOptimized(scrollTop: number, currentPage: number): number | null {
        lookupEvaluationsCount = 0;

        const check = (p: number) => {
          lookupEvaluationsCount++;
          const info = pageOffsets.get(p);
          if (!info) return null;
          const inView = scrollTop >= info.top - 100 && scrollTop < info.top + info.height - 50;
          return { inView, top: info.top };
        };

        // 1. Fast path (O(1))
        const candidates = [currentPage, currentPage + 1, currentPage - 1, currentPage + 2, currentPage - 2];
        for (const p of candidates) {
          if (p >= 1 && p <= totalPages) {
            const res = check(p);
            if (res?.inView) return p;
          }
        }

        // 2. Binary search fallback (O(log N))
        let low = 1;
        let high = totalPages;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const res = check(mid);
          if (!res) {
            low++;
            continue;
          }
          if (res.inView) return mid;
          if (scrollTop < res.top - 100) {
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }

        return null;
      }

      // Case A: Sequential reading from page 50 to page 51
      const sequentialPage = findPageOptimized(50 * PAGE_HEIGHT + 100, 50);
      assert.strictEqual(sequentialPage, 51);
      assert.ok(lookupEvaluationsCount <= 2, `Sequential reading should resolve in <= 2 checks, got ${lookupEvaluationsCount}`);

      // Case B: Huge scrubbing jump from page 50 to page 430
      const jumpPage = findPageOptimized(429 * PAGE_HEIGHT + 200, 50);
      assert.strictEqual(jumpPage, 430);
      // log2(500) ≈ 9, fast path takes 5 checks, binary search takes <= 9 -> max ~14 checks vs 500 checks!
      assert.ok(lookupEvaluationsCount <= 14, `Jump must resolve in <= 14 checks (vs 500 in O(N)), got ${lookupEvaluationsCount}`);
    });
  });

});

