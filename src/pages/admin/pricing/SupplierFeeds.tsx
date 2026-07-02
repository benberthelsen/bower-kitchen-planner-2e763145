/**
 * R5/R6: Supplier Feeds — manage URL-based scheduled pricing imports.
 * Each feed points to a CSV download URL for a specific pricing table.
 * The scheduled-supplier-import edge function processes these on a schedule,
 * or an admin can trigger a run manually.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw, Plus, Trash2, Play, CheckCircle2, AlertCircle, Clock, ExternalLink,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierFeed {
  id: string;
  label: string;
  table_name: string;
  feed_url: string;
  cron_schedule: string;
  auto_apply: boolean;
  is_active: boolean;
  last_run_at: string | null;
  last_run_ok: boolean | null;
  last_run_summary: string | null;
  created_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  material_pricing:   'Materials',
  hardware_pricing:   'Hardware',
  edge_pricing:  'Edge Tape',
  benchtop_pricing:   'Benchtops',
};

const CRON_PRESETS = [
  { label: 'Daily at 6am',     value: '0 6 * * *'   },
  { label: 'Weekly Monday',    value: '0 6 * * 1'   },
  { label: 'Monthly 1st',      value: '0 6 1 * *'   },
];

const BLANK_FORM = {
  label: '',
  table_name: 'material_pricing',
  feed_url: '',
  cron_schedule: '0 6 * * 1',
  auto_apply: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function cronLabel(cron: string): string {
  return CRON_PRESETS.find(p => p.value === cron)?.label ?? cron;
}

// ─── Add/Edit form ────────────────────────────────────────────────────────────

interface FeedFormProps {
  initial?: Partial<typeof BLANK_FORM>;
  onSave: (form: typeof BLANK_FORM) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function FeedForm({ initial = {}, onSave, onCancel, saving }: FeedFormProps) {
  const [form, setForm] = useState({ ...BLANK_FORM, ...initial });
  const set = (k: keyof typeof BLANK_FORM, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="border rounded-xl p-5 bg-slate-50 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Feed name</Label>
          <Input
            placeholder="e.g. Polytec Sheet Materials"
            value={form.label}
            onChange={e => set('label', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Target table</Label>
          <Select value={form.table_name} onValueChange={v => set('table_name', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TABLE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>CSV feed URL</Label>
          <Input
            placeholder="https://supplier.com/pricing/export.csv"
            value={form.feed_url}
            onChange={e => set('feed_url', e.target.value)}
            type="url"
          />
          <p className="text-xs text-gray-400">Must be a direct CSV download link accessible from Supabase Edge Functions.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Schedule</Label>
          <Select value={form.cron_schedule} onValueChange={v => set('cron_schedule', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CRON_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Apply mode</Label>
          <Select
            value={form.auto_apply ? 'auto' : 'manual'}
            onValueChange={v => set('auto_apply', v === 'auto')}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-apply changes</SelectItem>
              <SelectItem value="manual">Log only — manual review required</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">
            {form.auto_apply
              ? 'New and changed rows are applied immediately on each run.'
              : 'The diff is recorded in "Last run" but no data is changed — review at Supplier Import.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          onClick={() => onSave(form)}
          disabled={saving || !form.label || !form.feed_url}
          className="bg-slate-900 hover:bg-slate-800 text-white"
          size="sm"
        >
          {saving ? <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : 'Save feed'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SupplierFeeds() {
  const [feeds, setFeeds] = useState<SupplierFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { loadFeeds(); }, []);

  const loadFeeds = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('supplier_feeds')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { toast.error('Failed to load feeds'); }
    else setFeeds((data as SupplierFeed[]) || []);
    setLoading(false);
  };

  const saveFeed = async (form: typeof BLANK_FORM, id?: string) => {
    setSaving(true);
    try {
      if (id) {
        const { error } = await supabase.from('supplier_feeds').update(form).eq('id', id);
        if (error) throw error;
        toast.success('Feed updated');
        setEditingId(null);
      } else {
        const { error } = await supabase.from('supplier_feeds').insert([form]);
        if (error) throw error;
        toast.success('Feed added');
        setShowAdd(false);
      }
      loadFeeds();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteFeed = async (id: string) => {
    if (!confirm('Delete this feed? This cannot be undone.')) return;
    setDeletingId(id);
    const { error } = await supabase.from('supplier_feeds').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else { toast.success('Feed deleted'); loadFeeds(); }
    setDeletingId(null);
  };

  const toggleActive = async (feed: SupplierFeed) => {
    const { error } = await supabase
      .from('supplier_feeds')
      .update({ is_active: !feed.is_active })
      .eq('id', feed.id);
    if (error) toast.error('Update failed');
    else loadFeeds();
  };

  const runNow = async (feed: SupplierFeed) => {
    setRunningId(feed.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('scheduled-supplier-import', {
        body: { feedId: feed.id },
      });
      if (error) throw error;

      const result = data?.results?.[0];
      if (result?.ok) {
        toast.success(`Run complete: ${result.summary}`);
      } else {
        toast.warning(`Run finished with issues: ${result?.summary ?? 'Check edge function logs'}`);
      }
      loadFeeds();
    } catch (err) {
      console.error(err);
      toast.error(`Run failed: ${(err as Error).message}`);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplier Feeds</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configured URL-based pricing imports — auto or manual apply.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadFeeds} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(s => !s)}>
            <Plus className="w-4 h-4" /> Add feed
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <FeedForm
          onSave={form => saveFeed(form)}
          onCancel={() => setShowAdd(false)}
          saving={saving}
        />
      )}

      {/* How it works info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-4 px-5">
          <p className="text-sm text-blue-800 font-medium mb-1">How scheduled imports work</p>
          <p className="text-xs text-blue-700">
            Each feed is processed by the <code className="bg-blue-100 px-1 rounded">scheduled-supplier-import</code> edge function.
            Enable <strong>pg_cron</strong> + <strong>pg_net</strong> in your Supabase dashboard and uncomment the cron job in the
            <code className="bg-blue-100 px-1 rounded ml-1">20260620_supplier_feeds.sql</code> migration to run on a schedule.
            Until then, use "Run now" for manual triggers.
          </p>
        </CardContent>
      </Card>

      {/* Feed list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : feeds.length === 0 && !showAdd ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <ExternalLink className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 font-medium">No feeds configured</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Add a supplier feed URL and the import function will fetch and diff it automatically.
            </p>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add your first feed
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feeds.map(feed => (
            <Card key={feed.id} className={feed.is_active ? '' : 'opacity-60'}>
              <CardContent className="p-5">
                {editingId === feed.id ? (
                  <FeedForm
                    initial={{
                      label: feed.label,
                      table_name: feed.table_name,
                      feed_url: feed.feed_url,
                      cron_schedule: feed.cron_schedule,
                      auto_apply: feed.auto_apply,
                    }}
                    onSave={form => saveFeed(form, feed.id)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                ) : (
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{feed.label}</p>
                        <Badge variant="outline" className="text-xs">
                          {TABLE_LABELS[feed.table_name] ?? feed.table_name}
                        </Badge>
                        {feed.auto_apply ? (
                          <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Auto-apply</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-gray-500">Log only</Badge>
                        )}
                        {!feed.is_active && (
                          <Badge variant="outline" className="text-xs text-gray-400">Disabled</Badge>
                        )}
                      </div>

                      <p className="text-xs text-gray-400 mt-1 truncate">
                        <a
                          href={feed.feed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-600 hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {feed.feed_url}
                        </a>
                      </p>

                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {cronLabel(feed.cron_schedule)}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          {feed.last_run_ok === true && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                          {feed.last_run_ok === false && <AlertCircle className="w-3 h-3 text-red-500" />}
                          Last run: {timeAgo(feed.last_run_at)}
                        </span>
                        {feed.last_run_summary && (
                          <>
                            <span>·</span>
                            <span className={feed.last_run_ok === false ? 'text-red-500' : ''}>
                              {feed.last_run_summary}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => runNow(feed)}
                        disabled={runningId === feed.id}
                      >
                        {runningId === feed.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />}
                        Run now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={() => setEditingId(feed.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-gray-400"
                        onClick={() => toggleActive(feed)}
                      >
                        {feed.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deleteFeed(feed.id)}
                        disabled={deletingId === feed.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
