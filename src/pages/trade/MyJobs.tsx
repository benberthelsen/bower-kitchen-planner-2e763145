import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTradeJobs } from '@/hooks/useTradeJobs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TRADE_JOB_STATUS_LABELS, TradeJob } from '@/types/trade';
import { TRADE_STATUS_BADGE_STYLES } from '@/lib/trade/jobStatusBadge';
import { isQuoteInProgress, isStaleQuote } from '@/lib/trade/jobHealth';

type JobsFilter = 'all' | 'open_quotes' | 'production' | 'completed' | 'needs_follow_up';

const FILTER_LABELS: Record<JobsFilter, string> = {
  all: 'All',
  open_quotes: 'Open quotes',
  production: 'Production',
  completed: 'Completed',
  needs_follow_up: 'Needs follow-up',
};

export default function MyJobs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { jobs, loading, error } = useTradeJobs(user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<JobsFilter>('all');

  const filterCounts = useMemo(
    () => ({
      all: jobs.length,
      open_quotes: jobs.filter((job) => isQuoteInProgress(job.status)).length,
      production: jobs.filter((job) => job.status === 'approved' || job.status === 'in_production').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      needs_follow_up: jobs.filter((job) => isStaleQuote(job.status, job.updatedAt)).length,
    }),
    [jobs],
  );

  const filteredJobs = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return jobs
      .filter((job) => {
        if (!normalizedSearch) return true;
        return job.name.toLowerCase().includes(normalizedSearch) || `${job.jobNumber}`.includes(normalizedSearch);
      })
      .filter((job) => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'open_quotes') return isQuoteInProgress(job.status);
        if (activeFilter === 'production') return job.status === 'approved' || job.status === 'in_production';
        if (activeFilter === 'completed') return job.status === 'completed';
        return isStaleQuote(job.status, job.updatedAt);
      });
  }, [activeFilter, jobs, searchQuery]);

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/trade/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-display font-bold text-trade-navy">My Jobs</h1>
              <p className="text-trade-muted text-sm">View and manage all your jobs</p>
            </div>
          </div>

          <Button onClick={() => navigate('/trade/job/new')} className="bg-trade-navy hover:bg-trade-navy-light text-white">
            <Plus className="h-4 w-4 mr-2" />
            Create New Job
          </Button>
        </div>

        <div className="mb-4 rounded-xl border border-trade-border bg-trade-surface-elevated p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FILTER_LABELS) as JobsFilter[]).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setActiveFilter(filterKey)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    activeFilter === filterKey
                      ? 'border-trade-navy bg-trade-navy text-white'
                      : 'border-trade-border bg-white text-trade-navy hover:bg-trade-surface'
                  }`}
                >
                  {FILTER_LABELS[filterKey]} ({filterCounts[filterKey]})
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-trade-muted" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by job name or #" className="pl-9" />
            </div>
          </div>
        </div>

        <div className="bg-trade-surface-elevated rounded-xl border border-trade-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">Loading jobs…</TableCell>
                </TableRow>
              )}
              {error && (
                <TableRow>
                  <TableCell colSpan={5} className="text-destructive">Failed to load jobs: {error}</TableCell>
                </TableRow>
              )}
              {!loading && !error && jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No jobs yet. Create your first quote to get started.</TableCell>
                </TableRow>
              )}
              {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No jobs match your current filter/search.</TableCell>
                </TableRow>
              )}
              {!loading && !error && filteredJobs.map((job: TradeJob) => (
                <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/trade/job/${job.id}`)}>
                  <TableCell>#{job.jobNumber}</TableCell>
                  <TableCell className="font-medium">{job.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={TRADE_STATUS_BADGE_STYLES[job.status]}>
                        {TRADE_JOB_STATUS_LABELS[job.status]}
                      </Badge>
                      {isStaleQuote(job.status, job.updatedAt) && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Needs follow-up</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">${job.cost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>{job.updatedAt ? new Date(job.updatedAt).toLocaleString('en-AU') : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </TradeLayout>
  );
}
