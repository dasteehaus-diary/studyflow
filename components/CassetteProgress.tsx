'use client';

interface CassetteProgressProps {
  value: number;
  variant?: 'full' | 'compact' | 'minimal';
  showLabel?: boolean;
}

export function CassetteProgress({ value, variant = 'full', showLabel = true }: CassetteProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  // Calculate spool sizes (left unspools as pct grows, right spools up)
  const leftTapeRadius = Math.max(5, 14 * (1 - pct / 100));
  const rightTapeRadius = Math.max(5, 14 * (pct / 100));

  if (variant === 'minimal') {
    return (
      <div
        className="cassette minimal"
        aria-label={`Tiến độ ${pct}%`}
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <svg width="60" height="28" viewBox="0 0 60 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Shell */}
          <rect x="0.5" y="0.5" width="59" height="27" rx="3.5" fill="#f4ede1" stroke="#d5cebe" />
          <rect x="12" y="5" width="36" height="18" rx="2" fill="#e2dbcb" />
          {/* Spools */}
          <circle cx="21" cy="14" r={leftTapeRadius * 0.45 + 3} fill="#827663" opacity="0.8" />
          <circle cx="21" cy="14" r="3" fill="#fffdf8" stroke="#484238" strokeWidth="1" />
          <circle cx="39" cy="14" r={rightTapeRadius * 0.45 + 3} fill="#827663" opacity="0.8" />
          <circle cx="39" cy="14" r="3" fill="#fffdf8" stroke="#484238" strokeWidth="1" />
        </svg>
        <div className="track" style={{ flex: 1 }}>
          <span style={{ width: `${pct}%`, transition: 'width 0.3s ease' }} />
        </div>
        {showLabel && <span className="progressText">{pct}%</span>}
      </div>
    );
  }

  return (
    <div
      className="cassette full"
      aria-label={`Tiến độ đọc: ${pct}%`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        maxWidth: 680
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <svg
          width="130"
          height="42"
          viewBox="0 0 130 42"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          {/* Outer Cassette Body */}
          <rect x="0.5" y="0.5" width="129" height="41" rx="4.5" fill="#f7f2ea" stroke="#cfc7b6" />
          
          {/* Corner Screws */}
          <circle cx="4" cy="4" r="1.2" fill="#b0a897" />
          <circle cx="126" cy="4" r="1.2" fill="#b0a897" />
          <circle cx="4" cy="38" r="1.2" fill="#b0a897" />
          <circle cx="126" cy="38" r="1.2" fill="#b0a897" />

          {/* Cassette Label Area */}
          <rect x="12" y="4" width="106" height="34" rx="2" fill="#eee7dc" stroke="#e0d7c8" />
          <line x1="12" y1="11" x2="118" y2="11" stroke="#bd5738" strokeWidth="1.5" />
          
          {/* Text on Cassette */}
          <text x="16" y="9.5" fill="#6d6c62" fontSize="5" fontWeight="700" fontFamily="system-ui, sans-serif">
            SIDE A • STUDYFLOW
          </text>

          {/* Center Window */}
          <rect x="34" y="14" width="62" height="20" rx="3" fill="#3b3730" />
          <rect x="36" y="16" width="58" height="16" rx="2" fill="#25231f" />

          {/* Connecting Tape Ribbon */}
          <line x1="48" y1="24" x2="82" y2="24" stroke="#5a4537" strokeWidth="2.5" />

          {/* Left Reel (Spooling out) */}
          <circle cx="48" cy="24" r={leftTapeRadius} fill="#6e5746" opacity="0.9" />
          <circle cx="48" cy="24" r="5" fill="#fdfbf7" stroke="#333" strokeWidth="1" />
          {/* Spool teeth */}
          <line x1="48" y1="20" x2="48" y2="28" stroke="#777" strokeWidth="1" />
          <line x1="44" y1="24" x2="52" y2="24" stroke="#777" strokeWidth="1" />

          {/* Right Reel (Spooling in) */}
          <circle cx="82" cy="24" r={rightTapeRadius} fill="#6e5746" opacity="0.9" />
          <circle cx="82" cy="24" r="5" fill="#fdfbf7" stroke="#333" strokeWidth="1" />
          {/* Spool teeth */}
          <line x1="82" y1="20" x2="82" y2="28" stroke="#777" strokeWidth="1" />
          <line x1="78" y1="24" x2="86" y2="24" stroke="#777" strokeWidth="1" />
        </svg>
      </div>

      {/* Progress Track Bar */}
      <div
        className="track"
        style={{
          flex: 1,
          height: 6,
          background: '#dfd8cc',
          borderRadius: 999,
          overflow: 'hidden'
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            background: pct >= 100 ? '#73723f' : 'var(--terracotta)',
            transition: 'width 0.3s ease'
          }}
        />
      </div>

      {showLabel && (
        <span
          className="progressText"
          style={{
            fontWeight: 700,
            fontSize: 13,
            minWidth: 42,
            textAlign: 'right',
            color: 'var(--ink)'
          }}
        >
          {pct}%
        </span>
      )}
    </div>
  );
}
