'use client';

import Link from 'next/link';
import { CassetteProgress } from './CassetteProgress';
import type { LocalDocument, LocalProgress, LocalNote } from '@/lib/db/local';
import { readingPositionPercent } from '@/lib/progress/cassette';
import { formatRelativeTime } from '@/lib/utils/time';
import { IconParkingNote, IconResume } from '@/components/icons/BrandIcons';

interface ContinueCardProps {
  document: LocalDocument;
  progress: LocalProgress | null;
  activeParkingNote: LocalNote | null;
}

export function ContinueCard({ document, progress, activeParkingNote }: ContinueCardProps) {
  const currentPage = progress?.currentPage ?? 1;
  const totalPages = document.totalPages ?? 0;
  const pct = progress ? readingPositionPercent(totalPages, currentPage, progress.y ?? 0) : 0;
  const lastActive = formatRelativeTime(progress?.lastMeaningfulActivityAt || document.updatedAt);
  const isCompleted = document.status === 'completed' || !!progress?.completed;

  return (
    <section
      className="card continueCard"
      style={{
        marginBottom: 32,
        position: 'relative',
        overflow: 'hidden'
      }}
      aria-label="Tài liệu đang đọc dở"
    >
      {/* Book Cover Thumbnail */}
      <div
        className="cover"
        style={{
          background: document.thumbnail ? '#2c2a26' : 'linear-gradient(145deg, var(--sage, #5E7F68), #385041)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 3px 0 6px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)'
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
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              position: 'relative',
              zIndex: 2,
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              padding: 6,
              lineHeight: 1.3
            }}
          >
            {document.title}
          </div>
        )}
      </div>

      {/* Main Info */}
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <div className="eyebrow" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: isCompleted ? 'var(--sage)' : 'var(--terracotta)'
            }}
          >
            {isCompleted ? '✓ ĐÃ HOÀN THÀNH' : '▶ TIẾP TỤC ĐỌC'}
          </span>
          <span style={{ textTransform: 'none', fontWeight: 'normal', color: 'var(--muted)' }}>
            · {lastActive}
          </span>
        </div>

        <h3
          style={{
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            lineHeight: 1.25
          }}
          title={document.title}
        >
          {document.title}
        </h3>

        {/* Active Parking Note Callout */}
        {activeParkingNote ? (
          <div
            style={{
              fontSize: 13,
              background: 'var(--sticky-bg)',
              padding: '8px 12px',
              borderRadius: 10,
              borderLeft: '3px solid var(--terracotta)',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--terracotta)' }}>
              <IconParkingNote size={16} />
            </span>
            <div style={{ wordBreak: 'break-word' }}>
              <span style={{ fontWeight: 600, color: 'var(--terracotta)' }}>Lần trước:</span> “
              {activeParkingNote.noteText}”
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            Tiếp tục từ trang {currentPage}{totalPages > 0 ? ` / ${totalPages}` : ''}
          </div>
        )}

        {/* Cassette Reading Position */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
          <div style={{ width: 'min(200px, 100%)' }}>
            <CassetteProgress value={pct} variant="mini" />
          </div>
          <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
            Trang {currentPage} / {totalPages || '—'}
          </span>
        </div>
      </div>

      {/* CTA Button */}
      <Link
        className="primary"
        href={`/reader/${document.id}`}
        style={{
          whiteSpace: 'nowrap',
          padding: '12px 20px',
          boxShadow: '0 4px 14px rgba(189, 87, 56, 0.22)'
        }}
      >
        <IconResume size={18} />
        <span>{isCompleted ? 'Đọc lại' : 'Tiếp tục đọc'}</span>
      </Link>
    </section>
  );
}
