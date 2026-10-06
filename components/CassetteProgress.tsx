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
 * Minimal vintage cassette progress indicator.
 * Inspired by Japanese stationery and analog audio cassettes.
 * Outer hub boundaries remain physically fixed while the tape pack
 * visually spools from the left hub to the right hub inside the tape window.
 */
export function CassetteProgress({
  value,
  variant = 'reader',
  showLabel = true,
  className = '',
  style
}: CassetteProgressProps) {
  // Normalize percentage to 0..100 integer
  const pct = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

  // Normalize variant mapping
  const normalizedVariant: 'mini' | 'reader' | 'reward' =
    variant === 'mini' || variant === 'compact'
      ? 'mini'
      : variant === 'reward' || variant === 'full'
      ? 'reward'
      : 'reader';

  // SVG dimensions per variant (aspect ratio ~2.7:1)
  const dimensions = {
    mini: { width: 76, height: 28 },
    reader: { width: 104, height: 38 },
    reward: { width: 140, height: 52 }
  }[normalizedVariant];

  // Tape pack calculation strictly contained inside window (center y=25, window y=14..36)
  // Max radius 8.8 (leaving 2.2px buffer to window edges), min radius 4.6
  const leftTapeRadius = Number((8.8 - (pct / 100) * 4.2).toFixed(2));
  const rightTapeRadius = Number((4.6 + (pct / 100) * 4.2).toFixed(2));

  return (
    <div
      className={`studyflow-cassette-widget ${normalizedVariant} ${className}`}
      aria-label={`Tiến độ cuộn băng: ${pct}%`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: normalizedVariant === 'mini' ? 8 : 12,
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
        {/* Outer Cassette Body (Subtle analog shell) */}
        <rect
          x="1"
          y="1"
          width="128"
          height="46"
          rx="4"
          fill="var(--card-bg, #f7f2ea)"
          stroke="var(--line, #cfc7b6)"
          strokeWidth="1.2"
        />

        {/* 4 Corner Screws */}
        <circle cx="5" cy="5" r="1.2" fill="var(--line, #b8afa0)" />
        <circle cx="125" cy="5" r="1.2" fill="var(--line, #b8afa0)" />
        <circle cx="5" cy="43" r="1.2" fill="var(--line, #b8afa0)" />
        <circle cx="125" cy="43" r="1.2" fill="var(--line, #b8afa0)" />

        {/* Cassette Label Area */}
        <rect
          x="14"
          y="5"
          width="102"
          height="38"
          rx="2.5"
          fill="var(--card-subtle, #eee7dc)"
          stroke="var(--line, #e2d9cb)"
          strokeWidth="0.8"
        />

        {/* Top Accent Stripe on Label */}
        <line
          x1="14"
          y1="11.5"
          x2="116"
          y2="11.5"
          stroke="var(--terracotta, #bd5738)"
          strokeWidth="1.2"
          opacity="0.9"
        />

        {/* Label Text: Small, refined retro branding */}
        <text
          x="18"
          y="10"
          fill="var(--muted, #6d6c62)"
          fontSize="4"
          fontWeight="700"
          letterSpacing="0.8px"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        >
          SIDE A · STUDYFLOW
        </text>

        {/* Center Tape Window Outer Rim */}
        <rect
          x="37"
          y="14"
          width="56"
          height="22"
          rx="3"
          fill="#1f1e1a"
          stroke="#161513"
          strokeWidth="0.8"
        />

        {/* Center Tape Window Cutout */}
        <rect
          x="38"
          y="15"
          width="54"
          height="20"
          rx="2"
          fill="#272520"
        />

        {/* Window Calibration Center Tick */}
        <line x1="65" y1="16" x2="65" y2="18.5" stroke="#504c44" strokeWidth="0.8" />
        <line x1="65" y1="31.5" x2="65" y2="34" stroke="#504c44" strokeWidth="0.8" />

        {/* Connecting Tape Ribbon (Safely contained inside window) */}
        <line
          x1="51"
          y1="32.5"
          x2="79"
          y2="32.5"
          stroke="#4b3a2d"
          strokeWidth="1.6"
          strokeLinecap="round"
        />

        {/* LEFT REEL (Source spool: decreases as pct increases) */}
        <g id="left-reel">
          {/* Spooled tape pack */}
          <circle cx="51" cy="25" r={leftTapeRadius} fill="#544336" />
          {/* Reel hub outer white ring */}
          <circle cx="51" cy="25" r="4.2" fill="#fdfbf7" stroke="#292621" strokeWidth="0.8" />
          {/* Inner drive hole */}
          <circle cx="51" cy="25" r="1.8" fill="#201e1a" />
          {/* Hub gear teeth */}
          <line x1="51" y1="21.6" x2="51" y2="28.4" stroke="#77736b" strokeWidth="0.8" />
          <line x1="47.6" y1="25" x2="54.4" y2="25" stroke="#77736b" strokeWidth="0.8" />
        </g>

        {/* RIGHT REEL (Takeup spool: increases as pct increases) */}
        <g id="right-reel">
          {/* Spooled tape pack */}
          <circle cx="79" cy="25" r={rightTapeRadius} fill="#544336" />
          {/* Reel hub outer white ring */}
          <circle cx="79" cy="25" r="4.2" fill="#fdfbf7" stroke="#292621" strokeWidth="0.8" />
          {/* Inner drive hole */}
          <circle cx="79" cy="25" r="1.8" fill="#201e1a" />
          {/* Hub gear teeth */}
          <line x1="79" y1="21.6" x2="79" y2="28.4" stroke="#77736b" strokeWidth="0.8" />
          <line x1="75.6" y1="25" x2="82.4" y2="25" stroke="#77736b" strokeWidth="0.8" />
        </g>

        {/* Bottom Trapezoid Notch (Analog Cassette Signature) */}
        <polygon
          points="46,47 50,43 80,43 84,47"
          fill="var(--card-subtle, #eee7dc)"
          stroke="var(--line, #cfc7b6)"
          strokeWidth="0.8"
        />
      </svg>

      {/* Hero Percentage Label */}
      {showLabel && (
        <span
          className="cassette-label"
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            fontSize: normalizedVariant === 'mini' ? 12 : 13,
            color: pct >= 100 ? 'var(--olive)' : 'var(--ink)',
            whiteSpace: 'nowrap'
          }}
        >
          {pct}%
        </span>
      )}
    </div>
  );
}
