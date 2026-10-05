'use client';

import Link from 'next/link';
import { CassetteProgress } from './CassetteProgress';
import type { LocalDocument, LocalProgress, LocalNote } from '@/lib/db/local';
import { cassetteProgress } from '@/lib/progress/cassette';
import { formatRelativeTime } from '@/lib/utils/time';

interface ContinueCardProps {
  document: LocalDocument;
  progress: LocalProgress | null;
  activeParkingNote: LocalNote | null;
}

export function ContinueCard({ document, progress, activeParkingNote }: ContinueCardProps) {
  const currentPage = progress?.currentPage ?? 1;
  const totalPages = document.totalPages ?? 0;
  const pct = progress ? cassetteProgress(totalPages || currentPage, progress.visitedRanges) : 0;
  const lastActive = formatRelativeTime(progress?.lastMeaningfulActivityAt || document.updatedAt);

  return (
    <section className="card continueCard" style={{ marginBottom: 28 }}>
      <div className="cover" style={{ background: 'linear-gradient(145deg, var(--deep), #263330)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineClamp: 3 }}>{document.title}</div>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div className="eyebrow" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>Continue reading</span>
          <span style={{ textTransform: 'none', fontWeight: 'normal' }}>· {lastActive}</span>
        </div>

        <h3 style={{ margin: 0 }}>{document.title}</h3>

        {activeParkingNote ? (
          <div
            style={{
              fontSize: 13,
              background: '#f1ede3',
              padding: '6px 12px',
              borderRadius: 8,
              borderLeft: '3px solid var(--terracotta)',
              color: 'var(--ink)'
            }}
          >
            📌 <em>Lần trước:</em> “{activeParkingNote.noteText}”
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            Tiếp tục từ trang {currentPage}{totalPages > 0 ? ` / ${totalPages}` : ''}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <CassetteProgress value={pct} />
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Trang {currentPage}</span>
        </div>
      </div>

      <Link className="primary" href={`/reader/${document.id}`}>
        Continue reading →
      </Link>
    </section>
  );
}
