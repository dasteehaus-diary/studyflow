'use client';

import { useState } from 'react';
import type { LocalNote } from '@/lib/db/local';

interface ResumeToastProps {
  page: number;
  activeParkingNote: LocalNote | null;
  openQuestion: LocalNote | null;
  onDismiss: () => void;
}

export function ResumeToast({ page, activeParkingNote, openQuestion, onDismiss }: ResumeToastProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!activeParkingNote && !openQuestion)) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 64,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        width: 'min(540px, 92vw)',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        boxShadow: 'var(--shadow)',
        padding: '16px 20px',
        display: 'grid',
        gap: 10,
        animation: 'slideUp 0.25s ease-out'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="eyebrow" style={{ color: 'var(--terracotta)' }}>
          Lần trước mình dừng ở đây · Trang {page}
        </div>
        <button
          className="secondary"
          style={{ fontSize: 11, padding: '3px 8px', border: 0 }}
          onClick={() => { setDismissed(true); onDismiss(); }}
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>

      {activeParkingNote && (
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          <strong>📌 Parking Note:</strong>
          <div style={{ marginTop: 3, color: 'var(--ink)', background: 'var(--card-subtle)', padding: '8px 12px', borderRadius: 8, fontStyle: 'italic' }}>
            “{activeParkingNote.noteText}”
          </div>
        </div>
      )}

      {openQuestion && (
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          <strong style={{ color: 'var(--rose)' }}>❓ Câu hỏi chưa giải quyết:</strong>
          <div style={{ marginTop: 3, color: 'var(--ink)', fontStyle: 'italic' }}>
            “{openQuestion.noteText}”
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button
          className="primary"
          style={{ padding: '6px 14px', fontSize: 12 }}
          onClick={() => { setDismissed(true); onDismiss(); }}
        >
          Đã hiểu
        </button>
      </div>
    </div>
  );
}
