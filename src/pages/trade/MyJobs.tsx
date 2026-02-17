import React from 'react';
import { useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTradeJobs } from '@/hooks/useTradeJobs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function MyJobs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { jobs, loading, error } = useTradeJobs(user?.id);

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
              {!loading && !error && jobs.map((job) => (
                <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/trade/job/${job.id}`)}>
                  <TableCell>#{job.jobNumber}</TableCell>
                  <TableCell className="font-medium">{job.name}</TableCell>
                  <TableCell><Badge variant="secondary">{job.status}</Badge></TableCell>
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
