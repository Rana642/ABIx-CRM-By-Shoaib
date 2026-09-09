export type HardCap = { code: string; cap: string };

export type LaunchpadEntry = {
  id: string;
  name: string;
  slug: string;
  entity_type: string;
  status: string;
  parent_name: string | null;
  modules_total: number;
  modules_approved: number;
  modules_draft: number;
  readiness_pct: number | null;
  uncapped_level: string | null;
  effective_level: string | null;
  active_hard_caps: HardCap[] | null;
  onboarding_state: string | null;
  stage: 'not_started' | 'in_progress' | 'brain_ready' | 'live';
  is_live: boolean;
};

export type BlockerSubject = { label: string; note: string | null };

export type Blocker = {
  kind: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  detail: string;
  subjects: BlockerSubject[];
};

export type Portfolio = {
  as_of: string;
  companies: { total: number; active: number; onboarding: number; unowned: number };
  brains: {
    companies_with_brain: number;
    avg_readiness: string | number;
    modules_approved: number;
    modules_total: number;
    above_a0: number;
  };
  decisions: {
    missing_owner: number;
    unverified_entities: number;
    decisions_needed: number;
    parent_conflicts: number;
    total: number;
  };
  crm: { contacts: number; leads: number; opportunities: number };
  ops: {
    agent_roles: number;
    agent_deployments: number;
    skills: number;
    workflows: number;
    work_orders: number;
    approvals_pending: number;
    connectors: number;
    agent_runs: number;
    open_incidents: number;
    active_kill_switches: number;
  };
  autonomy: {
    available: boolean;
    companies_above_a0: number;
    companies_measured: number;
    verified_actions: number;
  };
  unavailable: { revenue: string; ai_spend: string; missions: string; connectors: string };
};

export type AgentRole = {
  agent_role_id: string;
  role_name: string;
  division_code: string;
  division_name: string;
  role_type: 'control' | 'executive' | 'specialist';
  default_mode: string;
  default_max_authority: string;
  status: string;
  reports_to_role_id: string | null;
  mission: string | null;
  deployed_count: number;
};

export type Division = {
  division_code: string;
  division_name: string;
  role_count: number;
  control_count: number;
  executive_count: number;
  specialist_count: number;
};

export type BrainModule = {
  module_code: string;
  module_name: string;
  status: string;
  readiness_weight: string | number;
  version: string | null;
  last_verified_at: string | null;
  score: string | number;
  gap_note: string | null;
  is_critical: string | null;
  knowledge_title: string | null;
};

export type BrainSummary = {
  readiness_score: string | number;
  modules_total: number;
  modules_approved: number;
  modules_draft: number;
  uncapped_level: string;
  effective_level: string;
  active_hard_caps: HardCap[];
};

export type Lead = {
  id: string;
  pipeline_stage: string;
  estimated_value: number | null;
  contact_id: string;
  contact_name: string;
  phone: string | null;
  lead_temperature: string | null;
  priority: string | null;
};

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  status: string | null;
  lead_temperature: string | null;
  location: string | null;
  last_contact_at: string | null;
  next_action: string | null;
  owner: string | null;
  priority: string | null;
};

export type Stats = {
  total_contacts: number;
  hot_leads: number;
  open_opportunities: number;
  open_opportunities_value: number;
};
