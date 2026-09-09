'use client';

import { AyaLogo } from './AyaLogo';

export type Section =
  | 'overview'
  | 'ask-aya'
  | 'businesses'
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

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

export function Shell({
  active,
  onNavigate,
  companyName,
  companies,
  companyId,
  onCompanyChange,
  counts,
  children,
}: {
  active: Section;
  onNavigate: (s: Section) => void;
  companyName: string;
  companies: Company[];
  companyId: string;
  onCompanyChange: (id: string) => void;
  counts: { missions: number; workforce: number; brainModules: number; approvals: number };
  children: React.ReactNode;
}) {
  const mainNav: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: 'grid_view' },
    { key: 'ask-aya', label: 'Ask Aya', icon: 'psychology', badge: 'Cmd+K', badgeTone: 'accent' },
    { key: 'businesses', label: 'Businesses', icon: 'domain' },
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
      <aside className="fixed left-0 top-0 h-full w-72 bg-surface-container-lowest border-r border-outline-variant/30 z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col min-h-0">
          <div className="h-16 px-space-20 flex items-center justify-between border-b border-outline-variant/20">
            <div className="flex items-center gap-space-12 min-w-0">
              <AyaLogo className="h-8 w-auto shrink-0" />
            </div>
            <div className="h-2 w-2 rounded-full bg-secondary shrink-0" title="Engine active" />
          </div>

          <div className="px-space-16 pt-space-16 pb-space-8">
            <label className="sr-only" htmlFor="workspace-select">
              Workspace
            </label>
            <div className="p-space-12 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-space-8">
              <div className="flex items-center gap-space-8 min-w-0 flex-1">
                <Icon name="corporate_fare" className="text-secondary text-[18px] shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-label-sm text-label-sm text-outline uppercase">Workspace</span>
                  <select
                    id="workspace-select"
                    value={companyId}
                    onChange={(e) => onCompanyChange(e.target.value)}
                    className="font-body-sm text-body-sm font-semibold text-on-surface bg-transparent border-0 p-0 -ml-0.5 focus:outline-none focus:ring-0 cursor-pointer truncate"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Icon name="unfold_more" className="text-on-surface-variant text-[16px] shrink-0" />
            </div>
          </div>

          <nav className="px-space-12 py-space-8 flex flex-col gap-space-2 overflow-y-auto">
            {mainNav.map((item) => (
              <NavLink key={item.key} item={item} active={active} onNavigate={onNavigate} />
            ))}
          </nav>
        </div>

        <div className="p-space-12 border-t border-outline-variant/20 flex flex-col gap-space-2">
          <nav className="flex flex-col gap-space-2">
            {footerNav.map((item) => (
              <NavLink key={item.key} item={item} active={active} onNavigate={onNavigate} />
            ))}
          </nav>
          <div className="mt-space-8 pt-space-8 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={() => onNavigate('personal')}
              className={`w-full flex items-center justify-between px-space-12 py-space-8 rounded-lg transition-colors font-body-sm text-body-sm border border-tertiary-fixed-dim/40 ${
                active === 'personal'
                  ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                  : 'bg-tertiary-fixed/40 text-on-tertiary-fixed-variant hover:bg-tertiary-fixed hover:text-on-tertiary-fixed'
              }`}
            >
              <span className="flex items-center gap-space-8 min-w-0">
                <Icon name="lock" className="text-tertiary text-[18px]" />
                <span className="truncate font-medium">Personal</span>
              </span>
              <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-tertiary-container text-on-tertiary font-semibold uppercase tracking-wider">
                Vault
              </span>
            </button>
          </div>
        </div>
      </aside>

      <div className="pl-72">
        <header className="fixed top-0 left-72 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/30 z-40 flex items-center justify-between px-space-24 shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-space-16 flex-1 max-w-2xl min-w-0">
            <div className="flex items-center px-space-12 py-space-8 rounded-lg bg-surface-container-low border border-outline-variant/30 shrink-0">
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
                className="w-full h-10 pl-9 pr-space-12 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all"
                placeholder="Search businesses, roles, or Brain modules…"
                type="search"
              />
            </div>
          </div>

          <div className="flex items-center gap-space-16 shrink-0">
            <div
              className="flex items-center gap-space-8 px-space-12 py-space-4 rounded-full bg-surface-container-low border border-outline-variant/30"
              title="No company has been promoted past observe-only yet"
            >
              <span className="h-2 w-2 rounded-full bg-outline" />
              <span className="font-label-sm text-label-sm text-on-surface font-medium">
                Automation: Observe only (A0)
              </span>
            </div>
            <div className="hidden md:flex items-center gap-space-12 pl-space-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <Icon name="person" className="text-on-primary text-[18px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-body-sm text-body-sm font-semibold text-on-surface leading-tight">
                  Serge Abi
                </span>
                <span className="font-label-sm text-label-sm text-outline leading-tight">
                  CEO / Portfolio Principal
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="w-full pt-16 bg-background min-h-screen px-space-24 py-space-24">
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
      className={`w-full flex items-center justify-between px-space-12 py-space-8 rounded-lg transition-colors font-body-sm text-body-sm ${
        isActive
          ? 'bg-primary-container text-on-primary font-semibold'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span className="flex items-center gap-space-12 min-w-0">
        <Icon name={item.icon} className="text-[20px]" />
        <span className="truncate">{item.label}</span>
      </span>
      {item.dot && <span className="h-2 w-2 rounded-full bg-outline" title="None registered" />}
      {item.badge !== undefined && item.badge !== null && (
        <span
          className={
            item.badgeTone === 'alert'
              ? 'h-5 min-w-[20px] px-1 rounded-full bg-error text-on-error font-label-sm text-label-sm flex items-center justify-center font-bold'
              : item.badgeTone === 'accent'
              ? 'font-label-sm text-label-sm px-space-4 py-space-2 bg-secondary-container text-on-secondary-container rounded font-medium'
              : `font-label-sm text-label-sm font-medium tabular-nums ${
                  isActive ? 'text-on-primary/70' : 'text-outline'
                }`
          }
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}
