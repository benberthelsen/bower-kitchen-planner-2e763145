import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradeJob, TradeJobStatusGroup, isTradeJobStatus, statusToGroup } from '@/types/trade';

export function useTradeJobs(userId?: string) {
  const [jobs, setJobs] = useState<TradeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!userId) {
      setJobs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('jobs')
      .select('id, job_number, name, cost_incl_tax, updated_at, status')
      .eq('customer_id', userId)
      .order('updated_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setJobs([]);
      setLoading(false);
      return;
    }

    setJobs(
      (data ?? []).map((job) => ({
        id: job.id,
        jobNumber: job.job_number,
        name: job.name,
        cost: job.cost_incl_tax ?? 0,
        updatedAt: job.updated_at,
        status: isTradeJobStatus(job.status ?? '') ? (job.status as TradeJobStatus) : 'draft',
      })),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const grouped = useMemo(() => {
    const groups: Record<TradeJobStatusGroup, TradeJob[]> = {
      draft: [],
      pending_approval: [],
      production: [],
      completed: [],
    };

    jobs.forEach((job) => {
      groups[statusToGroup(job.status)].push(job);
    });

    return groups;
  }, [jobs]);

  const stats = useMemo(() => {
    const totalValue = jobs.reduce((sum, job) => sum + job.cost, 0);

    return {
      total: jobs.length,
      draft: grouped.draft.length,
      pendingApproval: grouped.pending_approval.length,
      production: grouped.production.length,
      completed: grouped.completed.length,
      totalValue,
    };
  }, [grouped, jobs]);

  return { jobs, grouped, loading, error, stats, reload: loadJobs };
}
