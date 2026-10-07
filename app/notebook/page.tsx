'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { localDB, type LocalNote, type LocalDocument, type LocalHighlight } from '@/lib/db/local';
import { enqueueSync } from '@/lib/sync/sync-service';
import { formatRelativeTime } from '@/lib/utils/time';
import {
  IconSearch,
  IconNotebook,
  IconQuestion,
  IconParkingNote,
  IconPencil,
  IconTrash,
  IconArrowRight
} from '@/components/icons/BrandIcons';

type PrimaryFilter = 'all' | 'highlights' | 'quick' | 'question' | 'parking';
type StatusFilter = 'all' | 'open' | 'resolved';

interface UnifiedItem {
  id: string;
  itemType: 'note' | 'highlight';
  documentId: string;
  page: number;
  y: number;
  highlightId?: string;
  quoteText?: string;
  noteText?: string;
  noteType?: 'quick' | 'question' | 'parking';
  status?: 'open' | 'resolved' | 'reopened';
  color?: string;
  updatedAt: string;
}

export function NotebookPage() {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [highlightsList, setHighlightsList] = useState<LocalHighlight[]>([]);
  const [documents, setDocuments] = useState<Record<string, LocalDocument>>({});
  const [highlightsMap, setHighlightsMap] = useState<Record<string, LocalHighlight>>({});

  // Separated Primary & Status Filters (Section 11)
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Edit Note inline state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    const db = localDB;
    if (!db) return;

    const subNotes = liveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray())
      .subscribe({ next: setNotes, error: console.error });

    const subDocs = liveQuery(() => db.documents.toArray())
      .subscribe({
        next: (docs) => {
          const map: Record<string, LocalDocument> = {};
          docs.forEach(d => { map[d.id] = d; });
          setDocuments(map);
        },
        error: console.error
      });

    const subHl = liveQuery(() => db.highlights.orderBy('updatedAt').reverse().toArray())
      .subscribe({
        next: (hls) => {
          setHighlightsList(hls);
          const map: Record<string, LocalHighlight> = {};
          hls.forEach(h => { map[h.id] = h; });
          setHighlightsMap(map);
        },
        error: console.error
      });

    return () => {
      subNotes.unsubscribe();
      subDocs.unsubscribe();
      subHl.unsubscribe();
    };
  }, []);

  // Unified items combining notes and standalone highlights
  const unifiedItems = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];

    // Add all notes
    notes.forEach((n) => {
      items.push({
        id: n.id,
        itemType: 'note',
        documentId: n.documentId,
        page: n.page,
        y: n.y,
        highlightId: n.highlightId,
        quoteText: n.quoteText,
        noteText: n.noteText,
        noteType: n.type,
        status: n.status,
        updatedAt: n.updatedAt
      });
    });

    // Add highlights that do not have an attached note
    const linkedHighlightIds = new Set(notes.map(n => n.highlightId).filter(Boolean));
    highlightsList.forEach((h) => {
      if (!linkedHighlightIds.has(h.id)) {
        items.push({
          id: h.id,
          itemType: 'highlight',
          documentId: h.documentId,
          page: h.page,
          y: h.locator?.y || 0,
          highlightId: h.id,
          quoteText: h.quoteText,
          color: h.color,
          updatedAt: h.updatedAt
        });
      }
    });

    return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [notes, highlightsList]);

  // Save edited note
  const handleSaveEdit = async (noteId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!localDB || !editingText.trim()) return;

    const existing = notes.find(n => n.id === noteId);
    if (!existing) return;

    const now = new Date().toISOString();
    const updated: LocalNote = {
      ...existing,
      noteText: editingText.trim(),
      updatedAt: now
    };

    await localDB.notes.update(noteId, { noteText: updated.noteText, updatedAt: now });
    await enqueueSync('note', noteId, 'upsert', updated);

    setEditingNoteId(null);
    setEditingText('');
  };

  // Toggle resolve status for question notes
  const handleToggleQuestionStatus = async (noteId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!localDB) return;

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const nextStatus = note.status === 'resolved' ? 'reopened' : 'resolved';
    const now = new Date().toISOString();
    await localDB.notes.update(noteId, { status: nextStatus, updatedAt: now });
    await enqueueSync('note', noteId, 'upsert', { ...note, status: nextStatus, updatedAt: now });
  };

  // Delete note
  const handleDeleteNote = async (noteId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!localDB || !window.confirm('Bạn có chắc chắn muốn xóa ghi chú này?')) return;

    await localDB.notes.delete(noteId);
    await enqueueSync('note', noteId, 'delete', { id: noteId });
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      // Primary category filter
      if (primaryFilter === 'highlights' && item.itemType !== 'highlight') return false;
      if (primaryFilter === 'quick' && (item.itemType !== 'note' || item.noteType !== 'quick')) return false;
      if (primaryFilter === 'parking' && (item.itemType !== 'note' || item.noteType !== 'parking')) return false;
      if (primaryFilter === 'question' && (item.itemType !== 'note' || item.noteType !== 'question')) return false;

      // Status filter
      if (statusFilter === 'open') {
        if (item.itemType === 'note' && item.noteType === 'question' && item.status === 'resolved') {
          return false;
        }
      }
      if (statusFilter === 'resolved') {
        if (item.itemType !== 'note' || item.noteType !== 'question' || item.status !== 'resolved') {
          return false;
        }
      }

      // Search query across note text, quote, and document title
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const noteMatch = item.noteText?.toLowerCase().includes(q);
        const quoteMatch = item.quoteText?.toLowerCase().includes(q);
        const docTitle = documents[item.documentId]?.title.toLowerCase() || '';
        const docMatch = docTitle.includes(q);
        if (!noteMatch && !quoteMatch && !docMatch) return false;
      }

      return true;
    });
  }, [unifiedItems, primaryFilter, statusFilter, searchQuery, documents]);

  return (
    <AppShell>
      {/* Top Breadcrumb */}
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Sổ tay tri thức
      </div>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 10px' }}>
          Ghi chú luôn nhớ rõ nguồn gốc từng trang sách.
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15, maxWidth: 600, lineHeight: 1.55 }}>
          Tất cả trích dẫn, câu hỏi và suy nghĩ được lưu giữ nguyên văn kèm vị trí chính xác trong tài liệu gốc.
        </p>
      </div>

      {/* Search and Filters Section */}
      <div style={{ display: 'grid', gap: 14, marginBottom: 28 }}>
        {/* Search Bar */}
        <div style={{ position: 'relative', width: 'min(540px, 100%)' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sf-muted)', display: 'flex' }}>
            <IconSearch size={18} />
          </span>
          <input
            type="search"
            placeholder="Tìm kiếm trong ghi chú, trích dẫn highlight, câu hỏi, tên tài liệu…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              borderRadius: 999,
              fontSize: 14,
              background: 'var(--sf-surface)',
              border: '1px solid var(--sf-line)',
              boxShadow: 'var(--sf-shadow-sm)',
              color: 'var(--sf-ink)'
            }}
          />
        </div>

        {/* Primary Filter Row */}
        <div className="filterRow" style={{ margin: 0, gap: 8 }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 4, fontWeight: 600 }}>Loại:</span>
          {[
            ['all', `Tất cả (${unifiedItems.length})`, 'var(--sf-mint-soft)', 'var(--sf-mint-strong)', 'var(--sf-mint)'],
            ['highlights', `Trích dẫn (${highlightsList.length})`, 'var(--sf-butter-soft)', '#7B6215', 'var(--sf-butter)'],
            ['quick', 'Ghi chú', 'var(--sf-orange-soft)', '#A05B20', 'var(--sf-orange)'],
            ['question', 'Câu hỏi', 'var(--sf-coral-soft)', 'var(--sf-coral)', 'var(--sf-coral)'],
            ['parking', 'Parking Note', 'var(--sf-blue-soft)', '#3E637E', 'var(--sf-blue)']
          ].map(([key, label, activeBg, activeColor, activeBorder]) => {
            const isAct = primaryFilter === key;
            return (
              <button
                key={key}
                className="pill"
                style={isAct ? { background: activeBg, color: activeColor, borderColor: activeBorder, fontWeight: 600 } : {}}
                onClick={() => setPrimaryFilter(key as PrimaryFilter)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Status Filter Row */}
        <div className="filterRow" style={{ margin: 0, gap: 8 }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 4, fontWeight: 600 }}>Trạng thái:</span>
          {[
            ['all', 'Tất cả trạng thái', 'var(--sf-mint-soft)', 'var(--sf-mint-strong)', 'var(--sf-mint)'],
            ['open', 'Chưa giải quyết', 'var(--sf-coral-soft)', 'var(--sf-coral)', 'var(--sf-coral)'],
            ['resolved', 'Đã giải quyết', 'var(--sf-mint-soft)', 'var(--sf-mint-strong)', 'var(--sf-mint)']
          ].map(([key, label, activeBg, activeColor, activeBorder]) => {
            const isAct = statusFilter === key;
            return (
              <button
                key={key}
                className="pill"
                style={{
                  fontSize: 12,
                  padding: '5px 12px',
                  ...(isAct ? { background: activeBg, color: activeColor, borderColor: activeBorder, fontWeight: 600 } : {})
                }}
                onClick={() => setStatusFilter(key as StatusFilter)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Knowledge Cards (Scan-friendly grid on desktop, single column on mobile) */}
      {filteredItems.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--muted)',
            display: 'grid',
            placeItems: 'center',
            gap: 10
          }}
        >
          <div style={{ fontSize: 32 }}>✎</div>
          <h3 style={{ margin: '4px 0' }}>Không tìm thấy ghi chép nào</h3>
          <p style={{ margin: 0, fontSize: 14 }}>Thử đổi từ khóa tìm kiếm hoặc điều kiện lọc ở trên.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 18
          }}
        >
          {filteredItems.map((item) => {
            const doc = documents[item.documentId];
            const docTitle = doc?.title || 'Tài liệu đã lưu';
            const isHighlight = item.itemType === 'highlight';
            const isParking = item.noteType === 'parking';
            const isQuestion = item.noteType === 'question';
            const isResolved = item.status === 'resolved';
            const isEditing = editingNoteId === item.id;

            const indicatorColor = isHighlight
              ? 'var(--sf-butter)'
              : isParking
              ? 'var(--sf-blue)'
              : isQuestion
              ? (isResolved ? 'var(--sf-mint-strong)' : 'var(--sf-coral)')
              : 'var(--sf-orange)';

            const badgeBg = isHighlight
              ? 'var(--sf-butter-soft)'
              : isParking
              ? 'var(--sf-blue-soft)'
              : isQuestion
              ? (isResolved ? 'var(--sf-mint-soft)' : 'var(--sf-coral-soft)')
              : 'var(--sf-orange-soft)';

            const badgeColor = isHighlight
              ? '#7B6215'
              : isParking
              ? '#3E637E'
              : isQuestion
              ? (isResolved ? 'var(--sf-mint-strong)' : 'var(--sf-coral)')
              : '#A05B20';

            const targetUrl = `/reader/${item.documentId}?page=${item.page}&y=${item.y}${item.highlightId ? `&highlight=${item.highlightId}` : ''}`;

            return (
              <div
                key={`${item.itemType}-${item.id}`}
                className="card"
                style={{
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  background: 'var(--sf-surface)',
                  border: '1px solid var(--sf-line)',
                  borderLeft: `4px solid ${indicatorColor}`,
                  borderRadius: 'var(--sf-radius-lg)',
                  position: 'relative',
                  boxShadow: 'var(--sf-shadow-sm)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
              >
                {/* Header: Type Badge + Status + Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: badgeBg,
                        color: badgeColor,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      {isHighlight && '❝ Trích dẫn'}
                      {item.noteType === 'quick' && '✎ Ghi chú'}
                      {isQuestion && '❓ Câu hỏi'}
                      {isParking && '📌 Parking Note'}
                    </span>

                    {isQuestion && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 6,
                          background: isResolved ? 'var(--sf-mint-soft)' : 'var(--sf-coral-soft)',
                          color: isResolved ? 'var(--sf-mint-strong)' : 'var(--sf-coral)',
                          border: `1px solid ${isResolved ? 'var(--sf-mint)' : 'var(--sf-coral)'}`
                        }}
                      >
                        {isResolved ? '✓ Đã giải đáp' : 'Chưa giải quyết'}
                      </span>
                    )}
                  </div>

                  <span className="muted" style={{ fontSize: 11 }}>
                    {formatRelativeTime(item.updatedAt)}
                  </span>
                </div>

                {/* Linked Quote if present */}
                {item.quoteText && (
                  <blockquote
                    style={{
                      margin: 0,
                      padding: '8px 12px',
                      background: 'var(--sf-surface-soft)',
                      borderLeft: `3px solid ${indicatorColor}`,
                      borderRadius: '0 8px 8px 0',
                      fontSize: 13,
                      fontStyle: 'italic',
                      lineHeight: 1.45,
                      color: 'var(--sf-ink)'
                    }}
                  >
                    “{item.quoteText}”
                  </blockquote>
                )}

                {/* Main Note Text */}
                {item.itemType === 'note' && (
                  <div>
                    {isEditing ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <textarea
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          rows={3}
                          style={{
                            width: '100%',
                            padding: 8,
                            borderRadius: 8,
                            border: '1px solid var(--line)',
                            fontSize: 13
                          }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="secondary"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => { setEditingNoteId(null); setEditingText(''); }}
                          >
                            Hủy
                          </button>
                          <button
                            className="primary"
                            style={{ padding: '3px 10px', fontSize: 11 }}
                            onClick={(e) => handleSaveEdit(item.id, e)}
                          >
                            Lưu
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>
                        {item.noteText}
                      </p>
                    )}
                  </div>
                )}

                {/* Footer: Source + Deep link CTA */}
                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: 10,
                    borderTop: '1px solid var(--line)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={docTitle}
                    >
                      {docTitle}
                    </div>
                    <span className="muted" style={{ fontSize: 11 }}>Trang {item.page}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Action buttons for note */}
                    {item.itemType === 'note' && !isEditing && (
                      <>
                        {isQuestion && (
                          <button
                            className="secondary"
                            style={{ padding: '3px 7px', fontSize: 11 }}
                            onClick={(e) => handleToggleQuestionStatus(item.id, e)}
                            title={isResolved ? 'Mở lại câu hỏi' : 'Đánh dấu đã giải đáp'}
                          >
                            {isResolved ? '↩' : '✓'}
                          </button>
                        )}
                        <button
                          className="secondary"
                          style={{ padding: '3px 7px', fontSize: 11 }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingNoteId(item.id);
                            setEditingText(item.noteText || '');
                          }}
                          title="Sửa ghi chú"
                        >
                          <IconPencil size={12} />
                        </button>
                        <button
                          className="secondary danger"
                          style={{ padding: '3px 7px', fontSize: 11 }}
                          onClick={(e) => handleDeleteNote(item.id, e)}
                          title="Xóa ghi chú"
                        >
                          <IconTrash size={12} />
                        </button>
                      </>
                    )}

                    {/* Source Jump Link */}
                    <Link
                      href={targetUrl}
                      className="secondary"
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontWeight: 600,
                        color: 'var(--sf-mint-strong)',
                        borderColor: 'var(--sf-line)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <span>Mở nguồn</span>
                      <IconArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

export default NotebookPage;
