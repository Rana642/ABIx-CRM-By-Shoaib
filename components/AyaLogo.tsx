// Drawn from the ABIx Aya OS brand board (2026-09-10): the gradient A-mark with
// its teal ribbon and dot, the lowercase "aya" wordmark, and the
// "ABIx GROUP | AI OS" line beneath it.
//
// The mark keeps the board's own colours in both themes, as the board shows it
// on dark and light grounds alike. The wordmark and subline follow theme
// tokens so they stay legible on either.
//
// Gradient ids are namespaced by `idPrefix` because every inline SVG shares the
// document's id space: two logos on one page must not point at each other's
// gradients.

export const BRAND = {
  teal: '#00E5D1',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  ink: '#0B1220',
};

function MarkPaths({ idPrefix }: { idPrefix: string }) {
  const leg = `${idPrefix}-leg`;
  const ribbon = `${idPrefix}-ribbon`;
  return (
    <>
      <defs>
        <linearGradient id={leg} x1="10" y1="56" x2="44" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.purple} />
          <stop offset="0.55" stopColor={BRAND.blue} />
          <stop offset="1" stopColor="#7DD3FC" />
        </linearGradient>
        <linearGradient id={ribbon} x1="6" y1="44" x2="54" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.blue} stopOpacity="0.35" />
          <stop offset="0.5" stopColor={BRAND.teal} />
          <stop offset="1" stopColor={BRAND.blue} />
        </linearGradient>
      </defs>
      <path
        d="M12 54 L27.5 13 Q31 5 34.5 13 L50 54"
        stroke={`url(#${leg})`}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7 45 C19 31 37 33 53 46"
        stroke={`url(#${ribbon})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="55" cy="20" r="5" fill={BRAND.teal} />
    </>
  );
}

export function AyaMark({
  className = 'h-8 w-8',
  idPrefix = 'aya-mark',
}: {
  className?: string;
  idPrefix?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <MarkPaths idPrefix={idPrefix} />
    </svg>
  );
}

export function AyaLogo({
  className = 'h-10 w-auto',
  idPrefix = 'aya-logo',
}: {
  className?: string;
  idPrefix?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 176 56"
      fill="none"
      role="img"
      aria-label="Aya — ABIx Group AI OS"
    >
      <svg x="0" y="4" width="48" height="48" viewBox="0 0 64 64">
        <MarkPaths idPrefix={idPrefix} />
      </svg>
      <text
        x="56"
        y="35"
        fontFamily="Outfit, Inter, -apple-system, sans-serif"
        fontSize="34"
        fontWeight="500"
        letterSpacing="-0.01em"
        fill="rgb(var(--c-on-surface))"
      >
        aya
      </text>
      <text
        x="58"
        y="50"
        fontFamily="Inter, -apple-system, sans-serif"
        fontSize="7.2"
        fontWeight="500"
        letterSpacing="0.2em"
        fill="rgb(var(--c-on-surface-variant))"
      >
        ABIx GROUP | AI OS
      </text>
    </svg>
  );
}

// The board's loading sequence: a ring drawing itself around the mark.
export function AyaLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-space-12 py-space-64">
      <div className="relative h-16 w-16">
        <svg className="absolute inset-0 animate-spin [animation-duration:1.4s]" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="aya-loader-arc" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={BRAND.teal} />
              <stop offset="0.5" stopColor={BRAND.blue} />
              <stop offset="1" stopColor={BRAND.purple} />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="29" stroke="rgb(var(--c-outline-variant))" strokeOpacity="0.5" strokeWidth="2.5" />
          <circle
            cx="32"
            cy="32"
            r="29"
            stroke="url(#aya-loader-arc)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="60 122"
          />
        </svg>
        <AyaMark className="absolute inset-[14px] h-9 w-9" idPrefix="aya-loader-mark" />
      </div>
      <span className="font-body-sm text-body-sm text-outline">{label}</span>
    </div>
  );
}
