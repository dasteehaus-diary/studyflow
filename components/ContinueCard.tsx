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
        overflow: 'hidden',
        background: 'var(--sf-surface)',
        border: '1px solid var(--sf-line)',
        borderRadius: 20,
        boxShadow: 'var(--shadow)'
      }}
      aria-label="Tài liệu đang đọc dở"
    >
      {/* Book Cover Thumbnail */}
      <div
        className="cover"
        style={{
          background: document.thumbnail ? '#242a27' : 'linear-gradient(145deg, var(--sf-mint), #5A7E72)',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--sf-mint-soft)',
              color: 'var(--sf-mint-strong)',
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              letterSpacing: '0.02em'
            }}
          >
            {isCompleted ? '✓ ĐÃ HOÀN THÀNH' : '▶ TIẾP TỤC ĐỌC'}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            · {lastActive}
          </span>
        </div>

        <h3
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            lineHeight: 1.3
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
              background: 'var(--sf-surface-soft)',
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--sf-line)',
              borderLeft: '3px solid var(--sf-mint-strong)',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--sf-mint-strong)' }}>
              <IconParkingNote size={16} />
            </span>
            <div style={{ wordBreak: 'break-word' }}>
              <span style={{ fontWeight: 600, color: 'var(--sf-mint-strong)' }}>Lần trước:</span> “
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
          <div style={{ width: 'min(180px, 100%)' }}>
            <CassetteProgress value={pct} variant="mini" />
          </div>
          <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
            Trang {currentPage} / {totalPages || '—'}
          </span>
        </div>
      </div>

      {/* CTA Button (Mint Strong) */}
      <Link
        className="primary"
        href={`/reader/${document.id}`}
        style={{
          whiteSpace: 'nowrap',
          padding: '11px 20px',
          boxShadow: '0 4px 14px rgba(120, 153, 142, 0.28)'
        }}
      >
        <IconResume size={18} />
        <span>{isCompleted ? 'Đọc lại' : 'Tiếp tục đọc'}</span>
      </Link>
    </section>
  );
}
