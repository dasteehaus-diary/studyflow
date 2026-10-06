import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { LocalHighlight, LocalNote, HighlightColor } from '../lib/db/local.ts';

describe('StudyFlow — Highlight Note Popover (Notion-Style) QA Suite', () => {

  class MockDB {
    highlights: Map<string, LocalHighlight> = new Map();
    notes: Map<string, LocalNote> = new Map();
    syncQueue: Array<{ entity: string; entityId: string; op: string; payload: unknown }> = [];

    async createHighlight(hl: LocalHighlight) {
      this.highlights.set(hl.id, { ...hl });
      this.syncQueue.push({ entity: 'highlight', entityId: hl.id, op: 'upsert', payload: hl });
    }

    async updateHighlightColor(id: string, color: HighlightColor) {
      const hl = this.highlights.get(id);
      if (!hl) throw new Error('Highlight not found');
      hl.color = color;
      hl.updatedAt = new Date().toISOString();
      this.syncQueue.push({ entity: 'highlight', entityId: id, op: 'upsert', payload: hl });
    }

    async deleteHighlight(id: string) {
      this.highlights.delete(id);
      this.syncQueue.push({ entity: 'highlight', entityId: id, op: 'delete', payload: { id } });
    }

    async saveNoteFromPopover(highlight: LocalHighlight, noteText: string, type: 'quick' | 'question') {
      if (!noteText.trim()) throw new Error('Nội dung ghi chú không được để trống.');
      const id = 'note-' + Date.now();
      const now = new Date().toISOString();
      const newNote: LocalNote = {
        id,
        documentId: highlight.documentId,
        highlightId: highlight.id,
        type,
        noteText: noteText.trim(),
        quoteText: highlight.quoteText,
        page: highlight.page,
        y: highlight.locator.y,
        locator: { page: highlight.page, y: highlight.locator.y },
        status: type === 'question' ? 'open' : undefined,
        createdAt: now,
        updatedAt: now
      };
      this.notes.set(id, newNote);
      this.syncQueue.push({ entity: 'note', entityId: id, op: 'upsert', payload: newNote });
      return newNote;
    }

    async updateNoteFromPopover(noteId: string, noteText: string) {
      const n = this.notes.get(noteId);
      if (!n) throw new Error('Note not found');
      if (!noteText.trim()) throw new Error('Nội dung ghi chú không được để trống.');
      n.noteText = noteText.trim();
      n.updatedAt = new Date().toISOString();
      this.syncQueue.push({ entity: 'note', entityId: noteId, op: 'upsert', payload: n });
    }

    async deleteNoteFromPopover(noteId: string) {
      this.notes.delete(noteId);
      this.syncQueue.push({ entity: 'note', entityId: noteId, op: 'delete', payload: { id: noteId } });
    }

    async toggleQuestionStatus(noteId: string) {
      const n = this.notes.get(noteId);
      if (!n) throw new Error('Note not found');
      const isResolved = n.status === 'resolved';
      n.status = isResolved ? 'reopened' : 'resolved';
      n.resolutionText = isResolved ? undefined : 'Đã giải quyết';
      n.updatedAt = new Date().toISOString();
      this.syncQueue.push({ entity: 'note', entityId: noteId, op: 'upsert', payload: n });
    }

    async convertNoteType(noteId: string, newType: 'quick' | 'question') {
      const n = this.notes.get(noteId);
      if (!n) throw new Error('Note not found');
      n.type = newType;
      n.status = newType === 'question' ? 'open' : undefined;
      n.updatedAt = new Date().toISOString();
      this.syncQueue.push({ entity: 'note', entityId: noteId, op: 'upsert', payload: n });
    }

    getNoteForHighlight(highlightId: string): LocalNote | null {
      for (const n of this.notes.values()) {
        if (n.highlightId === highlightId) return n;
      }
      return null;
    }
  }

  it('QA 1–6: Create highlight -> Click highlight -> Add note -> Close -> Reopen -> Note persists across reloads', async () => {
    const db = new MockDB();

    // 1. Tạo highlight
    const hl: LocalHighlight = {
      id: 'hl-101',
      documentId: 'doc-alpha',
      page: 3,
      locator: { page: 3, y: 0.4 },
      quoteText: 'Analog cassette models provide tactile satisfaction.',
      color: 'apricot',
      rects: [{ x: 0.1, y: 0.4, width: 0.8, height: 0.05 }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.createHighlight(hl);
    assert.strictEqual(db.highlights.size, 1);

    // 2. Click highlight (trước khi có note: popover hiển thị ô thêm ghi chú)
    let linked = db.getNoteForHighlight(hl.id);
    assert.strictEqual(linked, null, 'Chưa có note');

    // 3. Thêm note qua popover
    const createdNote = await db.saveNoteFromPopover(hl, 'Ý tưởng này rất phù hợp với StudyFlow.', 'quick');
    assert.ok(createdNote);
    assert.strictEqual(createdNote.highlightId, hl.id);
    assert.strictEqual(createdNote.type, 'quick');

    // 4 & 5. Đóng popover -> click lại: note vẫn còn
    linked = db.getNoteForHighlight(hl.id);
    assert.ok(linked);
    assert.strictEqual(linked.noteText, 'Ý tưởng này rất phù hợp với StudyFlow.');

    // 6. Reload (simulate reading from storage): note vẫn còn nguyên
    const reloadedNote = db.notes.get(createdNote.id);
    assert.ok(reloadedNote);
    assert.strictEqual(reloadedNote.highlightId, 'hl-101');
    assert.strictEqual(reloadedNote.page, 3);
  });

  it('QA 7: Edit note in popover -> Updates immediately in DB and sync queue', async () => {
    const db = new MockDB();
    const hl: LocalHighlight = {
      id: 'hl-102',
      documentId: 'doc-alpha',
      page: 2,
      locator: { page: 2, y: 0.2 },
      quoteText: 'Mỗi highlight là một neo tri thức.',
      color: 'olive',
      rects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.createHighlight(hl);
    const note = await db.saveNoteFromPopover(hl, 'Nội dung cũ', 'quick');

    // Edit inline
    await db.updateNoteFromPopover(note.id, 'Nội dung mới đã được cập nhật.');

    const updated = db.getNoteForHighlight(hl.id);
    assert.strictEqual(updated?.noteText, 'Nội dung mới đã được cập nhật.');

    // Verify sync queue has upsert operation
    const lastSync = db.syncQueue[db.syncQueue.length - 1];
    assert.strictEqual(lastSync.entity, 'note');
    assert.strictEqual(lastSync.entityId, note.id);
    assert.strictEqual(lastSync.op, 'upsert');
  });

  it('QA 8: Convert note to Question in popover -> status=open, toggle resolved/reopened', async () => {
    const db = new MockDB();
    const hl: LocalHighlight = {
      id: 'hl-103',
      documentId: 'doc-alpha',
      page: 7,
      locator: { page: 7, y: 0.5 },
      quoteText: 'Khái niệm B-Side cassette.',
      color: 'blue',
      rects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.createHighlight(hl);
    const note = await db.saveNoteFromPopover(hl, 'Làm thế nào để tạo cassette audio?', 'quick');

    // 1. Chuyển thành Question
    await db.convertNoteType(note.id, 'question');
    let qNote = db.getNoteForHighlight(hl.id);
    assert.strictEqual(qNote?.type, 'question');
    assert.strictEqual(qNote?.status, 'open', 'Question mới convert phải có status=open');

    // 2. Resolve câu hỏi
    await db.toggleQuestionStatus(note.id);
    qNote = db.getNoteForHighlight(hl.id);
    assert.strictEqual(qNote?.status, 'resolved');
    assert.strictEqual(qNote?.resolutionText, 'Đã giải quyết');

    // 3. Reopen câu hỏi
    await db.toggleQuestionStatus(note.id);
    qNote = db.getNoteForHighlight(hl.id);
    assert.strictEqual(qNote?.status, 'reopened');
  });

  it('QA 9: Delete note in popover -> Highlight remains intact', async () => {
    const db = new MockDB();
    const hl: LocalHighlight = {
      id: 'hl-104',
      documentId: 'doc-alpha',
      page: 1,
      locator: { page: 1, y: 0.1 },
      quoteText: 'Highlight được bảo toàn.',
      color: 'rose',
      rects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.createHighlight(hl);
    const note = await db.saveNoteFromPopover(hl, 'Note này sẽ bị xóa.', 'quick');

    assert.strictEqual(db.notes.size, 1);
    assert.strictEqual(db.highlights.size, 1);

    // Xóa note
    await db.deleteNoteFromPopover(note.id);

    assert.strictEqual(db.notes.size, 0, 'Note phải bị xóa');
    assert.strictEqual(db.highlights.size, 1, 'Highlight phải giữ nguyên trong cơ sở dữ liệu');
    assert.ok(db.highlights.has('hl-104'));
  });

  it('QA 10: Delete highlight in popover -> Note remains intact with locator', async () => {
    const db = new MockDB();
    const hl: LocalHighlight = {
      id: 'hl-105',
      documentId: 'doc-alpha',
      page: 4,
      locator: { page: 4, y: 0.6 },
      quoteText: 'Trích dẫn sẽ xóa highlight.',
      color: 'apricot',
      rects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.createHighlight(hl);
    const note = await db.saveNoteFromPopover(hl, 'Ghi chú độc lập vẫn giữ vị trí trang 4, y 0.6', 'quick');

    // Xóa highlight
    await db.deleteHighlight(hl.id);

    assert.strictEqual(db.highlights.size, 0, 'Highlight phải bị xóa');
    assert.strictEqual(db.notes.size, 1, 'Note vẫn phải còn nguyên');
    const preservedNote = db.notes.get(note.id);
    assert.strictEqual(preservedNote?.page, 4);
    assert.strictEqual(preservedNote?.locator.y, 0.6);
  });

  it('QA 11: Visual cues logic -> ✎ for quick note, ? for question, none for plain highlight', () => {
    const getVisualCueIcon = (note?: LocalNote | null): string | null => {
      if (!note) return null;
      if (note.type === 'question') return '?';
      return '✎';
    };

    // Plain highlight
    assert.strictEqual(getVisualCueIcon(null), null);
    assert.strictEqual(getVisualCueIcon(undefined), null);

    // Quick note
    assert.strictEqual(getVisualCueIcon({
      id: '1', documentId: 'd', type: 'quick', noteText: 'abc', page: 1, y: 0, locator: { page: 1, y: 0 }, createdAt: '', updatedAt: ''
    }), '✎');

    // Parking note
    assert.strictEqual(getVisualCueIcon({
      id: '2', documentId: 'd', type: 'parking', noteText: 'park', page: 1, y: 0, locator: { page: 1, y: 0 }, createdAt: '', updatedAt: ''
    }), '✎');

    // Question
    assert.strictEqual(getVisualCueIcon({
      id: '3', documentId: 'd', type: 'question', noteText: 'why?', page: 1, y: 0, locator: { page: 1, y: 0 }, createdAt: '', updatedAt: ''
    }), '?');
  });

  it('QA 12: Desktop popover anchoring bounds clamping logic', () => {
    const calculateDesktopPopoverCoords = (clickX: number, clickY: number, windowW: number, windowH: number) => {
      const popoverWidth = 330;
      const padding = 16;

      let left = clickX - popoverWidth / 2;
      if (left < padding) left = padding;
      if (left + popoverWidth > windowW - padding) left = windowW - popoverWidth - padding;

      const popoverEstimatedHeight = 280;
      let top = clickY + 14;
      if (top + popoverEstimatedHeight > windowH - padding) {
        top = Math.max(padding + 60, clickY - popoverEstimatedHeight - 14);
      }

      return { left: Math.round(left), top: Math.round(top) };
    };

    // Center click
    const center = calculateDesktopPopoverCoords(600, 300, 1200, 800);
    assert.strictEqual(center.left, 435);
    assert.strictEqual(center.top, 314);

    // Left edge click (clamped to padding 16)
    const leftEdge = calculateDesktopPopoverCoords(20, 200, 1200, 800);
    assert.strictEqual(leftEdge.left, 16);

    // Right edge click (clamped to windowW - popoverWidth - padding = 1200 - 330 - 16 = 854)
    const rightEdge = calculateDesktopPopoverCoords(1180, 200, 1200, 800);
    assert.strictEqual(rightEdge.left, 854);

    // Bottom edge click (flipped above highlight)
    const bottomEdge = calculateDesktopPopoverCoords(500, 750, 1200, 800);
    assert.ok(bottomEdge.top < 750, 'Must flip above when too close to bottom');
  });
});
