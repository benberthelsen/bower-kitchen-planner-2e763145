import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';

interface Job {
  id: string;
  job_number: number;
  name: string;
  status: string;
  cost_excl_tax: number;
  cost_incl_tax: number;
  design_data: any;
  delivery_method: string;
  notes: string;
  created_at: string;
  completion_date: string | null;
  profiles?: {
    full_name: string;
    email: string;
    phone: string;
    company_name: string;
  };
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'processing', label: 'Processing' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_production', label: 'In Production' },
  { value: 'completed', label: 'Completed' },
];

export default function AdminJobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (id) loadJob();
  }, [id]);

  const loadJob = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          profiles:customer_id (
            full_name,
            email,
            phone,
            company_name
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setJob(data);
    } catch (error) {
      console.error('Error loading job:', error);
      toast.error('Failed to load job');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!job) return;
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', job.id);

      if (error) throw error;
      setJob({ ...job, status: newStatus });
      toast.success('Status updated');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const exportToXML = async () => {
    if (!job) return;
    setExporting(true);
    try {
      const response = await supabase.functions.invoke('export-microvellum-xml', {
        body: { jobId: job.id }
      });

      if (response.error) throw response.error;

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
      setExporting(false);
    }
  };

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

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Job not found</p>
      </div>
    );
  }

  const designData = job.design_data || {};
  const cabinets = designData.items?.filter((i: any) => i.itemType === 'Cabinet') || [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/jobs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Jobs
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Job #{job.job_number}</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(job.status)}`}>
          {job.status?.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Job Name</p>
                <p className="font-medium">{job.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Delivery Method</p>
                <p className="font-medium capitalize">{job.delivery_method}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Cost (excl. GST)</p>
                <p className="font-medium">${parseFloat(String(job.cost_excl_tax || 0)).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Cost (incl. GST)</p>
                <p className="font-medium text-lg">${parseFloat(String(job.cost_incl_tax || 0)).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">{new Date(job.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Completion Date</p>
                <p className="font-medium">{job.completion_date ? new Date(job.completion_date).toLocaleDateString() : 'Not set'}</p>
              </div>
              {job.notes && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="font-medium">{job.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cabinet List */}
          <Card>
            <CardHeader>
              <CardTitle>Cabinets ({cabinets.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {cabinets.length === 0 ? (
                <p className="text-gray-500">No cabinets in this design</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 font-medium">ID</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">W x D x H</th>
                        <th className="pb-2 font-medium">Position</th>
                        <th className="pb-2 font-medium">Hinge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cabinets.map((cab: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 font-mono">{cab.cabinetNumber || `C${i + 1}`}</td>
                          <td className="py-2">{cab.definitionId}</td>
                          <td className="py-2">{cab.width} x {cab.depth} x {cab.height}</td>
                          <td className="py-2">({Math.round(cab.x)}, {Math.round(cab.z)})</td>
                          <td className="py-2">{cab.hinge || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Room Config */}
          {designData.room && (
            <Card>
              <CardHeader>
                <CardTitle>Room Configuration</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Width</p>
                  <p className="font-medium">{designData.room.width}mm</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Depth</p>
                  <p className="font-medium">{designData.room.depth}mm</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Height</p>
                  <p className="font-medium">{designData.room.height}mm</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium">{job.profiles?.full_name || 'Unknown'}</p>
              {job.profiles?.company_name && (
                <p className="text-sm text-gray-500">{job.profiles.company_name}</p>
              )}
              <p className="text-sm">{job.profiles?.email}</p>
              {job.profiles?.phone && <p className="text-sm">{job.profiles.phone}</p>}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-2">Update Status</p>
                <Select value={job.status} onValueChange={updateStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                className="w-full" 
                onClick={exportToXML}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export to Microvellum XML
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}