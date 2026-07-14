import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Plus, FileText, Eye, Download, Inbox, TrendingUp, DollarSign, ArrowRight, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { statusToGroup, isTradeJobStatus } from '@/types/trade';

interface Job {
  id: string;
  job_number: number;
  name: string;
  status: string;
  cost_incl_tax: number;
  created_at: string;
  updated_at: string;
  customer_id: string;
  profiles?: { full_name: string; email: string } | null;
}

interface MonthlyStats {
  name: string;
  value: number;
  color: string;
}

interface ActivityItem {
  id: string;
  job_id: string;
  content: string;
  created_at: string;
  job_name?: string;
  job_number?: number;
}

interface KpiData {
  leadCount: number;
  conversionRate: number; // approved / (non-enquiry)
  pipelineValue: number;  // sum of pending_review + approved jobs
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  linkTo,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
  linkTo?: string;
}) {
  const content = (
    <Card className={`border-l-4 ${color} hover:shadow-md transition-shadow`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-gray-50`}>
            <Icon className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return linkTo ? <Link to={linkTo}>{content}</Link> : content;
}

export default function AdminDashboard() {
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  const [latestJobs, setLatestJobs] = useState<Job[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [kpi, setKpi] = useState<KpiData>({ leadCount: 0, conversionRate: 0, pipelineValue: 0 });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [pendingDays, setPendingDays] = useState('60');
  const [latestDays, setLatestDays] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [pendingDays, latestDays]);

  const loadDashboardData = async () => {
    try {
      // Fetch all jobs for KPI + chart
      const { data: allJobs } = await supabase
        .from('jobs')
        .select('id, status, cost_incl_tax, created_at');

      if (allJobs) {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const thisMonthJobs = allJobs.filter(j => {
          const d = new Date(j.created_at);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        const created = thisMonthJobs.filter(j =>
          isTradeJobStatus(j.status) && (statusToGroup(j.status) === 'draft' || statusToGroup(j.status) === 'pending_approval'),
        ).length;
        const accepted = thisMonthJobs.filter(j =>
          isTradeJobStatus(j.status) && (statusToGroup(j.status) === 'production' || statusToGroup(j.status) === 'completed'),
        ).length;

        const createdValue = thisMonthJobs
          .filter(j => isTradeJobStatus(j.status) && (statusToGroup(j.status) === 'draft' || statusToGroup(j.status) === 'pending_approval'))
          .reduce((s, j) => s + (parseFloat(String(j.cost_incl_tax)) || 0), 0);
        const acceptedValue = thisMonthJobs
          .filter(j => isTradeJobStatus(j.status) && (statusToGroup(j.status) === 'production' || statusToGroup(j.status) === 'completed'))
          .reduce((s, j) => s + (parseFloat(String(j.cost_incl_tax)) || 0), 0);

        setMonthlyStats([
          { name: `Created(${created})`, value: createdValue, color: '#0ea5e9' },
          { name: `Accepted(${accepted})`, value: acceptedValue, color: '#22c55e' },
        ]);

        // KPIs
        const leadCount = allJobs.filter(j => j.status === 'enquiry').length;
        const nonEnquiry = allJobs.filter(j => j.status !== 'enquiry');
        const approved = nonEnquiry.filter(j => j.status === 'approved' || j.status === 'completed');
        const conversionRate = nonEnquiry.length > 0
          ? Math.round((approved.length / nonEnquiry.length) * 100)
          : 0;
        const pipelineValue = allJobs
          .filter(j => j.status === 'pending_review' || j.status === 'approved')
          .reduce((s, j) => s + (parseFloat(String(j.cost_incl_tax)) || 0), 0);

        setKpi({ leadCount, conversionRate, pipelineValue });
      }

      // Pending approval jobs
      const pendingDate = new Date();
      pendingDate.setDate(pendingDate.getDate() - parseInt(pendingDays));

      const { data: pending } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending_approval')
        .gte('created_at', pendingDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (pending?.length) {
        const customerIds = [...new Set(pending.map(j => j.customer_id).filter(Boolean))];
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', customerIds);
        setPendingJobs(pending.map(job => ({ ...job, profiles: profiles?.find(p => p.id === job.customer_id) || null })));
      } else {
        setPendingJobs([]);
      }

      // Latest jobs
      const latestDate = new Date();
      latestDate.setDate(latestDate.getDate() - parseInt(latestDays));

      const { data: latest } = await supabase
        .from('jobs')
        .select('*')
        .gte('created_at', latestDate.toISOString())
        .order('updated_at', { ascending: false })
        .limit(15);

      if (latest?.length) {
        const customerIds = [...new Set(latest.map(j => j.customer_id).filter(Boolean))];
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', customerIds);
        setLatestJobs(latest.map(job => ({ ...job, profiles: profiles?.find(p => p.id === job.customer_id) || null })));
      } else {
        setLatestJobs([]);
      }

      // Recent system activity (last 20 system notes)
      const { data: notes } = await supabase
        .from('job_notes')
        .select('id, job_id, content, created_at, jobs(name, job_number)')
        .eq('author_role', 'system')
        .order('created_at', { ascending: false })
        .limit(20);

      if (notes) {
        setRecentActivity(
          notes.map((n: any) => ({
            id: n.id,
            job_id: n.job_id,
            content: n.content,
            created_at: n.created_at,
            job_name: n.jobs?.name,
            job_number: n.jobs?.job_number,
          })),
        );
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => format(new Date(dateStr), "d MMM 'at' h:mma").toLowerCase();
  const currentMonthName = format(new Date(), 'MMMM yyyy');
  const AUD = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 bg-gray-100 min-h-full space-y-6">

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          icon={Inbox}
          label="Active Leads"
          value={String(kpi.leadCount)}
          sub="enquiries awaiting review"
          color="border-l-amber-500"
          linkTo="/admin/leads"
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={`${kpi.conversionRate}%`}
          sub="approved vs total jobs"
          color="border-l-green-500"
        />
        <KpiCard
          icon={DollarSign}
          label="Pipeline Value"
          value={AUD(kpi.pipelineValue)}
          sub="pending review + approved"
          color="border-l-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column */}
        <div className="lg:col-span-3 space-y-6">
          {/* Monthly chart */}
          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-cyan-600 text-lg font-semibold">
                Total jobs submitted ($):
              </CardTitle>
              <p className="text-sm text-gray-600">{currentMonthName}</p>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyStats} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {monthlyStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Link to="/admin/reports" className="text-xs text-cyan-600 mt-2 hover:underline block">
                view more reports...
              </Link>
            </CardContent>
          </Card>

          <Button
            className="w-full h-16 bg-cyan-500 hover:bg-cyan-600 text-white text-lg font-semibold rounded-lg shadow-md"
            asChild
          >
            <Link to="/admin/customers">
              <Plus className="mr-2 h-5 w-5" />
              Add A Customer
            </Link>
          </Button>
        </div>

        {/* Center Column */}
        <div className="lg:col-span-4 space-y-6">
          {/* Recent Activity Feed */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-cyan-600 text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm">No recent activity.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {recentActivity.map(item => (
                    <div key={item.id} className="flex gap-3 items-start text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-700 leading-snug">{item.content}</p>
                        {item.job_number && (
                          <Link
                            to={`/admin/jobs/${item.job_id}`}
                            className="text-xs text-cyan-600 hover:underline"
                          >
                            Job #{item.job_number} · {item.job_name}
                          </Link>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(item.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Approval */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-cyan-600 text-lg font-semibold">
                Pending Approval
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Show Last:</span>
                <Select value={pendingDays} onValueChange={setPendingDays}>
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="60">60 Days</SelectItem>
                    <SelectItem value="90">90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {pendingJobs.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm">No pending approvals</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">Value</th>
                        <th className="pb-2 font-medium">Submitted</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingJobs.map(job => (
                        <tr key={job.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 text-cyan-600">{job.job_number}</td>
                          <td className="py-2 text-cyan-600 max-w-[120px] truncate">{job.name}</td>
                          <td className="py-2 text-cyan-600">{job.profiles?.full_name || 'Unknown'}</td>
                          <td className="py-2">{AUD(parseFloat(String(job.cost_incl_tax)) || 0)}</td>
                          <td className="py-2 text-gray-500 whitespace-nowrap">{formatDate(job.created_at)}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                                <Link to={`/admin/jobs/${job.id}`}>
                                  <Eye className="h-4 w-4 text-cyan-600" />
                                </Link>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <FileText className="h-4 w-4 text-cyan-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <Download className="h-4 w-4 text-cyan-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link to="/admin/jobs" className="text-xs text-cyan-600 mt-4 text-right hover:underline flex items-center justify-end gap-1">
                see more <ArrowRight className="w-3 h-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Latest Jobs */}
        <div className="lg:col-span-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold">Latest Jobs</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Show Last:</span>
                  <Select value={latestDays} onValueChange={setLatestDays}>
                    <SelectTrigger className="w-24 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 Days</SelectItem>
                      <SelectItem value="30">30 Days</SelectItem>
                      <SelectItem value="60">60 Days</SelectItem>
                      <SelectItem value="90">90 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500 text-center py-4">Loading...</p>
              ) : latestJobs.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No jobs found</p>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">Value</th>
                        <th className="pb-2 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestJobs.map(job => (
                        <tr
                          key={job.id}
                          className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                          onClick={() => window.location.href = `/admin/jobs/${job.id}`}
                        >
                          <td className="py-2 text-cyan-600 font-medium">{job.job_number}</td>
                          <td className="py-2 text-cyan-600 max-w-[140px] truncate">{job.name}</td>
                          <td className="py-2 text-cyan-600">{job.profiles?.full_name || 'Unknown'}</td>
                          <td className="py-2">{AUD(parseFloat(String(job.cost_incl_tax)) || 0)}</td>
                          <td className="py-2 text-gray-500 whitespace-nowrap">{formatDate(job.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
