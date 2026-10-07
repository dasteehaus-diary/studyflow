'use client';

import React from 'react';

export interface CassetteProgressProps {
  value: number;
  variant?: 'mini' | 'reader' | 'reward' | 'compact' | 'full';
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Clean Soft Minimal cassette progress indicator.
 * Physical reading position indicator: left hub spools to right hub.
 * Refined with soft mint & neutral palette.
 */
export function CassetteProgress({
  value,
  variant = 'reader',
  showLabel = true,
  className = '',
  style
}: CassetteProgressProps) {
  // Normalize percentage to 0..100 with 1 decimal place
  const num = Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(100, Math.round(num * 10) / 10));

  const normalizedVariant: 'mini' | 'reader' | 'reward' =
    variant === 'mini' || variant === 'compact'
      ? 'mini'
      : variant === 'reward' || variant === 'full'
      ? 'reward'
      : 'reader';

  const dimensions = {
    mini: { width: 76, height: 28 },
    reader: { width: 104, height: 38 },
    reward: { width: 140, height: 52 }
  }[normalizedVariant];

  // Tape pack calculation strictly contained inside window (center y=25, window y=14..36)
  const leftTapeRadius = Number((8.8 - (pct / 100) * 4.2).toFixed(2));
  const rightTapeRadius = Number((4.6 + (pct / 100) * 4.2).toFixed(2));

  return (
    <div
      className={`studyflow-cassette-widget ${normalizedVariant} ${className}`}
      aria-label={`Vị trí đọc: ${pct}% tài liệu`}
      title="Cassette biểu thị vị trí trang đọc của bạn trong tài liệu."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: normalizedVariant === 'mini' ? 8 : 10,
        userSelect: 'none',
        ...style
      }}
    >
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 130 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
      >
        {/* Outer Cassette Body (Clean rounded shell) */}
        <rect
          x="1"
          y="1"
          width="128"
          height="46"
          rx="6"
          fill="var(--sf-surface)"
          stroke="var(--sf-line)"
          strokeWidth="1.2"
        />

        {/* 4 Corner Screws (Subtle soft dots) */}
        <circle cx="5" cy="5" r="1.2" fill="var(--sf-line)" />
        <circle cx="125" cy="5" r="1.2" fill="var(--sf-line)" />
        <circle cx="5" cy="43" r="1.2" fill="var(--sf-line)" />
        <circle cx="125" cy="43" r="1.2" fill="var(--sf-line)" />

        {/* Cassette Label Area */}
        <rect
          x="14"
          y="5"
          width="102"
          height="38"
          rx="4"
          fill="var(--sf-surface-soft)"
          stroke="var(--sf-line)"
          strokeWidth="0.8"
        />

        {/* Top Accent Line on Label (Coral touch) */}
        <line
          x1="14"
          y1="11.5"
          x2="116"
          y2="11.5"
          stroke="var(--sf-coral)"
          strokeWidth="1.2"
          opacity="0.85"
        />

        {/* Label Text */}
        <text
          x="18"
          y="9.8"
          fill="var(--sf-muted)"
          fontSize="4"
          fontWeight="700"
          letterSpacing="0.8px"
          fontFamily="inherit"
        >
          SIDE A · STUDYFLOW
        </text>

        {/* Center Tape Window Cutout */}
        <rect
          x="38"
          y="14"
          width="54"
          height="22"
          rx="4"
          fill="var(--sf-mint-soft)"
          stroke="var(--sf-line)"
          strokeWidth="0.8"
        />

        {/* Window Center Tick */}
        <line x1="65" y1="15" x2="65" y2="17.5" stroke="var(--sf-mint-strong)" strokeWidth="0.8" opacity="0.6" />
        <line x1="65" y1="32.5" x2="65" y2="35" stroke="var(--sf-mint-strong)" strokeWidth="0.8" opacity="0.6" />

        {/* Connecting Tape Ribbon */}
        <line
          x1="51"
          y1="33"
          x2="79"
          y2="33"
          stroke="var(--sf-mint-strong)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* LEFT REEL (Source spool: decreases as pct increases) */}
        <g id="left-reel">
          {/* Spooled tape pack */}
          <circle cx="51" cy="25" r={leftTapeRadius} fill="var(--sf-mint-strong)" opacity="0.85" />
          {/* Reel hub outer white ring */}
          <circle cx="51" cy="25" r="4.2" fill="var(--sf-surface)" stroke="var(--sf-mint-strong)" strokeWidth="0.8" />
          {/* Inner drive hole */}
          <circle cx="51" cy="25" r="1.8" fill="var(--sf-ink)" />
          {/* Hub gear teeth */}
          <line x1="51" y1="21.8" x2="51" y2="28.2" stroke="var(--sf-mint-strong)" strokeWidth="0.8" />
          <line x1="47.8" y1="25" x2="54.2" y2="25" stroke="var(--sf-mint-strong)" strokeWidth="0.8" />
        </g>

        {/* RIGHT REEL (Takeup spool: increases as pct increases) */}
        <g id="right-reel">
          {/* Spooled tape pack */}
          <circle cx="79" cy="25" r={rightTapeRadius} fill="var(--sf-mint-strong)" opacity="0.85" />
          {/* Reel hub outer white ring */}
          <circle cx="79" cy="25" r="4.2" fill="var(--sf-surface)" stroke="var(--sf-mint-strong)" strokeWidth="0.8" />
          {/* Inner drive hole */}
          <circle cx="79" cy="25" r="1.8" fill="var(--sf-ink)" />
          {/* Hub gear teeth */}
          <line x1="79" y1="21.8" x2="79" y2="28.2" stroke="var(--sf-mint-strong)" strokeWidth="0.8" />
          <line x1="75.8" y1="25" x2="82.2" y2="25" stroke="var(--sf-mint-strong)" strokeWidth="0.8" />
        </g>
      </svg>

      {/* Percentage Label */}
      {showLabel && (
        <span
          style={{
            fontSize: normalizedVariant === 'mini' ? 12 : 13,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--ink)'
          }}
        >
          {pct}%
        </span>
      )}
    </div>
  );
}
