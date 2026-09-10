import './globals.css';
import { THEME_INIT_SCRIPT } from '@/components/ThemeToggle';

// Marks the page once the icon font can render, so ligature names are never
// shown as text. Without the Font Loading API the icons are simply shown.
const ICONS_READY_SCRIPT = `
(function () {
  var d = document.documentElement;
  try {
    var f = document.fonts;
    if (!f) { d.classList.add('icons-ready'); return; }
    var face = '24px "Material Symbols Outlined"';
    var mark = function () { if (f.check(face)) d.classList.add('icons-ready'); };
    f.load(face).then(mark, mark);
    f.ready.then(mark);
    f.addEventListener && f.addEventListener('loadingdone', mark);
  } catch (e) { d.classList.add('icons-ready'); }
})();
`;

// Tab title as it appears on the brand board's usage example. The favicon is
// app/icon.svg, picked up by Next.js's file convention.
export const metadata = {
  title: 'Aya | ABIx AI OS',
  description: 'ABIx Group AI Operating System — one vision, multiple businesses, real impact.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The pre-paint script below sets a class on this element, so its rendered
    // markup legitimately differs from the server's.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Loaded as links, not @import. A CSS @import is only valid before any
            other rule, and the @tailwind directives expand into rules above it,
            so the browser silently drops the import and every icon renders as
            its literal ligature text. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Outfit:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* One static instance (the only one globals.css ever renders) instead
            of the full variable font, which was several megabytes and slow
            enough to leave icon names on screen. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
          rel="stylesheet"
        />
        {/* Icons stay transparent until their font is confirmed (see globals.css). */}
        <script dangerouslySetInnerHTML={{ __html: ICONS_READY_SCRIPT }} />
        {/* Applies the stored or system theme before first paint, so the page
            never flashes light before switching to dark. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-background font-body-md text-body-md text-on-surface antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
