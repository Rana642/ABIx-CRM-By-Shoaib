'use client';

import { useEffect, useState } from 'react';
import { AyaLogo } from './AyaLogo';
import { ThemeToggle } from './ThemeToggle';

export type Section =
  | 'overview'
  | 'ask-aya'
  | 'businesses'
  | 'onboarding'
  | 'sales-and-customers'
  | 'missions'
  | 'workforce'
  | 'company-brain'
  | 'approvals'
  | 'insights-and-costs'
  | 'connectors'
  | 'settings'
  | 'personal';

export type Company = {
  id: string;
  name: string;
  slug: string;
  entity_type: string;
  status?: string;
};

type NavItem = {
  key: Section;
  label: string;
  icon: string;
  badge?: string | number | null;
  badgeTone?: 'muted' | 'alert' | 'accent';
  dot?: boolean;
};

// Level names from 02_AUTHORITY_POLICY.yaml (observe, draft, routine_execute,
// threshold_execute, human_only).
export const LEVEL_LABEL: Record<string, string> = {
  A0: 'Observe only',
  A1: 'Draft for review',
  A2: 'Routine execution',
  A3: 'Threshold execution',
  A4: 'Human only',
};

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

export function Shell({
  active,
  onNavigate,
  companyName,
  companies,
  companyId,
  onCompanyChange,
  counts,
  autonomy,
  children,
}: {
  active: Section;
  onNavigate: (s: Section) => void;
  companyName: string;
  companies: Company[];
  companyId: string;
  onCompanyChange: (id: string) => void;
  counts: { missions: number; workforce: number; brainModules: number; approvals: number };
  // Highest authority level any company currently holds, and how many are
  // above observe-only. Null until the portfolio has been read.
  autonomy: { level: string; above: number; total: number } | null;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer on navigation and whenever the viewport grows past lg,
  // so returning to desktop never leaves a stale backdrop behind.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const close = () => mq.matches && setNavOpen(false);
    mq.addEventListener('change', close);
    return () => mq.removeEventListener('change', close);
  }, []);

  const go = (s: Section) => {
    onNavigate(s);
    setNavOpen(false);
  };

  const mainNav: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: 'grid_view' },
    { key: 'ask-aya', label: 'Ask Aya', icon: 'psychology', badge: 'Cmd+K', badgeTone: 'accent' },
    { key: 'businesses', label: 'Businesses', icon: 'domain' },
    { key: 'onboarding', label: 'Onboarding', icon: 'assignment' },
    { key: 'sales-and-customers', label: 'Sales & Customers', icon: 'vital_signs' },
    { key: 'missions', label: 'Missions', icon: 'task_alt', badge: counts.missions },
    { key: 'workforce', label: 'Workforce', icon: 'smart_toy', badge: counts.workforce },
    { key: 'company-brain', label: 'Company Brain', icon: 'neurology', badge: counts.brainModules },
    {
      key: 'approvals',
      label: 'Approvals',
      icon: 'verified',
      badge: counts.approvals,
      badgeTone: counts.approvals > 0 ? 'alert' : 'muted',
    },
    { key: 'insights-and-costs', label: 'Insights & Costs', icon: 'monitoring' },
  ];

  const footerNav: NavItem[] = [
    { key: 'connectors', label: 'Connectors', icon: 'hub', dot: true },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <>
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-inverse-surface/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-surface-container-lowest border-r border-outline-variant/30 z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition-transform duration-200 lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col min-h-0">
          <div className="h-16 px-space-20 flex items-center justify-between border-b border-outline-variant/20 shrink-0">
            <AyaLogo className="h-10 w-auto shrink-0" />
            <div className="flex items-center gap-space-8">
              <span className="h-2 w-2 rounded-full bg-secondary shrink-0" title="Engine active" />
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="lg:hidden text-outline hover:text-on-surface p-space-4 rounded-lg hover:bg-surface-container"
                aria-label="Close navigation"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
          </div>

          <div className="px-space-16 pt-space-16 pb-space-8 shrink-0">
            <label className="sr-only" htmlFor="workspace-select">
              Workspace
            </label>
            <div className="p-space-12 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center gap-space-8">
              <Icon name="corporate_fare" className="text-secondary text-[18px]" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-label-sm text-label-sm text-outline uppercase">Workspace</span>
                <select
                  id="workspace-select"
                  value={companyId}
                  onChange={(e) => onCompanyChange(e.target.value)}
                  className="w-full font-body-sm text-body-sm font-semibold text-on-surface bg-transparent border-0 p-0 focus:outline-none focus:ring-0 cursor-pointer truncate"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Icon name="unfold_more" className="text-on-surface-variant text-[16px]" />
            </div>
          </div>

          <nav className="px-space-12 py-space-8 flex flex-col gap-space-2 overflow-y-auto">
            {mainNav.map((item) => (
              <NavLink key={item.key} item={item} active={active} onNavigate={go} />
            ))}
          </nav>
        </div>

        <div className="p-space-12 border-t border-outline-variant/20 flex flex-col gap-space-2 shrink-0">
          <nav className="flex flex-col gap-space-2">
            {footerNav.map((item) => (
              <NavLink key={item.key} item={item} active={active} onNavigate={go} />
            ))}
          </nav>
          <div className="mt-space-8 pt-space-8 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={() => go('personal')}
              className={`w-full flex items-center justify-between gap-space-8 px-space-12 py-space-8 rounded-lg transition-colors font-body-sm text-body-sm border border-tertiary-fixed-dim/40 ${
                active === 'personal'
                  ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                  : 'bg-tertiary-fixed/40 text-on-tertiary-fixed-variant hover:bg-tertiary-fixed hover:text-on-tertiary-fixed dark:text-on-tertiary-container dark:hover:text-on-tertiary-fixed'
              }`}
            >
              <span className="flex items-center gap-space-8 min-w-0">
                <Icon name="lock" className="text-tertiary text-[18px]" />
                <span className="truncate font-medium">Personal</span>
              </span>
              <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-tertiary-container text-on-tertiary dark:text-on-tertiary-container font-semibold uppercase tracking-wider shrink-0">
                Vault
              </span>
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="fixed top-0 left-0 right-0 lg:left-72 h-16 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/30 z-30 flex items-center justify-between gap-space-12 px-space-16 lg:px-space-24 shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-space-12 flex-1 max-w-2xl min-w-0">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="lg:hidden text-on-surface-variant hover:text-on-surface p-space-8 rounded-lg hover:bg-surface-container shrink-0"
              aria-label="Open navigation"
            >
              <Icon name="menu" className="text-[22px]" />
            </button>

            <div className="hidden sm:flex items-center px-space-12 py-space-8 rounded-lg bg-surface-container-low border border-outline-variant/30 shrink-0">
              <span className="font-body-sm text-body-sm font-semibold truncate max-w-[180px]">
                {companyName}
              </span>
            </div>

            <div className="relative flex-1 min-w-0">
              <Icon
                name="search"
                className="absolute left-space-12 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none"
              />
              <input
                className="w-full h-10 pl-10 pr-space-12 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all"
                placeholder="Search businesses, roles, or Brain modules…"
                type="search"
              />
            </div>
          </div>

          <div className="flex items-center gap-space-12 shrink-0">
            {autonomy && (
              <div
                className="hidden xl:flex items-center gap-space-8 px-space-12 py-space-4 rounded-full bg-surface-container-low border border-outline-variant/30"
                title={
                  autonomy.above === 0
                    ? 'No company has been promoted past observe-only yet'
                    : `${autonomy.above} of ${autonomy.total} companies above observe-only. Highest level held: ${autonomy.level}.`
                }
              >
                <span
                  className={`h-2 w-2 rounded-full ${autonomy.above > 0 ? 'bg-secondary' : 'bg-outline'}`}
                />
                <span className="font-label-sm text-label-sm text-on-surface font-medium whitespace-nowrap">
                  Automation: {LEVEL_LABEL[autonomy.level] ?? autonomy.level} ({autonomy.level})
                  <span className="text-outline tabular-nums">
                    {' '}
                    · {autonomy.above}/{autonomy.total}
                  </span>
                </span>
              </div>
            )}
            <ThemeToggle />
            <div className="flex items-center gap-space-8">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Icon name="person" className="text-on-primary text-[18px]" />
              </div>
              <div className="hidden md:flex flex-col min-w-0">
                <span className="font-body-sm text-body-sm font-semibold text-on-surface leading-tight truncate">
                  Serge Abi
                </span>
                <span className="font-label-sm text-label-sm text-outline leading-tight truncate">
                  CEO / Portfolio Principal
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="w-full pt-16 bg-background min-h-screen px-space-16 lg:px-space-24 py-space-24">
          {children}
        </main>
      </div>
    </>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: Section;
  onNavigate: (s: Section) => void;
}) {
  const isActive = active === item.key;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      aria-current={isActive ? 'page' : undefined}
      className={`w-full flex items-center justify-between gap-space-8 px-space-12 py-space-8 rounded-lg transition-colors font-body-sm text-body-sm ${
        isActive
          ? 'bg-primary-container text-on-primary font-semibold'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span className="flex items-center gap-space-12 min-w-0">
        <Icon name={item.icon} className="text-[20px]" />
        <span className="truncate">{item.label}</span>
      </span>
      {item.dot && (
        <span className="h-2 w-2 rounded-full bg-outline shrink-0" title="None registered" />
      )}
      {item.badge !== undefined && item.badge !== null && (
        <span
          className={`shrink-0 ${
            item.badgeTone === 'alert'
              ? 'h-5 min-w-[20px] px-1 rounded-full bg-error text-on-error font-label-sm text-label-sm flex items-center justify-center font-bold'
              : item.badgeTone === 'accent'
              ? 'font-label-sm text-label-sm px-space-4 py-space-2 bg-secondary-container text-on-secondary-container rounded font-medium'
              : `font-label-sm text-label-sm font-medium tabular-nums ${
                  isActive ? 'text-on-primary/70' : 'text-outline'
                }`
          }`}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}
