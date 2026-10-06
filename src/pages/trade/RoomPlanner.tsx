import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  useTradeRoom,
  TradeRoom,
  ConfiguredCabinet,
} from '@/contexts/TradeRoomContext';
import UnifiedScene from '@/components/3d/UnifiedScene';
import Scene3DErrorBoundary from '@/components/3d/Scene3DErrorBoundary';
import { UnifiedCatalog } from '@/components/shared/UnifiedCatalog';
import { CabinetListPanel } from '@/components/trade/planner/CabinetListPanel';
import { CabinetEditDialog } from '@/components/trade/planner/CabinetEditDialog';
import { BenchtopMatrixDialog } from '@/components/trade/planner/BenchtopMatrixDialog';
import { useCatalog } from '@/hooks/useCatalog';
import { useMaterialsCatalog } from '@/hooks/useMaterialsCatalog';
import { useTradeRoomPricing } from '@/hooks/useTradeRoomPricing';
import { getPersistedRoomTotal } from '@/lib/trade/pricingPersistence';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { getCategoryFromSpecGroup } from '@/constants/catalogGroups';
import { PlacedItem } from '@/types';
import { defaultCornerArmDepth, STANDARD_CORNER_ARM_DEPTH } from '@/lib/cornerDefaults';
import { calculateSnapPosition, findAutoWallPlacement, isCornerClear } from '@/utils/snapping';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';
import { JobWriteConflictError, RoomRevisionConflictError } from '@/hooks/useTradeJobPersistence';
import { exportPlanViewPdf } from '@/lib/planViewPdf';
import { computeOpeningWarnings } from '@/lib/trade/openingWarnings';
import RoomDocumentEditor from '@/components/roomDocument/RoomDocumentEditor';
import ScannerEvidencePanel from '@/components/roomDocument/ScannerEvidencePanel';
import { captureScannerSession } from '@/lib/roomScan/scannerSession';
import { cabinetFootprintDepthMm, derivedLegacyBounds, footprintCorners, footprintInsideConfirmedFloor, footprintsIntersect,
  migrateTradeRoom, placementPose, reconcileTradeRoomCabinets } from '@/lib/roomDocument';
import type { RoomDocumentV1 } from '@/lib/roomDocument';
import { findRoomWallPlacement, snapRoomDocumentPlacement } from '@/lib/trade/roomDocumentPlacement';
import { findRoomDocumentCornerPlacement } from '@/lib/trade/roomDocumentCornerPlacement';
import { generateRoomDocumentCandidates } from '@/lib/layout/roomDocumentCandidates';
import {
  ArrowLeft,
  Save,
  FileDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Box,
  PanelLeft,
  PanelLeftClose,
  DoorOpen,
  Pencil,
  RotateCw,
  X,
  AlertTriangle,
} from 'lucide-react';

function cabinetElevationMm(cabinet: ConfiguredCabinet, wallMountHeightMm = 1350): number {
  return cabinet.category === 'Wall'
    ? cabinet.position?.y || wallMountHeightMm
    : cabinet.position?.y ?? 0;
}

export default function RoomPlanner() {
  const { jobId, roomId } = useParams();
  const navigate = useNavigate();
  const { userType } = useAuth();
  const catalogMode = userType === 'trade' ? 'trade' : 'standard';
  const { catalog } = useCatalog(catalogMode);
  const {
    currentRoom,
    setCurrentRoom,
    rooms,
    addCabinet,
    removeCabinet,
    duplicateCabinet,
    replaceCabinet,
    getCabinetById,
    selectedCabinetId,
    selectCabinet,
    getSelectedCabinet,
    getCabinetsByRoom,
    hydrateRooms,
    updateRoom,
  } = useTradeRoom();

  const {
    jobQuery,
    roomsFromServer,
    persistedJobTotals,
    persistedQuoteSnapshot,
    persistedQuoteSnapshotsByRoom,
    upsertCabinet,
    replaceRoomInJob,
    removeCabinetFromJob,
    persistPricingState,
    exportJobPdf,
  } = useTradeJobPersistence(jobId);

  const [showCatalog, setShowCatalog] = useState(true);
  const [showRoomEditor, setShowRoomEditor] = useState(false);
  const [scannerSession] = useState(() => captureScannerSession());
  const [selectedWallRunId, setSelectedWallRunId] = useState<string | null>(null);
  const [includeSuggestedIsland, setIncludeSuggestedIsland] = useState(false);
  // Open in 2D top-down for layout (drag maps 1:1 to the cursor); 3D is for viewing.
  const [is3D, setIs3D] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [benchtopDialogOpen, setBenchtopDialogOpen] = useState(false);
  const [editDialogCabinet, setEditDialogCabinet] = useState<ConfiguredCabinet | null>(null);
  const [dirty, setDirtyState] = useState(false);
  const editGenerationRef = useRef(0);
  const serverRoomRevisionRef = useRef(new Map<string, number | null>());
  const setDirty = useCallback((value: boolean) => {
    if (value) editGenerationRef.current += 1;
    setDirtyState(value);
  }, []);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [cameraControls, setCameraControls] = useState<{ zoomIn: () => void; zoomOut: () => void; resetView: () => void; fitAll: () => void; setView: (preset: 'front' | 'top' | 'corner') => void } | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotePersistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedQuoteRef = useRef<string>('');

  useEffect(() => {
    // Don't let a server snapshot overwrite un-saved local edits — this was
    // wiping a freshly-added 2nd cabinet before its autosave landed.
    if (jobId && jobId !== 'new' && jobQuery.data && !dirty) {
      for (const room of roomsFromServer) {
        serverRoomRevisionRef.current.set(room.id, room.roomDocument?.revision ?? null);
      }
      hydrateRooms(roomsFromServer);
    }
  }, [jobId, jobQuery.data, roomsFromServer, hydrateRooms, dirty]);

  useEffect(() => {
    if (!roomId) return;
    const matchedRoom = rooms.find((room) => room.id === roomId) || null;
    setCurrentRoom(matchedRoom);
  }, [roomId, rooms, setCurrentRoom]);

  const selectedCabinet = getSelectedCabinet();
  const cabinets = useMemo(() => (currentRoom ? getCabinetsByRoom(currentRoom.id) : []), [currentRoom, getCabinetsByRoom]);
  const [placementItemId, setPlacementItemId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const defaultHardwareDefaults = {
    handleType: 'bar',
    handleColor: 'matte-black',
    hingeType: 'soft-close',
    drawerType: 'soft-close',
    softClose: true,
    supplyHardware: true,
    adjustableLegs: true,
  };

  const {
    quoteBOM,
    perCabinetTotals,
    perCabinetSell,
    roomTotal,
    pricingVersion,
    pricingHash,
    benchtopOptions,
    isLoading: isPricingLoading,
  } = useTradeRoomPricing({
    cabinets,
    dimensions: currentRoom?.dimensions || DEFAULT_GLOBAL_DIMENSIONS,
    materialDefaults: currentRoom?.materialDefaults,
    hardwareDefaults: currentRoom?.hardwareDefaults || defaultHardwareDefaults,
  });

  const selectedBenchtop = useMemo(() => {
    return benchtopOptions.find(option => option.id === currentRoom?.materialDefaults.benchtopPricingId)
      ?? benchtopOptions.find(option => option.catalog_finish_id === currentRoom?.materialDefaults.benchtopFinishId)
      ?? benchtopOptions.find(option => option.is_default)
      ?? benchtopOptions[0];
  }, [benchtopOptions, currentRoom?.materialDefaults.benchtopFinishId, currentRoom?.materialDefaults.benchtopPricingId]);

  const jobStatus = jobQuery.data?.status;
  const isPriceLocked = Boolean(jobStatus && jobStatus !== 'draft');
  const persistedRoomSnapshot = currentRoom
    ? persistedQuoteSnapshotsByRoom[currentRoom.id]
      ?? (persistedQuoteSnapshot?.roomId === currentRoom.id ? persistedQuoteSnapshot : undefined)
    : undefined;
  // jobs.cost_* and design_data.jobTotals drive both the dashboard and PDF.
  // For a one-room locked job, prefer that approved job total over a legacy
  // room snapshot that may have survived an older split-write race.
  const persistedRoomTotal = isPriceLocked && roomsFromServer.length === 1 && (persistedJobTotals?.total ?? 0) > 0
    ? persistedJobTotals!.total!
    : getPersistedRoomTotal(persistedRoomSnapshot);
  const displayedRoomTotal = isPriceLocked && persistedRoomTotal != null
    ? persistedRoomTotal
    : roomTotal;

  // Convert ConfiguredCabinets to PlacedItems for UnifiedScene
  const { materials: pricedMaterials } = useMaterialsCatalog();
  const placedItems: PlacedItem[] = useMemo(() => {
    const findUrl = (id?: string) => {
      const m = id ? pricedMaterials.find((x) => x.id === id) : undefined;
      return m ? (m.textureImageUrl || m.sampleImageUrl || null) : null;
    };
    return cabinets.filter(c => c.isPlaced && c.position).map(cabinet => {
      // L-shape pie-cut corners are a SQUARE footprint (both walls = width); the stored
      // depth is the arm/return depth. Render/bbox depth = width, arm carried via carcase depth.
      const nm = cabinet.productName || '';
      const isLCorner = /corner/i.test(nm) && !/diagonal|blind|open|angle/i.test(nm);
      const storedDepth = cabinet.dimensions.depth;
      return {
      instanceId: cabinet.instanceId,
      definitionId: cabinet.definitionId,
      itemType: cabinet.category === 'Appliance' ? 'Appliance' : 'Cabinet' as const,
      x: cabinet.position!.x,
      y: cabinet.position!.y ?? 0,
      z: cabinet.position!.z,
      rotation: cabinet.position!.rotation,
      width: cabinet.dimensions.width,
      depth: cabinetFootprintDepthMm(cabinet),
      height: cabinet.dimensions.height,
      hinge: cabinet.construction?.hingeSide ?? ('Left' as const),
      cabinetNumber: cabinet.cabinetNumber,
      finishColor: cabinet.materials?.exteriorFinish,
      carcaseMaterialId: cabinet.materials?.carcaseFinish,
      exteriorMaterialId: cabinet.materials?.exteriorFinish,
      doorTextureUrl: findUrl(cabinet.materials?.exteriorFinish),
      carcaseTextureUrl: findUrl(cabinet.materials?.carcaseFinish),
      handleType: cabinet.hardware?.handleType,
      handleColor: cabinet.hardware?.handleColor,
      // Microvellum-style construction prompts (persisted per cabinet)
      leftCarcaseDepth: cabinet.construction?.cabinetDepthLeft ?? (isLCorner ? defaultCornerArmDepth(cabinet.dimensions.width, storedDepth) : undefined),
      rightCarcaseDepth: cabinet.construction?.cabinetDepthRight ?? (isLCorner ? defaultCornerArmDepth(cabinet.dimensions.width, storedDepth) : undefined),
      secondWidth: cabinet.construction?.secondWidth ?? (isLCorner ? cabinet.dimensions.width : undefined),
      shelfCount: cabinet.accessories?.shelfCount,
      fillerLeft: cabinet.construction?.leftFillerWidth,
      fillerRight: cabinet.construction?.rightFillerWidth,
      endPanelLeft: cabinet.construction?.endPanelLeft,
      endPanelRight: cabinet.construction?.endPanelRight,
      blindSide: cabinet.construction?.blindSide,
      cornerReturnSide: cabinet.construction?.cornerReturnSide,
      drawerFrontHeights: cabinet.construction?.drawerFrontHeights,
      };
    });
  }, [cabinets, pricedMaterials]);

  const roomConfig = useMemo(() => ({
    width: currentRoom?.config.width || 4000,
    depth: currentRoom?.config.depth || 3000,
    height: currentRoom?.config.height || 2400,
    shape: currentRoom?.config.shape ?? 'Rectangle' as const,
    cutoutWidth: currentRoom?.config.cutoutWidth || 0,
    cutoutDepth: currentRoom?.config.cutoutDepth || 0,
    // Room features flow into the 3D scene (openings + service markers) —
    // previously dropped here, which left the scene opening-blind.
    openings: currentRoom?.config.openings ?? [],
    services: currentRoom?.config.services ?? [],
    roomDocument: currentRoom?.roomDocument,
  }), [currentRoom]);

  const editableDocument = useMemo(() => currentRoom
    ? currentRoom.roomDocument ?? migrateTradeRoom(currentRoom)
    : null, [currentRoom]);

  const planningDocument = useMemo(() => editableDocument && currentRoom
    ? reconcileTradeRoomCabinets(editableDocument, currentRoom.cabinets,
      { wallMountHeight: currentRoom.dimensions?.wallMountHeight })
    : null, [editableDocument, currentRoom]);
  const wallRunPool = useMemo(() => planningDocument
    ? generateRoomDocumentCandidates({ document: planningDocument, dimensions: currentRoom?.dimensions, maxCandidates: 3 })
    : null, [planningDocument, currentRoom?.dimensions]);
  const selectedWallRun = wallRunPool?.candidates.find(candidate => candidate.candidateId === selectedWallRunId) ?? null;
  const suggestedIsland = selectedWallRun && wallRunPool?.islandOption?.baseCandidateId === selectedWallRun.candidateId
    ? wallRunPool.islandOption : null;
  const selectedSuggestionItems = selectedWallRun
    ? [...selectedWallRun.items.map(entry => entry.item),
      ...(includeSuggestedIsland && suggestedIsland ? suggestedIsland.items : [])] : [];

  const handleRoomDocumentChange = useCallback((document: RoomDocumentV1) => {
    if (!currentRoom || isPriceLocked) return;
    const previous = planningDocument ?? migrateTradeRoom(currentRoom);
    const updatedCabinets = currentRoom.cabinets.map(cabinet => {
      if (!cabinet.wallAttachment) return cabinet;
      const oldWall = previous.walls.find(wall => wall.id === cabinet.wallAttachment!.wallId);
      const oldStart = previous.corners.find(corner => corner.id === oldWall?.startCornerId);
      const oldEnd = previous.corners.find(corner => corner.id === oldWall?.endCornerId);
      const newWall = document.walls.find(wall => wall.id === cabinet.wallAttachment!.wallId);
      const newStart = document.corners.find(corner => corner.id === newWall?.startCornerId);
      const newEnd = document.corners.find(corner => corner.id === newWall?.endCornerId);
      if (!newWall || !newStart || !newEnd) return { ...cabinet, geometryConflict: 'The supporting wall was removed.' };
      const oldLength = oldStart && oldEnd ? Math.hypot(oldEnd.xMm - oldStart.xMm, oldEnd.zMm - oldStart.zMm) : 0;
      const newLength = Math.hypot(newEnd.xMm - newStart.xMm, newEnd.zMm - newStart.zMm);
      const ratio = cabinet.dimensionStatus === 'inferred' && oldLength > 0 ? newLength / oldLength : 1;
      const width = cabinet.dimensionStatus === 'inferred'
        ? Math.max(1, Math.round(cabinet.dimensions.width * ratio)) : cabinet.dimensions.width;
      const offsetMm = cabinet.dimensionStatus === 'inferred'
        ? Math.max(0, Math.round(cabinet.wallAttachment.offsetMm * ratio))
        : cabinet.wallAttachment.offsetMm;
      const pose = placementPose(document, {
        type: 'wall', wallId: newWall.id, offsetMm,
        depthOffsetMm: cabinet.wallAttachment.depthOffsetMm ?? 10,
      }, width, cabinet.dimensions.depth);
      if (!pose) return { ...cabinet, geometryConflict: 'The wall geometry is invalid.' };
      const conflict = offsetMm + width > newLength - 1
        ? 'This cabinet extends beyond its edited wall.'
        : document.openings.some(opening => opening.wallId === newWall.id
            && (opening.kind !== 'window' || cabinet.category === 'Wall' || cabinet.category === 'Tall')
            && offsetMm < opening.offsetMm + opening.widthMm && offsetMm + width > opening.offsetMm)
          ? 'This cabinet overlaps an opening on its wall.' : undefined;
      const cornerCheck = cabinet.cornerJoinWallId
        ? findRoomDocumentCornerPlacement({
            document: { ...document, objects: document.objects.filter(object => !object.sourceCabinetId) },
            footprintMm: width, category: cabinet.category,
            elevationMm: cabinetElevationMm(cabinet, currentRoom.dimensions?.wallMountHeight),
            heightMm: cabinet.dimensions.height,
            preferredPoint: { xMm: pose.xMm, zMm: pose.zMm },
          }) : null;
      const cornerConflict = cabinet.cornerJoinWallId && (cornerCheck?.status !== 'placed'
        || cornerCheck.wallAttachment.wallId !== newWall.id
        || cornerCheck.joinedWallId !== cabinet.cornerJoinWallId)
        ? 'The corner cabinet no longer has a compatible 90° wall join.' : undefined;
      return {
        ...cabinet,
        dimensions: { ...cabinet.dimensions, width },
        wallAttachment: { ...cabinet.wallAttachment, offsetMm },
        position: { x: pose.xMm, y: cabinet.position?.y ?? 0, z: pose.zMm, rotation: pose.rotationDeg },
        geometryConflict: conflict ?? cornerConflict,
      };
    });
    const cabinets = updatedCabinets.map((cabinet, index) => {
      if (!cabinet.isPlaced || !cabinet.position) return cabinet;
      const footprint = footprintCorners({ xMm: cabinet.position.x, zMm: cabinet.position.z,
        rotationDeg: cabinet.position.rotation }, cabinet.dimensions.width, cabinetFootprintDepthMm(cabinet));
      const floor = footprintInsideConfirmedFloor(document, footprint);
      const elevation = cabinetElevationMm(cabinet, currentRoom.dimensions?.wallMountHeight);
      const collides = updatedCabinets.some((other, otherIndex) => otherIndex !== index && other.isPlaced && other.position
        && elevation < cabinetElevationMm(other, currentRoom.dimensions?.wallMountHeight) + other.dimensions.height
        && cabinetElevationMm(other, currentRoom.dimensions?.wallMountHeight) < elevation + cabinet.dimensions.height
        && footprintsIntersect(footprint,
          footprintCorners({ xMm: other.position!.x, zMm: other.position!.z,
            rotationDeg: other.position!.rotation }, other.dimensions.width, cabinetFootprintDepthMm(other)), 1));
      const geometryConflict = cabinet.geometryConflict
        ?? (floor.status === 'outside' ? 'This cabinet crosses the edited floor boundary.' : undefined)
        ?? (collides ? 'This cabinet overlaps another item after the wall edit.' : undefined);
      return geometryConflict ? { ...cabinet, geometryConflict } : cabinet;
    });
    const reconciledDocument = reconcileTradeRoomCabinets(document, cabinets,
      { wallMountHeight: currentRoom.dimensions?.wallMountHeight });
    const bounds = derivedLegacyBounds(reconciledDocument);
    updateRoom(currentRoom.id, {
      roomDocument: reconciledDocument,
      cabinets,
      config: bounds ? { ...currentRoom.config, width: Math.max(1, Math.round(bounds.widthMm)),
        depth: Math.max(1, Math.round(bounds.depthMm)) } : currentRoom.config,
    });
    setDirty(true);
  }, [currentRoom, isPriceLocked, planningDocument, setDirty, updateRoom]);

  const applySelectedWallRun = useCallback(() => {
    if (!currentRoom || !planningDocument || !selectedWallRun || isPriceLocked) return;
    if (selectedWallRun.roomRevision !== planningDocument.revision) {
      toast.error('The room changed. Review a fresh wall-run suggestion.');
      return;
    }
    const islandItems = includeSuggestedIsland && suggestedIsland ? suggestedIsland.items : [];
    const allItems = [...selectedWallRun.items.map(entry => entry.item), ...islandItems];
    const missing = allItems.filter(item => !catalog.some(product => product.id === item.definitionId));
    if (missing.length) {
      toast.error('Some suggested products are unavailable in the current catalogue.');
      return;
    }
    const now = new Date();
    const added: ConfiguredCabinet[] = allItems.map((item, index) => {
      const product = catalog.find(entry => entry.id === item.definitionId)!;
      const wallItem = selectedWallRun.items.find(entry => entry.item.instanceId === item.instanceId);
      const category = product.itemType === 'Appliance' ? 'Appliance'
        : product.renderConfig?.category || getCategoryFromSpecGroup(product.specGroup) || product.category || 'Base';
      return {
        instanceId: crypto.randomUUID(),
        definitionId: item.definitionId,
        cabinetNumber: `C${String(currentRoom.cabinets.length + index + 1).padStart(2, '0')}`,
        productName: product.name,
        category: category as ConfiguredCabinet['category'],
        dimensions: { width: item.width, depth: item.depth, height: item.height },
        materials: currentRoom.materialDefaults,
        hardware: {
          handleType: currentRoom.hardwareDefaults.handleType,
          handleColor: 'matte-black',
          hingeType: currentRoom.hardwareDefaults.hingeType,
          drawerType: currentRoom.hardwareDefaults.drawerType,
          softClose: currentRoom.hardwareDefaults.softClose,
        },
        accessories: { shelfCount: 2, adjustableShelves: true, dividers: false,
          softCloseUpgrade: false, specialFittings: [] },
        position: { x: item.x, y: item.y, z: item.z, rotation: item.rotation },
        isPlaced: true,
        wallAttachment: wallItem ? { wallId: wallItem.wallId, offsetMm: wallItem.offsetMm } : undefined,
        dimensionStatus: 'confirmed',
        createdAt: now, updatedAt: now,
      };
    });
    const cabinets = [...currentRoom.cabinets, ...added];
    updateRoom(currentRoom.id, { roomDocument: reconcileTradeRoomCabinets(planningDocument, cabinets,
      { wallMountHeight: currentRoom.dimensions?.wallMountHeight }), cabinets });
    setSelectedWallRunId(null);
    setIncludeSuggestedIsland(false);
    setDirty(true);
    toast.success('Wall-run idea added for review', { description: selectedWallRun.unresolved[0] });
  }, [catalog, currentRoom, planningDocument, includeSuggestedIsland, isPriceLocked, selectedWallRun, setDirty, suggestedIsland, updateRoom]);

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);


  const clampPositionToRoom = useCallback((room: TradeRoom, cabinet: ConfiguredCabinet, position: { x: number; y: number; z: number; rotation: number }) => {
    if (room.roomDocument) {
      const placement = snapRoomDocumentPlacement({
        document: room.roomDocument,
        widthMm: cabinet.dimensions.width,
        depthMm: cabinetFootprintDepthMm(cabinet),
        category: cabinet.category,
        elevationMm: cabinetElevationMm({ ...cabinet, position }, room.dimensions?.wallMountHeight),
        heightMm: cabinet.dimensions.height,
        point: { xMm: position.x, zMm: position.z },
        rotationDeg: position.rotation,
        excludeId: cabinet.instanceId,
        obstacles: room.cabinets.filter(item => item.isPlaced && item.position).map(item => ({
          id: item.instanceId, xMm: item.position!.x, zMm: item.position!.z,
          rotationDeg: item.position!.rotation, widthMm: item.dimensions.width,
          depthMm: cabinetFootprintDepthMm(item), category: item.category,
          elevationMm: cabinetElevationMm(item, room.dimensions?.wallMountHeight),
          heightMm: item.dimensions.height,
        })),
      });
      return placement.status === 'placed'
        ? { x: placement.xMm, y: position.y, z: placement.zMm, rotation: placement.rotationDeg,
            wallAttachment: placement.wallId ? { wallId: placement.wallId, offsetMm: placement.offsetMm! } : undefined }
        : null;
    }
    // x/z are CENTRE coordinates. Clamp rotation-aware so a snapped position
    // against the right/front wall is preserved (the previous corner-based
    // clamp pulled cabinets half a width away from those walls).
    const rot = ((Math.round(position.rotation) % 360) + 360) % 360;
    const rotated = rot === 90 || rot === 270;
    const planDepth = cabinetFootprintDepthMm(cabinet);
    const halfW = (rotated ? planDepth : cabinet.dimensions.width) / 2;
    const halfD = (rotated ? cabinet.dimensions.width : planDepth) / 2;
    return {
      ...position,
      x: Math.min(Math.max(position.x, halfW), Math.max(halfW, room.config.width - halfW)),
      z: Math.min(Math.max(position.z, halfD), Math.max(halfD, room.config.depth - halfD)),
      wallAttachment: undefined,
    };
  }, []);

  const saveRoomToServer = useCallback(async () => {
    if (!jobId || jobId === 'new' || !currentRoom || isPriceLocked) return false;
    const generation = editGenerationRef.current;
    const documentToSave = planningDocument ?? currentRoom.roomDocument;
    try {
      setSaveState('saving');
      await replaceRoomInJob({ jobId, room: documentToSave
        ? { ...currentRoom, roomDocument: documentToSave }
        : currentRoom,
        expectedRoomRevision: serverRoomRevisionRef.current.get(currentRoom.id),
      });
      serverRoomRevisionRef.current.set(currentRoom.id, documentToSave?.revision ?? null);
      if (generation === editGenerationRef.current) {
        setDirty(false);
        setSaveState('saved');
        return true;
      }
      return false;
    } catch (error) {
      if (error instanceof RoomRevisionConflictError || error instanceof JobWriteConflictError) {
        setSaveState('conflict');
        toast.error('This room changed on another device. Download your unsaved draft before reloading.');
      } else {
        setSaveState('error');
        toast.error('Could not save this room. Your changes remain on this device.');
      }
      return false;
    }
  }, [currentRoom, isPriceLocked, jobId, planningDocument, replaceRoomInJob, setDirty]);

  const downloadRoomBackup = useCallback(() => {
    if (!currentRoom) return;
    const snapshot = { ...currentRoom, roomDocument: planningDocument ?? currentRoom.roomDocument };
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentRoom.id}-room-draft.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [currentRoom, planningDocument]);

  useEffect(() => {
    if (!dirty || !jobId || jobId === 'new' || !currentRoom) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void saveRoomToServer();
    }, 1200);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [dirty, jobId, currentRoom, saveRoomToServer]);

  // Sell-price factor: per-cabinet BOM values are raw costs; the toolbar's
  // roomTotal includes the commercial layer (margin/design/markup, benchtops,
  // GST). Scale per-cabinet prices proportionally so the cabinet list sums to
  // the same Est. Total the toolbar shows — one source of truth for the user.
  const sellFactor = useMemo(() => {
    const costSum = Object.values(perCabinetTotals).reduce((s, v) => s + (v || 0), 0);
    return costSum > 0 && roomTotal > 0 ? roomTotal / costSum : 1;
  }, [perCabinetTotals, roomTotal]);

  const persistedSellFactor = useMemo(() => {
    if (!persistedRoomSnapshot || persistedRoomTotal == null) return 1;
    const costSum = Object.values(persistedRoomSnapshot.perCabinetTotals ?? {})
      .reduce((sum, value) => sum + (value || 0), 0);
    return costSum > 0 ? persistedRoomTotal / costSum : 1;
  }, [persistedRoomSnapshot, persistedRoomTotal]);

  const getCabinetPrice = useCallback((cabinet: ConfiguredCabinet) => {
    if (isPriceLocked && persistedRoomSnapshot) {
      const savedSell = persistedRoomSnapshot.perCabinetSell?.[cabinet.instanceId];
      if (typeof savedSell === 'number' && savedSell > 0) return savedSell;
      const savedCost = persistedRoomSnapshot.perCabinetTotals?.[cabinet.instanceId];
      if (typeof savedCost === 'number' && savedCost > 0) return savedCost * persistedSellFactor;
    }

    // Prefer the real piece-level BOM price for this cabinet; fall back to the
    // catalog estimate only when the BOM hasn't priced it yet.
    const bom = perCabinetTotals[cabinet.instanceId];
    if (typeof bom === 'number' && bom > 0) return bom * sellFactor;
    const catalogItem = catalogById.get(cabinet.definitionId);
    if (!catalogItem) return 0;
    const basePrice = catalogItem.price ?? 0;
    const widthScale = cabinet.dimensions.width / (catalogItem.defaultWidth || cabinet.dimensions.width || 1);
    return Math.max(0, basePrice * widthScale);
  }, [catalogById, isPriceLocked, perCabinetTotals, persistedRoomSnapshot, persistedSellFactor, sellFactor]);

  // Calculate smart default position for new cabinets
  const calculateDefaultPosition = useCallback((
    room: TradeRoom,
    existingCabinets: ConfiguredCabinet[],
    newCabinetWidth: number
  ) => {
    const placedCabinets = existingCabinets.filter(c => c.isPlaced && c.position);
    if (placedCabinets.length === 0) {
      return { x: room.config.width / 2 - newCabinetWidth / 2, y: 0, z: 50, rotation: 0 };
    }
    const sortedByX = [...placedCabinets].sort((a, b) =>
      (b.position!.x + b.dimensions.width) - (a.position!.x + a.dimensions.width)
    );
    const lastCabinet = sortedByX[0];
    const newX = lastCabinet.position!.x + lastCabinet.dimensions.width + 10;
    if (newX + newCabinetWidth > room.config.width - 50) {
      const sortedByZ = [...placedCabinets].sort((a, b) =>
        (b.position!.z + b.dimensions.depth) - (a.position!.z + a.dimensions.depth)
      );
      const frontCabinet = sortedByZ[0];
      return { x: 50, y: 0, z: Math.min(frontCabinet.position!.z + frontCabinet.dimensions.depth + 100, room.config.depth - 50), rotation: 0 };
    }
    return { x: newX, y: 0, z: lastCabinet.position!.z, rotation: lastCabinet.position!.rotation };
  }, []);

  const persistCabinet = useCallback(async (cabinet: ConfiguredCabinet) => {
    if (!jobId || jobId === 'new' || !currentRoom) return;
    await upsertCabinet({ jobId, roomId: currentRoom.id, cabinet, roomFallback: currentRoom });
  }, [jobId, currentRoom, upsertCabinet]);

  const handleCabinetSelect = (instanceId: string | null) => {
    // Click just selects (and enables drag-to-move). Editing is via the Edit
    // button on the selection bar or double-click — clicking a selected cabinet
    // no longer pops the editor, which had made selected cabinets impossible to move.
    selectCabinet(instanceId);
  };

  const handleCabinetPlace = useCallback((instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => {
    if (!currentRoom) return;
    const sourceCabinet = getCabinetById(currentRoom.id, instanceId);
    if (!sourceCabinet) return;

    const clamped = clampPositionToRoom(currentRoom, sourceCabinet, position);
    if (!clamped) return;
    replaceCabinet(currentRoom.id, {
      ...sourceCabinet,
      position: { x: clamped.x, y: clamped.y, z: clamped.z, rotation: clamped.rotation },
      isPlaced: true,
      wallAttachment: clamped.wallAttachment,
    });
    setDirty(true);
  }, [clampPositionToRoom, currentRoom, getCabinetById, replaceCabinet, setDirty]);

  const handleRotateSelected = useCallback(() => {
    if (!currentRoom) return;
    const cab = getSelectedCabinet();
    if (!cab || !cab.position) return;
    handleCabinetPlace(cab.instanceId, { ...cab.position, rotation: (((cab.position.rotation || 0) + 90) % 360) });
  }, [currentRoom, getSelectedCabinet, handleCabinetPlace]);

  // Keyboard: rotate (R / E forward, Q back), nudge (arrows; Shift = 1mm),
  // wall-cabinet elevation (PgUp/PgDn — WS8), deselect (Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { selectCabinet(null); return; }
      const cab = getSelectedCabinet();
      if (!cab || !cab.position) return;
      const pos = cab.position;
      const step = e.shiftKey ? 1 : 10;
      const place = (p: Partial<typeof pos>) => handleCabinetPlace(cab.instanceId, { ...pos, ...p });
      // Only wall/upper cabinets get an elevation nudge — base/tall sit on the floor.
      const isWallCab = /^(wall|upper)/i.test(cab.definitionId ?? '') || /wall|upper/i.test(cab.productName ?? '');
      const roomH = currentRoom?.config.height ?? 2400;
      const maxY = Math.max(0, roomH - cab.dimensions.height);
      // y === 0 means "auto-mount at the room's wall height" (CabinetMesh) —
      // seed the nudge from that effective elevation, not the floor.
      const effectiveY = isWallCab && !(pos.y ?? 0)
        ? (currentRoom?.dimensions?.wallMountHeight ?? 1350)
        : (pos.y ?? 0);
      switch (e.key) {
        case 'r': case 'R': case 'e': case 'E': e.preventDefault(); place({ rotation: ((pos.rotation || 0) + 90) % 360 }); break;
        case 'q': case 'Q': e.preventDefault(); place({ rotation: ((pos.rotation || 0) - 90 + 360) % 360 }); break;
        case 'ArrowLeft': e.preventDefault(); place({ x: pos.x - step }); break;
        case 'ArrowRight': e.preventDefault(); place({ x: pos.x + step }); break;
        case 'ArrowUp': e.preventDefault(); place({ z: pos.z - step }); break;
        case 'ArrowDown': e.preventDefault(); place({ z: pos.z + step }); break;
        case 'PageUp': if (isWallCab) { e.preventDefault(); place({ y: Math.min(maxY, effectiveY + step) }); } break;
        case 'PageDown': if (isWallCab) { e.preventDefault(); place({ y: Math.max(1, effectiveY - step) }); } break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [getSelectedCabinet, selectCabinet, handleCabinetPlace, currentRoom]);

  const handleItemMove = useCallback((id: string, updates: Partial<PlacedItem>) => {
    if (!currentRoom) return;
    const cabinet = getCabinetById(currentRoom.id, id);
    if (cabinet && updates.x !== undefined && updates.z !== undefined) {
      const position = { x: updates.x, y: 0, z: updates.z, rotation: updates.rotation ?? cabinet.position?.rotation ?? 0 };
      handleCabinetPlace(id, position);
    }
  }, [currentRoom, getCabinetById, handleCabinetPlace]);

  const handleQuickAddProduct = useCallback(async (productId: string) => {
    if (!currentRoom) return;
    const catalogItem = catalog.find(item => item.id === productId);
    if (!catalogItem) {
      toast.error('Product not found');
      return;
    }

    const defaultWidth = catalogItem.defaultWidth || 600;
    const defaultHeight = catalogItem.defaultHeight || 720;

    // Panel products (end panels, fillers, scribes) should auto-match the room's
    // carcase depth instead of using the catalog's stored depth (which is the
    // board thickness, e.g. 18mm). Use wall depth for wall panels, base depth otherwise.
    const isPanel = catalogItem.renderConfig?.productType === 'panel';
    const panelCategory = catalogItem.renderConfig?.category || 'Base';
    const roomCarcaseDepth = isPanel
      ? (panelCategory === 'Wall'
          ? (currentRoom.dimensions.wallDepth ?? 350)
          : (currentRoom.dimensions.baseDepth ?? 560))
      : null;
    const defaultDepth = roomCarcaseDepth ?? catalogItem.defaultDepth ?? 580;

    const category = catalogItem.itemType === 'Appliance'
      ? 'Appliance'
      : catalogItem.renderConfig?.category
        || getCategoryFromSpecGroup(catalogItem.specGroup)
        || catalogItem.category
        || 'Base';

    // Refine F-6: new cabinets back onto the nearest wall with a free run
    // (opening-aware, level-aware) instead of free-floating mid-room. Falls
    // back to the legacy row placement only when every wall is full.
    const autoObstacles = cabinets
      .filter((c) => c.isPlaced && c.position)
      .map((c) => ({
        x: c.position!.x,
        z: c.position!.z,
        rotation: c.position!.rotation,
        width: c.dimensions.width,
        depth: c.dimensions.depth,
        blocksFloor: c.category !== 'Wall',
        blocksWall: c.category === 'Wall' || c.category === 'Tall',
      }));
    const isCornerProduct = /corner|diagonal|blind|pie/i.test(`${productId} ${catalogItem.name}`);
    const documentCornerPlacement = currentRoom.roomDocument && isCornerProduct
      ? findRoomDocumentCornerPlacement({
          document: currentRoom.roomDocument,
          footprintMm: defaultWidth,
          category: category as 'Base' | 'Wall' | 'Tall' | 'Appliance',
          elevationMm: category === 'Wall' ? currentRoom.dimensions?.wallMountHeight ?? 1350 : 0,
          heightMm: defaultHeight,
          obstacles: cabinets.filter(c => c.isPlaced && c.position).map(c => ({
            id: c.instanceId, xMm: c.position!.x, zMm: c.position!.z,
            rotationDeg: c.position!.rotation, widthMm: c.dimensions.width,
            depthMm: cabinetFootprintDepthMm(c), category: c.category,
            elevationMm: cabinetElevationMm(c, currentRoom.dimensions?.wallMountHeight),
            heightMm: c.dimensions.height,
          })),
        }) : null;
    const documentPlacement = currentRoom.roomDocument
      ? isCornerProduct
        ? documentCornerPlacement?.status === 'placed'
          ? { ...documentCornerPlacement,
            wallId: documentCornerPlacement.wallAttachment.wallId,
            offsetMm: documentCornerPlacement.wallAttachment.offsetMm }
          : documentCornerPlacement
        : findRoomWallPlacement({
            document: currentRoom.roomDocument,
            widthMm: defaultWidth,
            depthMm: defaultDepth,
            category: category as 'Base' | 'Wall' | 'Tall' | 'Appliance',
            elevationMm: category === 'Wall' ? currentRoom.dimensions?.wallMountHeight ?? 1350 : 0,
            heightMm: defaultHeight,
            obstacles: cabinets.filter(c => c.isPlaced && c.position).map(c => ({
              id: c.instanceId, xMm: c.position!.x, zMm: c.position!.z,
              rotationDeg: c.position!.rotation, widthMm: c.dimensions.width,
              depthMm: cabinetFootprintDepthMm(c), category: c.category,
              elevationMm: cabinetElevationMm(c, currentRoom.dimensions?.wallMountHeight),
              heightMm: c.dimensions.height,
            })),
          })
      : null;
    const auto = currentRoom.roomDocument ? null : findAutoWallPlacement({
      room: currentRoom.config,
      width: defaultWidth,
      depth: defaultDepth,
      category: category as 'Base' | 'Wall' | 'Tall' | 'Appliance',
      obstacles: autoObstacles,
    });
    let rawPosition = auto
      ? { x: auto.x, y: 0, z: auto.z, rotation: auto.rotation }
      : calculateDefaultPosition(currentRoom, cabinets, defaultWidth);
    if (documentPlacement?.status === 'placed') {
      rawPosition = { x: documentPlacement.xMm, y: 0, z: documentPlacement.zMm,
        rotation: documentPlacement.rotationDeg };
    }

    // Corner cabinets start at the nearest FREE room corner so the snapping
    // engine nests them into it with the correct rotation (doors facing the
    // room) — instead of landing mid-wall like standard cabinets.
    const cornerConstruction = isCornerProduct
      ? { cabinetDepthLeft: STANDARD_CORNER_ARM_DEPTH, cabinetDepthRight: STANDARD_CORNER_ARM_DEPTH,
          ...(documentCornerPlacement?.status === 'placed'
            ? { cornerReturnSide: documentCornerPlacement.cornerReturnSide } : {}) }
      : undefined;
    if (isCornerProduct && !currentRoom.roomDocument) {
      const roomW = currentRoom.config.width;
      const roomD = currentRoom.config.depth;
      const isWallCat = category === 'Wall';
      const cornerPoints = [
        { cx: 0, cz: 0 },
        { cx: roomW, cz: 0 },
        { cx: 0, cz: roomD },
        { cx: roomW, cz: roomD },
      ];
      const cornerOccupied = (cx: number, cz: number) =>
        cabinets.some((c) => {
          if (!c.isPlaced || !c.position) return false;
          if ((c.category === 'Wall') !== isWallCat) return false;
          return Math.hypot(c.position.x - cx, c.position.z - cz) <
            Math.max(c.dimensions.width, c.dimensions.depth);
        });
      // F-11: prefer corners whose adjoining walls are clear of openings —
      // seating a corner unit across a doorway just trips the conflict
      // warning. Falls back to any free corner when every corner has one.
      const armReach = Math.max(defaultWidth, defaultDepth) + 50;
      const free =
        cornerPoints.find(
          ({ cx, cz }) =>
            !cornerOccupied(cx, cz) &&
            isCornerClear(currentRoom.config, { x: cx, z: cz }, armReach, category as 'Base' | 'Wall' | 'Tall' | 'Appliance'),
        ) ?? cornerPoints.find(({ cx, cz }) => !cornerOccupied(cx, cz));
      if (free) {
        const halfW = defaultWidth / 2;
        const halfD = defaultDepth / 2;
        rawPosition = {
          x: free.cx === 0 ? halfW : free.cx - halfW,
          y: 0,
          z: free.cz === 0 ? halfD : free.cz - halfD,
          rotation: 0,
        };
      }
    }

    // Auto-snap a newly added cabinet to the nearest wall so it orients correctly
    // (rotates onto a side wall when the run reaches a corner) — same engine the
    // drag uses, so click-to-add and drag behave the same.
    const snapItem: PlacedItem = {
      instanceId: 'pending', definitionId: productId,
      itemType: category === 'Appliance' ? 'Appliance' : 'Cabinet',
      x: rawPosition.x, y: 0, z: rawPosition.z, rotation: rawPosition.rotation,
      width: defaultWidth, depth: defaultDepth, height: defaultHeight,
    };
    const snapped = currentRoom.roomDocument ? null
      : calculateSnapPosition(rawPosition.x, rawPosition.z, snapItem, placedItems, currentRoom.config, 50, DEFAULT_GLOBAL_DIMENSIONS);
    const position = documentPlacement?.status === 'unplaced' ? undefined
      : snapped ? { x: snapped.x, y: rawPosition.y, z: snapped.z, rotation: snapped.rotation }
      : rawPosition;

    // Stage 1 — appliance catalog snapshot: freeze price/name/category at
    // placement so the quote line stays stable even if the catalog is edited.
    const applianceProduct = catalogItem.applianceProduct;
    const applianceUnitPrice = applianceProduct
      ? (applianceProduct.installed_price ?? applianceProduct.sell_price ?? applianceProduct.rrp ?? 0)
      : 0;
    const applianceExtras = applianceProduct
      ? {
          applianceProductId: applianceProduct.id,
          applianceSnapshot: {
            itemCode: applianceProduct.item_code ?? null,
            name: applianceProduct.brand ? `${applianceProduct.brand} ${applianceProduct.name}` : applianceProduct.name,
            category: applianceProduct.category,
            unitPrice: applianceUnitPrice,
            isPlaceholderPrice: applianceProduct.price_is_placeholder ?? true,
            modelUrl: applianceProduct.model_url ?? null,
            modelIosUrl: applianceProduct.model_ios_url ?? null,
            finish: applianceProduct.finish ?? null,
          },
          supplyWithOrder: applianceUnitPrice > 0,
        }
      : {};

    const newCabinet = addCabinet(currentRoom.id, {
      definitionId: productId,
      productName: catalogItem.name,
      category: category as 'Base' | 'Wall' | 'Tall' | 'Appliance',
      dimensions: { width: defaultWidth, height: defaultHeight, depth: defaultDepth },
      materials: currentRoom.materialDefaults,
      hardware: {
        handleType: currentRoom.hardwareDefaults.handleType,
        handleColor: 'matte-black',
        hingeType: currentRoom.hardwareDefaults.hingeType,
        drawerType: currentRoom.hardwareDefaults.drawerType,
        softClose: currentRoom.hardwareDefaults.softClose,
      },
      accessories: {
        shelfCount: 2,
        adjustableShelves: true,
        dividers: false,
        softCloseUpgrade: false,
        specialFittings: [],
      },
      isPlaced: Boolean(position),
      position,
      wallAttachment: documentCornerPlacement?.status === 'placed'
        ? { wallId: documentCornerPlacement.wallAttachment.wallId,
            offsetMm: documentCornerPlacement.wallAttachment.offsetMm,
            depthOffsetMm: (defaultWidth - defaultDepth) / 2 }
        : documentPlacement?.status === 'placed' && documentPlacement.wallId
          ? { wallId: documentPlacement.wallId, offsetMm: documentPlacement.offsetMm! } : undefined,
      cornerJoinWallId: documentCornerPlacement?.status === 'placed'
        ? documentCornerPlacement.joinedWallId : undefined,
      dimensionStatus: 'confirmed',
      ...(cornerConstruction ? { construction: cornerConstruction } : {}),
      ...applianceExtras,
    });

    // Local add only; the debounced room autosave persists the whole room.
    // (Previously this also did an immediate per-cabinet server write, which
    // raced the autosave and dropped the 2nd+ cabinet.)
    selectCabinet(newCabinet.instanceId);
    setDirty(true);
    // Stable id so rapid adds collapse into one toast instead of stacking (WS8).
    if (documentPlacement?.status === 'unplaced') {
      toast.warning(`${catalogItem.name} added as unplaced`, { description: documentPlacement.reason });
      return;
    }
    toast.success(`${catalogItem.name} added`, {
      id: 'cabinet-added',
      description: 'Selected — press R to rotate, or double-click to edit options.'
    });
  }, [currentRoom, catalog, cabinets, addCabinet, selectCabinet, calculateDefaultPosition, placedItems, setDirty]);


  const handleDuplicateCabinet = useCallback(async (cabinet: ConfiguredCabinet) => {
    if (!currentRoom) return;
    const duplicated = duplicateCabinet(currentRoom.id, cabinet.instanceId);
    if (!duplicated) {
      toast.error('Failed to duplicate cabinet');
      return;
    }

    setDirty(true);
    selectCabinet(duplicated.instanceId);
    toast.success(`${duplicated.cabinetNumber} duplicated`);
  }, [currentRoom, duplicateCabinet, selectCabinet, setDirty]);

  const handleRemoveCabinet = useCallback(async (cabinet: ConfiguredCabinet) => {
    if (!currentRoom) return;
    const roomId = currentRoom.id;

    removeCabinet(roomId, cabinet.instanceId);
    setDirty(true);
    // WS8: destructive action gets an Undo. Re-add the same config/position
    // (a fresh instanceId/number is fine — it restores the cabinet).
    toast.success(`${cabinet.cabinetNumber} removed`, {
      action: {
        label: 'Undo',
        onClick: () => {
          const { instanceId: _i, cabinetNumber: _n, createdAt: _c, updatedAt: _u, ...rest } = cabinet;
          const restored = addCabinet(roomId, rest);
          selectCabinet(restored.instanceId);
          setDirty(true);
        },
      },
    });
  }, [currentRoom, removeCabinet, addCabinet, selectCabinet, setDirty]);

  const handleCabinetPatch = useCallback(async (instanceId: string, updates: Partial<ConfiguredCabinet>) => {
    if (!currentRoom) return;
    const currentCab = getCabinetById(currentRoom.id, instanceId);
    if (!currentCab) return;
    const merged: ConfiguredCabinet = {
      ...currentCab,
      ...updates,
      dimensions: { ...currentCab.dimensions, ...(updates.dimensions || {}) },
      materials: { ...currentCab.materials, ...(updates.materials || {}) },
      hardware: { ...currentCab.hardware, ...(updates.hardware || {}) },
      updatedAt: new Date(),
    };

    replaceCabinet(currentRoom.id, merged);
    setDirty(true);
  }, [currentRoom, getCabinetById, replaceCabinet, setDirty]);

  const handleEditCabinet = (cabinet: ConfiguredCabinet) => {
    selectCabinet(cabinet.instanceId);
    setEditDialogCabinet(cabinet);
    setEditDialogOpen(true);
  };

  const handleOpenFullEditor = () => {
    if (editDialogCabinet && currentRoom) {
      setEditDialogOpen(false);
      navigate(`/trade/job/${jobId}/room/${currentRoom.id}/configure/${editDialogCabinet.definitionId}?edit=${editDialogCabinet.instanceId}`);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setEditDialogOpen(open);
  };

  // (The old developer "Export JSON" was removed from the toolbar — the
  // customer-facing export is the auto-generated plan view PDF.)


  useEffect(() => {
    if (!jobId || jobId === 'new' || !currentRoom || !jobQuery.data || isPriceLocked) return;
    if (!quoteBOM) return;

    const snapshot = {
      roomId: currentRoom.id,
      roomTotal,
      perCabinetTotals,   // raw cost per cabinet (ex commercial, ex GST)
      perCabinetSell,     // sell price per cabinet (what admin labels "Sell Price")
      bomSummary: {
        grandTotal: quoteBOM.grandTotal,
        cabinets: quoteBOM.cabinets,
        warnings: quoteBOM.warnings,
      },
      pricingVersion: pricingVersion ?? undefined,
      pricingHash: pricingHash ?? undefined,
      capturedAt: new Date().toISOString(),
    };

    const quoteFingerprint = JSON.stringify({
      roomId: snapshot.roomId,
      roomTotal: snapshot.roomTotal,
      pricingHash: snapshot.pricingHash,
      bomGrandTotal: quoteBOM.grandTotal,
      perCabinetTotals: snapshot.perCabinetTotals,
      warnings: quoteBOM.warnings,
    });

    if (quoteFingerprint === lastPersistedQuoteRef.current) return;

    if (quotePersistRef.current) {
      clearTimeout(quotePersistRef.current);
    }

    const flush = () => {
      lastPersistedQuoteRef.current = quoteFingerprint;
      void persistPricingState({
        jobId,
        snapshot,
        subtotal: quoteBOM.grandTotal.subtotalExGst,
        tax: quoteBOM.grandTotal.gst,
        total: quoteBOM.grandTotal.total,
        rooms,
      }).catch(() => toast.error('Could not save the latest quote total.'));
    };
    quotePersistRef.current = setTimeout(flush, 500);

    return () => {
      if (quotePersistRef.current) {
        clearTimeout(quotePersistRef.current);
        quotePersistRef.current = null;
        // Flush instead of dropping: leaving the planner right after a change
        // must not lose the latest quote snapshot (job page reads it).
        if (lastPersistedQuoteRef.current !== quoteFingerprint) flush();
      }
    };
    // `rooms` and `perCabinetSell` are read inside the effect (persisted into
    // the snapshot) — list them so a stale closure can't persist old room state
    // or a mismatched sell map (review #5).
  }, [currentRoom, isPriceLocked, jobId, jobQuery.data, rooms, perCabinetTotals, perCabinetSell, persistPricingState, pricingHash, pricingVersion, quoteBOM, roomTotal]);

  // Sync dialog cabinet with latest state when cabinet updates
  useEffect(() => {
    if (editDialogOpen && editDialogCabinet) {
      const updated = cabinets.find(c => c.instanceId === editDialogCabinet.instanceId);
      if (updated) {
        setEditDialogCabinet(updated);
      }
    }
  }, [cabinets, editDialogOpen, editDialogCabinet?.instanceId]);

  // Warn-only opening conflicts — pure function over current room + cabinets,
  // so any move/resize/rotate/delete/undo state change recomputes it.
  const openingWarnings = useMemo(
    () =>
      currentRoom
        ? computeOpeningWarnings(
            {
              width: currentRoom.config.width,
              depth: currentRoom.config.depth,
              openings: currentRoom.config.openings,
            },
            currentRoom.dimensions,
            cabinets,
          )
        : [],
    [currentRoom, cabinets],
  );
  const geometryConflicts = cabinets.filter(cabinet => cabinet.geometryConflict);

  if (!currentRoom) {
    return (
      <TradeLayout>
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <Box className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Loading Room...</h2>
            <p className="text-sm text-muted-foreground">Syncing from saved job data</p>
          </div>
        </div>
      </TradeLayout>
    );
  }

  return (
    <TradeLayout>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/trade/job/${jobId}`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-trade-navy">{currentRoom.name}</h1>
              <p className="text-xs text-muted-foreground">
                {currentRoom.roomDocument ? 'Plan extents ' : ''}{currentRoom.config.width} × {currentRoom.config.depth}mm • {cabinets.length} cabinet{cabinets.length !== 1 ? 's' : ''}
                <span className="ml-2">
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved'
                    : saveState === 'conflict' ? 'Changed on another device'
                      : saveState === 'error' ? 'Save failed' : dirty ? 'Unsaved changes' : 'Up to date'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Opening conflicts (master plan §8.2): warn-only, never blocks.
                Recomputes via useMemo on every placement/edit/undo change. */}
            {openingWarnings.length > 0 && (
              <div
                className="flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-orange-800 cursor-help"
                title={openingWarnings.map((w) => w.message).join('\n')}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-semibold">
                  {openingWarnings.length} opening conflict{openingWarnings.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {geometryConflicts.length > 0 && (
              <div className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-red-800"
                title={geometryConflicts.map(cabinet => `${cabinet.productName}: ${cabinet.geometryConflict}`).join('\n')}>
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-semibold">{geometryConflicts.length} geometry conflict{geometryConflicts.length === 1 ? '' : 's'}</span>
              </div>
            )}
            {/* Pricing-trust warnings (WS2 guard): unmatched/unpriced materials */}
            {(quoteBOM?.warnings?.length ?? 0) > 0 && (
              <div
                className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800 cursor-help"
                title={quoteBOM!.warnings.join('\n')}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-semibold">
                  {quoteBOM!.warnings.length} pricing warning{quoteBOM!.warnings.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {/* Live room pricing (BOM-based) */}
            <div className="mr-2 text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
                {isPriceLocked ? 'Approved total' : 'Est. Total'}
              </div>
              <div className="text-base font-semibold text-trade-navy leading-tight">
                {jobQuery.isLoading || (isPricingLoading && !isPriceLocked)
                  ? 'Calculatingâ€¦'
                  : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(displayedRoomTotal || 0)}
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => setBenchtopDialogOpen(true)} title="Select supplier product and fabrication pathway">
              <span className="max-w-36 truncate">{selectedBenchtop ? `${selectedBenchtop.brand} · ${selectedBenchtop.range_tier ?? 'Benchtop'}` : 'Benchtop'}</span>
            </Button>

            <div className="flex items-center gap-1 border rounded-md p-1 mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!cameraControls} onClick={() => cameraControls?.zoomIn()}><ZoomIn className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!cameraControls} onClick={() => cameraControls?.zoomOut()}><ZoomOut className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!cameraControls} onClick={() => cameraControls?.fitAll()}><Maximize className="w-4 h-4" /></Button>
            </div>

            {/* WS8: one-click camera presets (3D only) */}
            {is3D && (
              <div className="flex items-center gap-1 border rounded-md p-1 mr-2">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!cameraControls} onClick={() => cameraControls?.setView('front')} title="Front elevation — inspect door & drawer faces">Front</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!cameraControls} onClick={() => cameraControls?.setView('top')} title="Top plan view">Top</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!cameraControls} onClick={() => cameraControls?.setView('corner')} title="Corner isometric view">Corner</Button>
              </div>
            )}

            {is3D && (
              <Button
                variant={doorsOpen ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDoorsOpen(v => !v)}
                title="Toggle all doors & drawers open"
              >
                <DoorOpen className="w-4 h-4 mr-1" />
                {doorsOpen ? 'Close All' : 'Open All'}
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setIs3D((v) => !v)} title="Toggle 2D / 3D view">
              {is3D ? 'View 2D Plan' : 'View in 3D'}
            </Button>
            <span className="hidden xl:inline text-[10px] text-muted-foreground mr-1 select-none">
              {is3D ? 'Right-drag orbit · scroll zoom' : 'Right-drag pan · scroll zoom'}
            </span>

            <Button variant="outline" size="sm" onClick={() => setShowCatalog(!showCatalog)}>
              {showCatalog ? <PanelLeftClose className="w-4 h-4 mr-1" /> : <PanelLeft className="w-4 h-4 mr-1" />}
              Catalog
            </Button>

            <Button variant={showRoomEditor ? 'default' : 'outline'} size="sm" disabled={isPriceLocked}
              onClick={() => {
                if (!showRoomEditor && currentRoom && !currentRoom.roomDocument && planningDocument) {
                  updateRoom(currentRoom.id, { roomDocument: planningDocument });
                  setDirty(true);
                }
                setShowRoomEditor(value => !value);
              }} title="Edit measured walls and openings">
              <Pencil className="w-4 h-4 mr-1" /> Room plan
            </Button>

            {(saveState === 'error' || saveState === 'conflict') && <Button variant="outline" size="sm" onClick={downloadRoomBackup}>
              Download unsaved room
            </Button>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!currentRoom) return;
                exportPlanViewPdf(currentRoom, jobQuery.data?.name);
                toast.success('Plan view exported');
              }}
            >
              <FileDown className="w-4 h-4 mr-1" />
              Plan View
            </Button>

            <Button
              size="sm"
              className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy"
              disabled={saveState === 'saving'}
              onClick={async () => {
                if (!jobId || jobId === 'new') return;
                try {
                  if (await saveRoomToServer()) toast.success('Room saved', { description: 'Changes persisted to server.' });
                } catch { /* saveRoomToServer keeps the draft and reports the error. */ }
              }}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        </div>

        {/* Selected cabinet action bar */}
        {selectedCabinet && (
          <div className="flex items-center justify-between px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-sm flex-shrink-0">
            <span className="font-medium text-amber-900 truncate max-w-xs">{selectedCabinet.productName}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={handleRotateSelected}
                title="Rotate 90° (shortcut: R)"
              >
                <RotateCw className="w-3 h-3 mr-1" />
                Rotate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => handleEditCabinet(selectedCabinet)}
              >
                <Pencil className="w-3 h-3 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-100"
                onClick={() => selectCabinet(null)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden relative">
          {showRoomEditor && editableDocument && (
            <aside className="absolute inset-0 z-30 overflow-y-auto border-r bg-background md:relative md:inset-auto md:w-[420px] md:flex-shrink-0"
              aria-label="Room wall and opening editor">
              <RoomDocumentEditor document={planningDocument ?? editableDocument} onChange={handleRoomDocumentChange} />
              {planningDocument?.capture?.captureId && jobId && currentRoom && (
                <ScannerEvidencePanel captureId={planningDocument.capture.captureId}
                  sourceRevision={planningDocument.capture.sourceRevision} jobId={jobId}
                  roomId={currentRoom.id} initialSession={scannerSession} />
              )}
              <section className="border-t p-4 space-y-3" aria-label="Preliminary wall-run suggestions">
                <h2 className="font-semibold">Wall-run ideas</h2>
                <p className="text-xs text-muted-foreground">These suggestions use the drawn wall segments. Check dimensions, services and clearances on site before ordering.</p>
                {!wallRunPool?.capability.supported && wallRunPool?.capability.reasons.map(reason => (
                  <p key={reason} className="text-sm text-amber-800">{reason}</p>
                ))}
                {wallRunPool?.candidates.map(candidate => (
                  <Button key={candidate.candidateId} variant={selectedWallRunId === candidate.candidateId ? 'default' : 'outline'}
                    className="w-full justify-start" onClick={() => { setSelectedWallRunId(candidate.candidateId); setIncludeSuggestedIsland(false); }}>
                    {candidate.wallIds.length} wall{candidate.wallIds.length === 1 ? '' : 's'} · {candidate.items.length} items
                  </Button>
                ))}
                {wallRunPool?.capability.supported && !wallRunPool.candidates.length && (
                  <p className="text-sm text-amber-800">No wall run fits the current walls, openings and existing items.</p>
                )}
                {selectedWallRun && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">Preview on {selectedWallRun.wallIds.join(', ')}</p>
                    {selectedWallRun.unresolved.map(note => <p key={note} className="text-xs text-amber-800">{note}</p>)}
                    {suggestedIsland && <Button size="sm" variant={includeSuggestedIsland ? 'default' : 'outline'}
                      onClick={() => setIncludeSuggestedIsland(value => !value)}>
                      {includeSuggestedIsland ? 'Remove island from preview' : `Preview island · ${suggestedIsland.clearanceMm} mm circulation`}
                    </Button>}
                    {!suggestedIsland && wallRunPool?.islandReason && <p className="text-xs text-muted-foreground">{wallRunPool.islandReason}</p>}
                    <Button size="sm" disabled={isPriceLocked} onClick={applySelectedWallRun}>Add this idea to the plan</Button>
                  </div>
                )}
              </section>
            </aside>
          )}
          {showCatalog && (
            <div className="w-64 border-r flex-shrink-0">
              <UnifiedCatalog
                userType={catalogMode}
                onSelectProduct={handleQuickAddProduct}
                placementItemId={placementItemId}
                onCancelPlacement={() => setPlacementItemId(null)}
              />
            </div>
          )}

          <div
            className="flex-1 flex flex-col min-w-0"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.productId) handleQuickAddProduct(data.productId);
              } catch {
                // Ignore invalid drops
              }
            }}
          >
            <Scene3DErrorBoundary>
              <UnifiedScene
                items={selectedWallRun && showRoomEditor
                  ? [...placedItems, ...selectedSuggestionItems] : placedItems}
                room={roomConfig}
                globalDimensions={currentRoom?.dimensions || DEFAULT_GLOBAL_DIMENSIONS}
                selectedItemId={selectedCabinetId}
                draggedItemId={draggedItemId}
                placementItemId={null}
                onItemSelect={handleCabinetSelect}
                onItemMove={handleItemMove}
                onItemEdit={(id) => { if (!currentRoom) return; const cab = getCabinetById(currentRoom.id, id); if (cab) handleEditCabinet(cab); }}
                onDragStart={(id) => setDraggedItemId(id)}
                onDragEnd={() => setDraggedItemId(null)}
                onCameraControlsReady={setCameraControls}
                is3D={is3D}
                doorsOpen={doorsOpen}
                catalog={catalog}
              />
            </Scene3DErrorBoundary>
          </div>

          <CabinetListPanel
            roomId={currentRoom.id}
            cabinets={cabinets}
            getCabinetPrice={getCabinetPrice}
            onEditCabinet={handleEditCabinet}
            onSelectCabinet={handleCabinetSelect}
            onDuplicateCabinet={handleDuplicateCabinet}
            onRemoveCabinet={handleRemoveCabinet}
            onRotateCabinet={handleRotateSelected}
            className="w-72 flex-shrink-0"
          />
        </div>

        <CabinetEditDialog
          roomId={currentRoom.id}
          cabinet={selectedCabinet || editDialogCabinet}
          open={editDialogOpen}
          onOpenChange={handleDialogOpenChange}
          onOpenFullEditor={handleOpenFullEditor}
          onCabinetPatch={handleCabinetPatch}
        />
        <BenchtopMatrixDialog
          open={benchtopDialogOpen}
          onOpenChange={setBenchtopDialogOpen}
          options={benchtopOptions}
          selectedId={selectedBenchtop?.id}
          onSelect={(option) => {
            updateRoom(currentRoom.id, {
              materialDefaults: {
                ...currentRoom.materialDefaults,
                benchtopPricingId: option.id,
                benchtopFinishId: option.catalog_finish_id ?? currentRoom.materialDefaults.benchtopFinishId,
              },
            });
            setDirty(true);
            setBenchtopDialogOpen(false);
            toast.success(`Benchtop set to ${option.brand} — ${option.range_tier ?? 'Standard'}`);
          }}
        />
      </div>
    </TradeLayout>
  );
}
