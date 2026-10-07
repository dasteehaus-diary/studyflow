'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { LocalHighlight, LocalNote, HighlightColor } from '@/lib/db/local';

interface HighlightNotePopoverProps {
  documentId: string;
  highlight: LocalHighlight;
  linkedNote: LocalNote | null;
  position: { x: number; y: number };
  onClose: () => void;
  onColorChange: (color: HighlightColor) => void;
  onSaveNote: (noteText: string, type: 'quick' | 'question') => Promise<void>;
  onUpdateNote: (noteId: string, noteText: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onDeleteHighlight: (highlightId: string) => Promise<void>;
  onToggleQuestionStatus: (note: LocalNote) => Promise<void>;
  onConvertNoteType: (note: LocalNote, newType: 'quick' | 'question') => Promise<void>;
}

const COLORS: { key: HighlightColor; hex: string; label: string }[] = [
  { key: 'apricot', hex: '#f6a56e', label: 'Cam ấm' },
  { key: 'rose', hex: '#ea9090', label: 'Hồng phấn' },
  { key: 'olive', hex: '#dace8d', label: 'Cốm nhạt' },
  { key: 'blue', hex: '#97a8bc', label: 'Xanh lam' }
];

export function HighlightNotePopover({
  documentId,
  highlight,
  linkedNote,
  position,
  onClose,
  onColorChange,
  onSaveNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteHighlight,
  onToggleQuestionStatus,
  onConvertNoteType
}: HighlightNotePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Note authoring / editing state
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState(linkedNote?.noteText || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync inputText when linkedNote changes
  useEffect(() => {
    if (linkedNote) {
      setInputText(linkedNote.noteText);
      setIsEditing(false);
    } else {
      setInputText('');
      setIsEditing(true);
    }
  }, [linkedNote]);

  // Responsive mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Click outside to close (Desktop)
  useEffect(() => {
    if (isMobile) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isMobile, onClose]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle Save (Create)
  const handleCreate = async (type: 'quick' | 'question') => {
    if (!inputText.trim()) {
      setErrorMessage('Vui lòng nhập nội dung ghi chú.');
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onSaveNote(inputText.trim(), type);
      setIsEditing(false);
    } catch (err: unknown) {
      console.error('Failed to save note:', err);
      setErrorMessage('Không thể lưu ghi chú: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Save (Edit)
  const handleSaveEdit = async () => {
    if (!linkedNote || !inputText.trim()) {
      setErrorMessage('Nội dung không được để trống.');
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onUpdateNote(linkedNote.id, inputText.trim());
      setIsEditing(false);
    } catch (err: unknown) {
      console.error('Failed to update note:', err);
      setErrorMessage('Không thể cập nhật ghi chú: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Note
  const handleDeleteNoteAction = async () => {
    if (!linkedNote) return;
    try {
      setIsSubmitting(true);
      await onDeleteNote(linkedNote.id);
      setInputText('');
      setIsEditing(true);
      setMenuOpen(false);
    } catch (err: unknown) {
      console.error('Failed to delete note:', err);
      setErrorMessage('Không thể xóa ghi chú: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Highlight
  const handleDeleteHighlightAction = async () => {
    try {
      setIsSubmitting(true);
      await onDeleteHighlight(highlight.id);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to delete highlight:', err);
      setErrorMessage('Không thể xóa highlight: ' + (err instanceof Error ? err.message : String(err)));
      setIsSubmitting(false);
    }
  };

  // Calculate desktop popover position
  const getDesktopStyle = (): React.CSSProperties => {
    const popoverWidth = 330;
    const padding = 16;
    const windowW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Center horizontally on click, clamped within viewport
    let left = position.x - popoverWidth / 2;
    if (left < padding) left = padding;
    if (left + popoverWidth > windowW - padding) left = windowW - popoverWidth - padding;

    // Anchor vertically: default below highlight, flip above if too close to bottom
    const popoverEstimatedHeight = 280;
    let top = position.y + 14;
    if (top + popoverEstimatedHeight > windowH - padding) {
      top = Math.max(padding + 60, position.y - popoverEstimatedHeight - 14);
    }

    return {
      position: 'fixed',
      left: Math.round(left),
      top: Math.round(top),
      width: popoverWidth,
      maxWidth: 'calc(100vw - 32px)',
      background: 'var(--panel)',
      border: '1px solid var(--line)',
      borderRadius: 16,
      boxShadow: '0 16px 40px rgba(0, 0, 0, 0.16)',
      zIndex: 1050,
      padding: 14,
      display: 'grid',
      gap: 10,
      animation: 'fadeIn 0.15s ease-out'
    };
  };

  const currentColorHex = COLORS.find(c => c.key === highlight.color)?.hex || '#f6a56e';
  const isQuestion = linkedNote?.type === 'question';
  const isResolved = linkedNote?.status === 'resolved';

  const popoverContent = (
    <div
      ref={popoverRef}
      style={isMobile ? {
        background: 'var(--panel)',
        borderRadius: '20px 20px 0 0',
        padding: '18px 18px 28px',
        display: 'grid',
        gap: 12,
        maxHeight: '80vh',
        overflowY: 'auto'
      } : getDesktopStyle()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header: Color Picker + Quick Actions + Menu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {/* Colors */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {COLORS.map((c) => {
            const isSelected = highlight.color === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onColorChange(c.key)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: c.hex,
                  border: isSelected ? '2px solid var(--ink)' : '1px solid rgba(0,0,0,0.15)',
                  transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                  transition: 'transform 0.1s ease',
                  cursor: 'pointer',
                  padding: 0
                }}
                title={`Đổi màu sang ${c.label}`}
              />
            );
          })}
        </div>

        {/* Right Action Icons: Sổ tay + More menu + Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link
            href="/notebook"
            className="secondary"
            style={{
              fontSize: 11,
              padding: '3px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              textDecoration: 'none',
              borderRadius: 8,
              background: 'var(--sf-mint-soft)',
              color: 'var(--sf-mint-strong)',
              border: '1px solid var(--sf-mint)'
            }}
            title="Mở trong Sổ tay tri thức"
          >
            <span>📖 Ghi chép</span>
          </Link>

          {/* More menu button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="secondary"
              style={{ fontSize: 13, padding: '2px 7px', border: 0, borderRadius: 6 }}
              onClick={() => setMenuOpen(!menuOpen)}
              title="Tùy chọn khác"
            >
              •••
            </button>

            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 26,
                  zIndex: 1060,
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  boxShadow: 'var(--shadow)',
                  padding: 4,
                  minWidth: 140,
                  display: 'grid',
                  gap: 2
                }}
              >
                {linkedNote && (
                  <button
                    type="button"
                    className="secondary danger"
                    style={{ fontSize: 11, padding: '6px 10px', textAlign: 'left', border: 0, width: '100%' }}
                    onClick={handleDeleteNoteAction}
                  >
                    🗑️ Xóa ghi chú
                  </button>
                )}
                <button
                  type="button"
                  className="secondary danger"
                  style={{ fontSize: 11, padding: '6px 10px', textAlign: 'left', border: 0, width: '100%' }}
                  onClick={handleDeleteHighlightAction}
                >
                  🗑️ Xóa highlight
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="secondary"
            style={{ fontSize: 13, padding: '2px 6px', border: 0, borderRadius: 6 }}
            onClick={onClose}
            title="Đóng"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Quote Preview */}
      <div
        style={{
          fontSize: 12,
          fontStyle: 'italic',
          borderLeft: `3px solid ${currentColorHex}`,
          paddingLeft: 8,
          color: 'var(--muted)',
          maxHeight: 56,
          overflowY: 'auto',
          lineHeight: 1.45
        }}
      >
        “{highlight.quoteText}”
      </div>

      {/* Error message banner */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            background: 'var(--banner-error-bg)',
            border: '1px solid var(--banner-error-border)',
            color: 'var(--banner-error-text)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11
          }}
        >
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Note Area */}
      {!linkedNote || isEditing ? (
        /* Composer Mode (Add new note or edit existing) */
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              linkedNote?.type === 'question'
                ? 'Câu hỏi cần làm rõ… (Ctrl+Enter để lưu)'
                : 'Thêm ghi chú suy nghĩ… (Ctrl+Enter để lưu)'
            }
            rows={3}
            autoFocus
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--line)',
              padding: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (linkedNote) handleSaveEdit();
                else handleCreate('quick');
              }
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 10 }}>Ctrl+Enter để lưu</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {linkedNote && (
                <button
                  type="button"
                  className="secondary"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => {
                    setInputText(linkedNote.noteText);
                    setIsEditing(false);
                    setErrorMessage(null);
                  }}
                  disabled={isSubmitting}
                >
                  Hủy
                </button>
              )}

              {linkedNote ? (
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: 11, padding: '4px 12px' }}
                  onClick={handleSaveEdit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Đang lưu…' : 'Lưu'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary"
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      color: 'var(--sf-coral)',
                      background: 'var(--sf-coral-soft)',
                      border: '1px solid var(--sf-coral)'
                    }}
                    onClick={() => handleCreate('question')}
                    disabled={isSubmitting}
                    title="Lưu dưới dạng câu hỏi"
                  >
                    ❓ Câu hỏi
                  </button>
                  <button
                    type="button"
                    className="primary"
                    style={{
                      fontSize: 11,
                      padding: '4px 12px',
                      background: 'var(--sf-mint-strong)',
                      color: 'white',
                      border: 0
                    }}
                    onClick={() => handleCreate('quick')}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Đang lưu…' : 'Lưu ghi chú'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* View Mode (Display existing note & actions) */
        <div style={{ display: 'grid', gap: 8 }}>
          {/* Question Status Banner */}
          {isQuestion && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 700,
                  background: isResolved ? 'var(--sf-mint-soft)' : 'var(--sf-coral-soft)',
                  color: isResolved ? 'var(--sf-mint-strong)' : 'var(--sf-coral)',
                  border: `1px solid ${isResolved ? 'var(--sf-mint)' : 'rgba(228, 119, 104, 0.4)'}`
                }}
              >
                {isResolved ? '✓ Đã giải quyết' : '❓ Chưa giải quyết'}
              </span>

              <button
                type="button"
                className="secondary"
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  color: isResolved ? 'var(--muted)' : 'var(--sf-mint-strong)',
                  background: isResolved ? 'var(--card-subtle)' : 'var(--sf-mint-soft)',
                  border: `1px solid ${isResolved ? 'var(--line)' : 'var(--sf-mint)'}`
                }}
                onClick={() => onToggleQuestionStatus(linkedNote)}
              >
                {isResolved ? '↩ Mở lại câu hỏi' : '✓ Đánh dấu đã giải đáp'}
              </button>
            </div>
          )}

          {/* Note Body Text */}
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              color: 'var(--ink)',
              padding: '6px 8px',
              background: 'var(--card-subtle)',
              borderRadius: 8
            }}
          >
            {linkedNote.noteText}
          </div>

          {/* Bottom Actions Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <span className="muted" style={{ fontSize: 10 }}>Trang {highlight.page}</span>

            <div style={{ display: 'flex', gap: 6 }}>
              {isQuestion ? (
                <button
                  type="button"
                  className="secondary"
                  style={{ fontSize: 10, padding: '3px 8px' }}
                  onClick={() => onConvertNoteType(linkedNote, 'quick')}
                  title="Chuyển câu hỏi này thành ghi chú thông thường"
                >
                  ✎ Thành ghi chú
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  style={{ fontSize: 10, padding: '3px 8px', color: 'var(--sf-coral)' }}
                  onClick={() => onConvertNoteType(linkedNote, 'question')}
                  title="Biến ghi chú này thành câu hỏi"
                >
                  ❓ Thành câu hỏi
                </button>
              )}

              <button
                type="button"
                className="secondary"
                style={{ fontSize: 10, padding: '3px 8px' }}
                onClick={() => {
                  setInputText(linkedNote.noteText);
                  setIsEditing(true);
                  setErrorMessage(null);
                }}
                title="Sửa nội dung ghi chú"
              >
                ✎ Sửa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Render Mobile Bottom Sheet or Desktop Anchored Popover
  if (isMobile) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          zIndex: 1049,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={onClose}
      >
        {popoverContent}
      </div>
    );
  }

  return popoverContent;
}
