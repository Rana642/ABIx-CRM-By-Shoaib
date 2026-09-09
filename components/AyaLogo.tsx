// Inlined from design/stitch_aya_executive_os/aya_abix_executive_os_logo.
// Inlined rather than linked because the export points at a Google-hosted URL
// that is not a stable asset host.
//
// Fills are bound to theme tokens rather than the export's literal hexes: the
// mark and wordmark are navy on light and pale blue on dark, so the logo stays
// legible instead of disappearing into a dark sidebar.
export function AyaLogo({ className = 'h-8 w-auto' }: { className?: string }) {
  const mark = 'rgb(var(--c-primary-container))';
  const accent = 'rgb(var(--c-secondary))';

  return (
    <svg
      className={className}
      viewBox="0 0 200 48"
      fill="none"
      role="img"
      aria-label="Aya — ABIx Group AI OS"
    >
      <g transform="translate(4, 6)">
        <path d="M18 2L32 32H24.5L20 22H10L5.5 32H-2L12 2H18Z" fill={mark} />
        <path d="M12 18H20L16 9L12 18Z" fill={accent} />
        <circle cx="28" cy="8" r="3.5" fill={accent} />
        <path d="M22 13L26.5 9.5" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </g>
      <text
        x="46"
        y="29"
        fontFamily="Inter, -apple-system, sans-serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.04em"
        fill={mark}
      >
        aya
      </text>
      <line
        x1="92"
        y1="14"
        x2="92"
        y2="30"
        stroke="rgb(var(--c-outline-variant))"
        strokeWidth="1.5"
      />
      <text
        x="100"
        y="21"
        fontFamily="Inter, -apple-system, sans-serif"
        fontSize="9"
        fontWeight="700"
        letterSpacing="0.08em"
        fill="rgb(var(--c-on-surface-variant))"
      >
        ABIX GROUP
      </text>
      <text
        x="100"
        y="29"
        fontFamily="Inter, -apple-system, sans-serif"
        fontSize="8.5"
        fontWeight="500"
        letterSpacing="0.02em"
        fill={accent}
      >
        AI OS
      </text>
    </svg>
  );
}
