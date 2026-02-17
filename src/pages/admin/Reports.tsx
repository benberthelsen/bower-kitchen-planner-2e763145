import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, FileText, ShieldCheck } from 'lucide-react';

type ReportType = 'users' | 'jobs' | 'pricing_history';
type ExportFormat = 'csv' | 'json';

const reportTypeOptions: Array<{ value: ReportType; label: string; description: string }> = [
  {
    value: 'users',
    label: 'Users / Customers',
    description: 'Profile + type + activity summary',
  },
  {
    value: 'jobs',
    label: 'Jobs / Quotes',
    description: 'Status + value + date fields',
  },
  {
    value: 'pricing_history',
    label: 'Product / Pricing Change History',
    description: 'Price audit trail and change actor',
  },
];

const todayIso = new Date().toISOString().split('T')[0];
const thirtyDaysAgoIso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().split('T')[0];

export default function AdminReports() {
  const [reportType, setReportType] = useState<ReportType>('users');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [startDate, setStartDate] = useState(thirtyDaysAgoIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [tenantCompany, setTenantCompany] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadTenantDefault = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('company_name')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Failed to load admin tenant profile:', error);
        return;
      }

      setTenantCompany(data?.company_name ?? '');
    };

    void loadTenantDefault();
  }, []);

  const selectedReport = reportTypeOptions.find(option => option.value === reportType);

  const handleExport = async () => {
    if (!tenantCompany.trim()) {
      toast.error('Tenant company is required for safe export scoping.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('admin_generate_report_export', {
        p_report_type: reportType,
        p_start_date: startDate,
        p_end_date: endDate,
        p_tenant_company: tenantCompany.trim(),
        p_format: format,
      });

      if (error) throw error;

      const exportRow = data?.[0];
      if (!exportRow?.payload || !exportRow?.filename) {
        throw new Error('No export data was generated.');
      }

      const blob = new Blob([exportRow.payload], { type: exportRow.mime_type ?? 'text/plain' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = exportRow.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);

      toast.success(`Downloaded ${exportRow.filename}`);
    } catch (error) {
      console.error('Failed to export report:', error);
      toast.error('Export failed. Verify your role and filter values.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports & Exports</h1>
        <p className="text-muted-foreground mt-1">Generate auditable admin exports with server-side role checks.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Builder
          </CardTitle>
          <CardDescription>Choose a report type, date range, and tenant scope before exporting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportType">Report type</Label>
              <select
                id="reportType"
                className="w-full border rounded-md px-3 py-2 bg-background"
                value={reportType}
                onChange={(event) => setReportType(event.target.value as ReportType)}
              >
                {reportTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">{selectedReport?.description}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <select
                id="format"
                className="w-full border rounded-md px-3 py-2 bg-background"
                value={format}
                onChange={(event) => setFormat(event.target.value as ExportFormat)}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenantCompany">Tenant company (scope)</Label>
            <Input
              id="tenantCompany"
              value={tenantCompany}
              onChange={(event) => setTenantCompany(event.target.value)}
              placeholder="e.g. Acme Joinery"
            />
            <p className="text-sm text-muted-foreground">
              Export data is constrained to this tenant value for operational safety and auditability.
            </p>
          </div>

          <Button onClick={handleExport} disabled={loading} className="gap-2">
            <Download className="h-4 w-4" />
            {loading ? 'Generating export…' : 'Generate & Download'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Safety & audit controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>Exports are generated by a server-side SQL RPC that enforces admin role checks.</li>
            <li>Date range and tenant company are mandatory filter inputs.</li>
            <li>Filenames include report type, tenant, and generation timestamp for traceability.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
