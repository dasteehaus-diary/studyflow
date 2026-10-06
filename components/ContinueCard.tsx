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
  const isCompleted = document.status === 'completed' || !!progress?.completed;

  return (
    <section className="card continueCard" style={{ marginBottom: 28 }}>
      <div
        className="cover"
        style={{
          background: document.thumbnail ? '#2c2a26' : 'linear-gradient(145deg, var(--deep), #263330)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {document.thumbnail ? (
          <img
            src={document.thumbnail}
            alt={document.title}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            position: 'relative',
            zIndex: 2,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            padding: 8
          }}>
            {document.title}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div className="eyebrow" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: isCompleted ? 'var(--olive)' : 'var(--terracotta)' }}>
            {isCompleted ? '✓ Đã hoàn thành' : '▶ Tiếp tục đọc'}
          </span>
          <span style={{ textTransform: 'none', fontWeight: 'normal' }}>· {lastActive}</span>
        </div>

        <h3
          style={{
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word'
          }}
          title={document.title}
        >
          {document.title}
        </h3>

        {activeParkingNote ? (
          <div
            style={{
              fontSize: 13,
              background: 'var(--card-subtle)',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <div style={{ width: 'min(220px, 100%)' }}>
            <CassetteProgress value={pct} />
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Trang {currentPage}</span>
        </div>
      </div>

      <Link className="primary" href={`/reader/${document.id}`} style={{ whiteSpace: 'nowrap' }}>
        {isCompleted ? 'Đọc lại →' : 'Tiếp tục đọc →'}
      </Link>
    </section>
  );
}
