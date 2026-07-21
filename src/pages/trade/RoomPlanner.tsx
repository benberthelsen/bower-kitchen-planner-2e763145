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
import { useCatalog } from '@/hooks/useCatalog';
import { useMaterialsCatalog } from '@/hooks/useMaterialsCatalog';
import { useTradeRoomPricing } from '@/hooks/useTradeRoomPricing';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { getCategoryFromSpecGroup } from '@/constants/catalogGroups';
import { PlacedItem } from '@/types';
import { defaultCornerArmDepth, STANDARD_CORNER_ARM_DEPTH } from '@/lib/cornerDefaults';
import { calculateSnapPosition, findAutoWallPlacement, isCornerClear } from '@/utils/snapping';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';
import { exportPlanViewPdf } from '@/lib/planViewPdf';
import { computeOpeningWarnings } from '@/lib/trade/openingWarnings';
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
    placeCabinet,
    removeCabinet,
    duplicateCabinet,
    replaceCabinet,
    getCabinetById,
    selectedCabinetId,
    selectCabinet,
    getSelectedCabinet,
    getCabinetsByRoom,
    hydrateRooms,
  } = useTradeRoom();

  const { jobQuery, roomsFromServer, upsertCabinet, replaceRoomInJob, removeCabinetFromJob, persistQuoteSnapshot, persistJobTotals, exportJobPdf } = useTradeJobPersistence(jobId);

  const [showCatalog, setShowCatalog] = useState(true);
  // Open in 2D top-down for layout (drag maps 1:1 to the cursor); 3D is for viewing.
  const [is3D, setIs3D] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogCabinet, setEditDialogCabinet] = useState<ConfiguredCabinet | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cameraControls, setCameraControls] = useState<{ zoomIn: () => void; zoomOut: () => void; resetView: () => void; fitAll: () => void; setView: (preset: 'front' | 'top' | 'corner') => void } | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotePersistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedQuoteRef = useRef<string>('');

  useEffect(() => {
    // Don't let a server snapshot overwrite un-saved local edits — this was
    // wiping a freshly-added 2nd cabinet before its autosave landed.
    if (jobId && jobId !== 'new' && jobQuery.data && !dirty) {
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
  } = useTradeRoomPricing({
    cabinets,
    dimensions: currentRoom?.dimensions || DEFAULT_GLOBAL_DIMENSIONS,
    materialDefaults: currentRoom?.materialDefaults,
    hardwareDefaults: currentRoom?.hardwareDefaults || defaultHardwareDefaults,
  });

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
      depth: isLCorner ? cabinet.dimensions.width : storedDepth,
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
      drawerFrontHeights: cabinet.construction?.drawerFrontHeights,
      };
    });
  }, [cabinets, pricedMaterials]);

  const roomConfig = useMemo(() => ({
    width: currentRoom?.config.width || 4000,
    depth: currentRoom?.config.depth || 3000,
    height: currentRoom?.config.height || 2400,
    shape: 'Rectangle' as const,
    cutoutWidth: currentRoom?.config.cutoutWidth || 0,
    cutoutDepth: currentRoom?.config.cutoutDepth || 0,
    // Room features flow into the 3D scene (openings + service markers) —
    // previously dropped here, which left the scene opening-blind.
    openings: currentRoom?.config.openings ?? [],
    services: currentRoom?.config.services ?? [],
  }), [currentRoom]);

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);


  const clampPositionToRoom = useCallback((room: TradeRoom, cabinet: ConfiguredCabinet, position: { x: number; y: number; z: number; rotation: number }) => {
    // x/z are CENTRE coordinates. Clamp rotation-aware so a snapped position
    // against the right/front wall is preserved (the previous corner-based
    // clamp pulled cabinets half a width away from those walls).
    const rot = ((Math.round(position.rotation) % 360) + 360) % 360;
    const rotated = rot === 90 || rot === 270;
    const halfW = (rotated ? cabinet.dimensions.depth : cabinet.dimensions.width) / 2;
    const halfD = (rotated ? cabinet.dimensions.width : cabinet.dimensions.depth) / 2;
    return {
      ...position,
      x: Math.min(Math.max(position.x, halfW), Math.max(halfW, room.config.width - halfW)),
      z: Math.min(Math.max(position.z, halfD), Math.max(halfD, room.config.depth - halfD)),
    };
  }, []);

  const saveRoomToServer = useCallback(async () => {
    if (!jobId || jobId === 'new' || !currentRoom) return;
    try {
      setSaveState('saving');
      await replaceRoomInJob({ jobId, room: currentRoom });
      setDirty(false);
      setSaveState('saved');
    } catch {
      setSaveState('error');
      toast.error('Failed to save room');
    }
  }, [currentRoom, jobId, replaceRoomInJob]);

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

  const getCabinetPrice = useCallback((cabinet: ConfiguredCabinet) => {
    // Prefer the real piece-level BOM price for this cabinet; fall back to the
    // catalog estimate only when the BOM hasn't priced it yet.
    const bom = perCabinetTotals[cabinet.instanceId];
    if (typeof bom === 'number' && bom > 0) return bom * sellFactor;
    const catalogItem = catalogById.get(cabinet.definitionId);
    if (!catalogItem) return 0;
    const basePrice = catalogItem.price ?? 0;
    const widthScale = cabinet.dimensions.width / (catalogItem.defaultWidth || cabinet.dimensions.width || 1);
    return Math.max(0, basePrice * widthScale);
  }, [catalogById, perCabinetTotals, sellFactor]);

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
    placeCabinet(currentRoom.id, instanceId, clamped);
    setDirty(true);
  }, [clampPositionToRoom, currentRoom, getCabinetById, placeCabinet]);

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
    const auto = findAutoWallPlacement({
      room: currentRoom.config,
      width: defaultWidth,
      depth: defaultDepth,
      category: category as 'Base' | 'Wall' | 'Tall' | 'Appliance',
      obstacles: autoObstacles,
    });
    let rawPosition = auto
      ? { x: auto.x, y: 0, z: auto.z, rotation: auto.rotation }
      : calculateDefaultPosition(currentRoom, cabinets, defaultWidth);

    // Corner cabinets start at the nearest FREE room corner so the snapping
    // engine nests them into it with the correct rotation (doors facing the
    // room) — instead of landing mid-wall like standard cabinets.
    const isCornerProduct = /corner|diagonal|blind|pie/i.test(`${productId} ${catalogItem.name}`);
    const cornerConstruction = isCornerProduct
      ? { cabinetDepthLeft: STANDARD_CORNER_ARM_DEPTH, cabinetDepthRight: STANDARD_CORNER_ARM_DEPTH }
      : undefined;
    if (isCornerProduct) {
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
    const snapped = calculateSnapPosition(rawPosition.x, rawPosition.z, snapItem, placedItems, currentRoom.config, 50, DEFAULT_GLOBAL_DIMENSIONS);
    const position = { x: snapped.x, y: rawPosition.y, z: snapped.z, rotation: snapped.rotation };

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
      isPlaced: true,
      position,
      ...(cornerConstruction ? { construction: cornerConstruction } : {}),
    });

    // Local add only; the debounced room autosave persists the whole room.
    // (Previously this also did an immediate per-cabinet server write, which
    // raced the autosave and dropped the 2nd+ cabinet.)
    selectCabinet(newCabinet.instanceId);
    setDirty(true);
    // Stable id so rapid adds collapse into one toast instead of stacking (WS8).
    toast.success(`${catalogItem.name} added`, {
      id: 'cabinet-added',
      description: 'Selected — press R to rotate, or double-click to edit options.'
    });
  }, [currentRoom, catalog, cabinets, addCabinet, selectCabinet, calculateDefaultPosition]);


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
  }, [currentRoom, duplicateCabinet, selectCabinet]);

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
  }, [currentRoom, removeCabinet, addCabinet, selectCabinet]);

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
  }, [currentRoom, getCabinetById, replaceCabinet]);

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
    if (!jobId || jobId === 'new' || !currentRoom) return;
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
      void persistQuoteSnapshot({ jobId, snapshot, rooms });
      void persistJobTotals({
        jobId,
        subtotal: quoteBOM.grandTotal.subtotalExGst,
        tax: quoteBOM.grandTotal.gst,
        total: quoteBOM.grandTotal.total,
        rooms,
      });
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
  }, [currentRoom, jobId, rooms, perCabinetTotals, perCabinetSell, persistJobTotals, persistQuoteSnapshot, pricingHash, pricingVersion, quoteBOM, roomTotal]);

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
                {currentRoom.config.width} × {currentRoom.config.depth}mm • {cabinets.length} cabinet{cabinets.length !== 1 ? 's' : ''}
                <span className="ml-2">
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : dirty ? 'Unsaved changes' : 'Up to date'}
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
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Est. Total</div>
              <div className="text-base font-semibold text-trade-navy leading-tight">
                {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(roomTotal || 0)}
              </div>
            </div>

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
                  await saveRoomToServer();
                  toast.success('Room saved', { description: 'Changes persisted to server.' });
                } catch {
                  toast.error('Failed to save room');
                }
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

        <div className="flex-1 flex overflow-hidden">
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
                items={placedItems}
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
      </div>
    </TradeLayout>
  );
}
