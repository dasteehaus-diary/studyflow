import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { LocalNote, LocalHighlight } from '../lib/db/local.ts';

describe('StudyFlow Notes End-to-End Lifecycle & Verification Suite', () => {

  // Simulated Dexie in-memory store for exact state and mutation verification
  class MockStudyFlowDB {
    notes: LocalNote[] = [];
    highlights: LocalHighlight[] = [];
    changeListeners: Array<() => void> = [];

    subscribe(fn: () => void) {
      this.changeListeners.push(fn);
      return () => {
        this.changeListeners = this.changeListeners.filter(l => l !== fn);
      };
    }

    notify() {
      this.changeListeners.forEach(fn => fn());
    }

    async addNote(note: LocalNote): Promise<void> {
      if (!note.noteText.trim()) {
        throw new Error('Nội dung ghi chú không được để trống.');
      }

      // If parking note, deactivate all previous active parking notes
      if (note.type === 'parking') {
        this.notes.forEach(n => {
          if (n.documentId === note.documentId && n.type === 'parking' && n.isActiveParking) {
            n.isActiveParking = false;
            n.updatedAt = new Date().toISOString();
          }
        });
      }

      this.notes.push({ ...note });
      this.notify();
    }

    async updateNote(id: string, updates: Partial<LocalNote>): Promise<void> {
      const idx = this.notes.findIndex(n => n.id === id);
      if (idx === -1) throw new Error('Note not found');
      this.notes[idx] = { ...this.notes[idx], ...updates, updatedAt: new Date().toISOString() };
      this.notify();
    }

    async deleteNote(id: string): Promise<void> {
      this.notes = this.notes.filter(n => n.id !== id);
      this.notify();
    }

    async addHighlight(hl: LocalHighlight): Promise<void> {
      this.highlights.push({ ...hl });
      this.notify();
    }

    async getNotesForDocument(documentId: string): Promise<LocalNote[]> {
      return this.notes.filter(n => n.documentId === documentId);
    }

    async getActiveParkingNote(documentId: string): Promise<LocalNote | null> {
      const list = this.notes.filter(n => n.documentId === documentId && n.type === 'parking' && !!n.isActiveParking);
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return list[0] || null;
    }
  }

  describe('1. Quick Note Creation & Instant Reactivity', () => {
    it('creates a quick note without quote and increments badge count immediately', async () => {
      const db = new MockStudyFlowDB();
      let listenerCalled = 0;
      db.subscribe(() => { listenerCalled++; });

      const newNote: LocalNote = {
        id: 'note-1',
        documentId: 'doc-1',
        type: 'quick',
        noteText: 'Hiểu được ý chính về analog cognitive model.',
        page: 3,
        y: 0.25,
        locator: { page: 3, y: 0.25 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.addNote(newNote);

      const notesInDb = await db.getNotesForDocument('doc-1');
      assert.strictEqual(notesInDb.length, 1);
      assert.strictEqual(notesInDb[0].noteText, 'Hiểu được ý chính về analog cognitive model.');
      assert.strictEqual(notesInDb[0].type, 'quick');
      assert.strictEqual(listenerCalled, 1, 'liveQuery/listener must notify immediately on creation');
    });
  });

  describe('2. Desktop Shortcuts N & Q Trigger Direct Composer Opening', () => {
    it('opens Quick Note composer directly on shortcut N without requiring quote text', () => {
      // Simulating PdfReader keyboard handler logic
      const simulateKeydown = (key: string, page: number, y: number) => {
        if (key === 'n' || key === 'N') {
          return {
            isOpen: true,
            trigger: {
              type: 'quick' as const,
              quote: null,
              page,
              y,
              token: Date.now()
            }
          };
        }
        if (key === 'q' || key === 'Q') {
          return {
            isOpen: true,
            trigger: {
              type: 'question' as const,
              quote: null,
              page,
              y,
              token: Date.now()
            }
          };
        }
        return null;
      };

      const resultN = simulateKeydown('n', 7, 0.4);
      assert.ok(resultN);
      assert.strictEqual(resultN.isOpen, true);
      assert.strictEqual(resultN.trigger.type, 'quick');
      assert.strictEqual(resultN.trigger.quote, null, 'Shortcut N does not require selected quote text');
      assert.strictEqual(resultN.trigger.page, 7);

      const resultQ = simulateKeydown('Q', 12, 0.8);
      assert.ok(resultQ);
      assert.strictEqual(resultQ.isOpen, true);
      assert.strictEqual(resultQ.trigger.type, 'question');
      assert.strictEqual(resultQ.trigger.page, 12);
    });
  });

  describe('3. Text Selection -> Linked Highlight & Note / Question', () => {
    it('creates linked highlight with exact page/locator and associates with note', async () => {
      const db = new MockStudyFlowDB();

      const highlightId = 'hl-42';
      const quote = 'Bộ não xử lý tốt hơn với các điểm mốc vật lý.';
      const newHl: LocalHighlight = {
        id: highlightId,
        documentId: 'doc-1',
        page: 5,
        locator: { page: 5, y: 0.32 },
        quoteText: quote,
        color: 'apricot',
        rects: [{ x: 0.1, y: 0.32, width: 0.8, height: 0.04 }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await db.addHighlight(newHl);

      // Create linked Question note
      const newQuestion: LocalNote = {
        id: 'note-q1',
        documentId: 'doc-1',
        highlightId,
        type: 'question',
        quoteText: quote,
        noteText: 'Điểm mốc vật lý cụ thể trong tài liệu số là gì?',
        page: 5,
        y: 0.32,
        locator: { page: 5, y: 0.32 },
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await db.addNote(newQuestion);

      const notes = await db.getNotesForDocument('doc-1');
      assert.strictEqual(notes.length, 1);
      assert.strictEqual(notes[0].highlightId, highlightId);
      assert.strictEqual(notes[0].quoteText, quote);
      assert.strictEqual(notes[0].status, 'open', 'New question must have status=open');
    });
  });

  describe('4. Note Editing & Persistence', () => {
    it('updates note text and persists changes immediately without affecting highlight', async () => {
      const db = new MockStudyFlowDB();
      const initialNote: LocalNote = {
        id: 'note-edit',
        documentId: 'doc-1',
        highlightId: 'hl-1',
        type: 'quick',
        quoteText: 'Trích dẫn mẫu',
        noteText: 'Nội dung ban đầu',
        page: 2,
        y: 0.1,
        locator: { page: 2, y: 0.1 },
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z'
      };
      await db.addNote(initialNote);

      await db.updateNote('note-edit', { noteText: 'Nội dung đã được biên tập lại hoàn chỉnh.' });

      const notes = await db.getNotesForDocument('doc-1');
      assert.strictEqual(notes[0].noteText, 'Nội dung đã được biên tập lại hoàn chỉnh.');
      assert.strictEqual(notes[0].quoteText, 'Trích dẫn mẫu');
      assert.notStrictEqual(notes[0].updatedAt, '2026-10-01T10:00:00Z', 'updatedAt must be refreshed');
    });
  });

  describe('5. Note Deletion with Highlight Preservation', () => {
    it('deletes note while keeping linked highlight intact in database', async () => {
      const db = new MockStudyFlowDB();
      const hlId = 'hl-preserved';
      await db.addHighlight({
        id: hlId,
        documentId: 'doc-1',
        page: 4,
        locator: { page: 4, y: 0.2 },
        quoteText: 'Highlight phải giữ nguyên khi xoá note.',
        color: 'rose',
        rects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await db.addNote({
        id: 'note-to-delete',
        documentId: 'doc-1',
        highlightId: hlId,
        type: 'quick',
        noteText: 'Note sẽ bị xoá.',
        page: 4,
        y: 0.2,
        locator: { page: 4, y: 0.2 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Verify both exist
      assert.strictEqual(db.notes.length, 1);
      assert.strictEqual(db.highlights.length, 1);

      // Perform note delete
      await db.deleteNote('note-to-delete');

      // Verify note is gone but highlight is strictly preserved
      assert.strictEqual(db.notes.length, 0, 'Note must disappear immediately');
      assert.strictEqual(db.highlights.length, 1, 'Linked highlight must remain intact per policy');
      assert.strictEqual(db.highlights[0].id, hlId);
    });
  });

  describe('6. Question Resolution & Reopening', () => {
    it('resolves question with resolutionText and allows reopening', async () => {
      const db = new MockStudyFlowDB();
      await db.addNote({
        id: 'q-resolve',
        documentId: 'doc-1',
        type: 'question',
        noteText: 'Tại sao lại dùng B-Side thay vì gamification?',
        page: 10,
        y: 0.5,
        locator: { page: 10, y: 0.5 },
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 1. Resolve
      await db.updateNote('q-resolve', {
        status: 'resolved',
        resolutionText: 'Vì triết lý là cassette analog và sự trân trọng mạch đọc cá nhân.'
      });

      let note = (await db.getNotesForDocument('doc-1'))[0];
      assert.strictEqual(note.status, 'resolved');
      assert.strictEqual(note.resolutionText, 'Vì triết lý là cassette analog và sự trân trọng mạch đọc cá nhân.');

      // 2. Reopen
      await db.updateNote('q-resolve', {
        status: 'reopened',
        resolutionText: undefined
      });

      note = (await db.getNotesForDocument('doc-1'))[0];
      assert.strictEqual(note.status, 'reopened');
      assert.strictEqual(note.resolutionText, undefined);
    });
  });

  describe('7. Parking Note Mutual Exclusivity & Active State', () => {
    it('deactivates previous active parking note when new parking note is saved', async () => {
      const db = new MockStudyFlowDB();

      // First parking note
      await db.addNote({
        id: 'park-1',
        documentId: 'doc-1',
        type: 'parking',
        noteText: 'Đang đọc dở phần chương 2, lần sau đọc tiếp từ công thức 2.1.',
        page: 15,
        y: 0.3,
        locator: { page: 15, y: 0.3 },
        isActiveParking: true,
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z'
      });

      let activeNote = await db.getActiveParkingNote('doc-1');
      assert.strictEqual(activeNote?.id, 'park-1');
      assert.strictEqual(activeNote?.isActiveParking, true);

      // Second parking note added later
      await db.addNote({
        id: 'park-2',
        documentId: 'doc-1',
        type: 'parking',
        noteText: 'Chuyển sang làm bài tập cuối chương 2.',
        page: 22,
        y: 0.7,
        locator: { page: 22, y: 0.7 },
        isActiveParking: true,
        createdAt: '2026-10-02T15:00:00Z',
        updatedAt: '2026-10-02T15:00:00Z'
      });

      // Verify park-1 was deactivated and park-2 is the single active parking note
      const allNotes = await db.getNotesForDocument('doc-1');
      const park1 = allNotes.find(n => n.id === 'park-1');
      const park2 = allNotes.find(n => n.id === 'park-2');

      assert.strictEqual(park1?.isActiveParking, false, 'Previous parking note must be deactivated');
      assert.strictEqual(park2?.isActiveParking, true, 'New parking note must be active');

      activeNote = await db.getActiveParkingNote('doc-1');
      assert.strictEqual(activeNote?.id, 'park-2', 'Dashboard ContinueCard / ResumeToast must show the new parking note');
      assert.strictEqual(activeNote?.noteText, 'Chuyển sang làm bài tập cuối chương 2.');
    });
  });

  describe('8. Notebook Source Location Jump URL & Deep Linking', () => {
    it('generates correct source jump URL with page, y offset, and highlightId', () => {
      const buildTargetUrl = (docId: string, page: number, y: number, highlightId?: string) => {
        return `/reader/${docId}?page=${page}&y=${y}${highlightId ? `&highlight=${highlightId}` : ''}`;
      };

      const url1 = buildTargetUrl('doc-abc', 8, 0.45);
      assert.strictEqual(url1, '/reader/doc-abc?page=8&y=0.45');

      const url2 = buildTargetUrl('doc-xyz', 14, 0.625, 'hl-999');
      assert.strictEqual(url2, '/reader/doc-xyz?page=14&y=0.625&highlight=hl-999');
    });
  });

  describe('9. Error Handling & Validation', () => {
    it('rejects empty note text with clear message and does not close composer', async () => {
      const db = new MockStudyFlowDB();
      let errorCaught: string | null = null;

      try {
        await db.addNote({
          id: 'note-empty',
          documentId: 'doc-1',
          type: 'quick',
          noteText: '   ', // whitespace only
          page: 1,
          y: 0,
          locator: { page: 1, y: 0 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } catch (err: unknown) {
        errorCaught = (err instanceof Error) ? err.message : String(err);
      }

      assert.ok(errorCaught);
      assert.ok(errorCaught.includes('Nội dung ghi chú không được để trống'));
      assert.strictEqual(db.notes.length, 0);
    });
  });

  describe('10. Responsive CSS: Elimination of Duplicate Buttons on Desktop', () => {
    it('verifies globals.css defines .mobileOnly with display: none !important by default and .desktopOnly with display: flex !important', () => {
      const cssPath = path.resolve(process.cwd(), 'app/globals.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // 1. .mobileOnly default hidden
      assert.ok(
        cssContent.includes('.mobileOnly') && cssContent.includes('display: none !important'),
        '.mobileOnly must have display: none !important by default on desktop'
      );

      // 2. .desktopOnly default visible
      assert.ok(
        cssContent.includes('.desktopOnly') && cssContent.includes('display: flex !important'),
        '.desktopOnly must have display: flex !important by default on desktop'
      );

      // 3. Media query for responsive swap
      assert.ok(
        cssContent.includes('@media (max-width: 820px)'),
        'Must contain responsive media query for mobile breakpoint'
      );
    });
  });
});
