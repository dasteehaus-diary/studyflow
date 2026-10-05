'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { localDB, type LocalNote, type LocalDocument, type LocalHighlight } from '@/lib/db/local';
import { formatRelativeTime } from '@/lib/utils/time';

export default function NotebookPage() {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [documents, setDocuments] = useState<Record<string, LocalDocument>>({});
  const [highlights, setHighlights] = useState<Record<string, LocalHighlight>>({});
  const [filterTab, setFilterTab] = useState<'all' | 'quick' | 'question' | 'parking' | 'open' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

    const subHl = liveQuery(() => db.highlights.toArray())
      .subscribe({
        next: (hls) => {
          const map: Record<string, LocalHighlight> = {};
          hls.forEach(h => { map[h.id] = h; });
          setHighlights(map);
        },
        error: console.error
      });

    return () => {
      subNotes.unsubscribe();
      subDocs.unsubscribe();
      subHl.unsubscribe();
    };
  }, []);

  // Filter notes
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // Tab filters
      if (filterTab === 'quick' && n.type !== 'quick') return false;
      if (filterTab === 'parking' && n.type !== 'parking') return false;
      if (filterTab === 'question' && n.type !== 'question') return false;
      if (filterTab === 'open' && (n.type !== 'question' || n.status === 'resolved')) return false;
      if (filterTab === 'resolved' && (n.type !== 'question' || n.status !== 'resolved')) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const noteMatch = n.noteText?.toLowerCase().includes(q);
        const quoteMatch = n.quoteText?.toLowerCase().includes(q);
        const docTitle = documents[n.documentId]?.title.toLowerCase() || '';
        const docMatch = docTitle.includes(q);
        if (!noteMatch && !quoteMatch && !docMatch) return false;
      }

      return true;
    });
  }, [notes, filterTab, searchQuery, documents]);

  return (
    <AppShell>
      <div className="eyebrow">Notebook</div>
      <h1>Notes that still know where they came from.</h1>

      {/* Search and Filters */}
      <div style={{ display: 'grid', gap: 14, marginBottom: 24, maxWidth: 800 }}>
        <input
          type="search"
          placeholder="🔍 Tìm kiếm trong ghi chú, trích dẫn, tên tài liệu…"
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

        <div className="filterRow" style={{ margin: 0 }}>
          {[
            ['all', `All (${notes.length})`],
            ['quick', 'Notes'],
            ['question', 'Questions'],
            ['parking', 'Parking'],
            ['open', 'Open Questions'],
            ['resolved', 'Resolved']
          ].map(([key, label]) => (
            <button
              key={key}
              className={`pill ${filterTab === key ? 'activePill' : ''}`}
              style={filterTab === key ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : undefined}
              onClick={() => setFilterTab(key as typeof filterTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      <div style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
        {filteredNotes.map((note) => {
          const doc = documents[note.documentId];
          const docTitle = doc?.title || 'Tài liệu không xác định';
          const hl = note.highlightId ? highlights[note.highlightId] : null;

          const isParking = note.type === 'parking';
          const isQuestion = note.type === 'question';
          const isResolved = note.status === 'resolved';

          const hlBorderColor = hl?.color === 'rose'
            ? 'var(--rose)'
            : hl?.color === 'olive'
            ? 'var(--olive-cream)'
            : hl?.color === 'blue'
            ? 'var(--dusty-blue)'
            : 'var(--apricot)';

          const targetUrl = `/reader/${note.documentId}?page=${note.page}&y=${note.y}${note.highlightId ? `&highlight=${note.highlightId}` : ''}`;

          return (
            <Link
              key={note.id}
              href={targetUrl}
              className="card"
              style={{
                padding: '16px 20px',
                display: 'grid',
                gap: 8,
                textDecoration: 'none',
                color: 'inherit',
                borderLeft: isParking
                  ? '5px solid var(--terracotta)'
                  : isQuestion
                  ? `5px solid ${isResolved ? 'var(--olive)' : 'var(--rose)'}`
                  : '5px solid var(--apricot)',
                transition: 'transform 0.1s ease, box-shadow 0.1s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{docTitle}</strong>
                  <span className="muted">· Trang {note.page}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isParking && (
                    <span className={`verifyBadge ${note.isActiveParking ? 'pass' : ''}`}>
                      {note.isActiveParking ? '📌 Active Parking' : 'Archived Parking'}
                    </span>
                  )}
                  {isQuestion && (
                    <span className={`verifyBadge ${isResolved ? 'pass' : 'fail'}`}>
                      {isResolved ? '✓ Resolved' : '❓ Open Question'}
                    </span>
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {formatRelativeTime(note.updatedAt)}
                  </span>
                  <span style={{ color: 'var(--terracotta)', fontSize: 12, fontWeight: 700 }}>
                    Mở vị trí →
                  </span>
                </div>
              </div>

              {note.quoteText && (
                <div
                  className="noteQuote"
                  style={{
                    borderColor: hlBorderColor,
                    fontSize: 13,
                    fontStyle: 'italic',
                    color: 'var(--ink)'
                  }}
                >
                  “{note.quoteText}”
                </div>
              )}

              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                {note.noteText}
              </div>

              {note.resolutionText && (
                <div style={{ fontSize: 12, color: 'var(--olive)', background: '#edf4e9', padding: '6px 10px', borderRadius: 8 }}>
                  ✓ {note.resolutionText}
                </div>
              )}
            </Link>
          );
        })}

        {filteredNotes.length === 0 && (
          <div className="card emptyState" style={{ padding: 40, textAlign: 'center' }}>
            <h3>Không tìm thấy ghi chú nào</h3>
            <p className="muted" style={{ maxWidth: 440, margin: '8px auto' }}>
              Khi đọc tài liệu, bạn có thể bôi đen văn bản để Highlight, tạo Quick Note hoặc ghi lại Parking Note cho lần học sau.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
