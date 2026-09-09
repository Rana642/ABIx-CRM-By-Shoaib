import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The 134-role workforce registry from 04_AGENT_REGISTRY.json.
// Roles are logical capability definitions; a role only becomes active for a
// company through an agent_deployment, which is why deployed_count matters.
export async function GET() {
  const [roles, divisions] = await Promise.all([
    pool.query(`
      SELECT r.agent_role_id, r.role_name, r.division_code, r.division_name,
             r.role_type, r.default_mode, r.default_max_authority, r.status,
             r.reports_to_role_id, r.mission,
             count(d.agent_deployment_id)::int AS deployed_count
      FROM abix.agent_roles r
      LEFT JOIN abix.agent_deployments d ON d.agent_role_id = r.agent_role_id
      GROUP BY r.agent_role_id
      ORDER BY r.division_code, r.agent_role_id
    `),
    pool.query(`
      SELECT division_code, division_name, count(*)::int AS role_count,
             count(*) FILTER (WHERE role_type = 'control')::int    AS control_count,
             count(*) FILTER (WHERE role_type = 'executive')::int  AS executive_count,
             count(*) FILTER (WHERE role_type = 'specialist')::int AS specialist_count
      FROM abix.agent_roles
      GROUP BY division_code, division_name
      ORDER BY division_code
    `),
  ]);

  return NextResponse.json({ roles: roles.rows, divisions: divisions.rows });
}
