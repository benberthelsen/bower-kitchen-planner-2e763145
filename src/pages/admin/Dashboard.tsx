import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { Plus, FileText, Eye, Download, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

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

export default function AdminDashboard() {
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  const [latestJobs, setLatestJobs] = useState<Job[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [totalSubmitted, setTotalSubmitted] = useState(0);
  const [pendingDays, setPendingDays] = useState('60');
  const [latestDays, setLatestDays] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [pendingDays, latestDays]);

  const loadDashboardData = async () => {
    try {
      // Get all jobs for stats
      const { data: allJobs } = await supabase
        .from('jobs')
        .select('status, cost_incl_tax, created_at');

      // Calculate monthly stats
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      const thisMonthJobs = allJobs?.filter(j => {
        const jobDate = new Date(j.created_at);
        return jobDate.getMonth() === currentMonth && jobDate.getFullYear() === currentYear;
      }) || [];

      const created = thisMonthJobs.filter(j => j.status === 'draft' || j.status === 'processing').length;
      const accepted = thisMonthJobs.filter(j => j.status === 'approved' || j.status === 'completed').length;
      
      const createdValue = thisMonthJobs
        .filter(j => j.status === 'draft' || j.status === 'processing')
        .reduce((sum, j) => sum + (parseFloat(String(j.cost_incl_tax)) || 0), 0);
      const acceptedValue = thisMonthJobs
        .filter(j => j.status === 'approved' || j.status === 'completed')
        .reduce((sum, j) => sum + (parseFloat(String(j.cost_incl_tax)) || 0), 0);

      setMonthlyStats([
        { name: `Created(${created})`, value: createdValue, color: '#0ea5e9' },
        { name: `Accepted(${accepted})`, value: acceptedValue, color: '#22c55e' },
      ]);
      
      setTotalSubmitted(createdValue + acceptedValue);

      // Get pending approval jobs
      const pendingDate = new Date();
      pendingDate.setDate(pendingDate.getDate() - parseInt(pendingDays));
      
      const { data: pending } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending_approval')
        .gte('created_at', pendingDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      // Get customer names for pending jobs
      if (pending && pending.length > 0) {
        const customerIds = [...new Set(pending.map(j => j.customer_id).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', customerIds);

        const jobsWithCustomers = pending.map(job => ({
          ...job,
          profiles: profiles?.find(p => p.id === job.customer_id) || null
        }));
        setPendingJobs(jobsWithCustomers);
      } else {
        setPendingJobs([]);
      }

      // Get latest jobs
      const latestDate = new Date();
      latestDate.setDate(latestDate.getDate() - parseInt(latestDays));
      
      const { data: latest } = await supabase
        .from('jobs')
        .select('*')
        .gte('created_at', latestDate.toISOString())
        .order('updated_at', { ascending: false })
        .limit(15);

      if (latest && latest.length > 0) {
        const customerIds = [...new Set(latest.map(j => j.customer_id).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', customerIds);

        const jobsWithCustomers = latest.map(job => ({
          ...job,
          profiles: profiles?.find(p => p.id === job.customer_id) || null
        }));
        setLatestJobs(jobsWithCustomers);
      } else {
        setLatestJobs([]);
      }

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "d MMM 'at' h:mma").toLowerCase();
  };

  const currentMonthName = format(new Date(), 'MMMM yyyy');

  return (
    <div className="p-6 bg-gray-100 min-h-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column */}
        <div className="lg:col-span-3 space-y-6">
          {/* Total Jobs Submitted Chart */}
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
              <p className="text-xs text-cyan-600 mt-2 cursor-pointer hover:underline">
                view more reports...
              </p>
            </CardContent>
          </Card>

          {/* Add Customer Button */}
          <Button 
            className="w-full h-16 bg-cyan-500 hover:bg-cyan-600 text-white text-lg font-semibold rounded-lg shadow-md"
            asChild
          >
            <Link to="/admin/customers">
              <Plus className="mr-2 h-5 w-5" />
              Add A Customer
            </Link>
          </Button>

          {/* Newest Customers */}
          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-cyan-600 text-lg font-semibold">
                Newest Customers
              </CardTitle>
              <p className="text-sm text-gray-500">Show Last: 60 Days</p>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 text-sm">Loading customers...</p>
            </CardContent>
          </Card>
        </div>

        {/* Center Column - Pending Approval */}
        <div className="lg:col-span-4 space-y-6">
          {/* Customer Interactions (placeholder) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-cyan-600 text-lg font-semibold">
                Customer Interactions
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Status:</span>
                <Select defaultValue="open">
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">OPEN</SelectItem>
                    <SelectItem value="closed">CLOSED</SelectItem>
                    <SelectItem value="all">ALL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="text-center py-8">
              <p className="text-gray-500">No OPEN Customer Interactions.</p>
              <Button variant="outline" className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Add Activity
              </Button>
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
                <p className="text-gray-500 text-center py-4">No pending approvals</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">Cost incl. Tax</th>
                        <th className="pb-2 font-medium">Date Submitted</th>
                        <th className="pb-2 font-medium">Options</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingJobs.map(job => (
                        <tr key={job.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 text-cyan-600">{job.job_number}</td>
                          <td className="py-2 text-cyan-600">{job.name}</td>
                          <td className="py-2 text-cyan-600">{job.profiles?.full_name || 'Unknown'}</td>
                          <td className="py-2">${parseFloat(String(job.cost_incl_tax) || '0').toFixed(2)}</td>
                          <td className="py-2 text-gray-500">{formatDate(job.created_at)}</td>
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
              <p className="text-xs text-cyan-600 mt-4 text-right cursor-pointer hover:underline">
                see more...
              </p>
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">System:</span>
                  <Select defaultValue="all">
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
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
                        <th className="pb-2 font-medium">Cost incl. Tax</th>
                        <th className="pb-2 font-medium">Last Updated</th>
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
                          <td className="py-2 text-cyan-600">{job.name}</td>
                          <td className="py-2 text-cyan-600">{job.profiles?.full_name || 'Unknown'}</td>
                          <td className="py-2">${parseFloat(String(job.cost_incl_tax) || '0').toFixed(2)}</td>
                          <td className="py-2 text-gray-500">{formatDate(job.updated_at)}</td>
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