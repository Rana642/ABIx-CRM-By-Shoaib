'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Shell';

export type Theme = 'light' | 'dark';

// Runs before paint, from layout.tsx, so the first frame is already in the
// right theme. Kept in sync with the logic below by hand — it cannot import.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('aya-theme');
    var dark = stored ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  // Follow the OS while the viewer has never chosen explicitly.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('aya-theme')) return;
      document.documentElement.classList.toggle('dark', e.matches);
      setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('aya-theme', next);
    } catch {
      // Private browsing can refuse writes; the theme still applies for this visit.
    }
    setTheme(next);
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      // Rendered inert until mounted so the server's guess never contradicts
      // what the pre-paint script already applied.
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : 'Switch theme'}
      title={mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : undefined}
      className="p-space-8 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0"
    >
      <Icon
        name={mounted && isDark ? 'light_mode' : 'dark_mode'}
        className="text-[20px] align-middle"
      />
    </button>
  );
}
