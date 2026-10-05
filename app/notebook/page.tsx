'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { localDB, type LocalNote, type LocalDocument, type LocalHighlight } from '@/lib/db/local';
import { enqueueSync } from '@/lib/sync/sync-service';
import { formatRelativeTime } from '@/lib/utils/time';

type FilterTab = 'all' | 'highlights' | 'quick' | 'question' | 'parking' | 'open' | 'resolved';

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

export default function NotebookPage() {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [highlightsList, setHighlightsList] = useState<LocalHighlight[]>([]);
  const [documents, setDocuments] = useState<Record<string, LocalDocument>>({});
  const [highlightsMap, setHighlightsMap] = useState<Record<string, LocalHighlight>>({});
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Requirement 14: Edit Note state in notebook
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

  // Requirement 13: Unified items combining notes and standalone highlights
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

  // Requirement 14: Save edited note
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

  // Filter unified items
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      // Tab filters
      if (filterTab === 'highlights' && item.itemType !== 'highlight') return false;
      if (filterTab === 'quick' && (item.itemType !== 'note' || item.noteType !== 'quick')) return false;
      if (filterTab === 'parking' && (item.itemType !== 'note' || item.noteType !== 'parking')) return false;
      if (filterTab === 'question' && (item.itemType !== 'note' || item.noteType !== 'question')) return false;
      if (filterTab === 'open' && (item.itemType !== 'note' || item.noteType !== 'question' || item.status === 'resolved')) return false;
      if (filterTab === 'resolved' && (item.itemType !== 'note' || item.noteType !== 'question' || item.status !== 'resolved')) return false;

      // Text search
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
  }, [unifiedItems, filterTab, searchQuery, documents]);

  return (
    <AppShell>
      <div className="eyebrow">Sổ tay tri thức</div>
      <h1>Ghi chú luôn nhớ rõ nguồn gốc từng trang sách.</h1>

      {/* Search and Filters (Requirement 13) */}
      <div style={{ display: 'grid', gap: 14, marginBottom: 24, maxWidth: 840 }}>
        <input
          type="search"
          placeholder="🔍 Tìm kiếm trong ghi chú, trích dẫn highlight, câu hỏi, tên tài liệu…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid var(--line)',
            background: 'var(--panel)',
            fontSize: 14
          }}
        />

        <div className="filterRow" style={{ margin: 0, gap: 6 }}>
          {[
            ['all', `Tất cả (${unifiedItems.length})`],
            ['highlights', `Trích dẫn (${highlightsList.length})`],
            ['quick', 'Ghi chú'],
            ['question', 'Câu hỏi'],
            ['parking', 'Parking Note'],
            ['open', 'Chưa giải quyết'],
            ['resolved', 'Đã giải quyết']
          ].map(([key, label]) => (
            <button
              key={key}
              className={`pill ${filterTab === key ? 'activePill' : ''}`}
              style={filterTab === key ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : undefined}
              onClick={() => setFilterTab(key as FilterTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified Knowledge List */}
      <div style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
        {filteredItems.map((item) => {
          const doc = documents[item.documentId];
          const docTitle = doc?.title || 'Tài liệu không xác định';
          const hl = item.highlightId ? highlightsMap[item.highlightId] : null;

          const isHighlight = item.itemType === 'highlight';
          const isParking = item.noteType === 'parking';
          const isQuestion = item.noteType === 'question';
          const isResolved = item.status === 'resolved';
          const isEditing = editingNoteId === item.id;

          const borderColor = isHighlight
            ? 'var(--olive)'
            : isParking
            ? 'var(--terracotta)'
            : isQuestion
            ? (isResolved ? 'var(--olive)' : 'var(--rose)')
            : 'var(--apricot)';

          const targetUrl = `/reader/${item.documentId}?page=${item.page}&y=${item.y}${item.highlightId ? `&highlight=${item.highlightId}` : ''}`;

          return (
            <div
              key={`${item.itemType}-${item.id}`}
              className="card"
              style={{
                padding: '16px 20px',
                display: 'grid',
                gap: 8,
                borderLeft: `5px solid ${borderColor}`,
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link
                    href={`/reader/${item.documentId}`}
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--deep)' }}
                  >
                    {docTitle}
                  </Link>
                  <span className="muted" style={{ fontSize: 12 }}>· Trang {item.page}</span>
                  <span className="muted" style={{ fontSize: 11 }}>({formatRelativeTime(item.updatedAt)})</span>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isHighlight && (
                    <span className="verifyBadge" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(115, 114, 63, 0.15)', color: 'var(--olive)' }}>
                      🖍️ Highlight
                    </span>
                  )}
                  {isParking && (
                    <span className="verifyBadge" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(189, 87, 56, 0.15)', color: 'var(--terracotta)' }}>
                      📌 Parking
                    </span>
                  )}
                  {isQuestion && (
                    <span className={`verifyBadge ${isResolved ? 'pass' : 'fail'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                      {isResolved ? '✓ Đã giải quyết' : '❓ Chưa giải quyết'}
                    </span>
                  )}

                  {/* Edit button for notes (Requirement 14) */}
                  {!isHighlight && !isEditing && (
                    <button
                      className="secondary"
                      style={{ fontSize: 11, padding: '2px 6px', border: 0 }}
                      onClick={(e) => {
                        e.preventDefault();
                        setEditingNoteId(item.id);
                        setEditingText(item.noteText || '');
                      }}
                      title="Sửa ghi chú"
                    >
                      ✎ Sửa
                    </button>
                  )}
                </div>
              </div>

              {/* Highlight quote text */}
              {item.quoteText && (
                <div
                  style={{
                    fontSize: 13,
                    fontStyle: 'italic',
                    borderLeft: '3px solid var(--apricot)',
                    paddingLeft: 10,
                    color: 'var(--muted)',
                    lineHeight: 1.45
                  }}
                >
                  “{item.quoteText}”
                </div>
              )}

              {/* Note text / Edit box */}
              {!isHighlight && (
                isEditing ? (
                  <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        padding: 8,
                        fontSize: 13,
                        fontFamily: 'inherit'
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        className="secondary"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => setEditingNoteId(null)}
                      >
                        Hủy
                      </button>
                      <button
                        className="primary"
                        style={{ fontSize: 11, padding: '2px 10px' }}
                        onClick={(e) => handleSaveEdit(item.id, e)}
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {item.noteText}
                  </div>
                )
              )}

              {/* Direct Jump to Source Link */}
              <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
                <Link
                  href={targetUrl}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--terracotta)',
                    textDecoration: 'none'
                  }}
                >
                  Nhảy tới vị trí trong sách →
                </Link>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="card emptyState" style={{ padding: 40, textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              {searchQuery
                ? 'Không tìm thấy ghi chú hoặc trích dẫn nào khớp với từ khóa tìm kiếm.'
                : 'Chưa có ghi chú hoặc trích dẫn nào trong danh mục này.'}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
