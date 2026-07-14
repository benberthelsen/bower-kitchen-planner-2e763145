/**
 * Admin → Design Rules: review surface for the versioned kitchen rule pack
 * (implementation plan §7.4/7.4.7). Read-only in this phase — values live in
 * versioned source (src/lib/designV2/rulePack.ts) so every change is
 * reviewable in git. Adding/altering values from this page moves to a
 * DB-backed, audited config table in a later phase.
 */

import React from 'react';
import { ShieldAlert, ShieldCheck, Ruler } from 'lucide-react';
import {
  BOWER_LAYOUT_PACK_VERSION,
  ERGONOMIC_PARAMETERS,
  PACK_SIGN_OFF,
  QLD_REGULATORY_PROFILE_DRAFT,
  type RulePackParameter,
} from '@/lib/designV2';

function ParameterTable({ parameters }: { parameters: RulePackParameter[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Parameter</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Class</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Approved</th>
          </tr>
        </thead>
        <tbody>
          {parameters.map(p => (
            <tr key={p.parameterId} className="border-t border-slate-100">
              <td className="px-3 py-2 font-mono text-xs text-slate-800">{p.parameterId}</td>
              <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-900">
                {typeof p.value === 'boolean' ? (p.value ? 'yes' : 'no') : p.value}
                {p.unit === 'mm' ? ' mm' : ''}
              </td>
              <td className="px-3 py-2">
                <span className={p.class === 'regulatory'
                  ? 'text-xs font-medium text-red-700'
                  : 'text-xs font-medium text-slate-600'}>
                  {p.class}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-slate-500 max-w-md">{p.source}</td>
              <td className="px-3 py-2 text-xs">
                {p.bowerApproved
                  ? <span className="text-emerald-700 font-medium">signed off</span>
                  : <span className="text-amber-700 font-medium">pending</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DesignRules() {
  const draft = QLD_REGULATORY_PROFILE_DRAFT;
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Ruler className="w-5 h-5" /> Design Rules
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          The versioned kitchen rule pack used by the AI designer's deterministic engine.
          Values are read-only here for now — they live in versioned source so every change is
          reviewed; in-page editing moves to an audited settings table in a later phase.
        </p>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-sm text-emerald-900">
          <p className="font-medium">Sign-off recorded</p>
          <p className="text-emerald-800">
            {PACK_SIGN_OFF.approvedBy} ({PACK_SIGN_OFF.role}), {PACK_SIGN_OFF.date} — {PACK_SIGN_OFF.scope}.
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Layout pack — ergonomic defaults
          <span className="ml-2 font-mono text-xs text-slate-500">{BOWER_LAYOUT_PACK_VERSION}</span>
        </h2>
        <p className="text-xs text-slate-500">
          NKBA-derived guidance, Bower-tunable. These score and warn; they never block a design
          on their own and are labelled as negotiable guidance in customer/trade output.
        </p>
        <ParameterTable parameters={ERGONOMIC_PARAMETERS} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Regulatory profile — {draft.jurisdiction}
          <span className="ml-2 font-mono text-xs text-slate-500">{draft.profileId}@{draft.version}</span>
        </h2>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Draft — regulated rules stay “pending” until qualified verification</p>
            <p className="text-amber-800">{draft.approvalRequired}</p>
            <p className="text-amber-800 mt-1">
              Scopes: {draft.projectScopes.join(', ')} · Standards:{' '}
              {Object.entries(draft.standardsEditions).map(([k, v]) => `${k}:${v}`).join(' · ')}
            </p>
          </div>
        </div>
        <ParameterTable parameters={draft.seedParameters} />
      </section>

      <p className="text-xs text-slate-400">
        Rule evaluation itself is deterministic code (`evaluateKitchenRules`) — the AI can never
        bypass, rewrite or waive a rule. Regulated minimums have no staff-exception path.
      </p>
    </div>
  );
}
