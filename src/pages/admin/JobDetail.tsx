import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Download, Loader2, ChevronDown, FileText, CheckCircle2, MessageSquare } from 'lucide-react';
import { JobNotes, addSystemNote } from '@/components/shared/JobNotes';
import { CANONICAL_TRADE_JOB_STATUSES, TRADE_JOB_STATUS_LABELS, TradeJobStatus, isTradeJobStatus } from '@/types/trade';
import { useQuery } from '@tanstack/react-query';
import { generateQuoteBOM, PricingData } from '@/lib/pricing';
import { exportOrderingListPdf } from '@/lib/orderingListPdf';
import { exportPackingListPdf } from '@/lib/packingListPdf';
import { exportCutSummaryPdf } from '@/lib/cutSummaryPdf';
import { GlobalDimensions, HardwareOptions } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';

interface Job {
  id: string;
  job_number: number;
  name: string;
  status: string;
  cost_excl_tax: number;
  cost_incl_tax: number;
  design_data: Record<string, unknown>;
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

const STATUS_OPTIONS: { value: TradeJobStatus; label: string }[] = CANONICAL_TRADE_JOB_STATUSES.map((status) => ({
  value: status,
  label: TRADE_JOB_STATUS_LABELS[status],
}));

const AUD = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);

/** Load all pricing tables needed to re-run the BOM engine. */
async function fetchPricingData(): Promise<PricingData> {
  const [parts, materials, edges, hardware, labor, doorDrawer, benchtop] = await Promise.all([
    supabase.from('parts_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('material_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('edge_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('hardware_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('labor_rates').select('*'),
    supabase.from('door_drawer_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('benchtop_pricing').select('*'),
  ]);
  return {
    parts: (parts.data ?? []) as PricingData['parts'],
    materials: (materials.data ?? []) as PricingData['materials'],
    edges: (edges.data ?? []) as PricingData['edges'],
    hardware: (hardware.data ?? []) as PricingData['hardware'],
    labor: (labor.data ?? []) as PricingData['labor'],
    doorDrawer: (doorDrawer.data ?? []) as PricingData['doorDrawer'],
    benchtop: (benchtop.data ?? []) as PricingData['benchtop'],
  };
}

export default function AdminJobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showRequestChanges, setShowRequestChanges] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Pricing data for shop document generation
  const { data: pricingData } = useQuery({
    queryKey: ['admin-pricing-data'],
    queryFn: fetchPricingData,
    staleTime: 10 * 60 * 1000,
  });

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
      setJob(data as Job);
    } catch (error) {
      console.error('Error loading job:', error);
      toast.error('Failed to load job');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: TradeJobStatus) => {
    if (!job) return;
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', job.id);

      if (error) throw error;
      await addSystemNote(job.id, `Status changed to "${TRADE_JOB_STATUS_LABELS[newStatus]}"`);
      setJob({ ...job, status: newStatus });
      toast.success('Status updated');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleApprove = async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      const updatedDesignData = { ...(job.design_data || {}), adminNotes: null };
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'approved', design_data: updatedDesignData })
        .eq('id', job.id);
      if (error) throw error;
      await addSystemNote(job.id, 'Job approved — proceeding to production.');
      setJob({ ...job, status: 'approved', design_data: updatedDesignData });
      // Notify trade user
      if (job.profiles?.email) {
        supabase.functions.invoke('send-email', {
          body: {
            type: 'job_status_change',
            payload: {
              trade_name: job.profiles.full_name || 'there',
              trade_email: job.profiles.email,
              job_title: job.name,
              new_status: 'approved',
              job_url: `${window.location.origin}/trade/job/${job.id}`,
            },
          },
        }).catch((e: unknown) => console.warn('[send-email] job_status_change failed:', e));
      }
      toast.success('Job approved');
    } catch (error) {
      console.error('Error approving job:', error);
      toast.error('Failed to approve job');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!job || !changeNote.trim()) {
      toast.error('Please enter feedback for the trade user');
      return;
    }
    setActionLoading(true);
    try {
      const updatedDesignData = { ...(job.design_data || {}), adminNotes: changeNote.trim() };
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'draft', design_data: updatedDesignData })
        .eq('id', job.id);
      if (error) throw error;
      await addSystemNote(job.id, `Changes requested: "${changeNote.trim()}"`);
      setJob({ ...job, status: 'draft', design_data: updatedDesignData });
      // Notify trade user
      if (job.profiles?.email) {
        supabase.functions.invoke('send-email', {
          body: {
            type: 'job_status_change',
            payload: {
              trade_name: job.profiles.full_name || 'there',
              trade_email: job.profiles.email,
              job_title: job.name,
              new_status: 'changes_requested',
              change_note: changeNote.trim(),
              job_url: `${window.location.origin}/trade/job/${job.id}`,
            },
          },
        }).catch((e: unknown) => console.warn('[send-email] job_status_change failed:', e));
      }
      setShowRequestChanges(false);
      setChangeNote('');
      toast.success('Changes requested — job returned to trade user');
    } catch (error) {
      console.error('Error requesting changes:', error);
      toast.error('Failed to request changes');
    } finally {
      setActionLoading(false);
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

      toast.success('XML exported');
    } catch (error) {
      console.error('Error exporting XML:', error);
      toast.error('Failed to export XML');
    } finally {
      setExporting(false);
    }
  };

  // ── Data extraction from new trade job structure ──────────────────────────
  const designData = useMemo(() => (job?.design_data ?? {}) as Record<string, unknown>, [job]);

  /** Stored trade cabinets have `category`, not `itemType` — treat rows without
   * an explicit itemType as cabinets unless their category is Appliance. */
  const isCabinetRow = (c: Record<string, unknown> & { roomName: string }) =>
    (c.itemType ?? ((c.category === 'Appliance') ? 'Appliance' : 'Cabinet')) === 'Cabinet';

  /** All cabinets across all rooms (new trade job structure: design_data.tradeRooms). */
  const allCabinets = useMemo(() => {
    const rooms = (designData.tradeRooms as Array<Record<string, unknown>> | undefined) ?? [];
    return rooms.flatMap((room) => {
      const cabs = (room.cabinets as Array<Record<string, unknown>> | undefined) ?? [];
      return cabs.map((c) => ({ ...c, roomName: room.name as string }) as Record<string, unknown> & { roomName: string });
    });
  }, [designData]);

  /** All rooms for display. */
  const allRooms = useMemo(() => {
    return (designData.tradeRooms as Array<Record<string, unknown>> | undefined) ?? [];
  }, [designData]);

  // ── Re-run pricing engine to build QuoteBOM for shop documents ────────────
  const quoteBOM = useMemo(() => {
    if (!pricingData || allCabinets.length === 0) return null;

    // Reconstruct PlacedItems from stored cabinet data
    const placedItems = allCabinets
      .filter(isCabinetRow)
      .map((c) => ({
        instanceId: c.instanceId as string,
        definitionId: c.definitionId as string,
        itemType: 'Cabinet' as const,
        cabinetNumber: c.cabinetNumber as string | undefined,
        x: (c.position as Record<string, number> | undefined)?.x ?? 0,
        y: (c.position as Record<string, number> | undefined)?.y ?? 0,
        z: (c.position as Record<string, number> | undefined)?.z ?? 0,
        rotation: (c.position as Record<string, number> | undefined)?.rotation ?? 0,
        width: (c.dimensions as Record<string, number>)?.width ?? 600,
        height: (c.dimensions as Record<string, number>)?.height ?? 870,
        depth: (c.dimensions as Record<string, number>)?.depth ?? 575,
        carcaseMaterialId: (c.materials as Record<string, string> | undefined)?.carcaseFinish,
        exteriorMaterialId: (c.materials as Record<string, string> | undefined)?.exteriorFinish,
      }));

    if (placedItems.length === 0) return null;

    // Use first room's dimensions/hardware if available
    const firstRoom = allRooms[0] as Record<string, unknown> | undefined;
    const dims: GlobalDimensions = {
      ...(DEFAULT_GLOBAL_DIMENSIONS as GlobalDimensions),
      ...((firstRoom?.dimensions as Partial<GlobalDimensions>) ?? {}),
    };
    const hw = firstRoom?.hardware as Record<string, unknown> | undefined;
    const hardwareOptions: HardwareOptions = {
      hingeType: (hw?.hingeType as string) ?? 'Series 200',
      drawerType: (hw?.drawerType as string) ?? 'Alto',
      cabinetTop: 'Standard',
      supplyHardware: (hw?.supplyHardware as boolean) ?? true,
      adjustableLegs: (hw?.adjustableLegs as boolean) ?? true,
      handleId: (hw?.handleType as string) ?? '',
    };

    try {
      return generateQuoteBOM(placedItems, dims, hardwareOptions, pricingData);
    } catch {
      return null;
    }
  }, [pricingData, allCabinets, allRooms]);

  const getStatusBadge = (status: TradeJobStatus) => {
    const styles: Record<TradeJobStatus, string> = {
      draft: 'bg-gray-100 text-gray-700',
      pending_approval: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      in_production: 'bg-orange-100 text-orange-700',
      completed: 'bg-emerald-100 text-emerald-700',
    };
    return styles[status];
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

  const safeStatus: TradeJobStatus = isTradeJobStatus(job.status) ? job.status : 'draft';

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
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(safeStatus)}`}>
          {TRADE_JOB_STATUS_LABELS[safeStatus]}
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
                <p className="font-medium capitalize">{job.delivery_method || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Sell Price (ex GST)</p>
                <p className="font-medium">{AUD(parseFloat(String(job.cost_excl_tax || 0)))}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Sell Price (inc GST)</p>
                <p className="font-medium text-lg">{AUD(parseFloat(String(job.cost_incl_tax || 0)))}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">{new Date(job.created_at).toLocaleDateString('en-AU')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Completion Date</p>
                <p className="font-medium">
                  {job.completion_date ? new Date(job.completion_date).toLocaleDateString('en-AU') : 'Not set'}
                </p>
              </div>
              {job.notes && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="font-medium">{job.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rooms & Cabinets */}
          <Card>
            <CardHeader>
              <CardTitle>
                Rooms &amp; Cabinets ({allRooms.length} room{allRooms.length !== 1 ? 's' : ''}, {allCabinets.filter(isCabinetRow).length} cabinet{allCabinets.filter(isCabinetRow).length !== 1 ? 's' : ''})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allRooms.length === 0 ? (
                <p className="text-gray-500 text-sm">No rooms in this job yet.</p>
              ) : (
                allRooms.map((room, ri) => {
                  const cabs = (room.cabinets as Array<Record<string, unknown>> | undefined) ?? [];
                  const config = room.config as Record<string, number> | undefined;
                  return (
                    <div key={ri} className={ri > 0 ? 'mt-5 pt-5 border-t' : ''}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm">{(room.name as string) || `Room ${ri + 1}`}</p>
                        {config && (
                          <p className="text-xs text-gray-400">
                            {config.width} × {config.depth} mm
                          </p>
                        )}
                      </div>
                      {cabs.length === 0 ? (
                        <p className="text-gray-400 text-xs">No cabinets</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-gray-400 text-xs">
                                <th className="pb-1 font-medium">#</th>
                                <th className="pb-1 font-medium">Product</th>
                                <th className="pb-1 font-medium">W × D × H</th>
                                <th className="pb-1 font-medium text-right">Sell Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cabs.map((cab, ci) => {
                                const dims = cab.dimensions as Record<string, number> | undefined;
                                const snap = (designData.quoteSnapshotsByRoom as Record<string, Record<string, unknown>> | undefined)?.[room.id as string];
                                const perCab = (snap?.perCabinetTotals as Record<string, number> | undefined)?.[cab.instanceId as string]
                                  ?? (designData.quoteSnapshot as Record<string, unknown> | undefined
                                    ? ((designData.quoteSnapshot as Record<string, Record<string, number>>).perCabinetTotals)?.[cab.instanceId as string]
                                    : undefined);
                                return (
                                  <tr key={ci} className="border-b last:border-0">
                                    <td className="py-1.5 text-gray-500">{cab.cabinetNumber as string || `C${ci + 1}`}</td>
                                    <td className="py-1.5">{cab.productName as string || cab.definitionId as string}</td>
                                    <td className="py-1.5 text-gray-500">
                                      {dims ? `${dims.width} × ${dims.depth} × ${dims.height}` : '—'}
                                    </td>
                                    <td className="py-1.5 text-right text-gray-500">
                                      {perCab != null ? AUD(perCab) : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Shop Cost Breakdown from live pricing engine */}
          {quoteBOM && (
            <Card>
              <CardHeader>
                <CardTitle>Production Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {[
                    ['Materials', quoteBOM.grandTotal.materials],
                    ['Edge Tape', quoteBOM.grandTotal.edging],
                    ['Hardware', quoteBOM.grandTotal.hardware],
                    ['Labor', quoteBOM.grandTotal.labor],
                    ['Handling', quoteBOM.grandTotal.handling],
                    ['Machining', quoteBOM.grandTotal.machining],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <p className="text-gray-500 text-xs">{label as string}</p>
                      <p className="font-medium">{AUD(val as number)}</p>
                    </div>
                  ))}
                </div>

                {/* Benchtops sub-breakdown */}
                {quoteBOM.benchtops.length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Benchtops
                    </p>
                    <div className="space-y-1.5">
                      {quoteBOM.benchtops.map((bt) => {
                        const qtyLabel =
                          bt.pricingMethod === 'per_sheet'
                            ? `${bt.sheetsRequired ?? 1} sheet${(bt.sheetsRequired ?? 1) !== 1 ? 's' : ''}`
                            : bt.pricingMethod === 'per_lm'
                            ? `${((bt.linearMetres ?? bt.runLengthMm / 1000)).toFixed(2)} LM`
                            : `${bt.areaSqm.toFixed(2)} m²`;
                        return (
                          <div key={bt.wallLabel} className="flex items-center justify-between text-sm">
                            <div>
                              <span className="font-medium">{bt.wallLabel}</span>
                              <span className="text-gray-400 ml-1 text-xs">
                                {bt.materialName} · {bt.runLengthMm} mm · {qtyLabel}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-medium">{AUD(bt.supplyCost)}</span>
                              {bt.installCost > 0 && (
                                <span className="text-gray-400 text-xs ml-1">+{AUD(bt.installCost)} inst</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dashed">
                      <span className="text-gray-500">Benchtop subtotal</span>
                      <span className="font-medium">{AUD(quoteBOM.grandTotal.benchtop)}</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t flex justify-between">
                  <span className="font-semibold text-sm">Total Shop Cost</span>
                  <span className="font-bold">{AUD(quoteBOM.grandTotal.cost)}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>Build time</span>
                  <span>{quoteBOM.buildHours.total.toFixed(1)} h ({quoteBOM.buildHours.cut.toFixed(1)} cut / {quoteBOM.buildHours.edge.toFixed(1)} edge / {quoteBOM.buildHours.assembly.toFixed(1)} asm)</span>
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

          {/* Pending Review Actions */}
          {safeStatus === 'pending_approval' && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Pending Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-amber-700">
                  This job needs your approval before it can proceed to production.
                </p>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={actionLoading}
                  onClick={handleApprove}
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Approve Job
                </Button>
                {!showRequestChanges ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setShowRequestChanges(true)}
                  >
                    Request Changes
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      className="w-full text-sm rounded-md border border-gray-200 p-2 min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      placeholder="Describe what changes are needed..."
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm"
                        disabled={actionLoading || !changeNote.trim()}
                        onClick={handleRequestChanges}
                      >
                        {actionLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Send Feedback
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => { setShowRequestChanges(false); setChangeNote(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={safeStatus} onValueChange={(v) => updateStatus(v as TradeJobStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Shop Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Shop Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Shop PDFs — admin only */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="w-full" variant="outline" disabled={!quoteBOM}>
                    <FileText className="h-4 w-4 mr-2" />
                    Production PDFs
                    <ChevronDown className="h-3 w-3 ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!quoteBOM) return;
                      exportOrderingListPdf(quoteBOM, job.name);
                      toast.success('Ordering list exported');
                    }}
                  >
                    Ordering List
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!quoteBOM) return;
                      exportPackingListPdf(quoteBOM, job.name);
                      toast.success('Packing list exported');
                    }}
                  >
                    Packing List
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!quoteBOM) return;
                      exportCutSummaryPdf(quoteBOM, job.name);
                      toast.success('Cut summary exported');
                    }}
                  >
                    Cut Summary
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenuSeparator />

              {/* Microvellum XML — gated on approved status */}
              <Button
                className={`w-full ${safeStatus === 'approved' ? 'bg-navy-50 border-navy-200' : ''}`}
                variant="outline"
                onClick={exportToXML}
                disabled={exporting || safeStatus !== 'approved'}
                title={safeStatus !== 'approved' ? 'Job must be approved before exporting to Microvellum' : 'Export to Microvellum XML'}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export to Microvellum XML
                {safeStatus !== 'approved' && (
                  <span className="ml-auto text-xs text-gray-400">Approved only</span>
                )}
              </Button>

              {!quoteBOM && pricingData && (
                <p className="text-xs text-gray-400 text-center">
                  No cabinets in job — PDFs unavailable.
                </p>
              )}
              {!pricingData && (
                <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading pricing…
                </p>
              )}
            </CardContent>
          </Card>

          {/* Job Notes */}
          <Card>
            <CardContent className="pt-5">
              <JobNotes jobId={job.id} isAdmin={true} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
