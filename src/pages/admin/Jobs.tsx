import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Download, Eye, RefreshCw } from 'lucide-react';

interface Job {
  id: string;
  job_number: number;
  name: string;
  status: string;
  cost_excl_tax: number;
  cost_incl_tax: number;
  created_at: string;
  completion_date: string | null;
  customer_id: string;
  profiles?: {
    full_name: string;
    email: string;
  };
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'processing', label: 'Processing' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_production', label: 'In Production' },
  { value: 'completed', label: 'Completed' },
];

export default function AdminJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, [statusFilter]);

  const loadJobs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('jobs')
        .select(`
          *,
          profiles:customer_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const updateJobStatus = async (jobId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', jobId);

      if (error) throw error;
      toast.success('Status updated');
      loadJobs();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const exportToXML = async (jobId: string) => {
    setExportingId(jobId);
    try {
      const response = await supabase.functions.invoke('export-microvellum-xml', {
        body: { jobId }
      });

      if (response.error) throw response.error;

      // Create downloadable XML file
      const blob = new Blob([response.data.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${response.data.filename}.xml`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('XML exported successfully');
    } catch (error) {
      console.error('Error exporting XML:', error);
      toast.error('Failed to export XML');
    } finally {
      setExportingId(null);
    }
  };

  const filteredJobs = jobs.filter(job => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      job.name.toLowerCase().includes(search) ||
      job.job_number.toString().includes(search) ||
      job.profiles?.full_name?.toLowerCase().includes(search) ||
      job.profiles?.email?.toLowerCase().includes(search)
    );
  });

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <Button onClick={loadJobs} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filteredJobs.length === 0 ? (
            <p className="text-gray-500">No jobs found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-gray-500">
                    <th className="pb-3 font-medium">Job #</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Cost (inc GST)</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map(job => (
                    <tr key={job.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{job.job_number}</td>
                      <td className="py-3">{job.name}</td>
                      <td className="py-3">
                        <div>
                          <p className="font-medium">{job.profiles?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{job.profiles?.email}</p>
                        </div>
                      </td>
                      <td className="py-3">
                        <Select 
                          value={job.status} 
                          onValueChange={(val) => updateJobStatus(job.id, val)}
                        >
                          <SelectTrigger className="w-36 h-8">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(job.status)}`}>
                              {job.status?.replace('_', ' ')}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.filter(o => o.value !== 'all').map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3">${parseFloat(String(job.cost_incl_tax || 0)).toLocaleString()}</td>
                      <td className="py-3 text-gray-500 text-sm">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Link to={`/admin/jobs/${job.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => exportToXML(job.id)}
                            disabled={exportingId === job.id}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
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