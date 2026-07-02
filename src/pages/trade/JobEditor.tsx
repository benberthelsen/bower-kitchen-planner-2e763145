import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, Send, Plus, LayoutGrid, Box, Clock, CheckCircle2, Wrench, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TradeLayout from './components/TradeLayout';
import RoomSetupWizard, { RoomConfig } from './components/RoomSetupWizard';
import { useTradeRoom, TradeRoom } from '@/contexts/TradeRoomContext';
import { TradeJobStatus, TRADE_JOB_STATUS_LABELS, isTradeJobStatus } from '@/types/trade';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';
import { JobNotes } from '@/components/shared/JobNotes';


/**
 * Job totals come from the room planner's persisted BOM quote snapshots
 * (design_data.quoteSnapshotsByRoom — the pricing engine's grand totals).
 * The old width×depth placeholder estimate is gone: rooms without a snapshot
 * yet (never opened in the planner) contribute 0 and are counted so the UI
 * can flag the quote as incomplete.
 */
type RoomSnapshots = Record<string, {
  roomTotal?: number;
  perCabinetTotals?: Record<string, number>;
  bomSummary?: { grandTotal?: { subtotalExGst?: number; gst?: number; total?: number } } | null;
} | undefined>;

const computeJobTotalsRaw = (rooms: TradeRoom[], snapshots: RoomSnapshots = {}) => {
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  let unpricedRooms = 0;
  const perCabinetTotals: Record<string, number> = {};
  const perRoomTotals: Record<string, number> = {};
  const perRoomCabinetTotals: Record<string, Record<string, number>> = {};

  rooms.forEach((room) => {
    const snap = snapshots[room.id];
    const grand = snap?.bomSummary?.grandTotal;
    const roomTotal = grand?.total ?? snap?.roomTotal ?? 0;

    if (roomTotal <= 0 && room.cabinets.length > 0) unpricedRooms += 1;

    subtotal += grand?.subtotalExGst ?? (roomTotal > 0 ? roomTotal / 1.1 : 0);
    tax += grand?.gst ?? (roomTotal > 0 ? roomTotal - roomTotal / 1.1 : 0);
    total += roomTotal;

    const roomCabinetTotals = snap?.perCabinetTotals ?? {};
    perRoomTotals[room.id] = Number(roomTotal.toFixed(2));
    perRoomCabinetTotals[room.id] = roomCabinetTotals;
    Object.assign(perCabinetTotals, roomCabinetTotals);
    room.cabinets.forEach((cabinet) => {
      if (!(cabinet.instanceId in perCabinetTotals)) perCabinetTotals[cabinet.instanceId] = 0;
    });
  });

  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
    unpricedRooms,
    perCabinetTotals,
    perRoomTotals,
    perRoomCabinetTotals,
  };
};

const toRoomConfig = (room: TradeRoom): RoomConfig => ({
  name: room.name,
  description: room.description,
  shape: room.shape,
  roomWidth: room.config.width,
  roomDepth: room.config.depth,
  roomHeight: room.config.height,
  cutoutWidth: room.config.cutoutWidth,
  cutoutDepth: room.config.cutoutDepth,
  exteriorMaterial: room.materialDefaults.exteriorFinish,
  exteriorEdge: room.materialDefaults.edgeBanding,
  doorStyle: room.materialDefaults.doorStyle,
  carcaseMaterial: room.materialDefaults.carcaseFinish,
  carcaseEdge: room.materialDefaults.edgeBanding,
  hingeStyle: room.hardwareDefaults.hingeType,
  drawerStyle: room.hardwareDefaults.drawerType,
  supplyHardware: room.hardwareDefaults.supplyHardware,
  adjustableLegs: room.hardwareDefaults.adjustableLegs,
  toeKickHeight: room.dimensions.toeKickHeight,
  shelfSetback: room.dimensions.shelfSetback,
  baseHeight: room.dimensions.baseHeight,
  baseDepth: room.dimensions.baseDepth,
  wallHeight: room.dimensions.wallHeight,
  wallDepth: room.dimensions.wallDepth,
  tallHeight: room.dimensions.tallHeight,
  tallDepth: room.dimensions.tallDepth,
  wallMountHeight: room.dimensions.wallMountHeight ?? 1350,
  doorGap: room.dimensions.doorGap,
  drawerGap: room.dimensions.drawerGap,
  leftGap: room.dimensions.leftGap,
  rightGap: room.dimensions.rightGap,
  upperTopMargin: room.dimensions.topMargin,
  upperBottomMargin: room.dimensions.bottomMargin,
  baseTopMargin: room.dimensions.topMargin,
});

export default function JobEditor() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const isNewJob = jobId === 'new';

  const { rooms, addRoom, updateRoom, hydrateRooms } = useTradeRoom();
  const {
    jobQuery,
    roomsFromServer,
    persistedJobTotals,
    persistedQuoteSnapshot,
    persistedQuoteSnapshotsByRoom,
    upsertJob,
    upsertRoom,
    updateJobStatus,
    persistQuoteSnapshot,
    persistJobTotals,
    exportJobPdf,
    isSaving,
  } = useTradeJobPersistence(jobId);

  const [showRoomWizard, setShowRoomWizard] = useState(isNewJob);
  const [editingRoom, setEditingRoom] = useState<TradeRoom | null>(null);

  // Derive current job status & locked state
  const _jobData = jobQuery.data as { name?: string; status?: string; design_data?: Record<string, unknown> } | undefined;
  const jobStatus: TradeJobStatus = isTradeJobStatus(_jobData?.status) ? (_jobData!.status as TradeJobStatus) : 'draft';
  const isLocked = !isNewJob && jobStatus !== 'draft';
  const adminNote: string | null = (_jobData?.design_data?.adminNotes as string | undefined) ?? null;

  useEffect(() => {
    if (!isNewJob && jobQuery.data) {
      hydrateRooms(roomsFromServer);
    }
  }, [isNewJob, jobQuery.data, roomsFromServer, hydrateRooms]);

  const displayRooms = useMemo(() => rooms, [rooms]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value || 0);

  const quoteState = useMemo(() => {
    const live = computeJobTotalsRaw(displayRooms, persistedQuoteSnapshotsByRoom as RoomSnapshots);
    const persisted = persistedJobTotals;

    // Snapshot-derived totals are the source of truth (same BOM engine as the
    // planner toolbar). Persisted jobTotals only cover rooms with no snapshot.
    const useLive = live.total > 0;
    const subtotal = useLive ? live.subtotal : persisted?.subtotal ?? 0;
    const tax = useLive ? live.tax : persisted?.tax ?? 0;
    const total = useLive ? live.total : persisted?.total ?? 0;

    return {
      subtotal,
      tax,
      total,
      unpricedRooms: live.unpricedRooms,
      isPersisted: Boolean(persisted) || useLive,
      persistedAt: persisted?.updatedAt ?? persistedQuoteSnapshot?.capturedAt ?? null,
      roomCount: displayRooms.length,
      cabinetCount: Object.keys(live.perCabinetTotals).length,
    };
  }, [displayRooms, persistedJobTotals, persistedQuoteSnapshot, persistedQuoteSnapshotsByRoom]);


  const computeJobTotals = useCallback(() => {
    return computeJobTotalsRaw(displayRooms, persistedQuoteSnapshotsByRoom as RoomSnapshots);
  }, [displayRooms, persistedQuoteSnapshotsByRoom]);

  const persistFullJob = async (status: TradeJobStatus = 'draft') => {
    if (!jobId || jobId === 'new') {
      toast.error('A persisted job id is required for save/submit.');
      return;
    }

    await upsertJob({
      id: jobId,
      name: jobQuery.data?.name || `Job ${jobId.slice(0, 8)}`,
      status,
      rooms: displayRooms,
    });

    // Totals derive from the planner's persisted BOM snapshots — persist the
    // roll-up only. Never overwrite the per-room snapshots here: the room
    // planner owns them (they carry the real pricing engine output).
    const totals = computeJobTotals();
    await persistJobTotals({
      jobId,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });
  };

  const handleRoomComplete = async (config: RoomConfig) => {
    if (!jobId) return;

    // For brand-new jobs (jobId === 'new'), create the job row in Supabase first
    // so we have a real UUID before navigating to the planner.
    if (isNewJob && !editingRoom) {
      const newId = crypto.randomUUID();
      const firstRoom = addRoom({
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        config: {
          width: config.roomWidth,
          depth: config.roomDepth,
          height: config.roomHeight,
          shape: config.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
          cutoutWidth: config.cutoutWidth || 0,
          cutoutDepth: config.cutoutDepth || 0,
        },
        dimensions: {
          ...DEFAULT_GLOBAL_DIMENSIONS,
          toeKickHeight: config.toeKickHeight,
          baseHeight: config.baseHeight,
          baseDepth: config.baseDepth,
          wallHeight: config.wallHeight,
          wallDepth: config.wallDepth,
          tallHeight: config.tallHeight,
          tallDepth: config.tallDepth,
          wallMountHeight: config.wallMountHeight ?? 1350,
          doorGap: config.doorGap,
          drawerGap: config.drawerGap,
        },
        materialDefaults: {
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
        },
        hardwareDefaults: {
          handleType: 'bar-handle',
          handleColor: '#1a1a1a',
          hingeType: config.hingeStyle,
          drawerType: config.drawerStyle,
          softClose: true,
          supplyHardware: config.supplyHardware,
          adjustableLegs: config.adjustableLegs,
        },
      });
      try {
        await upsertJob({
          id: newId,
          name: config.name || 'New Job',
          status: 'draft',
          rooms: [firstRoom],
        });
      } catch {
        toast.error('Could not create job — check your connection and try again.');
        return;
      }
      toast.success(`Room "${config.name}" created`);
      navigate(`/trade/job/${newId}/room/${firstRoom.id}/planner`);
      return;
    }

    if (editingRoom) {
      const updatedRoom: TradeRoom = {
        ...editingRoom,
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        config: {
          width: config.roomWidth,
          depth: config.roomDepth,
          height: config.roomHeight,
          shape: config.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
          cutoutWidth: config.cutoutWidth || 0,
          cutoutDepth: config.cutoutDepth || 0,
        },
        dimensions: {
          ...editingRoom.dimensions,
          toeKickHeight: config.toeKickHeight,
          baseHeight: config.baseHeight,
          baseDepth: config.baseDepth,
          wallHeight: config.wallHeight,
          wallDepth: config.wallDepth,
          tallHeight: config.tallHeight,
          tallDepth: config.tallDepth,
          doorGap: config.doorGap,
          drawerGap: config.drawerGap,
        },
        materialDefaults: {
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
        },
        hardwareDefaults: {
          ...editingRoom.hardwareDefaults,
          hingeType: config.hingeStyle,
          drawerType: config.drawerStyle,
          supplyHardware: config.supplyHardware,
          adjustableLegs: config.adjustableLegs,
        },
        updatedAt: new Date(),
      };

      updateRoom(editingRoom.id, updatedRoom);
      if (!isNewJob) {
        await upsertRoom({ jobId, room: updatedRoom });
      }
      toast.success(`Room "${config.name}" updated`);
    } else {
      const newRoom = addRoom({
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        config: {
          width: config.roomWidth,
          depth: config.roomDepth,
          height: config.roomHeight,
          shape: config.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
          cutoutWidth: config.cutoutWidth || 0,
          cutoutDepth: config.cutoutDepth || 0,
        },
        dimensions: {
          ...DEFAULT_GLOBAL_DIMENSIONS,
          toeKickHeight: config.toeKickHeight,
          baseHeight: config.baseHeight,
          baseDepth: config.baseDepth,
          wallHeight: config.wallHeight,
          wallDepth: config.wallDepth,
          tallHeight: config.tallHeight,
          tallDepth: config.tallDepth,
          wallMountHeight: config.wallMountHeight ?? 1350,
          doorGap: config.doorGap,
          drawerGap: config.drawerGap,
        },
        materialDefaults: {
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
        },
        hardwareDefaults: {
          handleType: 'bar-handle',
          handleColor: '#1a1a1a',
          hingeType: config.hingeStyle,
          drawerType: config.drawerStyle,
          softClose: true,
          supplyHardware: config.supplyHardware,
          adjustableLegs: config.adjustableLegs,
        },
      });

      if (!isNewJob) {
        await upsertRoom({ jobId, room: newRoom });
      }

      toast.success(`Room "${config.name}" created`);
      navigate(`/trade/job/${jobId}/room/${newRoom.id}/planner`);
      return;
    }

    setShowRoomWizard(false);
    setEditingRoom(null);
  };

  const handleRoomCancel = () => {
    if (isNewJob && displayRooms.length === 0) {
      navigate('/trade/dashboard');
    } else {
      setShowRoomWizard(false);
      setEditingRoom(null);
    }
  };

  const handleEditRoom = (room: TradeRoom) => {
    setEditingRoom(room);
    setShowRoomWizard(true);
  };

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/trade/dashboard')} className="text-trade-muted hover:text-trade-navy">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-display font-bold text-trade-navy">{isNewJob ? 'Create New Job' : `Job #${(_jobData as { job_number?: number } | undefined)?.job_number ?? jobId?.slice(0, 8)}${_jobData?.name && !_jobData.name.startsWith('Job ') ? ' — ' + _jobData.name : ''}`}</h1>
              <p className="text-trade-muted text-sm">
                {showRoomWizard
                  ? (editingRoom ? `Editing: ${editingRoom.name}` : 'Configure room defaults')
                  : `${displayRooms.length} room${displayRooms.length !== 1 ? 's' : ''} configured`}
              </p>
            </div>
          </div>

          {!showRoomWizard && displayRooms.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" className="border-trade-border" onClick={exportJobPdf}>
                <FileDown className="h-4 w-4 mr-2" />
                Export Quote PDF
              </Button>
              {isLocked ? (
                <>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${
                    jobStatus === 'pending_approval' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    jobStatus === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                    jobStatus === 'in_production' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                    'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {jobStatus === 'pending_approval' ? <Clock className="h-4 w-4" /> :
                     jobStatus === 'in_production' ? <Wrench className="h-4 w-4" /> :
                     <CheckCircle2 className="h-4 w-4" />}
                    {TRADE_JOB_STATUS_LABELS[jobStatus]}
                  </div>
                  {jobStatus === 'pending_approval' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-amber-700 hover:text-amber-900 hover:bg-amber-50"
                      disabled={isSaving}
                      onClick={async () => {
                        try {
                          await updateJobStatus('draft');
                          toast.success('Submission withdrawn — job returned to draft');
                        } catch {
                          toast.error('Failed to withdraw submission');
                        }
                      }}
                    >
                      Withdraw
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="border-trade-border"
                    disabled={isSaving || isNewJob}
                    onClick={async () => {
                      try {
                        await persistFullJob('draft');
                        await updateJobStatus('draft');
                        toast.success('Draft saved', { description: 'Job and rooms persisted.' });
                      } catch {
                        toast.error('Failed to save draft');
                      }
                    }}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button
                    className="bg-trade-amber hover:bg-trade-amber-light text-white"
                    disabled={isSaving || isNewJob}
                    onClick={async () => {
                      try {
                        if (!displayRooms.length || displayRooms.some((room) => !room.name.trim())) {
                          toast.error('Add at least one valid room before submitting');
                          return;
                        }
                        await persistFullJob('pending_approval');
                        await updateJobStatus('pending_approval');
                        toast.success('Job submitted for approval');
                      } catch {
                        toast.error('Failed to submit job');
                      }
                    }}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Approval
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {!showRoomWizard && displayRooms.length > 0 && (
          <div className="mb-6 bg-trade-surface-elevated rounded-xl border border-trade-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-trade-navy">Quote State</h2>
                <p className="text-xs text-trade-muted">
                  {quoteState.isPersisted ? 'Using persisted totals' : 'Using live calculated totals'}
                  {quoteState.persistedAt ? ` • Last persisted ${new Date(quoteState.persistedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="text-xs text-trade-muted">
                {quoteState.roomCount} room{quoteState.roomCount !== 1 ? 's' : ''} • {quoteState.cabinetCount} cabinet{quoteState.cabinetCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div className="rounded-lg border border-trade-border p-3 bg-trade-surface">
                <p className="text-xs text-trade-muted">Subtotal</p>
                <p className="text-lg font-semibold text-trade-navy">{formatCurrency(quoteState.subtotal)}</p>
              </div>
              <div className="rounded-lg border border-trade-border p-3 bg-trade-surface">
                <p className="text-xs text-trade-muted">GST</p>
                <p className="text-lg font-semibold text-trade-navy">{formatCurrency(quoteState.tax)}</p>
              </div>
              <div className="rounded-lg border border-trade-border p-3 bg-trade-surface">
                <p className="text-xs text-trade-muted">Total</p>
                <p className="text-lg font-semibold text-trade-amber">{formatCurrency(quoteState.total)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Status banner — shown whenever job is not a draft */}
        {!showRoomWizard && isLocked && (
          <div className={`mb-6 rounded-xl border p-4 ${
            jobStatus === 'pending_approval' ? 'bg-amber-50 border-amber-200' :
            jobStatus === 'approved' ? 'bg-green-50 border-green-200' :
            jobStatus === 'in_production' ? 'bg-orange-50 border-orange-200' :
            'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 p-1.5 rounded-full ${
                jobStatus === 'pending_approval' ? 'bg-amber-100 text-amber-600' :
                jobStatus === 'approved' ? 'bg-green-100 text-green-600' :
                jobStatus === 'in_production' ? 'bg-orange-100 text-orange-600' :
                'bg-emerald-100 text-emerald-600'
              }`}>
                {jobStatus === 'pending_approval' ? <Clock className="h-4 w-4" /> :
                 jobStatus === 'in_production' ? <Wrench className="h-4 w-4" /> :
                 <CheckCircle2 className="h-4 w-4" />}
              </div>
              <div>
                <p className={`font-semibold text-sm ${
                  jobStatus === 'pending_approval' ? 'text-amber-800' :
                  jobStatus === 'approved' ? 'text-green-800' :
                  jobStatus === 'in_production' ? 'text-orange-800' :
                  'text-emerald-800'
                }`}>
                  {jobStatus === 'pending_approval' ? 'Awaiting Admin Review' :
                   jobStatus === 'approved' ? 'Job Approved' :
                   jobStatus === 'in_production' ? 'In Production' :
                   'Job Completed'}
                </p>
                <p className={`text-xs mt-0.5 ${
                  jobStatus === 'pending_approval' ? 'text-amber-700' :
                  jobStatus === 'approved' ? 'text-green-700' :
                  jobStatus === 'in_production' ? 'text-orange-700' :
                  'text-emerald-700'
                }`}>
                  {jobStatus === 'pending_approval'
                    ? 'This job is locked while under review. You can withdraw your submission to make changes.'
                    : jobStatus === 'approved'
                    ? 'This job has been approved and is ready for production.'
                    : jobStatus === 'in_production'
                    ? 'This job is currently in production.'
                    : 'This job has been completed.'}
                </p>
                {adminNote && (
                  <div className="mt-2 p-2.5 bg-white rounded-lg border border-amber-200">
                    <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Admin feedback:
                    </p>
                    <p className="text-xs text-gray-700">{adminNote}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showRoomWizard ? (
          <RoomSetupWizard onComplete={handleRoomComplete} onCancel={handleRoomCancel} initialConfig={editingRoom ? toRoomConfig(editingRoom) : undefined} />
        ) : displayRooms.length > 0 ? (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayRooms.map((room) => (
                <div key={room.id} className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-trade-amber/10 rounded-lg"><LayoutGrid className="h-5 w-5 text-trade-amber" /></div>
                    <span className="text-xs text-trade-muted bg-trade-surface px-2 py-1 rounded">{room.shape === 'l-shaped' ? 'L-Shape' : 'Rectangle'}</span>
                  </div>
                  <h3 className="font-display font-semibold text-trade-navy text-lg">{room.name}</h3>
                  {room.description && <p className="text-sm text-trade-muted mt-1 line-clamp-2">{room.description}</p>}
                  <div className="mt-4 pt-3 border-t border-trade-border flex items-center justify-between">
                    <span className="text-sm text-trade-muted">{room.cabinets.length} products</span>
                    <div className="flex gap-2">
                      {!isLocked && (
                        <Button variant="outline" size="sm" onClick={() => handleEditRoom(room)}>Edit</Button>
                      )}
                      <Button
                        size="sm"
                        className={isLocked
                          ? 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-100'
                          : 'bg-trade-amber hover:bg-trade-amber/90 text-trade-navy'}
                        onClick={() => navigate(`/trade/job/${jobId}/room/${room.id}/planner`)}
                        disabled={isLocked}
                      >
                        <Box className="h-4 w-4 mr-1" />
                        {isLocked ? 'Locked' : 'Open Planner'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => { setEditingRoom(null); setShowRoomWizard(true); }} className="bg-trade-surface-elevated rounded-xl border-2 border-dashed border-trade-border p-5 hover:border-trade-amber hover:bg-trade-amber/5 transition-all flex flex-col items-center justify-center min-h-[180px] group">
                <div className="p-3 bg-trade-surface rounded-full group-hover:bg-trade-amber/10 transition-colors"><Plus className="h-6 w-6 text-trade-muted group-hover:text-trade-amber" /></div>
                <span className="mt-3 font-medium text-trade-muted group-hover:text-trade-amber">Add Another Room</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-trade-amber/10 rounded-full flex items-center justify-center mx-auto mb-4"><Plus className="h-8 w-8 text-trade-amber" /></div>
              <h2 className="text-xl font-display font-semibold text-trade-navy mb-2">No Rooms Yet</h2>
              <p className="text-trade-muted mb-6">Start by adding your first room to configure its default materials, hardware, and dimensions.</p>
              <Button onClick={() => { setEditingRoom(null); setShowRoomWizard(true); }} className="bg-trade-navy hover:bg-trade-navy-light text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add First Room
              </Button>
            </div>
          </div>
        )}

      {/* Activity & Notes */}
      {jobId && (
        <div className="mt-6 bg-trade-surface-elevated rounded-xl border border-trade-border p-6">
          <JobNotes jobId={jobId} isAdmin={false} />
        </div>
      )}
      </div>
    </TradeLayout>
  );
}
