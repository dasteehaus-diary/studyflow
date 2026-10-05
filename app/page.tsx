'use client';

import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { ContinueCard } from '@/components/ContinueCard';
import { DocumentCard } from '@/components/DocumentCard';
import { ImportPdfModal } from '@/components/ImportPdfModal';
import { localDB, type LocalDocument, type LocalProgress, type LocalNote } from '@/lib/db/local';
import Link from 'next/link';

export default function HomePage() {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, LocalProgress>>({});
  const [parkingMap, setParkingMap] = useState<Record<string, LocalNote>>({});
  const [selectedTag, setSelectedTag] = useState<string>('All');
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

    const subNotes = liveQuery(() => db.notes.where('isActiveParking').equals(1).toArray())
      .subscribe({
        next: (items) => {
          const map: Record<string, LocalNote> = {};
          items.forEach(n => { map[n.documentId] = n; });
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

  // Determine Continue Document (most recently active non-archived document)
  const continueDoc = useMemo(() => {
    const activeDocs = documents.filter(d => d.status !== 'archived');
    if (activeDocs.length === 0) return null;

    return [...activeDocs].sort((a, b) => {
      const progA = progressMap[a.id]?.lastMeaningfulActivityAt || a.updatedAt;
      const progB = progressMap[b.id]?.lastMeaningfulActivityAt || b.updatedAt;
      return new Date(progB).getTime() - new Date(progA).getTime();
    })[0];
  }, [documents, progressMap]);

  // Filtered documents for the library grid
  const filteredDocuments = useMemo(() => {
    if (selectedTag === 'Archived') {
      return documents.filter(d => d.status === 'archived');
    }
    const nonArchived = documents.filter(d => d.status !== 'archived');
    if (selectedTag === 'All') return nonArchived;
    return nonArchived.filter(d => d.tags?.includes(selectedTag));
  }, [documents, selectedTag]);

  return (
    <AppShell>
      <div className="eyebrow">Personal Library</div>
      <h1>Pick up where your brain left off.</h1>

      {/* Continue First Section */}
      {continueDoc && (
        <ContinueCard
          document={continueDoc}
          progress={progressMap[continueDoc.id] ?? null}
          activeParkingNote={parkingMap[continueDoc.id] ?? null}
        />
      )}

      {/* Library Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <h2>My Library</h2>
        <button
          className="primary"
          style={{ padding: '8px 14px', fontSize: 13 }}
          onClick={() => {
            setRelinkTarget(null);
            setIsImportOpen(true);
          }}
        >
          ＋ Import PDF
        </button>
      </div>

      {/* Tag Filters */}
      <div className="filterRow">
        <button
          className={`pill ${selectedTag === 'All' ? 'activePill' : ''}`}
          style={selectedTag === 'All' ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : undefined}
          onClick={() => setSelectedTag('All')}
        >
          All
        </button>
        {allTags.map(tag => (
          <button
            key={tag}
            className={`pill ${selectedTag === tag ? 'activePill' : ''}`}
            style={selectedTag === tag ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : undefined}
            onClick={() => setSelectedTag(tag)}
          >
            {tag}
          </button>
        ))}
        <button
          className={`pill ${selectedTag === 'Archived' ? 'activePill' : ''}`}
          style={selectedTag === 'Archived' ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : undefined}
          onClick={() => setSelectedTag('Archived')}
        >
          📦 Archived
        </button>
      </div>

      {/* Documents Grid */}
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

        {/* Add Document Card CTA */}
        <div
          className="card docCard"
          style={{
            display: 'grid',
            placeItems: 'center',
            color: 'var(--muted)',
            cursor: 'pointer',
            borderStyle: 'dashed'
          }}
          onClick={() => {
            setRelinkTarget(null);
            setIsImportOpen(true);
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>＋</div>
            <strong>Import PDF</strong>
            <div style={{ fontSize: 11, marginTop: 4 }}>Lưu trữ an toàn trong OPFS</div>
          </div>
        </div>
      </div>

      {filteredDocuments.length === 0 && documents.length === 0 && (
        <div className="card emptyState" style={{ marginTop: 24, padding: 36, textAlign: 'center' }}>
          <h3>Chưa có tài liệu nào trong thư viện</h3>
          <p className="muted" style={{ maxWidth: 440, margin: '8px auto 20px' }}>
            Bắt đầu bằng cách chọn một file PDF. StudyFlow sẽ ghi nhớ trang đọc, dòng suy nghĩ qua Parking Note, và mở quà B-Side khi hoàn thành.
          </p>
          <button
            className="primary"
            onClick={() => {
              setRelinkTarget(null);
              setIsImportOpen(true);
            }}
          >
            Chọn file PDF đầu tiên
          </button>
        </div>
      )}

      {/* Dev spike link */}
      <section className="devSpikeLink">
        <div>
          <strong>Phase 0 technical spike</strong>
          <div className="muted">OPFS verification and persistence harness.</div>
        </div>
        <Link className="secondary" href="/spike/local-pdf">
          Technical Spikes →
        </Link>
      </section>

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
