// Inlined from design/stitch_aya_executive_os/aya_abix_executive_os_logo.
// Inlined rather than linked because the export points at a Google-hosted URL
// that is not a stable asset host.
export function AyaLogo({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 48" fill="none" role="img" aria-label="Aya — ABIx Group AI OS">
      <g transform="translate(4, 6)">
        <path d="M18 2L32 32H24.5L20 22H10L5.5 32H-2L12 2H18Z" fill="#183344" />
        <path d="M12 18H20L16 9L12 18Z" fill="#137C72" />
        <circle cx="28" cy="8" r="3.5" fill="#137C72" />
        <path d="M22 13L26.5 9.5" stroke="#137C72" strokeWidth="2" strokeLinecap="round" />
      </g>
      <text
        x="46"
        y="29"
        fontFamily="Inter, -apple-system, sans-serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.04em"
        fill="#183344"
      >
        aya
      </text>
      <line x1="92" y1="14" x2="92" y2="30" stroke="#DCE3EA" strokeWidth="1.5" />
      <text
        x="100"
        y="21"
        fontFamily="Inter, -apple-system, sans-serif"
        fontSize="9"
        fontWeight="700"
        letterSpacing="0.08em"
        fill="#526172"
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
        fill="#137C72"
      >
        AI OS
      </text>
    </svg>
  );
}
