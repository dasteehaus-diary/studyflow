'use client';

import { useRef, MouseEvent } from 'react';
import { Page } from 'react-pdf';
import type { LocalHighlight, HighlightColor, LocalNote } from '@/lib/db/local';
import { normalizeClientRect } from '@/lib/reader/coordinates';

interface PdfPageItemProps {
  pageNumber: number;
  scale: number;
  isMounted: boolean;
  estimatedHeight: number;
  highlights: LocalHighlight[];
  notesByHighlightId?: Record<string, LocalNote>;
  onTextSelected: (pageNumber: number, text: string, rects: LocalHighlight['rects'], clientPos: { x: number; y: number }) => void;
  onHighlightClick: (highlight: LocalHighlight, clientPos: { x: number; y: number }) => void;
  onPageVisible?: (pageNumber: number) => void;
  onRegisterElement?: (pageNumber: number, el: HTMLDivElement | null) => void;
  onPageDimensions?: (width: number, height: number) => void;
}

const COLOR_MAP: Record<HighlightColor, string> = {
  apricot: 'rgba(246, 165, 110, 0.42)',
  rose: 'rgba(234, 144, 144, 0.42)',
  olive: 'rgba(218, 206, 141, 0.48)',
  blue: 'rgba(151, 168, 188, 0.45)'
};

export function PdfPageItem({
  pageNumber,
  scale,
  isMounted,
  estimatedHeight,
  highlights,
  notesByHighlightId,
  onTextSelected,
  onHighlightClick,
  onRegisterElement,
  onPageDimensions
}: PdfPageItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const setContainerRef = (el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (onRegisterElement) {
      onRegisterElement(pageNumber, el);
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text || text.length === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const range = selection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects());

    if (clientRects.length === 0) return;

    // Filter rects that fall inside this page container
    const validRects = clientRects.filter(r =>
      r.top >= containerRect.top - 10 &&
      r.bottom <= containerRect.bottom + 10 &&
      r.left >= containerRect.left - 10 &&
      r.right <= containerRect.right + 10
    );

    if (validRects.length === 0) return;

    const normalizedRects = validRects.map(r => normalizeClientRect(r, containerRect));
    const firstRect = validRects[0];

    onTextSelected(
      pageNumber,
      text,
      normalizedRects,
      { x: firstRect.left + firstRect.width / 2, y: firstRect.top }
    );
  };

  if (!isMounted) {
    return (
      <div
        id={`page-container-${pageNumber}`}
        ref={setContainerRef}
        style={{
          width: 'min(820px, 92vw)',
          height: estimatedHeight,
          background: 'white',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          borderRadius: 8,
          margin: '0 auto 24px',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted)',
          fontSize: 13
        }}
      >
        Trang {pageNumber} (đang cuộn…)
      </div>
    );
  }

  return (
    <div
      id={`page-container-${pageNumber}`}
      ref={setContainerRef}
      onMouseUp={handleMouseUp}
      style={{
        position: 'relative',
        width: 'fit-content',
        maxWidth: '100%',
        minHeight: estimatedHeight,
        margin: '0 auto 24px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        borderRadius: 4,
        background: 'white',
        overflow: 'hidden'
      }}
    >
      <Page
        pageNumber={pageNumber}
        scale={scale}
        renderAnnotationLayer={false}
        renderTextLayer={true}
        onLoadSuccess={(pageData) => {
          const w = pageData.originalWidth || (pageData.width / scale);
          const h = pageData.originalHeight || (pageData.height / scale);
          if (w > 0 && h > 0) {
            onPageDimensions?.(w, h);
          }
        }}
        loading={
          <div style={{ height: estimatedHeight, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
            Đang tải trang {pageNumber}…
          </div>
        }
      />

      {/* Highlight Overlay Layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10
        }}
      >
        {highlights.map((hl) => {
          const bg = COLOR_MAP[hl.color] || COLOR_MAP.apricot;
          const note = notesByHighlightId ? notesByHighlightId[hl.id] : undefined;
          const hasQuickNote = note && note.type !== 'question';
          const hasQuestion = note && note.type === 'question';
          const lastRect = hl.rects[hl.rects.length - 1];

          return (
            <div key={hl.id}>
              {hl.rects.map((r, i) => (
                <div
                  key={`${hl.id}-${i}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHighlightClick(hl, { x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    position: 'absolute',
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.width * 100}%`,
                    height: `${r.height * 100}%`,
                    background: bg,
                    borderRadius: 2,
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    transition: 'background 0.15s ease'
                  }}
                  title={`Highlight: "${hl.quoteText}"${note ? `\nNote: ${note.noteText}` : ''}`}
                />
              ))}

              {/* Visual cue: Highlight có Quick Note -> ✎, có Question -> ? (Requirement: Visual cue) */}
              {(hasQuickNote || hasQuestion) && lastRect && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onHighlightClick(hl, { x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    position: 'absolute',
                    left: `calc(${lastRect.x * 100}% + ${lastRect.width * 100}% - 2px)`,
                    top: `calc(${lastRect.y * 100}% - 7px)`,
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: '1.5px 3px',
                    borderRadius: 3,
                    background: hasQuestion ? 'var(--rose)' : 'var(--panel)',
                    color: hasQuestion ? '#ffffff' : 'var(--terracotta)',
                    border: '1px solid var(--line)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                    zIndex: 12,
                    userSelect: 'none',
                    transform: 'scale(0.85)'
                  }}
                  title={hasQuestion ? 'Highlight này có câu hỏi' : 'Highlight này có ghi chú'}
                >
                  {hasQuestion ? '?' : '✎'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
