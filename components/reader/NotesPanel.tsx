'use client';

import { useState, useEffect } from 'react';
import type { LocalNote, LocalHighlight } from '@/lib/db/local';
import { localDB } from '@/lib/db/local';
import { enqueueSync } from '@/lib/sync/sync-service';

interface NotesPanelProps {
  documentId: string;
  currentPage: number;
  currentY: number;
  notes: LocalNote[];
  highlights: LocalHighlight[];
  isOpen: boolean;
  onClose: () => void;
  onJumpToSource: (page: number, y: number, highlightId?: string) => void;
  initialComposerQuote?: string | null;
  initialComposerType?: 'quick' | 'question' | 'parking';
  onClearInitialComposer?: () => void;
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
  initialComposerQuote,
  initialComposerType = 'quick',
  onClearInitialComposer
}: NotesPanelProps) {
  const [tab, setTab] = useState<'all' | 'quick' | 'question' | 'parking'>('all');
  const [questionFilter, setQuestionFilter] = useState<'all' | 'open' | 'resolved'>('all');

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerType, setComposerType] = useState<'quick' | 'question' | 'parking'>(initialComposerType);
  const [noteText, setNoteText] = useState('');
  const [quoteText, setQuoteText] = useState('');
  const [targetPage, setTargetPage] = useState(currentPage);

  // Resolution state
  const [resolvingNoteId, setResolvingNoteId] = useState<string | null>(null);
  const [resolutionInput, setResolutionInput] = useState('');

  // Handle external quote/type triggered from reader selection
  useEffect(() => {
    if (initialComposerQuote !== undefined && initialComposerQuote !== null) {
      setComposerType(initialComposerType);
      setQuoteText(initialComposerQuote);
      setTargetPage(currentPage);
      setComposerOpen(true);
    }
  }, [initialComposerQuote, initialComposerType, currentPage]);

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
    if (!localDB || !noteText.trim()) return;

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // If type is parking, archive any existing active parking note for this document
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
      type: composerType,
      noteText: noteText.trim(),
      quoteText: quoteText.trim() || undefined,
      page: targetPage,
      y: currentY,
      locator: { page: targetPage, y: currentY },
      status: composerType === 'question' ? 'open' : undefined,
      isActiveParking: composerType === 'parking' ? true : false,
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

    setNoteText('');
    setQuoteText('');
    setComposerOpen(false);
    onClearInitialComposer?.();
  };

  const handleResolveQuestion = async (note: LocalNote) => {
    if (!localDB) return;
    const now = new Date().toISOString();
    const isNowResolved = note.status !== 'resolved';
    const nextStatus = isNowResolved ? 'resolved' : 'reopened';

    const updated = {
      ...note,
      status: nextStatus as 'resolved' | 'reopened',
      resolutionText: isNowResolved ? (resolutionInput.trim() || 'Resolved') : undefined,
      updatedAt: now
    };

    await localDB.notes.update(note.id, updated);
    await enqueueSync('note', note.id, 'upsert', updated);

    await localDB.progress.update(documentId, {
      lastMeaningfulActivityAt: now,
      updatedAt: now
    });

    setResolvingNoteId(null);
    setResolutionInput('');
  };

  const handleDeleteNote = async (id: string) => {
    if (!localDB) return;
    await localDB.notes.delete(id);
    await enqueueSync('note', id, 'delete', { id });
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
    <aside className="notesPanel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Notes & Thoughts</div>
          <strong style={{ fontSize: 16 }}>Trang {currentPage}</strong>
        </div>
        <button
          className="secondary"
          style={{ fontSize: 12, padding: '4px 8px' }}
          onClick={onClose}
          aria-label="Đóng panel"
        >
          ✕ Esc
        </button>
      </div>

      {/* Tabs */}
      <div className="filterRow" style={{ marginBottom: 10, gap: 4 }}>
        <button
          className={`pill ${tab === 'all' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'all' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('all')}
        >
          All ({notes.length})
        </button>
        <button
          className={`pill ${tab === 'quick' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'quick' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('quick')}
        >
          Notes
        </button>
        <button
          className={`pill ${tab === 'question' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'question' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('question')}
        >
          Questions
        </button>
        <button
          className={`pill ${tab === 'parking' ? 'activePill' : ''}`}
          style={{ fontSize: 11, padding: '4px 10px', ...(tab === 'parking' ? { background: 'var(--deep)', color: 'white' } : {}) }}
          onClick={() => setTab('parking')}
        >
          Parking
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
            All
          </button>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '2px 8px', ...(questionFilter === 'open' ? { fontWeight: 700, color: 'var(--rose)' } : {}) }}
            onClick={() => setQuestionFilter('open')}
          >
            Open
          </button>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '2px 8px', ...(questionFilter === 'resolved' ? { fontWeight: 700, color: 'var(--olive)' } : {}) }}
            onClick={() => setQuestionFilter('resolved')}
          >
            Resolved
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
            setComposerOpen(true);
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
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="pill"
              style={{ fontSize: 11, padding: '3px 8px', ...(composerType === 'quick' ? { background: 'var(--deep)', color: 'white' } : {}) }}
              onClick={() => setComposerType('quick')}
            >
              ✎ Quick Note
            </button>
            <button
              type="button"
              className="pill"
              style={{ fontSize: 11, padding: '3px 8px', ...(composerType === 'question' ? { background: 'var(--rose)', color: 'white' } : {}) }}
              onClick={() => setComposerType('question')}
            >
              ❓ Question
            </button>
            <button
              type="button"
              className="pill"
              style={{ fontSize: 11, padding: '3px 8px', ...(composerType === 'parking' ? { background: 'var(--terracotta)', color: 'white' } : {}) }}
              onClick={() => setComposerType('parking')}
            >
              📌 Parking Note
            </button>
          </div>

          {quoteText && (
            <div
              style={{
                fontSize: 12,
                borderLeft: '3px solid var(--apricot)',
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
                ? 'Lời nhắn cho lần đọc sau: Đang nghĩ gì? Lần tới cần làm gì?'
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
                style={{ fontSize: 12, padding: '4px 10px' }}
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

    return (
      <div
        key={note.id}
        className="card"
        style={{
          padding: 12,
          display: 'grid',
          gap: 6,
          borderLeft: isParking
            ? '4px solid var(--terracotta)'
            : isQuestion
            ? `4px solid ${isResolved ? 'var(--olive)' : 'var(--rose)'}`
            : '4px solid var(--apricot)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => onJumpToSource(note.page, note.y, note.highlightId)}
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              color: 'var(--terracotta)',
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
              <span className="verifyBadge pass" style={{ fontSize: 9, padding: '2px 6px' }}>
                Active Parking
              </span>
            )}
            {isQuestion && (
              <span
                className={`verifyBadge ${isResolved ? 'pass' : 'fail'}`}
                style={{ fontSize: 9, padding: '2px 6px' }}
              >
                {isResolved ? '✓ Resolved' : '❓ Open'}
              </span>
            )}
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

        {note.quoteText && (
          <div
            className="noteQuote"
            style={{ fontSize: 12, maxHeight: 48, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            “{note.quoteText}”
          </div>
        )}

        <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--ink)' }}>
          {note.noteText}
        </div>

        {note.resolutionText && (
          <div style={{ fontSize: 12, color: 'var(--olive)', background: '#eef3e8', padding: '4px 8px', borderRadius: 6 }}>
            ✓ {note.resolutionText}
          </div>
        )}

        {/* Question actions */}
        {isQuestion && (
          <div style={{ marginTop: 4 }}>
            {resolvingNoteId === note.id ? (
              <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                <input
                  type="text"
                  placeholder="Tôi đã hiểu: ... (tuỳ chọn)"
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)' }}
                />
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="secondary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setResolvingNoteId(null)}>Hủy</button>
                  <button className="primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => handleResolveQuestion(note)}>Xác nhận</button>
                </div>
              </div>
            ) : (
              <button
                className="secondary"
                style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => {
                  if (isResolved) {
                    handleResolveQuestion(note);
                  } else {
                    setResolvingNoteId(note.id);
                  }
                }}
              >
                {isResolved ? 'Mở lại câu hỏi' : '✓ I got it (Đã hiểu)'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
}
