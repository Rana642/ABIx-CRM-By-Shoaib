'use client';

import { useEffect, useState } from 'react';
import { Shell, LEVEL_LABEL, type Section, type Company } from '@/components/Shell';
import { AyaIntro, ComingSoon } from '@/components/ui';
import { Overview } from '@/components/screens/Overview';
import { Businesses } from '@/components/screens/Businesses';
import { CompanyBrain } from '@/components/screens/CompanyBrain';
import { Workforce } from '@/components/screens/Workforce';
import { SalesCustomers } from '@/components/screens/SalesCustomers';
import { Onboarding } from '@/components/screens/Onboarding';
import { Insights } from '@/components/screens/Insights';
import { Inbox } from '@/components/screens/Inbox';
import { Settings } from '@/components/screens/Settings';
import { Users } from '@/components/screens/Users';
import type {
  Portfolio,
  Blocker,
  LaunchpadEntry,
  AgentRole,
  Division,
  BrainModule,
  BrainSummary,
  Lead,
  Contact,
  Stats,
} from '@/components/types';

// The signed-in person and what they may do (Users & Access, /api/me).
type Me = {
  username: string;
  display_name: string;
  is_owner: boolean;
  can_manage_users: boolean;
  portfolio: boolean;
  workspaces: { company_id: string; code: string; name: string; permissions: string[] | null }[];
};

// Sections that need no portfolio-wide access: the ones of a single workspace.
const WORKSPACE_SECTIONS: Section[] = ['sales-and-customers', 'inbox', 'company-brain', 'onboarding', 'settings'];

function roleLabel(m: Me): string {
  if (m.is_owner) return 'Owner';
  const perms = new Set(m.workspaces.flatMap((w) => w.permissions ?? []));
  const role = perms.has('agents.pause') ? 'Workspace Administrator' : perms.has('inbox.reply') ? 'Operator' : 'Viewer';
  if (m.portfolio) return `${role} · all businesses`;
  return m.workspaces.length === 1 ? `${role} · ${m.workspaces[0].name}` : role;
}

export default function Dashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [me, setMe] = useState<Me | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [launchpad, setLaunchpad] = useState<LaunchpadEntry[]>([]);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const [modules, setModules] = useState<BrainModule[]>([]);
  const [brainSummary, setBrainSummary] = useState<BrainSummary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  // Bumped when the onboarding record changes the Brain, so its screen re-reads.
  const [brainTick, setBrainTick] = useState(0);

  // Deep links such as /?section=insights-and-costs open that section directly.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('section');
    const known: Section[] = [
      'overview', 'ask-aya', 'businesses', 'onboarding', 'sales-and-customers', 'inbox', 'missions',
      'workforce', 'company-brain', 'approvals', 'insights-and-costs', 'connectors', 'settings',
      'personal', 'users',
    ];
    if (wanted && (known as string[]).includes(wanted)) setSection(wanted as Section);
  }, []);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Me | null) => setMe(m));
  }, []);

  const allowed: Section[] = !me
    ? []
    : me.portfolio
      ? ['overview', 'ask-aya', 'businesses', 'onboarding', 'sales-and-customers', 'inbox', 'missions', 'workforce',
         'company-brain', 'approvals', 'insights-and-costs', 'connectors', 'settings', 'personal',
         ...(me.can_manage_users ? (['users'] as Section[]) : [])]
      : [...WORKSPACE_SECTIONS, ...(me.can_manage_users ? (['users'] as Section[]) : [])];

  // Open a section the person may see.
  useEffect(() => {
    if (me && !allowed.includes(section)) setSection(allowed.includes('sales-and-customers') ? 'sales-and-customers' : allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, section]);

  const permsHere = new Set(
    me?.is_owner ? ['crm.edit', 'intake.edit', 'inbox.reply'] : me?.workspaces.find((w) => w.company_id === companyId)?.permissions ?? []
  );

  useEffect(() => {
    if (!me) return;
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data: Company[]) => {
        setCompanies(data);
        const clif = data.find((c) => c.slug === 'clif');
        const firstOperating = clif ?? data.find((c) => c.entity_type !== 'portfolio') ?? data[0];
        if (firstOperating) setCompanyId(firstOperating.id);
      });
    if (!me.portfolio) return;
    fetch('/api/portfolio').then((r) => r.json()).then(setPortfolio);
    fetch('/api/blockers').then((r) => r.json()).then(setBlockers);
    fetch('/api/launchpad').then((r) => r.json()).then(setLaunchpad);
    fetch('/api/workforce')
      .then((r) => r.json())
      .then((d) => {
        setRoles(d.roles);
        setDivisions(d.divisions);
      });
  }, [me]);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/company-brain?company_id=${companyId}`)
      .then((r) => r.json())
      .then((d) => {
        setModules(d.modules ?? []);
        setBrainSummary(d.summary ?? null);
      });
  }, [companyId, brainTick]);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      fetch(`/api/stats?company_id=${companyId}`).then((r) => r.json()),
      fetch(`/api/leads?company_id=${companyId}`).then((r) => r.json()),
      fetch(`/api/contacts?company_id=${companyId}`).then((r) => r.json()),
    ]).then(([s, l, c]) => {
      setStats(s);
      setLeads(l);
      setContacts(c);
    });
  }, [companyId]);

  async function moveLead(leadId: string, newStage: string) {
    // Viewers cannot change leads; the API refuses it too.
    if (!permsHere.has('crm.edit')) {
      alert('Your access to this business is view-only.');
      return;
    }
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: newStage } : l))
    );
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadId, pipeline_stage: newStage }),
    });
  }

  const currentCompany = companies.find((c) => c.id === companyId);
  const companyName = currentCompany?.name ?? 'Loading…';

  // The highest level any company actually holds, so the header and the
  // "needs first" lists describe today's state rather than the day they were written.
  const LEVELS = ['A0', 'A1', 'A2', 'A3', 'A4'];
  const topLevel = launchpad.reduce((top, e) => {
    const l = e.effective_level ?? 'A0';
    return LEVELS.indexOf(l) > LEVELS.indexOf(top) ? l : top;
  }, 'A0');
  const autonomy = portfolio
    ? {
        level: topLevel,
        above: portfolio.autonomy.companies_above_a0,
        total: portfolio.companies.total,
      }
    : null;

  return (
    <Shell
      active={section}
      onNavigate={setSection}
      companyName={companyName}
      companies={companies}
      companyId={companyId}
      onCompanyChange={setCompanyId}
      counts={{
        missions: portfolio?.ops.work_orders ?? 0,
        workforce: roles.length,
        brainModules: brainSummary?.modules_total ?? 0,
        approvals: portfolio?.ops.approvals_pending ?? 0,
      }}
      autonomy={autonomy}
      allowed={allowed}
      user={me ? { name: me.display_name, role: roleLabel(me) } : null}
    >
      {section === 'overview' && (
        <Overview
          portfolio={portfolio}
          blockers={blockers}
          launchpad={launchpad}
          onNavigate={setSection}
        />
      )}

      {section === 'businesses' && (
        <Businesses
          launchpad={launchpad}
          blockers={blockers}
          onOpenBrain={(id) => {
            setCompanyId(id);
            setSection('company-brain');
          }}
        />
      )}

      {section === 'onboarding' && companyId && !permsHere.has('intake.edit') && (
        <div role="status" className="mb-space-12 rounded-lg bg-surface-container-high px-space-12 py-space-8 font-body-sm text-body-sm text-on-surface-variant">
          View only: your access lets you read this record, not change or approve it.
        </div>
      )}
      {section === 'onboarding' && companyId && (
        <Onboarding
          companyId={companyId}
          companyName={companyName}
          onBrainChanged={() => setBrainTick((t) => t + 1)}
        />
      )}

      {section === 'company-brain' && (
        <CompanyBrain companyName={companyName} modules={modules} summary={brainSummary} />
      )}

      {section === 'workforce' && <Workforce roles={roles} divisions={divisions} />}

      {section === 'sales-and-customers' && (
        <SalesCustomers
          companyName={companyName}
          stats={stats}
          leads={leads}
          contacts={contacts}
          onMoveLead={moveLead}
        />
      )}

      {section === 'ask-aya' && (
        <div className="flex flex-col gap-space-24">
          <AyaIntro />
          <ComingSoon
            icon="psychology"
            title="Ask Aya"
            what="The command console — where you issue an instruction in plain language and Aya turns it into a governed mission, assigns agents, and brings the result back for your approval."
            blockedBy={[
              'The orchestrator that turns a command into a work order. The authority policy and the twelve shared components it will call are already built and tested',
              'At least one connector, so a mission can act on something outside this database',
              LEVELS.indexOf(topLevel) >= 2
                ? `A company at ${topLevel} is available — the orchestrator is the remaining piece`
                : `A company at A2 (routine execution). The highest today is ${topLevel} — ${
                    LEVEL_LABEL[topLevel]?.toLowerCase() ?? topLevel
                  }`,
            ]}
          />
        </div>
      )}

      {section === 'missions' && (
        <ComingSoon
          icon="task_alt"
          title="Missions"
          what="Every piece of work Aya is running or has run, with its stage gates, assigned agents, verification evidence and cost."
          blockedBy={[
            'The orchestrator that dispatches work orders to agents and records each run',
            `Agent deployments: ${roles.length} roles are registered, ${
              portfolio?.ops.agent_deployments ?? 0
            } deployed to a company`,
          ]}
        />
      )}

      {section === 'approvals' && (
        <ComingSoon
          icon="verified"
          title="Approvals"
          what="Your sign-off queue. Anything above an agent's authority ceiling — spend over a threshold, an outbound message, a contract — waits here with its evidence packet."
          blockedBy={[
            'An agent executing work. The approval machinery — create, wait, validate, void on any change — is built and tested; nothing is requesting approval yet',
            'Per-company spend and action thresholds — your specification leaves these as explicit configuration',
          ]}
        />
      )}

      {section === 'insights-and-costs' && <Insights />}

      {section === 'inbox' && <Inbox />}

      {section === 'connectors' && (
        <ComingSoon
          icon="hub"
          title="Connectors"
          what="Every external system Aya can reach — WhatsApp, Zoho, Calendly, banking, ad platforms — each with its own scope, rate limits, health check and revocation test."
          blockedBy={[
            'No connector registered yet. Your specification requires a business and technical owner, a scoped service identity, and a passing revoke test before any connector goes live',
          ]}
        />
      )}

      {section === 'settings' && <Settings />}

      {section === 'users' && <Users />}

      {section === 'personal' && (
        <ComingSoon
          icon="lock"
          title="Personal Vault"
          what="Your private workspace — health, finances and personal conversations kept separate, where Aya only receives what you explicitly authorize."
          blockedBy={[
            'A separate isolated store, so personal data never sits alongside business records',
            'The personal assistant, sequenced after the shared foundation as agreed on 10 September',
          ]}
        />
      )}
    </Shell>
  );
}
