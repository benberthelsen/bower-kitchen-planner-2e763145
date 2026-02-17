import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  FileText,
  Clock,
  CheckCircle2,
  TrendingUp,
  Search,
  MoreHorizontal,
  Copy,
  Trash2,
  Eye,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { TradeJob, useTradeJobs } from '@/hooks/useTradeJobs';
import TradeLayout from './components/TradeLayout';

function StatCard({ icon: Icon, label, value, trend }: { icon: React.ElementType; label: string; value: string | number; trend?: string }) {
  return (
    <div className="bg-trade-surface-elevated rounded-xl p-5 border border-trade-border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="p-2.5 bg-trade-navy/5 rounded-lg">
          <Icon className="h-5 w-5 text-trade-navy" />
        </div>
        {trend && (
          <Badge variant="secondary" className="bg-trade-success/10 text-trade-success border-0 text-xs">
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend}
          </Badge>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-display font-semibold text-trade-navy">{value}</p>
        <p className="text-sm text-trade-muted mt-1">{label}</p>
      </div>
    </div>
  );
}

function JobsTable({ jobs, title }: { jobs: TradeJob[]; title: string }) {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'quoted':
        return <Badge className="bg-trade-amber/10 text-trade-amber border-0">Quoted</Badge>;
      case 'completed':
        return <Badge className="bg-trade-success/10 text-trade-success border-0">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700 border-0">In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="bg-trade-surface-elevated rounded-xl border border-trade-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-trade-border flex items-center justify-between">
        <h3 className="font-display font-semibold text-trade-navy">{title}</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-trade-border">
            <TableHead className="text-trade-muted font-medium">Job #</TableHead>
            <TableHead className="text-trade-muted font-medium">Job Name</TableHead>
            <TableHead className="text-trade-muted font-medium text-right">Cost (incl. Tax)</TableHead>
            <TableHead className="text-trade-muted font-medium">Last Updated</TableHead>
            <TableHead className="text-trade-muted font-medium">Status</TableHead>
            <TableHead className="text-trade-muted font-medium w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id} className="cursor-pointer hover:bg-trade-surface/50 border-trade-border" onClick={() => navigate(`/trade/job/${job.id}`)}>
              <TableCell className="font-medium text-trade-navy">#{job.jobNumber}</TableCell>
              <TableCell>{job.name}</TableCell>
              <TableCell className="text-right font-medium">${job.cost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</TableCell>
              <TableCell className="text-trade-muted text-sm">{job.updatedAt ? new Date(job.updatedAt).toLocaleString('en-AU') : '-'}</TableCell>
              <TableCell>{getStatusBadge(job.status)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/trade/job/${job.id}`); }}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Job
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TradeDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { jobs, loading, error, stats } = useTradeJobs(user?.id);
  const [searchQuery, setSearchQuery] = useState('');

  const userName = user?.email?.split('@')[0] || 'Trade User';
  const greeting = getGreeting();

  const filteredJobs = useMemo(
    () => jobs.filter((job) => job.name.toLowerCase().includes(searchQuery.toLowerCase()) || `${job.jobNumber}`.includes(searchQuery)),
    [jobs, searchQuery],
  );

  const quotedJobs = filteredJobs.filter((job) => job.status === 'quoted' || job.status === 'in_progress' || job.status === 'draft');
  const completedJobs = filteredJobs.filter((job) => job.status === 'completed');
  const latestJob = jobs[0];

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-trade-navy">
              {greeting}, <span className="text-trade-amber">{userName}</span>
            </h1>
            <p className="text-trade-muted mt-1">Manage your cabinet orders and quotes</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-muted" />
              <Input placeholder="Search jobs..." className="pl-9 w-64 bg-trade-surface-elevated border-trade-border" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button onClick={() => navigate('/trade/job/new')} className="group flex items-center gap-4 p-5 bg-trade-navy rounded-xl text-white hover:bg-trade-navy-light transition-colors">
            <div className="p-3 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <div className="text-left">
              <span className="font-display font-semibold text-lg block">Create New Job</span>
              <span className="text-white/70 text-sm">Start a new cabinet order</span>
            </div>
          </button>

          {latestJob ? (
            <button
              onClick={() => navigate(`/trade/job/${latestJob.id}`)}
              className="group flex items-center gap-4 p-5 bg-trade-surface-elevated border-2 border-trade-amber/30 rounded-xl hover:border-trade-amber transition-colors"
            >
              <div className="p-3 bg-trade-amber/10 rounded-lg group-hover:bg-trade-amber/20 transition-colors">
                <Pencil className="h-6 w-6 text-trade-amber" />
              </div>
              <div className="text-left">
                <span className="font-display font-semibold text-lg block text-trade-navy">Continue Editing</span>
                <span className="text-trade-muted text-sm">Last Job: #{latestJob.jobNumber}</span>
              </div>
            </button>
          ) : (
            <div className="flex items-center p-5 border rounded-xl bg-muted/30 text-muted-foreground">Create your first job to continue editing later.</div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={FileText} label="Total Jobs" value={stats.total} />
          <StatCard icon={Clock} label="In Progress" value={stats.inProgress} />
          <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} />
          <StatCard icon={TrendingUp} label="Total Value" value={`$${stats.totalValue.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`} />
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading jobs…</div>}
        {error && <div className="text-sm text-destructive">Failed to load jobs: {error}</div>}

        {!loading && !error && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <JobsTable jobs={quotedJobs} title="Quoted & Active Jobs" />
            <JobsTable jobs={completedJobs} title="Completed Jobs" />
          </div>
        )}
      </div>
    </TradeLayout>
  );
}
