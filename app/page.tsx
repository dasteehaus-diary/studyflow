'use client';

import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { ContinueCard } from '@/components/ContinueCard';
import { DocumentCard } from '@/components/DocumentCard';
import { ImportPdfModal } from '@/components/ImportPdfModal';
import { localDB, type LocalDocument, type LocalProgress, type LocalNote } from '@/lib/db/local';
import { selectContinueDocument } from '@/lib/documents/selectors';
import { IconSearch, IconPlus, IconCassetteLogo } from '@/components/icons/BrandIcons';
import Link from 'next/link';

export default function HomePage() {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, LocalProgress>>({});
  const [parkingMap, setParkingMap] = useState<Record<string, LocalNote>>({});
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [relinkTarget, setRelinkTarget] = useState<LocalDocument | null>(null);

  useEffect(() => {
    const db = localDB;
    if (!db) return;

    const subDocs = liveQuery(() => db.documents.orderBy('updatedAt').reverse().toArray())
      .subscribe({ next: setDocuments, error: console.error });

    const subProgress = liveQuery(() => db.progress.toArray())
      .subscribe({
        next: (items) => {
          const map: Record<string, LocalProgress> = {};
          items.forEach(p => { map[p.documentId] = p; });
          setProgressMap(map);
        },
        error: console.error
      });

    const subNotes = liveQuery(() =>
      db.notes.filter(n => n.type === 'parking' && !!n.isActiveParking).toArray()
    ).subscribe({
      next: (items) => {
        const map: Record<string, LocalNote> = {};
        // Prioritize the most recently updated active parking note per document
        items
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .forEach(n => {
            if (!map[n.documentId]) {
              map[n.documentId] = n;
            }
          });
        setParkingMap(map);
      },
      error: console.error
    });

    return () => {
      subDocs.unsubscribe();
      subProgress.unsubscribe();
      subNotes.unsubscribe();
    };
  }, []);

  // Compute all available tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    documents.forEach(doc => {
      doc.tags?.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [documents]);

  // Determine Continue Document (Prioritize in-progress & non-completed)
  const continueDoc = useMemo(() => {
    return selectContinueDocument(documents, progressMap);
  }, [documents, progressMap]);

  // Filtered documents for the library grid
  const filteredDocuments = useMemo(() => {
    let list = documents;

    // Filter by tag/archive
    if (selectedTag === 'Archived') {
      list = list.filter(d => d.status === 'archived');
    } else {
      list = list.filter(d => d.status !== 'archived');
      if (selectedTag !== 'All') {
        list = list.filter(d => d.tags?.includes(selectedTag));
      }
    }

    // Filter by search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    return list;
  }, [documents, selectedTag, searchQuery]);

  return (
    <AppShell>
      {/* Top Bar with Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20
        }}
      >
        <div className="eyebrow">Thư viện cá nhân</div>

        <div style={{ position: 'relative', width: 'min(280px, 100%)' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sf-muted)', pointerEvents: 'none', display: 'flex' }}>
            <IconSearch size={16} />
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm trong thư viện..."
            aria-label="Tìm kiếm tài liệu"
            style={{
              width: '100%',
              padding: '8px 14px 8px 36px',
              borderRadius: 999,
              fontSize: 13,
              background: 'var(--sf-surface)',
              border: '1px solid var(--sf-line)',
              boxShadow: 'var(--sf-shadow-sm)',
              color: 'var(--sf-ink)'
            }}
          />
        </div>
      </div>

      {/* Hero Section */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 10px' }}>
          Tiếp tục nơi bạn đang dở.
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15, maxWidth: 580, lineHeight: 1.55 }}>
          StudyFlow nhớ vị trí, ghi chú và mạch suy nghĩ để bạn quay lại dễ dàng.
        </p>
      </div>

      {/* Continue Card (Focal Point) */}
      {continueDoc && (
        <ContinueCard
          document={continueDoc}
          progress={progressMap[continueDoc.id] ?? null}
          activeParkingNote={parkingMap[continueDoc.id] ?? null}
        />
      )}

      {/* Bookshelf Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 24,
          marginBottom: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Tủ sách</h2>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              background: 'var(--sf-surface-soft)',
              border: '1px solid var(--sf-line)',
              padding: '2px 8px',
              borderRadius: 12,
              color: 'var(--sf-muted)'
            }}
          >
            {filteredDocuments.length}
          </span>
        </div>

        <button
          className="primary"
          style={{ padding: '8px 14px', fontSize: 13 }}
          onClick={() => {
            setRelinkTarget(null);
            setIsImportOpen(true);
          }}
        >
          <IconPlus size={16} />
          <span>Thêm sách PDF</span>
        </button>
      </div>

      {/* Tag Filters */}
      <div className="filterRow">
        <button
          className="pill"
          style={selectedTag === 'All' ? { background: 'var(--sf-mint-soft)', color: 'var(--sf-mint-strong)', borderColor: 'var(--sf-mint)', fontWeight: 600 } : {}}
          onClick={() => setSelectedTag('All')}
        >
          Tất cả
        </button>
        {allTags.map(tag => {
          const isAct = selectedTag === tag;
          return (
            <button
              key={tag}
              className="pill"
              style={isAct ? { background: 'var(--sf-mint-soft)', color: 'var(--sf-mint-strong)', borderColor: 'var(--sf-mint)', fontWeight: 600 } : {}}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </button>
          );
        })}
        <button
          className="pill"
          style={selectedTag === 'Archived' ? { background: 'var(--sf-mint-soft)', color: 'var(--sf-mint-strong)', borderColor: 'var(--sf-mint)', fontWeight: 600 } : {}}
          onClick={() => setSelectedTag('Archived')}
        >
          📦 Đã lưu trữ
        </button>
      </div>

      {/* Empty State vs Documents Grid */}
      {documents.length === 0 ? (
        <div
          className="card"
          style={{
            marginTop: 24,
            padding: '56px 24px',
            textAlign: 'center',
            display: 'grid',
            placeItems: 'center',
            gap: 12
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              background: 'var(--sf-mint-soft)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--sf-mint-strong)',
              margin: '0 auto'
            }}
          >
            <IconCassetteLogo size={28} />
          </div>
          <h3 style={{ margin: '8px 0 4px', fontSize: 20 }}>Thư viện của bạn đang trống</h3>
          <p className="muted" style={{ maxWidth: 420, margin: '0 auto 16px', lineHeight: 1.5, fontSize: 14 }}>
            Chọn PDF đầu tiên để StudyFlow ghi nhớ mạch đọc. File PDF hoàn toàn lưu riêng tư trên máy của bạn (Local-First).
          </p>
          <button
            className="primary"
            onClick={() => {
              setRelinkTarget(null);
              setIsImportOpen(true);
            }}
          >
            <IconPlus size={16} />
            <span>Thêm PDF</span>
          </button>
        </div>
      ) : (
        <>
          <div className="libraryGrid">
            {filteredDocuments.map(doc => (
              <DocumentCard
                key={doc.id}
                document={doc}
                progress={progressMap[doc.id] ?? null}
                onRelinkRequest={(target) => {
                  setRelinkTarget(target);
                  setIsImportOpen(true);
                }}
              />
            ))}

            {/* Add Document Card in Grid */}
            <div
              className="card docCard"
              style={{
                display: 'grid',
                placeItems: 'center',
                color: 'var(--sf-muted)',
                cursor: 'pointer',
                borderStyle: 'dashed',
                borderWidth: '1.5px',
                borderColor: 'var(--sf-line)',
                background: 'transparent',
                borderRadius: 'var(--sf-radius-lg)',
                minHeight: 280
              }}
              onClick={() => {
                setRelinkTarget(null);
                setIsImportOpen(true);
              }}
            >
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'var(--sf-surface-soft)',
                    border: '1px solid var(--sf-line)',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 10px',
                    color: 'var(--sf-mint-strong)'
                  }}
                >
                  <IconPlus size={22} />
                </div>
                <strong style={{ display: 'block', fontSize: 14, color: 'var(--sf-ink)' }}>Thêm PDF mới</strong>
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--sf-muted)' }}>Lưu trữ an toàn qua OPFS</div>
              </div>
            </div>
          </div>

          {filteredDocuments.length === 0 && (
            <div className="card" style={{ marginTop: 24, padding: 36, textAlign: 'center', color: 'var(--muted)' }}>
              Không tìm thấy tài liệu phù hợp với điều kiện lọc hiện tại.
            </div>
          )}
        </>
      )}

      {/* Dev spike link - hidden on production */}
      {process.env.NODE_ENV === 'development' && (
        <section className="devSpikeLink">
          <div>
            <strong>Phase 0 technical spike</strong>
            <div className="muted">OPFS verification and persistence harness.</div>
          </div>
          <Link className="secondary" href="/spike/local-pdf">
            Technical Spikes →
          </Link>
        </section>
      )}

      {/* Import / Relink Modal */}
      <ImportPdfModal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setRelinkTarget(null);
        }}
        relinkTarget={relinkTarget}
      />
    </AppShell>
  );
}
