import './globals.css';
import { THEME_INIT_SCRIPT } from '@/components/ThemeToggle';

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
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
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
