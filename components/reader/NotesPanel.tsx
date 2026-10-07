'use client';

import { useState, useEffect } from 'react';
import type { LocalNote, LocalHighlight } from '@/lib/db/local';
import { localDB } from '@/lib/db/local';
import { enqueueSync } from '@/lib/sync/sync-service';

export interface ComposerTrigger {
  type: 'quick' | 'question' | 'parking';
  quote?: string | null;
  page?: number;
  y?: number;
  highlightId?: string;
  token: number;
}

interface NotesPanelProps {
  documentId: string;
  currentPage: number;
  currentY: number;
  notes: LocalNote[];
  highlights: LocalHighlight[];
  isOpen: boolean;
  onClose: () => void;
  onJumpToSource: (page: number, y: number, highlightId?: string) => void;
  onNotesChanged?: () => void;
  composerTrigger?: ComposerTrigger | null;
  initialComposerQuote?: string | null;
  initialComposerType?: 'quick' | 'question' | 'parking';
  initialComposerPage?: number;
  initialComposerY?: number;
  initialComposerHighlightId?: string;
  onClearInitialComposer?: () => void;
  onNoteMeaningfulAction?: (page: number) => void;
}

export function NotesPanel({
  documentId,
  currentPage,
  currentY,
  notes,
  highlights,
  isOpen,
  onClose,
  onJumpToSource,
  onNotesChanged,
  composerTrigger,
  initialComposerQuote,
  initialComposerType = 'quick',
  initialComposerPage,
  initialComposerY,
  initialComposerHighlightId,
  onClearInitialComposer,
  onNoteMeaningfulAction
}: NotesPanelProps) {
  const [tab, setTab] = useState<'all' | 'quick' | 'question' | 'parking'>('all');
  const [questionFilter, setQuestionFilter] = useState<'all' | 'open' | 'resolved'>('all');

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerType, setComposerType] = useState<'quick' | 'question' | 'parking'>(initialComposerType);
  const [noteText, setNoteText] = useState('');
  const [quoteText, setQuoteText] = useState('');
  const [targetPage, setTargetPage] = useState(currentPage);
  const [targetY, setTargetY] = useState(currentY);
  const [targetHighlightId, setTargetHighlightId] = useState<string | undefined>(undefined);

  // Error handling state (Requirement 13)
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit state (Requirement 14)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Resolution state
  const [resolvingNoteId, setResolvingNoteId] = useState<string | null>(null);
  const [resolutionInput, setResolutionInput] = useState('');

  // Handle composerTrigger (Requirement 4 & 5 & 6: N, Q, Selection -> Note/Question)
  useEffect(() => {
    if (!composerTrigger) return;
    setComposerType(composerTrigger.type);
    setQuoteText(composerTrigger.quote || '');
    setTargetPage(composerTrigger.page !== undefined ? composerTrigger.page : currentPage);
    setTargetY(composerTrigger.y !== undefined ? composerTrigger.y : currentY);
    setTargetHighlightId(composerTrigger.highlightId);
    setNoteText('');
    setComposerOpen(true);
    setErrorMessage(null);
  }, [composerTrigger, currentPage, currentY]);

  // Handle external quote/type triggered from reader selection (legacy/direct props)
  useEffect(() => {
    if (initialComposerQuote !== undefined && initialComposerQuote !== null) {
      setComposerType(initialComposerType);
      setQuoteText(initialComposerQuote);
      setTargetPage(initialComposerPage !== undefined ? initialComposerPage : currentPage);
      setTargetY(initialComposerY !== undefined ? initialComposerY : currentY);
      setTargetHighlightId(initialComposerHighlightId);
      setComposerOpen(true);
      setErrorMessage(null);
    }
  }, [initialComposerQuote, initialComposerType, initialComposerPage, initialComposerY, initialComposerHighlightId, currentPage, currentY]);

  // Handle Esc key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) {
      setErrorMessage('Vui lòng nhập nội dung ghi chú.');
      return;
    }
    if (!localDB) {
      setErrorMessage('Không thể kết nối cơ sở dữ liệu trên thiết bị.');
      return;
    }

    try {
      setErrorMessage(null);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      // If type is parking, archive any existing active parking note for this document (Requirement 10)
      if (composerType === 'parking') {
        const existingParkings = await localDB.notes
          .where('documentId')
          .equals(documentId)
          .filter(n => n.type === 'parking' && !!n.isActiveParking)
          .toArray();

        for (const p of existingParkings) {
          await localDB.notes.update(p.id, { isActiveParking: false, updatedAt: now });
          await enqueueSync('note', p.id, 'upsert', { ...p, isActiveParking: false, updatedAt: now });
        }
      }

      const newNote: LocalNote = {
        id,
        documentId,
        highlightId: targetHighlightId,
        type: composerType,
        noteText: noteText.trim(),
        quoteText: quoteText.trim() || undefined,
        page: targetPage,
        y: targetY,
        locator: { page: targetPage, y: targetY },
        status: composerType === 'question' ? 'open' : undefined,
        isActiveParking: composerType === 'parking',
        createdAt: now,
        updatedAt: now
      };

      await localDB.notes.add(newNote);
      await enqueueSync('note', id, 'upsert', newNote);

      // Update last meaningful activity
      await localDB.progress.update(documentId, {
        lastMeaningfulActivityAt: now,
        updatedAt: now
      });

      onNoteMeaningfulAction?.(newNote.page);
      onNotesChanged?.();

      setNoteText('');
      setQuoteText('');
      setTargetHighlightId(undefined);
      setComposerOpen(false);
      onClearInitialComposer?.();
    } catch (err: unknown) {
      console.error('Failed to create note:', err);
      // Requirement 13: Visible error alert, do NOT close composer silently!
      setErrorMessage('Lỗi khi lưu ghi chú: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Requirement 7 & 14: Edit Note
  const handleStartEdit = (note: LocalNote) => {
    setEditingNoteId(note.id);
    setEditingText(note.noteText);
    setErrorMessage(null);
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editingText.trim()) {
      setErrorMessage('Nội dung ghi chú không được để trống.');
      return;
    }
    if (!localDB) {
      setErrorMessage('Không thể kết nối cơ sở dữ liệu trên thiết bị.');
      return;
    }

    try {
      setErrorMessage(null);
      const now = new Date().toISOString();
      const existing = notes.find(n => n.id === noteId);
      if (!existing) return;

      const updated: LocalNote = {
        ...existing,
        noteText: editingText.trim(),
        updatedAt: now
      };

      await localDB.notes.update(noteId, { noteText: updated.noteText, updatedAt: now });
      await enqueueSync('note', noteId, 'upsert', updated);

      await localDB.progress.update(documentId, {
        lastMeaningfulActivityAt: now,
        updatedAt: now
      });

      onNotesChanged?.();

      setEditingNoteId(null);
      setEditingText('');
    } catch (err: unknown) {
      console.error('Failed to save edited note:', err);
      setErrorMessage('Lỗi khi cập nhật ghi chú: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Requirement 9: Resolve / reopen question
  const handleResolveQuestion = async (note: LocalNote) => {
    if (!localDB) {
      setErrorMessage('Không thể kết nối cơ sở dữ liệu trên thiết bị.');
      return;
    }

    try {
      setErrorMessage(null);
      const now = new Date().toISOString();
      const isNowResolved = note.status !== 'resolved';
      const nextStatus = isNowResolved ? 'resolved' : 'reopened';

      const updated = {
        ...note,
        status: nextStatus as 'resolved' | 'reopened',
        resolutionText: isNowResolved ? (resolutionInput.trim() || 'Đã giải quyết') : undefined,
        updatedAt: now
      };

      await localDB.notes.update(note.id, updated);
      await enqueueSync('note', note.id, 'upsert', updated);

      await localDB.progress.update(documentId, {
        lastMeaningfulActivityAt: now,
        updatedAt: now
      });

      onNoteMeaningfulAction?.(note.page);
      onNotesChanged?.();

      setResolvingNoteId(null);
      setResolutionInput('');
    } catch (err: unknown) {
      console.error('Failed to resolve question:', err);
      setErrorMessage('Lỗi khi cập nhật câu hỏi: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Requirement 8: Delete note
  const handleDeleteNote = async (id: string) => {
    if (!localDB) {
      setErrorMessage('Không thể kết nối cơ sở dữ liệu trên thiết bị.');
      return;
    }

    try {
      setErrorMessage(null);
      await localDB.notes.delete(id);
      await enqueueSync('note', id, 'delete', { id });
      onNotesChanged?.();
    } catch (err: unknown) {
      console.error('Failed to delete note:', err);
      setErrorMessage('Lỗi khi xóa ghi chú: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Filter notes
  const filteredNotes = notes.filter((n) => {
    if (tab === 'quick' && n.type !== 'quick') return false;
    if (tab === 'parking' && n.type !== 'parking') return false;
    if (tab === 'question') {
      if (n.type !== 'question') return false;
      if (questionFilter === 'open' && n.status === 'resolved') return false;
      if (questionFilter === 'resolved' && n.status !== 'resolved') return false;
    }
    return true;
  });

  const currentPageNotes = filteredNotes.filter(n => n.page === currentPage);
  const otherPageNotes = filteredNotes.filter(n => n.page !== currentPage);

  return (
    <aside
      className="notesPanel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Ghi chú & Suy nghĩ</h3>
        <button
          className="secondary"
          style={{ border: 0, fontSize: 16, padding: '2px 8px' }}
          onClick={onClose}
          title="Đóng panel"
        >
          ✕
        </button>
      </div>

      {/* Error Banner when composer is not open (Requirement 13) */}
      {errorMessage && !composerOpen && (
        <div
          role="alert"
          style={{
            background: 'var(--banner-error-bg)',
            border: '1px solid var(--banner-error-border)',
            color: 'var(--banner-error-text)',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            marginBottom: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: '0 4px' }}
            onClick={() => setErrorMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Tabs */}
      <div className="filterRow" style={{ margin: '0 0 10px 0', gap: 6 }}>
        <button
          className={`pill ${tab === 'all' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'all' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('all')}
        >
          Tất cả ({notes.length})
        </button>
        <button
          className={`pill ${tab === 'quick' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'quick' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('quick')}
        >
          Ghi chú
        </button>
        <button
          className={`pill ${tab === 'question' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'question' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('question')}
        >
          Câu hỏi
        </button>
        <button
          className={`pill ${tab === 'parking' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'parking' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('parking')}
        >
          Parking Note
        </button>
      </div>

      {/* Question Subfilter */}
      {tab === 'question' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '2px 8px', ...(questionFilter === 'all' ? { fontWeight: 700 } : {}) }}
            onClick={() => setQuestionFilter('all')}
          >
            Tất cả
          </button>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '2px 8px', ...(questionFilter === 'open' ? { fontWeight: 700, color: 'var(--rose)' } : {}) }}
            onClick={() => setQuestionFilter('open')}
          >
            Chưa giải quyết
          </button>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '2px 8px', ...(questionFilter === 'resolved' ? { fontWeight: 700, color: 'var(--olive)' } : {}) }}
            onClick={() => setQuestionFilter('resolved')}
          >
            Đã giải quyết
          </button>
        </div>
      )}

      {/* New Note Action */}
      {!composerOpen ? (
        <button
          className="primary"
          style={{ width: '100%', marginBottom: 14, fontSize: 13, padding: '8px 12px' }}
          onClick={() => {
            setComposerType('quick');
            setQuoteText('');
            setTargetPage(currentPage);
            setTargetY(currentY);
            setTargetHighlightId(undefined);
            setComposerOpen(true);
            setErrorMessage(null);
          }}
        >
          ＋ Tạo ghi chú / câu hỏi mới
        </button>
      ) : (
        /* Composer */
        <form
          onSubmit={handleCreateNote}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: 12,
            marginBottom: 14,
            display: 'grid',
            gap: 8
          }}
        >
          {/* Visible Error Banner in Composer (Requirement 13) */}
          {errorMessage && (
            <div
              role="alert"
              style={{
                background: 'var(--banner-error-bg)',
                border: '1px solid var(--banner-error-border)',
                color: 'var(--banner-error-text)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>⚠️ {errorMessage}</span>
              <button
                type="button"
                style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: '0 4px', fontSize: 13 }}
                onClick={() => setErrorMessage(null)}
              >
                ✕
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="pill"
              style={{
                fontSize: 11,
                padding: '3px 8px',
                ...(composerType === 'quick' ? { background: 'var(--sf-apricot)', color: 'white', borderColor: 'var(--sf-apricot)' } : {})
              }}
              onClick={() => setComposerType('quick')}
            >
              ✎ Quick Note
            </button>
            <button
              type="button"
              className="pill"
              style={{
                fontSize: 11,
                padding: '3px 8px',
                ...(composerType === 'question' ? { background: 'var(--sf-rose)', color: 'white', borderColor: 'var(--sf-rose)' } : {})
              }}
              onClick={() => setComposerType('question')}
            >
              ❓ Câu hỏi
            </button>
            <button
              type="button"
              className="pill"
              style={{
                fontSize: 11,
                padding: '3px 8px',
                ...(composerType === 'parking' ? { background: 'var(--sf-blue)', color: 'white', borderColor: 'var(--sf-blue)' } : {})
              }}
              onClick={() => setComposerType('parking')}
            >
              📌 Parking Note
            </button>
          </div>

          {quoteText && (
            <div
              style={{
                fontSize: 12,
                borderLeft: '3px solid var(--sf-apricot)',
                paddingLeft: 8,
                color: 'var(--muted)',
                maxHeight: 60,
                overflow: 'hidden'
              }}
            >
              “{quoteText}”
            </div>
          )}

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={
              composerType === 'parking'
                ? 'Lần sau mình cần tiếp tục từ đâu? (Parking Note)'
                : composerType === 'question'
                ? 'Điều gì chưa hiểu? Cần làm rõ gì?'
                : 'Suy nghĩ tức thời…'
            }
            rows={3}
            autoFocus
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--line)',
              padding: 8,
              fontSize: 13,
              fontFamily: 'inherit'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 11 }}>Trang {targetPage}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="secondary"
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={() => {
                  setComposerOpen(false);
                  onClearInitialComposer?.();
                }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="primary"
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  background:
                    composerType === 'parking'
                      ? 'var(--sf-mint)'
                      : composerType === 'question'
                      ? 'var(--sf-coral)'
                      : 'var(--sf-mint-strong)',
                  color: 'white',
                  border: 0
                }}
              >
                Lưu
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Note List */}
      <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, display: 'grid', gap: 10 }}>
        {/* Current page section */}
        {currentPageNotes.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Ghi chú trang hiện tại ({currentPageNotes.length})</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {currentPageNotes.map((note) => renderNoteCard(note))}
            </div>
          </div>
        )}

        {/* Other pages section */}
        {otherPageNotes.length > 0 && (
          <div style={{ marginTop: currentPageNotes.length > 0 ? 12 : 0 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Các trang khác ({otherPageNotes.length})</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {otherPageNotes.map((note) => renderNoteCard(note))}
            </div>
          </div>
        )}

        {filteredNotes.length === 0 && (
          <div className="emptyState" style={{ padding: 20 }}>
            Chưa có ghi chú nào trong mục này.
          </div>
        )}
      </div>
    </aside>
  );

  function renderNoteCard(note: LocalNote) {
    const isParking = note.type === 'parking';
    const isQuestion = note.type === 'question';
    const isResolved = note.status === 'resolved';
    const isEditing = editingNoteId === note.id;

    const indicatorColor = isParking
      ? 'var(--sf-mint)'
      : isQuestion
      ? (isResolved ? 'var(--sf-mint-strong)' : 'var(--sf-coral)')
      : 'var(--sf-mint-strong)';

    return (
      <div
        key={note.id}
        className="card"
        style={{
          padding: 12,
          display: 'grid',
          gap: 6,
          background: 'var(--sf-surface)',
          border: '1px solid var(--sf-line)',
          borderLeft: `4px solid ${indicatorColor}`,
          borderRadius: 12,
          boxShadow: 'var(--sf-shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => onJumpToSource(note.page, note.y, note.highlightId)}
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              color: isParking ? 'var(--sf-mint-strong)' : indicatorColor,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            Trang {note.page} → Nhảy tới
          </button>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {isParking && note.isActiveParking && (
              <span
                style={{
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: 'var(--sf-mint-soft)',
                  color: 'var(--sf-mint-strong)',
                  border: '1px solid var(--sf-mint)'
                }}
              >
                Active Parking
              </span>
            )}
            {isQuestion && (
              <span
                style={{
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: isResolved ? 'var(--sf-mint-soft)' : 'var(--sf-coral-soft)',
                  color: isResolved ? 'var(--sf-mint-strong)' : 'var(--sf-coral)',
                  border: `1px solid ${isResolved ? 'var(--sf-mint)' : 'var(--sf-coral)'}`
                }}
              >
                {isResolved ? '✓ Đã giải quyết' : '❓ Chưa giải quyết'}
              </span>
            )}
            {/* Edit button (Requirement 14) */}
            <button
              className="secondary"
              style={{ border: 0, padding: '2px 6px', fontSize: 11 }}
              onClick={() => handleStartEdit(note)}
              title="Chỉnh sửa ghi chú"
            >
              ✎ Sửa
            </button>
            <button
              className="secondary danger"
              style={{ border: 0, padding: '2px 4px', fontSize: 11 }}
              onClick={() => handleDeleteNote(note.id)}
              title="Xóa ghi chú"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Linked Highlight Quote */}
        {note.quoteText && (
          <div
            className="noteQuote"
            style={{
              fontSize: 12,
              fontStyle: 'italic',
              cursor: 'pointer'
            }}
            onClick={() => onJumpToSource(note.page, note.y, note.highlightId)}
            title="Bấm để nhảy tới trích dẫn này trên trang sách"
          >
            “{note.quoteText}”
          </div>
        )}

        {/* Note Body (Editable) */}
        {isEditing ? (
          <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
            <textarea
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                borderRadius: 6,
                border: '1px solid var(--line)',
                padding: 6,
                fontSize: 13,
                fontFamily: 'inherit'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button
                type="button"
                className="secondary"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setEditingNoteId(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="primary"
                style={{ fontSize: 11, padding: '2px 10px' }}
                onClick={() => handleSaveEdit(note.id)}
              >
                Lưu
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
            {note.noteText}
          </div>
        )}

        {/* Resolution section for Questions */}
        {isQuestion && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--line)' }}>
            {resolvingNoteId === note.id ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Ghi chú giải đáp (tùy chọn)…"
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                    fontSize: 12
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    className="secondary"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setResolvingNoteId(null)}
                  >
                    Hủy
                  </button>
                  <button
                    className="primary"
                    style={{ fontSize: 11, padding: '2px 10px', background: 'var(--olive)' }}
                    onClick={() => handleResolveQuestion(note)}
                  >
                    Xác nhận giải quyết
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {isResolved && note.resolutionText && (
                  <span className="muted" style={{ fontSize: 11, fontStyle: 'italic' }}>
                    Giải đáp: “{note.resolutionText}”
                  </span>
                )}
                <button
                  className="secondary"
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    marginLeft: 'auto',
                    color: isResolved ? 'var(--muted)' : 'var(--olive)'
                  }}
                  onClick={() => {
                    if (isResolved) {
                      handleResolveQuestion(note);
                    } else {
                      setResolvingNoteId(note.id);
                      setResolutionInput('');
                    }
                  }}
                >
                  {isResolved ? '↩ Mở lại câu hỏi' : '✓ Đánh dấu đã giải đáp'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
