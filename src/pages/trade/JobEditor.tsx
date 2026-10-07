import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, Send, Plus, LayoutGrid, Box, Clock, CheckCircle2, Wrench, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TradeLayout from './components/TradeLayout';
import RoomSetupWizard, { roomConfigWithDefaults, type RoomConfig } from './components/RoomSetupWizard';
import { useTradeRoom, TradeRoom } from '@/contexts/TradeRoomContext';
import { TradeJobStatus, TRADE_JOB_STATUS_LABELS, isTradeJobStatus } from '@/types/trade';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';
import { captureHandoffToken, usePlannerHandoff, useTokenizedPlannerHandoff, linkTradeHandoff } from '@/hooks/usePlannerHandoff';
import { parseLegacyWebsitePlannerHandoff } from '@/lib/roomScan/contract';
import { previewCaptureUpdate, resolveRoomCapture, roomDocumentFromCaptureDraft } from '@/lib/roomScan/roomDocumentAdapter';
import { captureScannerSession, linkScannerRoom, readScannerSession, type ScannerSession } from '@/lib/roomScan/scannerSession';
import { derivedLegacyBounds, RoomRevisionConflictError, saveRoomSetupEdit } from '@/lib/roomDocument';
import { readWizardRoomHandoff } from '@/lib/homeowner/wizardRoomHandoff';
import { legacyRoomConfig, roomDimensions, roomSetupExtras, toRoomConfig } from '@/lib/trade/roomSetupMapping';
import { useMaterialsCatalog } from '@/hooks/useMaterialsCatalog';
import { useAuth } from '@/hooks/useAuth';
import { consumerScannerRoomConfig, consumerScannerRoomForFastPath } from '@/lib/trade/consumerScannerHandoff';
import { JobNotes } from '@/components/shared/JobNotes';
import { supabase } from '@/integrations/supabase/client';


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
  bomSummary?: {
    grandTotal?: { subtotalExGst?: number; gst?: number; total?: number };
    /** Pricing-trust warnings persisted by the planner (WS2 guard) */
    warnings?: string[];
  } | null;
} | undefined>;

type ExistingCaptureRoom = { jobId: string; roomId: string };

/** Query only the signed-in owner's jobs. Re-importing the same scan must not
 * silently create a second draft or overwrite the room edited in trade. */
async function findExistingCaptureRoom(captureId: string): Promise<ExistingCaptureRoom | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in before saving this room.');
  const { data, error } = await supabase.from('jobs')
    .select('id, design_data')
    .eq('customer_id', auth.user.id)
    .contains('design_data', { tradeRooms: [{ roomDocument: { capture: { captureId } } }] })
    .limit(5);
  if (error) throw error;
  for (const job of data ?? []) {
    const rooms = (job.design_data as { tradeRooms?: { id: string; roomDocument?: { capture?: { captureId?: string } } }[] } | null)?.tradeRooms;
    const room = rooms?.find(candidate => candidate.roomDocument?.capture?.captureId === captureId);
    if (room) return { jobId: job.id, roomId: room.id };
  }
  return null;
}

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

export default function JobEditor() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const isNewJob = jobId === 'new';
  const { userType } = useAuth();

  // WS5 Phase 3: website → planner starter-design handoff (?handoff=<id>).
  const [searchParams] = useSearchParams();
  const handoffId = searchParams.get('handoff');
  const importingWizardRoom = isNewJob && searchParams.get('wizardRoom') === '1';
  const wizardRoom = useMemo(() => importingWizardRoom
    ? readWizardRoomHandoff(sessionStorage, handoffId) : null,
  [importingWizardRoom, handoffId]);
  const [scannerSession] = useState<ScannerSession | null>(() => captureScannerSession());
  const [handoffToken] = useState<string | null>(() => captureHandoffToken(handoffId));
  const handoffQuery = usePlannerHandoff(handoffToken ? null : handoffId);
  const tokenizedHandoff = useTokenizedPlannerHandoff(handoffId, handoffToken);
  const handoffPayload = tokenizedHandoff.data?.payload ?? handoffQuery.data?.payload;
  const handoffLoading = handoffToken
    ? tokenizedHandoff.isPending || tokenizedHandoff.isFetching
    : handoffQuery.isPending || handoffQuery.isFetching;
  const handoffError = handoffToken ? tokenizedHandoff.isError : handoffQuery.isError;
  const retryHandoff = () => {
    void (handoffToken ? tokenizedHandoff.refetch() : handoffQuery.refetch());
  };
  const { materials: catalogMaterials } = useMaterialsCatalog();

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
  const [scanUpdateSaving, setScanUpdateSaving] = useState(false);
  const [scanUpdateDismissed, setScanUpdateDismissed] = useState(false);
  const [existingCaptureRoom, setExistingCaptureRoom] = useState<ExistingCaptureRoom | null>(null);
  const [showAdvancedScanSetup, setShowAdvancedScanSetup] = useState(false);
  const [creatingConsumerRoom, setCreatingConsumerRoom] = useState(false);

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

  // WS5 Phase 3: map the website handoff onto the Room Setup Wizard. Material
  // names are matched against the priced catalog when possible; unmatched
  // names pass through as-is (the WS2 pricing guard flags them on the quote).
  const handoffInitialConfig = useMemo<Partial<RoomConfig> | undefined>(() => {
    if (!isNewJob) return undefined;
    const wizardConfig: Partial<RoomConfig> | undefined = wizardRoom ? {
      name: wizardRoom.name,
      description: 'Reviewed wall plan from the homeowner wizard',
      shape: 'custom',
      roomDocument: wizardRoom.document,
      roomWidth: wizardRoom.widthMm,
      roomDepth: wizardRoom.depthMm,
      roomHeight: wizardRoom.heightMm,
    } : undefined;
    if (!handoffPayload) return wizardConfig;
    const p = handoffPayload;
    const matchMaterial = (sel?: string) => {
      if (!sel) return undefined;
      const s = sel.toLowerCase();
      const m = catalogMaterials.find(
        (x) => x.name?.toLowerCase() === s || x.name?.toLowerCase().includes(s) || s.includes(x.name?.toLowerCase() ?? '~'),
      );
      return m?.name ?? sel;
    };
    const cfg: Partial<RoomConfig> = {
      name: p.roomType ? p.roomType.charAt(0).toUpperCase() + p.roomType.slice(1) : 'Kitchen',
      description: [
        'From website design scope',
        p.styleTags?.length ? `Style: ${p.styleTags.join(', ')}` : '',
        p.notes?.trim() ?? '',
      ].filter(Boolean).join(' | '),
    };
    // Scanner-aware mapping: a validated room scan is authoritative for
    // dimensions AND features; rough dimensions are the legacy fallback.
    const parsed = parseLegacyWebsitePlannerHandoff(p);
    const scan = parsed.ok ? parsed.handoff.roomScan : undefined;
    const captureDraft = parsed.ok ? parsed.handoff.roomCaptureDraft : undefined;
    if (scan) {
      cfg.roomWidth = scan.room.width;
      cfg.roomDepth = scan.room.depth;
      cfg.roomHeight = scan.room.height;
      // parseLegacyWebsitePlannerHandoff has already runtime-validated these
      // against the canonical scanner contract. The app-facing types are kept
      // compile-checked in roomScan/compat-test.ts under strict mode.
      cfg.openings = scan.room.openings as RoomConfig['openings'];
      cfg.services = scan.room.services as RoomConfig['services'];
    } else if (captureDraft) {
      // The draft can contain an open wall run. It must not be replaced by the
      // rough bounding rectangle or treated as a confirmed room boundary.
      try {
        cfg.roomDocument = roomDocumentFromCaptureDraft(captureDraft, `handoff-${handoffId}`);
        cfg.shape = 'custom';
        if (captureDraft.dimensions?.widthMm) cfg.roomWidth = captureDraft.dimensions.widthMm;
        if (captureDraft.dimensions?.depthMm) cfg.roomDepth = captureDraft.dimensions.depthMm;
        if (captureDraft.dimensions?.heightMm) cfg.roomHeight = captureDraft.dimensions.heightMm;
      } catch {
        // Preserve the handoff and its notes even when geometry needs review.
        cfg.description = `${cfg.description} | Wall draft needs review before import`;
      }
    } else {
      if (p.dimensions?.widthMm) cfg.roomWidth = p.dimensions.widthMm;
      if (p.dimensions?.depthMm) cfg.roomDepth = p.dimensions.depthMm;
      if (p.dimensions?.heightMm) cfg.roomHeight = p.dimensions.heightMm;
    }
    const exterior = matchMaterial(p.materials?.mainCabinet);
    if (exterior) cfg.exteriorMaterial = exterior;
    // The homeowner may have corrected walls and added proposed cabinets
    // after the scanner handoff was created. Keep that reviewed document while
    // retaining the handoff's other room settings and capture reference.
    return { ...cfg, ...wizardConfig };
  }, [handoffPayload, handoffId, isNewJob, catalogMaterials, wizardRoom]);

  // A consumer's saved scan already has an editable RoomDocument. Let them
  // review that room and open the existing cabinet planner in one step;
  // detailed room setup remains available when they choose it.
  const consumerScannerRoom = consumerScannerRoomForFastPath({
    userType, isNewJob, importingWizardRoom, initialConfig: handoffInitialConfig,
  });

  // Both homeowner wall plans and tokenized scanner handoffs can import the
  // same capture. Surface the saved room before setup, then repeat the check
  // at save time so a second tab cannot silently create a duplicate job.
  const importedCaptureId = isNewJob ? handoffInitialConfig?.roomDocument?.capture?.captureId : undefined;
  useEffect(() => {
    setExistingCaptureRoom(null);
    if (!importedCaptureId) return;
    let cancelled = false;
    void findExistingCaptureRoom(importedCaptureId).then(existing => {
      if (!cancelled) setExistingCaptureRoom(existing);
    }).catch(() => { /* The save handler repeats this check and blocks on error. */ });
    return () => { cancelled = true; };
  }, [importedCaptureId]);

  const openExistingCaptureRoom = (existing: ExistingCaptureRoom) => {
    // Keep a later scanner handoff available for review against the edited
    // room; a direct planner route would drop the incoming scan update.
    navigate(handoffId && !importingWizardRoom
      ? `/trade/job/${existing.jobId}?handoff=${encodeURIComponent(handoffId)}`
      : `/trade/job/${existing.jobId}/room/${existing.roomId}/planner`);
  };

  // Loading a handoff never consumes it (master plan §6.3 step 7 / defect
  // D-3): consumption/linking happens only in handleRoomComplete after the
  // job actually exists, via the link-trade-handoff function.
  useEffect(() => {
    if (handoffPayload) {
      toast.success('Website design scope loaded — the wizard is pre-filled.');
    }
  }, [handoffPayload]);

  const scanUpdate = useMemo(() => {
    if (isNewJob || !handoffPayload || !jobQuery.data) return null;
    const parsed = parseLegacyWebsitePlannerHandoff(handoffPayload);
    if (!parsed.ok) return { status: 'invalid' as const };
    const resolved = resolveRoomCapture(parsed.handoff, `handoff-${handoffId}`);
    if (resolved.kind !== 'draft' || !resolved.document)
      return { status: 'invalid' as const };
    const room = roomsFromServer.find(candidate => candidate.roomDocument?.capture?.captureId
      === resolved.document!.capture?.captureId);
    if (!room?.roomDocument) return { status: 'unlinked' as const };
    if (room.roomDocument.capture?.sourceRevision === resolved.document.capture?.sourceRevision)
      return { status: 'current' as const, room };
    try {
      return { status: 'review' as const, room,
        preview: previewCaptureUpdate(room.roomDocument, resolved.document) };
    } catch { return { status: 'invalid' as const }; }
  }, [handoffPayload, handoffId, isNewJob, jobQuery.data, roomsFromServer]);

  const acceptScanUpdate = async () => {
    if (!jobId || !scanUpdate || scanUpdate.status !== 'review' || isLocked) return;
    const { room, preview } = scanUpdate;
    if (preview.updatedWallEvidence === 0 && preview.addedPhotoObservations === 0) return;
    const bounds = derivedLegacyBounds(preview.document);
    const updatedRoom: TradeRoom = { ...room, roomDocument: preview.document,
      config: bounds ? { ...room.config, width: Math.max(1, Math.round(bounds.widthMm)),
        depth: Math.max(1, Math.round(bounds.depthMm)) } : room.config,
      updatedAt: new Date() };
    setScanUpdateSaving(true);
    try {
      await upsertRoom({ jobId, room: updatedRoom,
        expectedRoomRevision: room.roomDocument?.revision ?? null });
      updateRoom(room.id, updatedRoom);
      if (handoffId) void linkTradeHandoff(handoffId, jobId);
      if (scannerSession?.captureId === preview.document.capture?.captureId
        && preview.document.capture?.sourceRevision !== room.roomDocument?.capture?.sourceRevision) {
        try { await linkScannerRoom(scannerSession, jobId, room.id, preview.document.capture.sourceRevision); }
        catch { toast.warning('Scan update saved; the scanner link needs a retry in the planner.'); }
      }
      navigate(`/trade/job/${jobId}/room/${room.id}/planner`);
    } catch {
      toast.error('The scan update could not be saved. Your current room is unchanged; reload and review again.');
    } finally { setScanUpdateSaving(false); }
  };

  const quoteState = useMemo(() => {
    const live = computeJobTotalsRaw(displayRooms, persistedQuoteSnapshotsByRoom as RoomSnapshots);
    const persisted = persistedJobTotals;

    // Pricing-trust warnings persisted with each room's snapshot (WS2 guard).
    const warnings = Array.from(new Set(
      Object.values(persistedQuoteSnapshotsByRoom as RoomSnapshots)
        .flatMap((snap) => snap?.bomSummary?.warnings ?? [])
    ));

    // Submitted/approved jobs are frozen to the persisted job total used by
    // both the dashboard cost columns and the PDF. Drafts use current room
    // snapshots. This also reconciles legacy rows where the old parallel
    // snapshot/totals writes left different generations in design_data.
    const useLockedJobTotal = jobStatus !== 'draft' && (persisted?.total ?? 0) > 0;
    const useLive = !useLockedJobTotal && live.total > 0;
    const subtotal = useLockedJobTotal ? persisted?.subtotal ?? 0 : useLive ? live.subtotal : persisted?.subtotal ?? 0;
    const tax = useLockedJobTotal ? persisted?.tax ?? 0 : useLive ? live.tax : persisted?.tax ?? 0;
    const total = useLockedJobTotal ? persisted?.total ?? 0 : useLive ? live.total : persisted?.total ?? 0;

    return {
      subtotal,
      tax,
      total,
      warnings,
      unpricedRooms: live.unpricedRooms,
      isPersisted: Boolean(persisted) || useLive,
      persistedAt: persisted?.updatedAt ?? persistedQuoteSnapshot?.capturedAt ?? null,
      roomCount: displayRooms.length,
      cabinetCount: Object.keys(live.perCabinetTotals).length,
    };
  }, [displayRooms, jobStatus, persistedJobTotals, persistedQuoteSnapshot, persistedQuoteSnapshotsByRoom]);


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
      if (config.roomDocument?.capture?.captureId) {
        try {
          const existing = await findExistingCaptureRoom(config.roomDocument.capture.captureId);
          if (existing) {
            setExistingCaptureRoom(existing);
            toast.warning('This scan is already saved in a trade room. Open that room to review it; your current wizard edits have not replaced it.');
            return;
          }
        } catch {
          toast.error('Could not check whether this scan was saved already. Your room setup is still here; retry when the connection is available.');
          return;
        }
      }
      const newId = crypto.randomUUID();
      const firstRoom = addRoom({
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        roomDocument: config.roomDocument,
        setupExtras: roomSetupExtras(config),
        config: legacyRoomConfig(config),
        dimensions: roomDimensions(config),
        materialDefaults: {
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
          carcaseEdge: config.carcaseEdge,
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
      // WS5 loop closure: link the created job back onto the handoff/lead row
      // so admin Leads can connect lead → job. Runs through the authenticated
      // link_trade_handoff_v1 RPC — direct table updates are RLS-denied.
      if (handoffId) void linkTradeHandoff(handoffId, newId);

      const roomScannerSession = scannerSession ?? (firstRoom.roomDocument?.capture?.captureId
        ? readScannerSession(firstRoom.roomDocument.capture.captureId) : null);
      if (roomScannerSession && firstRoom.roomDocument?.capture?.captureId === roomScannerSession.captureId) {
        try {
          await linkScannerRoom(roomScannerSession, newId, firstRoom.id,
            firstRoom.roomDocument.capture.sourceRevision);
        } catch {
          // The planner room is durable. Its room page retains the tab-scoped
          // token and presents a retry instead of losing the scan association.
          toast.warning('Room saved, but the scanner link needs a retry in the planner.');
        }
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
        // A deliberately chosen preset replaces the former custom wall plan.
        // The wizard asks for confirmation before clearing a non-empty plan.
        roomDocument: config.shape === 'custom' ? config.roomDocument : undefined,
        setupExtras: roomSetupExtras(config, editingRoom.setupExtras),
        config: legacyRoomConfig(config),
        dimensions: roomDimensions(config, editingRoom.dimensions),
        materialDefaults: {
          ...editingRoom.materialDefaults,
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
          carcaseEdge: config.carcaseEdge,
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

      try {
        if (isNewJob) updateRoom(editingRoom.id, updatedRoom);
        else await saveRoomSetupEdit(jobId, editingRoom, updatedRoom, upsertRoom, updateRoom);
      } catch (error) {
        toast.error(error instanceof RoomRevisionConflictError
          ? 'This room changed on another device. Your setup edits are still here; reload the latest room before saving.'
          : 'Could not save this room. Your setup edits are still here; check your connection and try again.');
        return;
      }
      toast.success(`Room "${config.name}" updated`);
    } else {
      const newRoom = addRoom({
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        roomDocument: config.roomDocument,
        setupExtras: roomSetupExtras(config),
        config: legacyRoomConfig(config),
        dimensions: roomDimensions(config),
        materialDefaults: {
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
          carcaseEdge: config.carcaseEdge,
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

  const openConsumerCabinetPlanner = async () => {
    if (!consumerScannerRoom || !handoffInitialConfig || creatingConsumerRoom || existingCaptureRoom) return;
    setCreatingConsumerRoom(true);
    try {
      await handleRoomComplete(consumerScannerRoomConfig(
        roomConfigWithDefaults({}), handoffInitialConfig, consumerScannerRoom));
    } finally {
      setCreatingConsumerRoom(false);
    }
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
        {existingCaptureRoom && (
          <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            This scan already has a saved kitchen plan. Your room changes have not overwritten it.
            <div className="mt-3"><Button variant="outline" onClick={() => openExistingCaptureRoom(existingCaptureRoom)}>Review saved room</Button></div>
          </div>
        )}
        {!isNewJob && handoffId && !scanUpdateDismissed && scanUpdate?.status === 'review' && (
          <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
            <h2 className="font-semibold text-base">Review newer scan of {scanUpdate.room.name}</h2>
            <p className="mt-1">The scan proposes {scanUpdate.preview.deferred.walls} new wall segments,
              {' '}{scanUpdate.preview.deferred.openings} openings, {scanUpdate.preview.deferred.services} services and
              {' '}{scanUpdate.preview.deferred.objects} fittings. These stay in the scanner review until their
              coordinate frame is verified against this room. Your measured walls, cabinet layout and confirmed
              floor boundary stay as they are. This update will remain available for review.</p>
            {scanUpdate.preview.updatedWallEvidence > 0 && (
              <p className="mt-2">It also adds outline evidence to {scanUpdate.preview.updatedWallEvidence} existing
                {' '}walls whose corners have not changed. Checked lengths and your edits stay as they are.</p>
            )}
            {scanUpdate.preview.addedPhotoObservations > 0 && (
              <p className="mt-2">It adds {scanUpdate.preview.addedPhotoObservations} photo observations to the review list.
                {' '}Their positions and sizes remain unresolved; they do not change the plan or cabinet clearances.</p>
            )}
            {(scanUpdate.preview.changedExisting > 0 || scanUpdate.preview.cornerConflicts > 0) && (
              <p className="mt-2">{scanUpdate.preview.changedExisting} changed existing features and
                {' '}{scanUpdate.preview.cornerConflicts} corner differences need manual review; they will not overwrite your edits.</p>
            )}
            {scanUpdate.preview.updatedWallEvidence === 0 && scanUpdate.preview.addedPhotoObservations === 0 && (
              <p className="mt-2">No new finding can be placed safely in this room yet. Keep the current room and
                review the newer scan separately.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {(scanUpdate.preview.updatedWallEvidence > 0 || scanUpdate.preview.addedPhotoObservations > 0) && (
                <Button size="sm" disabled={scanUpdateSaving || isLocked} onClick={() => void acceptScanUpdate()}>
                  Add safe scan evidence
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setScanUpdateDismissed(true)}>
                Keep current room
              </Button>
            </div>
          </div>
        )}
        {!isNewJob && handoffId && scanUpdate?.status === 'unlinked' && (
          <p role="alert" className="mb-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            This scan is not linked to a room in this job. Reopen the scan from its owner account before importing it.
          </p>
        )}
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
                        const { error: pipelineError } = await supabase.functions.invoke('sync-buildflow-lead', {
                          body: { jobId },
                        });
                        if (pipelineError) {
                          toast.warning('Job submitted; lead sync needs attention', {
                            description: 'The planner copy is safe and the Build Flow handoff is marked for retry.',
                          });
                        } else {
                          toast.success('Job submitted for approval and added to the lead pipeline');
                        }
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
            {quoteState.warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-semibold">
                    {quoteState.warnings.length} pricing warning{quoteState.warnings.length !== 1 ? 's' : ''} — this quote may understate costs
                  </p>
                </div>
                <ul className="mt-1.5 ml-6 list-disc space-y-0.5">
                  {quoteState.warnings.map((w) => (
                    <li key={w} className="text-xs text-amber-800">{w}</li>
                  ))}
                </ul>
              </div>
            )}
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

        {showRoomWizard && importingWizardRoom && wizardRoom && (
          <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" role="status">
            Your edited wall plan and provisional cabinets are ready. Complete room setup to save them in this trade job.
          </p>
        )}
        {showRoomWizard && wizardRoom && handoffId && !handoffPayload
          && !handoffLoading && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            {handoffError
              ? 'The planner could not load the scanner handoff. Your edited wall plan is still here; retry loading its details.'
              : 'The scanner handoff details could not be reopened. Your edited wall plan is still here; save it after review. Reopen the private scan if its photos are needed.'}
            {handoffError && <Button variant="outline" className="ml-3" onClick={retryHandoff}>Retry handoff</Button>}
          </div>
        )}
        {showRoomWizard ? (
          // key remounts the wizard when the async handoff row arrives so the
          // pre-fill lands even though the wizard state initialises once.
          importingWizardRoom && !wizardRoom ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950" role="alert">
              The wall plan is no longer available in this browser tab. Return to the homeowner wizard and choose Continue to trade planner again.
              <div className="mt-3"><Button variant="outline" onClick={() => navigate('/wizard')}>Return to wall plan</Button></div>
            </div>
          ) : handoffId && isNewJob && !handoffPayload && !wizardRoom ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950" role={handoffLoading ? 'status' : 'alert'}>
              {handoffLoading
                ? 'Loading the scanned room before setup…'
                : handoffError
                  ? 'The planner could not load this scanner handoff. The scan is still saved; retry the connection before room setup.'
                  : 'This scanner handoff could not be opened. Reopen it from the scan rather than creating an empty room.'}
              {!handoffLoading && handoffError &&
                <div className="mt-3"><Button variant="outline" onClick={retryHandoff}>Retry handoff</Button></div>}
            </div>
          ) : consumerScannerRoom && !showAdvancedScanSetup ? (
            <section className="mx-auto max-w-xl rounded-xl border border-trade-border bg-white p-5 space-y-4" aria-label="Open your kitchen plan">
              <div>
                <h2 className="text-xl font-semibold text-trade-navy">Your room is ready to design</h2>
                <p className="mt-2 text-sm text-slate-700">
                  {consumerScannerRoom.walls.length} wall{consumerScannerRoom.walls.length === 1 ? '' : 's'} from your saved scan,
                  {' '}{consumerScannerRoom.walls.filter(wall => wall.lengthEvidence?.source === 'measured').length} with a measured length.
                  You can adjust walls and cabinets in the next view.
                </p>
                {!consumerScannerRoom.floorBoundary && <p className="mt-2 text-sm text-amber-800">
                  The room outline is still an estimate. Check it before ordering cabinets.
                </p>}
              </div>
              <Button className="w-full bg-trade-navy hover:bg-trade-navy-light text-white"
                disabled={creatingConsumerRoom || Boolean(existingCaptureRoom)}
                onClick={() => void openConsumerCabinetPlanner()}>
                {creatingConsumerRoom ? 'Opening your kitchen…' : 'Continue to cabinets'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowAdvancedScanSetup(true)}>
                Advanced room setup
              </Button>
            </section>
          ) : <RoomSetupWizard key={editingRoom?.id ?? handoffId ?? 'new'} onComplete={handleRoomComplete}
            onCancel={consumerScannerRoom ? () => setShowAdvancedScanSetup(false) : handleRoomCancel}
            initialConfig={editingRoom ? toRoomConfig(editingRoom) : handoffInitialConfig} legacyRoom={editingRoom} />
        ) : displayRooms.length > 0 ? (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayRooms.map((room) => (
                <div key={room.id} className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-trade-amber/10 rounded-lg"><LayoutGrid className="h-5 w-5 text-trade-amber" /></div>
                    <span className="text-xs text-trade-muted bg-trade-surface px-2 py-1 rounded">{room.roomDocument ? 'Custom walls' : room.shape === 'l-shaped' ? 'L-Shape' : 'Rectangle'}</span>
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
