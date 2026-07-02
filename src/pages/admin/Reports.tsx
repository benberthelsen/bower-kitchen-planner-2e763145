/**
 * Admin Reports page — rebuilt with live data charts.
 * Sections:
 *   1. Monthly Revenue (last 12 months) — bar chart
 *   2. Job Status Breakdown — horizontal bar
 *   3. Wizard Funnel Metrics (from funnel_events) — conversion table
 *   4. Raw data export (CSV)
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { TRADE_JOB_STATUS_LABELS, isTradeJobStatus } from '@/types/trade';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonthlyRevenue {
  month: string;       // "Jun 2025"
  revenue: number;
  jobCount: number;
}

interface StatusCount {
  status: string;
  label: string;
  count: number;
  value: number;
}

interface FunnelRow {
  stage: string;
  count: number;
  pct: number | null;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  enquiry: '#f59e0b',
  draft: '#94a3b8',
  pending_review: '#818cf8',
  approved: '#22c55e',
  in_production: '#06b6d4',
  completed: '#10b981',
};

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const v = String(r[h] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminReports() {
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<StatusCount[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadRevenue(), loadStatusBreakdown(), loadFunnel()]);
    setLoading(false);
  }

  async function loadRevenue() {
    const from = startOfMonth(subMonths(new Date(), 11)).toISOString();
    const { data } = await supabase
      .from('jobs')
      .select('cost_incl_tax, created_at')
      .gte('created_at', from)
      .neq('status', 'enquiry');

    if (!data) return;

    // Build 12 month buckets
    const buckets: Record<string, { revenue: number; jobCount: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'MMM yyyy');
      buckets[key] = { revenue: 0, jobCount: 0 };
    }

    data.forEach(j => {
      const key = format(new Date(j.created_at), 'MMM yyyy');
      if (buckets[key]) {
        buckets[key].revenue += parseFloat(String(j.cost_incl_tax)) || 0;
        buckets[key].jobCount += 1;
      }
    });

    setMonthlyRevenue(
      Object.entries(buckets).map(([month, v]) => ({ month, ...v })),
    );
  }

  async function loadStatusBreakdown() {
    const { data } = await supabase
      .from('jobs')
      .select('status, cost_incl_tax');

    if (!data) return;

    const counts: Record<string, StatusCount> = {};
    data.forEach(j => {
      if (!counts[j.status]) {
        counts[j.status] = {
          status: j.status,
          label: isTradeJobStatus(j.status) ? TRADE_JOB_STATUS_LABELS[j.status] : j.status,
          count: 0,
          value: 0,
        };
      }
      counts[j.status].count += 1;
      counts[j.status].value += parseFloat(String(j.cost_incl_tax)) || 0;
    });

    setStatusBreakdown(
      Object.values(counts).sort((a, b) => b.count - a.count),
    );
  }

  async function loadFunnel() {
    const { data } = await supabase
      .from('funnel_events')
      .select('event_type, session_id');

    if (!data) return;

    const byType: Record<string, Set<string>> = {};
    data.forEach(e => {
      if (!byType[e.event_type]) byType[e.event_type] = new Set();
      byType[e.event_type].add(e.session_id);
    });

    const stages = ['wizard_started', 'step_complete', 'quote_requested', 'job_approved'];
    const stageLabels: Record<string, string> = {
      wizard_started: 'Wizard Started',
      step_complete: 'Completed a Step',
      quote_requested: 'Quote Requested',
      job_approved: 'Job Approved',
    };

    const started = byType['wizard_started']?.size ?? 0;
    const rows: FunnelRow[] = stages.map(s => {
      const count = byType[s]?.size ?? 0;
      return {
        stage: stageLabels[s] ?? s,
        count,
        pct: started > 0 ? Math.round((count / started) * 100) : null,
      };
    });

    setFunnel(rows);
  }

  async function exportJobsCsv() {
    const { data } = await supabase
      .from('jobs')
      .select('job_number, name, status, cost_excl_tax, cost_incl_tax, created_at, updated_at')
      .order('job_number', { ascending: false });

    if (data) downloadCsv('bower_jobs_export.csv', data);
  }

  const AUD = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const totalRevenue = monthlyRevenue.reduce((s, m) => s + m.revenue, 0);
  const totalJobs = statusBreakdown.reduce((s, s2) => s + s2.count, 0);

  return (
    <div className="p-6 bg-gray-100 min-h-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportJobsCsv}>
            <Download className="w-4 h-4 mr-2" />
            Export Jobs CSV
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue (12m)', value: AUD(totalRevenue) },
          { label: 'Total Jobs', value: String(totalJobs) },
          { label: 'Avg Job Value', value: totalJobs > 0 ? AUD(totalRevenue / totalJobs) : '—' },
          { label: 'Wizard Starts', value: String(funnel[0]?.count ?? 0) },
        ].map(k => (
          <Card key={k.label} className="border-0 shadow-sm">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{k.label}</p>
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Revenue — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue} margin={{ top: 10, right: 16, bottom: 10, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === 'revenue' ? [AUD(v), 'Revenue'] : [v, 'Jobs']
                  }
                />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statusBreakdown.map(s => (
                <div key={s.status} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{s.label}</span>
                    <span className="text-gray-500">{s.count} jobs · {AUD(s.value)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${totalJobs > 0 ? (s.count / totalJobs) * 100 : 0}%`,
                        backgroundColor: STATUS_COLORS[s.status] ?? '#94a3b8',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Funnel Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wizard Funnel Conversion</CardTitle>
          </CardHeader>
          <CardContent>
            {funnel.every(f => f.count === 0) ? (
              <p className="text-sm text-gray-400 text-center py-6">No funnel events recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">Stage</th>
                    <th className="pb-2 font-medium text-right">Sessions</th>
                    <th className="pb-2 font-medium text-right">vs. Start</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.map((row, i) => (
                    <tr key={row.stage} className="border-b last:border-0">
                      <td className="py-2.5 font-medium text-gray-800">{row.stage}</td>
                      <td className="py-2.5 text-right text-gray-700">{row.count.toLocaleString()}</td>
                      <td className="py-2.5 text-right">
                        {row.pct != null ? (
                          <span className={`font-semibold ${i === 0 ? 'text-gray-400' : row.pct >= 50 ? 'text-green-600' : row.pct >= 20 ? 'text-amber-600' : 'text-red-500'}`}>
                            {row.pct}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
