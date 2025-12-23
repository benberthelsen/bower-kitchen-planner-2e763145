import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Users, DollarSign, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface DashboardStats {
  totalJobs: number;
  pendingApproval: number;
  inProduction: number;
  completed: number;
  totalCustomers: number;
  totalRevenue: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalJobs: 0,
    pendingApproval: 0,
    inProduction: 0,
    completed: 0,
    totalCustomers: 0,
    totalRevenue: 0,
  });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get job counts by status
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('status, cost_incl_tax');
      
      if (jobsError) throw jobsError;

      const pendingApproval = jobs?.filter(j => j.status === 'pending_approval').length || 0;
      const inProduction = jobs?.filter(j => j.status === 'in_production').length || 0;
      const completed = jobs?.filter(j => j.status === 'completed').length || 0;
      const totalRevenue = jobs?.reduce((sum, j) => sum + (parseFloat(String(j.cost_incl_tax)) || 0), 0) || 0;

      // Get customer count
      const { count: customerCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get recent jobs
      const { data: recent } = await supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          name,
          status,
          cost_incl_tax,
          created_at,
          customer_id
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalJobs: jobs?.length || 0,
        pendingApproval,
        inProduction,
        completed,
        totalCustomers: customerCount || 0,
        totalRevenue,
      });

      setRecentJobs(recent || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: 'Total Jobs', value: stats.totalJobs, icon: FileText, color: 'bg-blue-500' },
    { title: 'Pending Approval', value: stats.pendingApproval, icon: Clock, color: 'bg-yellow-500' },
    { title: 'In Production', value: stats.inProduction, icon: AlertCircle, color: 'bg-orange-500' },
    { title: 'Completed', value: stats.completed, icon: CheckCircle, color: 'bg-green-500' },
    { title: 'Customers', value: stats.totalCustomers, icon: Users, color: 'bg-purple-500' },
    { title: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'bg-emerald-500' },
  ];

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      processing: 'bg-blue-100 text-blue-700',
      pending_approval: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      in_production: 'bg-orange-100 text-orange-700',
      completed: 'bg-emerald-100 text-emerald-700',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.color} text-white`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : recentJobs.length === 0 ? (
            <p className="text-gray-500">No jobs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-gray-500">
                    <th className="pb-3 font-medium">Job #</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Cost</th>
                    <th className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map(job => (
                    <tr key={job.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{job.job_number}</td>
                      <td className="py-3">{job.name}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(job.status)}`}>
                          {job.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3">${parseFloat(job.cost_incl_tax || 0).toLocaleString()}</td>
                      <td className="py-3 text-gray-500 text-sm">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}