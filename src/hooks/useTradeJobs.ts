import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TradeJob = {
  id: string;
  jobNumber: number;
  name: string;
  cost: number;
  updatedAt: string | null;
  status: string;
};

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
        status: job.status ?? 'draft',
      })),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const stats = useMemo(() => {
    const completed = jobs.filter((job) => job.status === 'completed');
    const quoted = jobs.filter((job) => job.status === 'quoted');
    const inProgress = jobs.filter((job) => job.status === 'in_progress' || job.status === 'draft');
    const totalValue = jobs.reduce((sum, job) => sum + job.cost, 0);

    return {
      total: jobs.length,
      completed: completed.length,
      quoted: quoted.length,
      inProgress: inProgress.length,
      totalValue,
    };
  }, [jobs]);

  return { jobs, loading, error, stats, reload: loadJobs };
}
