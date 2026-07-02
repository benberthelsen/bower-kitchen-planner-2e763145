/**
 * Admin Leads page — shows homeowner wizard enquiry submissions.
 * These are jobs with status = 'enquiry', auto-created by the /wizard flow.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  RefreshCw,
  Search,
  ExternalLink,
  CheckSquare,
  Inbox,
  ChevronRight,
} from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  notes: string | null;
  cost_incl_tax: number | null;
  created_at: string;
  status: string;
  design_data: Record<string, unknown> | null;
}

function parseNotes(notes: string | null) {
  if (!notes) return {};
  const lines = notes.split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(': ');
    if (idx !== -1) {
      result[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
    }
  }
  return result;
}

function AUD(n: number | null) {
  if (n == null) return '–';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [convertingId, setConvertingId] = useState<string | null>(null);

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, notes, cost_incl_tax, created_at, status, design_data')
        .eq('status', 'enquiry')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads((data as Lead[]) || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  const convertToJob = async (lead: Lead) => {
    setConvertingId(lead.id);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'draft' })
        .eq('id', lead.id);

      if (error) throw error;
      toast.success('Lead converted to job');
      loadLeads();
    } catch (err) {
      console.error(err);
      toast.error('Conversion failed');
    } finally {
      setConvertingId(null);
    }
  };

  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.notes ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const dd = (lead: Lead) => lead.design_data as Record<string, unknown> | null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Homeowner enquiries from the design wizard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-base px-3 py-1">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
          </Badge>
          <Button variant="outline" size="sm" onClick={loadLeads} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading leads…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Inbox className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 font-medium">No leads yet</p>
            <p className="text-sm text-gray-400 max-w-xs">
              When a homeowner completes the wizard and submits their contact details, they'll appear here.
            </p>
            <a
              href="/wizard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline flex items-center gap-1 mt-1"
            >
              Preview the wizard <ExternalLink className="w-3 h-3" />
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(lead => {
            const info = parseNotes(lead.notes);
            const shape = dd(lead)?.roomShape as string ?? info['kitchen shape'] ?? '–';
            const widthM = dd(lead)?.roomWidth
              ? ((dd(lead)!.roomWidth as number) / 1000).toFixed(1) + ' m'
              : '–';
            const layoutStyle = dd(lead)?.layoutStyle as string ?? '–';

            return (
              <Card key={lead.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: contact info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 truncate">{lead.name}</p>
                        <Badge variant="outline" className="text-xs capitalize">{shape}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{layoutStyle}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-gray-500 space-y-0.5">
                        {info['email'] && (
                          <p>
                            <a href={`mailto:${info['email']}`} className="text-blue-600 hover:underline">
                              {info['email']}
                            </a>
                          </p>
                        )}
                        {info['phone'] && <p>{info['phone']}</p>}
                        <p className="text-xs text-gray-400">
                          {widthM} wide · submitted {timeAgo(lead.created_at)}
                        </p>
                      </div>
                    </div>

                    {/* Right: estimate + actions */}
                    <div className="text-right flex-shrink-0 space-y-2">
                      {lead.cost_incl_tax != null && (
                        <p className="text-lg font-bold text-gray-900">{AUD(lead.cost_incl_tax)}</p>
                      )}
                      <p className="text-xs text-gray-400">est. inc. GST</p>
                      <div className="flex items-center gap-2 justify-end mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={convertingId === lead.id}
                          onClick={() => convertToJob(lead)}
                          className="text-xs h-8"
                        >
                          <CheckSquare className="w-3.5 h-3.5 mr-1" />
                          {convertingId === lead.id ? 'Converting…' : 'Convert to Job'}
                        </Button>
                        <Link to={`/admin/jobs/${lead.id}`}>
                          <Button size="sm" variant="ghost" className="text-xs h-8">
                            View <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Notes / design summary */}
                  {info['finish'] && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {info['finish'] && <span>Doors: <strong>{info['finish']}</strong></span>}
                      {info['benchtop'] && <span>Benchtop: <strong>{info['benchtop']}</strong></span>}
                      {info['handle'] && <span>Handle: <strong>{info['handle']}</strong></span>}
                      {info['estimate'] && <span className="ml-auto font-medium text-gray-700">{info['estimate']}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
