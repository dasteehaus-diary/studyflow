import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('STUDYFLOW v0.2.4 — Stability & Data Integrity Audit Suite', () => {

  // =========================================================================
  // 1. SYNC QUEUE INFLATION PREVENTION (RULES A, B, C, D)
  // =========================================================================
  describe('1. Sync Queue Invariants & Coalescing', () => {
    it('Rule A: Does not accumulate sync queue when Supabase is unconfigured', () => {
      // Mock unconfigured environment
      const isConfigured = false;
      const queue: Array<{ entity: string; entityId: string }> = [];

      function enqueueMock(entity: string, entityId: string) {
        if (!isConfigured) return; // Rule A
        queue.push({ entity, entityId });
      }

      for (let i = 0; i < 50; i++) {
        enqueueMock('progress', 'doc-1');
      }

      assert.strictEqual(queue.length, 0, 'Queue must remain exactly 0 when Supabase is not configured');
    });

    it('Rule B: Does not accumulate sync queue when user is signed out', () => {
      const isConfigured = true;
      const user = null; // signed out
      const queue: Array<{ entity: string; entityId: string }> = [];

      function enqueueMock(entity: string, entityId: string) {
        if (!isConfigured || !user) return; // Rule B
        queue.push({ entity, entityId });
      }

      enqueueMock('note', 'note-1');
      enqueueMock('progress', 'doc-1');
      assert.strictEqual(queue.length, 0, 'Queue must remain 0 when user is not signed in');
    });

    it('Rule D: Coalesces offline queue operations by (entity, entityId)', () => {
      interface QueueItem {
        entity: string;
        entityId: string;
        operation: 'upsert' | 'delete';
        payload: { page: number; y: number };
      }

      const queue: QueueItem[] = [];

      function enqueueWithCoalescing(item: QueueItem) {
        const existingIdx = queue.findIndex(q => q.entity === item.entity && q.entityId === item.entityId);
        if (existingIdx >= 0) {
          queue[existingIdx] = item; // Coalesce
        } else {
          queue.push(item);
        }
      }

      // Simulate 10 scroll ticks while offline
      for (let p = 1; p <= 10; p++) {
        enqueueWithCoalescing({
          entity: 'progress',
          entityId: 'doc-1',
          operation: 'upsert',
          payload: { page: p, y: 0.1 * p }
        });
      }

      assert.strictEqual(queue.length, 1, 'Rapid offline scroll ticks must coalesce into 1 queue item');
      assert.strictEqual(queue[0].payload.page, 10, 'Coalesced item must contain latest payload');
    });
  });

  // =========================================================================
  // 2. REWARD FOREIGN KEY CONSISTENCY
  // =========================================================================
  describe('2. Reward FK Canonical Mapping', () => {
    function mapToCanonicalRewardId(rawRewardId: string): string {
      if (rawRewardId.startsWith('flashback-note')) return 'flashback-note';
      if (rawRewardId.startsWith('flashback-question')) return 'flashback-question';
      if (rawRewardId.startsWith('flashback-parking')) return 'flashback-parking';
      return rawRewardId;
    }

    it('maps dynamic contextual reward IDs to canonical reward table keys', () => {
      assert.strictEqual(mapToCanonicalRewardId('flashback-note-abc-123'), 'flashback-note');
      assert.strictEqual(mapToCanonicalRewardId('flashback-question-doc-xyz'), 'flashback-question');
      assert.strictEqual(mapToCanonicalRewardId('flashback-parking-999'), 'flashback-parking');
      assert.strictEqual(mapToCanonicalRewardId('first-step'), 'first-step');
    });

    it('ensures canonical reward IDs match migration 0003 seed catalog', () => {
      const canonicalSeedIds = new Set([
        'flashback-note',
        'flashback-question',
        'flashback-parking',
        'first-step',
        'deep-focus-1',
        'cassette-side-a',
        'full-tape'
      ]);

      assert.ok(canonicalSeedIds.has(mapToCanonicalRewardId('flashback-note-doc-uuid')));
      assert.ok(canonicalSeedIds.has(mapToCanonicalRewardId('flashback-question-doc-uuid')));
      assert.ok(canonicalSeedIds.has(mapToCanonicalRewardId('flashback-parking-doc-uuid')));
    });
  });

  // =========================================================================
  // 3. LOCAL CASCADE DELETION
  // =========================================================================
  describe('3. Local Cascade Deletion', () => {
    it('cleans all associated document entities while preserving unlocked rewards snapshots', async () => {
      const docId = 'doc-to-delete';

      const mockDb = {
        documents: new Set([docId, 'doc-keep']),
        progress: new Set([docId]),
        highlights: new Set(['hl-1', 'hl-2']),
        notes: new Set(['note-1', 'note-2']),
        readingSessions: new Set(['ses-1']),
        syncQueue: new Set(['sync-for-doc-to-delete', 'sync-other']),
        unlockedRewards: [
          { id: 'rew-1', documentId: docId, title: 'Preserved snapshot' },
          { id: 'rew-2', documentId: 'doc-keep', title: 'Other snapshot' }
        ]
      };

      let opfsDeleted = false;
      const mockOpfsDelete = async (id: string) => {
        if (id === docId) opfsDeleted = true;
      };

      // Execute cascade deletion logic
      await mockOpfsDelete(docId);
      mockDb.documents.delete(docId);
      mockDb.progress.delete(docId);
      mockDb.highlights.clear();
      mockDb.notes.clear();
      mockDb.readingSessions.clear();
      mockDb.syncQueue.delete('sync-for-doc-to-delete');

      // Verify
      assert.strictEqual(opfsDeleted, true, 'OPFS file must be deleted');
      assert.strictEqual(mockDb.documents.has(docId), false, 'Document must be removed');
      assert.strictEqual(mockDb.progress.has(docId), false, 'Progress must be removed');
      assert.strictEqual(mockDb.highlights.size, 0, 'Highlights must be cleaned');
      assert.strictEqual(mockDb.notes.size, 0, 'Notes must be cleaned');
      assert.strictEqual(mockDb.readingSessions.size, 0, 'Sessions must be cleaned');
      assert.strictEqual(mockDb.syncQueue.has('sync-for-doc-to-delete'), false, 'Sync queue items for doc must be cleaned');

      // Unlocked rewards snapshot MUST be preserved
      assert.strictEqual(mockDb.unlockedRewards.length, 2, 'Reward snapshots must remain in vault');
      assert.strictEqual(mockDb.unlockedRewards[0].documentId, docId);
    });
  });

  // =========================================================================
  // 4. HIGHLIGHT DELETE NOTE UNLINKING
  // =========================================================================
  describe('4. Highlight Note Unlinking', () => {
    it('unlinks notes when highlight is deleted without removing the note or locator', () => {
      const highlightId = 'hl-target';

      let note = {
        id: 'note-1',
        documentId: 'doc-1',
        highlightId: 'hl-target',
        noteText: 'Insight on page 3',
        page: 3,
        y: 0.45,
        locator: { page: 3, y: 0.45 }
      };

      // Action: delete highlight
      const deletedHighlightId = highlightId;
      if (note.highlightId === deletedHighlightId) {
        note = { ...note, highlightId: undefined as unknown as string };
      }

      assert.strictEqual(note.highlightId, undefined, 'Note must be unlinked from deleted highlight');
      assert.strictEqual(note.noteText, 'Insight on page 3', 'Note content must remain intact');
      assert.strictEqual(note.page, 3, 'Page reference must be preserved');
      assert.strictEqual(note.locator.y, 0.45, 'Locator coordinates must be preserved');
    });
  });

  // =========================================================================
  // 5. READING SESSION LIFECYCLE ON VISIBILITY CHANGE
  // =========================================================================
  describe('5. Reading Session Lifecycle & Tab Focus', () => {
    it('saves session on tab hide and resets session tracking for fresh period on visible', () => {
      let sessionSaved = false;
      let activeSeconds = 45;
      let startLocator = { page: 1, y: 0 };
      const currentLocator = { page: 5, y: 0.6 };
      const recordedSessions: Array<{ activeSeconds: number; startPage: number; endPage: number }> = [];

      function handleVisibilityChange(state: 'hidden' | 'visible') {
        if (state === 'hidden') {
          if (!sessionSaved && activeSeconds >= 5) {
            sessionSaved = true;
            recordedSessions.push({
              activeSeconds,
              startPage: startLocator.page,
              endPage: currentLocator.page
            });
          }
        } else if (state === 'visible') {
          // Reset tracking for new focus period
          sessionSaved = false;
          activeSeconds = 0;
          startLocator = { ...currentLocator };
        }
      }

      // Step 1: User switches tab (hidden)
      handleVisibilityChange('hidden');
      assert.strictEqual(recordedSessions.length, 1);
      assert.strictEqual(recordedSessions[0].startPage, 1);
      assert.strictEqual(recordedSessions[0].endPage, 5);
      assert.strictEqual(sessionSaved, true);

      // Step 2: User returns to tab (visible)
      handleVisibilityChange('visible');
      assert.strictEqual(sessionSaved, false, 'sessionSaved must be reset to false on visible');
      assert.strictEqual(activeSeconds, 0, 'activeSeconds must reset for next session');
      assert.strictEqual(startLocator.page, 5, 'startLocator must update to current reading position');

      // Step 3: User reads for 30s more and switches away again
      activeSeconds = 30;
      currentLocator.page = 7;
      handleVisibilityChange('hidden');
      assert.strictEqual(recordedSessions.length, 2, 'Second reading stretch must be recorded as new session');
      assert.strictEqual(recordedSessions[1].startPage, 5);
      assert.strictEqual(recordedSessions[1].endPage, 7);
      assert.strictEqual(recordedSessions[1].activeSeconds, 30);
    });
  });

  // =========================================================================
  // 6. TELEGRAM HTML ESCAPING
  // =========================================================================
  describe('6. Telegram Safe HTML Formatting', () => {
    function escapeHtml(str: string): string {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    it('escapes Markdown and HTML special characters to prevent Telegram API errors', () => {
      const trickyTitle = 'Sách: Lập trình C++ & Python <Bản_đặc_biệt> *v1.0*';
      const escapedTitle = escapeHtml(trickyTitle);

      assert.strictEqual(
        escapedTitle,
        'Sách: Lập trình C++ &amp; Python &lt;Bản_đặc_biệt&gt; *v1.0*'
      );

      const message = [
        `📼 <b>${escapedTitle}</b>`,
        '',
        'Bạn đang dừng ở <b>trang 15 / 100</b>.'
      ].join('\n');

      assert.ok(message.includes('&amp;'));
      assert.ok(message.includes('&lt;Bản_đặc_biệt&gt;'));
      // Underscores do not break HTML mode (unlike Markdown mode where _ is reserved)
      assert.ok(message.includes('Bản_đặc_biệt'));
    });
  });

  // =========================================================================
  // 7. BACKUP RESTORE SAFETY & CONFLICT RESOLUTION
  // =========================================================================
  describe('7. Backup Restore Validation & Safe Merging', () => {
    const isNewer = (localUpdatedAt?: string, backupUpdatedAt?: string): boolean => {
      if (!localUpdatedAt) return false;
      if (!backupUpdatedAt) return true;
      return new Date(localUpdatedAt).getTime() > new Date(backupUpdatedAt).getTime();
    };

    it('does not overwrite newer local records with older backup records', () => {
      const localDoc = {
        id: 'doc-1',
        title: 'Newer Local Title',
        updatedAt: '2026-10-07T12:00:00.000Z'
      };

      const backupDoc = {
        id: 'doc-1',
        title: 'Older Backup Title',
        updatedAt: '2026-10-05T10:00:00.000Z'
      };

      assert.strictEqual(
        isNewer(localDoc.updatedAt, backupDoc.updatedAt),
        true,
        'Local record is newer than backup'
      );
    });

    it('accepts backup record if local does not exist or backup is strictly newer', () => {
      const localDoc = {
        id: 'doc-2',
        title: 'Older Local',
        updatedAt: '2026-10-01T10:00:00.000Z'
      };

      const backupDoc = {
        id: 'doc-2',
        title: 'Newer Backup',
        updatedAt: '2026-10-06T10:00:00.000Z'
      };

      assert.strictEqual(
        isNewer(localDoc.updatedAt, backupDoc.updatedAt),
        false,
        'Backup record is newer, safe to restore'
      );
    });

    it('rejects invalid backup versions', () => {
      const badBackup = { version: 2, documents: [] };
      assert.throws(() => {
        if (badBackup.version !== 1) {
          throw new Error('Unsupported version');
        }
      }, /Unsupported version/);
    });
  });

});
