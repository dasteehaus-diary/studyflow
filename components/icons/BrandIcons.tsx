import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * 1. StudyFlow Cassette / Logo Mark
 * Rounded vintage cassette with dual spools and central viewing window.
 */
export function IconCassetteLogo({ size = 22, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <rect x="6.5" y="8.5" width="11" height="7" rx="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <path d="M10.5 12h3" />
      <path d="M6 19l2-3h8l2 3" />
    </svg>
  );
}

/**
 * 2. Kệ sách (Bookshelf)
 * Clean analog bookshelf with leaning and standing books.
 */
export function IconBookshelf({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 20h18" />
      <rect x="5" y="6" width="3.5" height="14" rx="1" />
      <rect x="9.5" y="4" width="3.5" height="16" rx="1" />
      <path d="M14 8.5l4 11.5" />
      <path d="M16.5 7.5l3.5 10" />
      <path d="M6.5 9h.5" />
      <path d="M11 7h.5" />
    </svg>
  );
}

/**
 * 3. Resume / Tiếp tục đọc
 * Analog tape play loop - gentle retro prompt to resume reading.
 */
export function IconResume({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * 4. Ghi chú (Notebook / Quick Note)
 * Clean stationery notebook with corner fold and bookmark ribbon.
 */
export function IconNotebook({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H18a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6.5a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M4 6h3" />
      <path d="M4 10h3" />
      <path d="M4 14h3" />
      <path d="M10 7h6" />
      <path d="M10 11h6" />
      <path d="M10 15h4" />
    </svg>
  );
}

/**
 * 5. Parking Note
 * Analog pushpin pinning a thoughtful thought to resume later.
 */
export function IconParkingNote({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14" />
      <path d="M7 17l1.5-8.5a3.5 3.5 0 0 1 7 0L17 17" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
    </svg>
  );
}

/**
 * 6. Question
 * Thoughtful conversation question bubble with soft serif question mark.
 */
export function IconQuestion({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" />
    </svg>
  );
}

/**
 * 7. Finish Tape
 * Cassette spool completed with celebration rosette.
 */
export function IconFinishTape({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M8.21 13.89L7 22l5-3 5 3-1.21-8.11" />
      <circle cx="12" cy="8" r="2" />
    </svg>
  );
}

/**
 * 8. Kho B-Side
 * Cassette Side B / Postcard collector icon.
 */
export function IconBSide({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 8h3a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H9" />
      <path d="M9 12h3.5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H9" />
      <path d="M9 8v8" />
    </svg>
  );
}

/**
 * Functional: Settings
 */
export function IconSettings({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Functional: Search
 */
export function IconSearch({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

/**
 * Functional: Plus / Add
 */
export function IconPlus({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * Functional: Close
 */
export function IconClose({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Functional: Checkmark
 */
export function IconCheck({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Functional: More Options (Three Dots)
 */
export function IconMore({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/**
 * Functional: Arrow Left
 */
export function IconArrowLeft({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

/**
 * Functional: Arrow Right
 */
export function IconArrowRight({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/**
 * Functional: Zoom In
 */
export function IconZoomIn({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

/**
 * Functional: Zoom Out
 */
export function IconZoomOut({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

/**
 * Functional: Focus / Distraction-free Viewfinder
 */
export function IconFocus({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/**
 * Functional: Fit Width
 */
export function IconFitWidth({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="2" y1="5" x2="2" y2="19" />
      <line x1="22" y1="5" x2="22" y2="19" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <polyline points="9 9 6 12 9 15" />
      <polyline points="15 9 18 12 15 15" />
    </svg>
  );
}

/**
 * Functional: Fit Page
 */
export function IconFitPage({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="13" y2="15" />
    </svg>
  );
}

/**
 * Functional: Trash / Delete
 */
export function IconTrash({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/**
 * Functional: Tag
 */
export function IconTag({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

/**
 * Functional: Archive Box
 */
export function IconArchive({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

/**
 * Functional: Rotate / Restart
 */
export function IconRotate({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

/**
 * Functional: Pencil / Edit
 */
export function IconPencil({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

/**
 * Decorative: Sleepy cat on stacked books (for sidebar analog warmth)
 */
export function DecoCatOnBooks({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width="140"
      height="68"
      viewBox="0 0 140 68"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ pointerEvents: 'none', userSelect: 'none', ...style }}
    >
      {/* Bottom Book 1 */}
      <rect x="12" y="48" width="116" height="14" rx="3" fill="var(--card-subtle, #eee7dc)" stroke="var(--line, #ded9ce)" strokeWidth="1.2" />
      <line x1="20" y1="52" x2="20" y2="58" stroke="var(--line, #ded9ce)" strokeWidth="1.5" />
      <line x1="26" y1="55" x2="118" y2="55" stroke="var(--muted, #9ba098)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />

      {/* Middle Book 2 */}
      <rect x="18" y="34" width="102" height="14" rx="3" fill="var(--sage, #5E7F68)" opacity="0.25" stroke="var(--sage, #5E7F68)" strokeWidth="1.2" />
      <line x1="26" y1="38" x2="26" y2="44" stroke="var(--sage, #5E7F68)" strokeWidth="1.5" />

      {/* Top Book 3 */}
      <rect x="26" y="22" width="86" height="12" rx="2.5" fill="var(--terracotta, #bd5738)" opacity="0.2" stroke="var(--terracotta, #bd5738)" strokeWidth="1.2" />

      {/* Sleeping Cat body */}
      <ellipse cx="68" cy="18" rx="18" ry="11" fill="var(--peach, #E9A17A)" opacity="0.85" />
      {/* Cat head */}
      <circle cx="84" cy="15" r="8" fill="var(--peach, #E9A17A)" opacity="0.9" />
      {/* Cat ears */}
      <polygon points="82,8 85,3 88,8" fill="var(--coral, #D66F68)" />
      <polygon points="88,9 92,5 93,10" fill="var(--coral, #D66F68)" />
      {/* Cat tail curled */}
      <path d="M50 18 Q42 20 44 26 Q46 28 50 25" stroke="var(--peach, #E9A17A)" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Sleeping closed eyes */}
      <path d="M82 16 Q84 18 86 16" stroke="var(--ink, #222722)" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* Whiskers */}
      <line x1="90" y1="16" x2="96" y2="15" stroke="var(--ink, #222722)" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
      <line x1="90" y1="18" x2="95" y2="19" stroke="var(--ink, #222722)" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />

      {/* Tiny Zzz */}
      <text x="96" y="8" fill="var(--muted, #6F716B)" fontSize="7" fontFamily="monospace" fontWeight="bold">z</text>
      <text x="101" y="4" fill="var(--muted, #6F716B)" fontSize="6" fontFamily="monospace" fontWeight="bold">z</text>
    </svg>
  );
}

/**
 * Decorative: Cute sticky note with gentle tape at the top
 */
export function StickyNote({
  children,
  className = '',
  style
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`studyflow-sticky-note ${className}`}
      style={{
        position: 'relative',
        background: 'var(--sticky-bg, #FFF9E6)',
        border: '1px solid var(--sticky-border, #EFE5C6)',
        borderRadius: 12,
        padding: '16px 18px',
        boxShadow: '0 4px 14px rgba(68, 58, 43, 0.06)',
        color: 'var(--ink, #222722)',
        fontSize: 13,
        lineHeight: 1.5,
        ...style
      }}
    >
      {/* Washi Tape Strip at top */}
      <div
        style={{
          position: 'absolute',
          top: -9,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 54,
          height: 18,
          background: 'rgba(233, 161, 122, 0.45)',
          border: '1px dashed rgba(189, 87, 56, 0.3)',
          borderRadius: 2,
          pointerEvents: 'none'
        }}
      />
      {children}
    </div>
  );
}
