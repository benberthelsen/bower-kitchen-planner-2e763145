/**
 * R5: Admin analytics — homeowner wizard funnel dashboard.
 * Shows event counts for each funnel stage with conversion rates.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, TrendingUp, Users, MousePointerClick, Send } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface FunnelEvent {
  id: string;
  session_id: string | null;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type DateRange = '7d' | '30d' | 'all';

interface FunnelStage {
  label: string;
  key: string;
  count: number;
  color: string;
  icon: React.ReactNode;
}

function sinceDate(range: DateRange): string | null {
  if (range === 'all') return null;
  const d = new Date();
  d.setDate(d.getDate() - (range === '7d' ? 7 : 30));
  return d.toISOString();
}

function conversionRate(from: number, to: number): string {
  if (!from) return '–';
  return `${Math.round((to / from) * 100)}%`;
}

export default function Analytics() {
  const [events, setEvents] = useState<FunnelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>('30d');

  useEffect(() => {
    loadEvents();
  }, [range]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('funnel_events')
        .select('*')
        .order('created_at', { ascending: false });

      const since = sinceDate(range);
      if (since) query = query.gte('created_at', since);

      const { data, error } = await query;
      if (error) throw error;
      setEvents((data as FunnelEvent[]) || []);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Count by event type
  const count = (type: string, filterFn?: (e: FunnelEvent) => boolean) =>
    events.filter(e => e.event_type === type && (!filterFn || filterFn(e))).length;

  // Unique sessions
  const uniqueSessions = (type: string) =>
    new Set(events.filter(e => e.event_type === type).map(e => e.session_id)).size;

  const started = uniqueSessions('wizard_started');
  const step2   = count('step_complete', e => (e.metadata as { step?: number })?.step === 1);
  const step3   = count('step_complete', e => (e.metadata as { step?: number })?.step === 2);
  const step4   = count('step_complete', e => (e.metadata as { step?: number })?.step === 3);
  const quoted  = count('quote_requested');
  const approved = count('job_approved');

  const stages: FunnelStage[] = [
    { label: 'Wizard started',   key: 'started',  count: started,  color: '#6366f1', icon: <Users className="w-4 h-4" /> },
    { label: 'Completed step 1', key: 'step2',    count: step2,    color: '#8b5cf6', icon: <MousePointerClick className="w-4 h-4" /> },
    { label: 'Completed step 2', key: 'step3',    count: step3,    color: '#a78bfa', icon: <MousePointerClick className="w-4 h-4" /> },
    { label: 'Completed step 3', key: 'step4',    count: step4,    color: '#c4b5fd', icon: <TrendingUp className="w-4 h-4" /> },
    { label: 'Quote requested',  key: 'quoted',   count: quoted,   color: '#10b981', icon: <Send className="w-4 h-4" /> },
    { label: 'Job approved',     key: 'approved', count: approved, color: '#059669', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  // Recent quote requests
  const recentQuotes = events
    .filter(e => e.event_type === 'quote_requested')
    .slice(0, 10);

  // Shape breakdown from step_complete events at step 1
  const shapeBreakdown = events
    .filter(e => e.event_type === 'step_complete' && (e.metadata as { step?: number })?.step === 1)
    .reduce<Record<string, number>>((acc, e) => {
      const shape = (e.metadata as { shape?: string })?.shape ?? 'unknown';
      acc[shape] = (acc[shape] ?? 0) + 1;
      return acc;
    }, {});

  const shapeData = Object.entries(shapeBreakdown).map(([name, value]) => ({ name, value }));
  const SHAPE_COLORS: Record<string, string> = {
    'single-wall': '#6366f1', 'l-shape': '#8b5cf6', 'u-shape': '#a78bfa', galley: '#c4b5fd',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Funnel Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Homeowner wizard performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={range} onValueChange={v => setRange(v as DateRange)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadEvents} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Funnel stages */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stages.map((stage, i) => {
          const prev = stages[i - 1];
          const rate = prev ? conversionRate(prev.count, stage.count) : null;
          return (
            <Card key={stage.key} className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-gray-500 mb-2">
                  {stage.icon}
                  <span className="text-xs font-medium">{stage.label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stage.count.toLocaleString()}</p>
                {rate && (
                  <p className="text-xs text-gray-400 mt-1">
                    <span className="font-medium text-gray-600">{rate}</span> from prev
                  </p>
                )}
                <div
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ background: stage.color }}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Overall conversion */}
      {started > 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-6">
            <div>
              <p className="text-sm text-gray-500">Start → Quote</p>
              <p className="text-2xl font-bold text-gray-900">{conversionRate(started, quoted)}</p>
            </div>
            <div className="h-10 w-px bg-gray-200" />
            <div>
              <p className="text-sm text-gray-500">Start → Approved Job</p>
              <p className="text-2xl font-bold text-gray-900">{conversionRate(started, approved)}</p>
            </div>
            <div className="h-10 w-px bg-gray-200" />
            <div>
              <p className="text-sm text-gray-500">Total events</p>
              <p className="text-2xl font-bold text-gray-900">{events.length.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart: funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funnel overview</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
            ) : events.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                No events yet — start the wizard to see data here.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stages} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => [v.toLocaleString(), 'Count']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                    {stages.map(s => <Cell key={s.key} fill={s.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Kitchen shape breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kitchen shapes</CardTitle>
          </CardHeader>
          <CardContent>
            {shapeData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                No shape data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={shapeData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v, 'Designs']} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {shapeData.map(s => (
                      <Cell key={s.name} fill={SHAPE_COLORS[s.name] ?? '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent quote requests */}
      {recentQuotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent quote requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs">
                  <th className="px-4 py-2 font-medium">Session</th>
                  <th className="px-4 py-2 font-medium">Shape</th>
                  <th className="px-4 py-2 font-medium">Layout</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentQuotes.map(e => {
                  const m = e.metadata as { shape?: string; layout?: string } | null;
                  return (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">
                        {(e.session_id ?? '–').slice(-6)}
                      </td>
                      <td className="px-4 py-2 capitalize">{m?.shape ?? '–'}</td>
                      <td className="px-4 py-2 capitalize">{m?.layout ?? '–'}</td>
                      <td className="px-4 py-2 text-gray-400">
                        {new Date(e.created_at).toLocaleDateString('en-AU', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
