'use client';

import { useState } from 'react';
import { Icon } from '../Shell';
import { Card, AuthorityBadge } from '../ui';
import type { AgentRole, Division } from '../types';

const TYPE_TONE: Record<string, string> = {
  control: 'bg-primary-container text-on-primary',
  executive: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  specialist: 'bg-surface-container text-on-surface-variant',
};

export function Workforce({ roles, divisions }: { roles: AgentRole[]; divisions: Division[] }) {
  const [division, setDivision] = useState<string>('all');

  const shown = division === 'all' ? roles : roles.filter((r) => r.division_code === division);
  const deployed = roles.filter((r) => r.deployed_count > 0).length;

  return (
    <div className="flex flex-col w-full gap-space-24">
      <Card className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-24">
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
            AI Workforce Registry
          </span>
          <h1 className="font-headline-md text-headline-md text-primary">
            {roles.length} roles across {divisions.length} divisions
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-4 max-w-[72ch]">
            These are logical capability roles, not always-on models. A role only starts doing work
            when it is deployed to a specific company — with its own authority ceiling and kill switch.
          </p>
        </div>
        <div className="flex items-center gap-space-24 shrink-0">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase">Deployed</span>
            <span className="font-tabular-metric text-tabular-metric text-primary font-bold tabular-nums">
              {deployed}
            </span>
            <span className="font-label-sm text-label-sm text-outline">
              of {roles.length} registered
            </span>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-space-8">
        <button
          type="button"
          onClick={() => setDivision('all')}
          className={`px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm transition-colors ${
            division === 'all'
              ? 'bg-primary-container text-on-primary font-semibold'
              : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          All divisions
          <span className="ml-space-8 font-label-sm text-label-sm tabular-nums opacity-70">
            {roles.length}
          </span>
        </button>
        {divisions.map((d) => (
          <button
            key={d.division_code}
            type="button"
            onClick={() => setDivision(d.division_code)}
            className={`px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm transition-colors ${
              division === d.division_code
                ? 'bg-primary-container text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
            }`}
            title={d.division_name}
          >
            {d.division_name}
            <span className="ml-space-8 font-label-sm text-label-sm tabular-nums opacity-70">
              {d.role_count}
            </span>
          </button>
        ))}
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm font-body-sm">
            <thead>
              <tr className="bg-surface-container-low text-left">
                {['Role', 'Division', 'Type', 'Mode', 'Max authority', 'Status', 'Deployed'].map((h) => (
                  <th
                    key={h}
                    className="px-space-16 py-space-8 font-label-sm text-label-sm text-outline uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.agent_role_id} className="border-t border-outline-variant/20">
                  <td className="px-space-16 py-space-12">
                    <div className="flex flex-col">
                      <span className="font-semibold text-on-surface">{r.role_name}</span>
                      <span className="font-label-sm text-label-sm text-outline tabular-nums">
                        {r.agent_role_id}
                        {r.reports_to_role_id && ` · reports to ${r.reports_to_role_id}`}
                      </span>
                    </div>
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant whitespace-nowrap">
                    {r.division_name}
                  </td>
                  <td className="px-space-16 py-space-12">
                    <span
                      className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded font-semibold uppercase ${
                        TYPE_TONE[r.role_type] ?? TYPE_TONE.specialist
                      }`}
                    >
                      {r.role_type}
                    </span>
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant whitespace-nowrap">
                    {r.default_mode.replace(/_/g, ' ')}
                  </td>
                  <td className="px-space-16 py-space-12">
                    <AuthorityBadge level={r.default_max_authority} />
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant whitespace-nowrap">
                    {r.status}
                  </td>
                  <td className="px-space-16 py-space-12 tabular-nums">
                    {r.deployed_count > 0 ? (
                      <span className="font-semibold text-secondary">{r.deployed_count}</span>
                    ) : (
                      <span className="text-outline">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
