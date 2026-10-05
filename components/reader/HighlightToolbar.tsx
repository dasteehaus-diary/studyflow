'use client';

import { useState } from 'react';
import type { HighlightColor } from '@/lib/db/local';

interface HighlightToolbarProps {
  position: { x: number; y: number } | null;
  selectedText: string;
  defaultColor: HighlightColor;
  onHighlight: (color: HighlightColor) => void;
  onAddNote: (quote: string) => void;
  onAddQuestion: (quote: string) => void;
  onClose: () => void;
}

const COLORS: Array<{ id: HighlightColor; name: string; bg: string }> = [
  { id: 'apricot', name: 'Apricot', bg: '#f6a56e' },
  { id: 'rose', name: 'Dusty Rose', bg: '#ea9090' },
  { id: 'olive', name: 'Olive Cream', bg: '#dace8d' },
  { id: 'blue', name: 'Dusty Blue', bg: '#97a8bc' }
];

export function HighlightToolbar({
  position,
  selectedText,
  defaultColor,
  onHighlight,
  onAddNote,
  onAddQuestion,
  onClose
}: HighlightToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!position || !selectedText) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y - 46,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 24,
        boxShadow: 'var(--shadow)',
        display: 'flex',
        alignItems: 'center',
        padding: '4px 6px',
        gap: 6
      }}
      onMouseDown={(e) => e.preventDefault()} // Don't clear selection on mousedown
    >
      {/* Primary Highlight Button */}
      <button
        className="secondary"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          padding: '4px 10px',
          borderRadius: 16
        }}
        onClick={() => {
          onHighlight(defaultColor);
          onClose();
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: COLORS.find(c => c.id === defaultColor)?.bg ?? '#f6a56e'
          }}
        />
        <span>Highlight</span>
      </button>

      {/* Color picker toggle */}
      <button
        className="secondary"
        style={{ fontSize: 11, padding: '4px 6px', borderRadius: 12 }}
        onClick={() => setShowColorPicker(!showColorPicker)}
        title="Chọn màu khác"
      >
        ▾
      </button>

      {/* Add Note Button */}
      <button
        className="secondary"
        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 16 }}
        onClick={() => {
          onAddNote(selectedText);
          onClose();
        }}
      >
        ✎ Note
      </button>

      {/* Add Question Button */}
      <button
        className="secondary"
        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 16 }}
        onClick={() => {
          onAddQuestion(selectedText);
          onClose();
        }}
      >
        ❓ Question
      </button>

      {/* Color picker drop */}
      {showColorPicker && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: 6,
            display: 'flex',
            gap: 6
          }}
        >
          {COLORS.map((c) => (
            <button
              key={c.id}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: c.bg,
                border: '2px solid white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                cursor: 'pointer'
              }}
              title={c.name}
              onClick={() => {
                onHighlight(c.id);
                setShowColorPicker(false);
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
