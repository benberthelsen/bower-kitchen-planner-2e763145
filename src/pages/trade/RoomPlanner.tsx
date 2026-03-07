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
import { useTradeRoomPricing } from '@/hooks/useTradeRoomPricing';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { getCategoryFromSpecGroup } from '@/constants/catalogGroups';
import { PlacedItem } from '@/types';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogCabinet, setEditDialogCabinet] = useState<ConfiguredCabinet | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cameraControls, setCameraControls] = useState<{ zoomIn: () => void; zoomOut: () => void; resetView: () => void; fitAll: () => void } | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotePersistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedQuoteRef = useRef<string>('');

  useEffect(() => {
    if (jobId && jobId !== 'new' && jobQuery.data) {
      hydrateRooms(roomsFromServer);
    }
  }, [jobId, jobQuery.data, roomsFromServer, hydrateRooms]);

  useEffect(() => {
    if (!roomId) return;
    const matchedRoom = rooms.find((room) => room.id === roomId) || null;
    setCurrentRoom(matchedRoom);
  }, [roomId, rooms, setCurrentRoom]);

  const selectedCabinet = getSelectedCabinet();
  const cabinets = currentRoom ? getCabinetsByRoom(currentRoom.id) : [];
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
  const placedItems: PlacedItem[] = useMemo(() => {
    return cabinets.filter(c => c.isPlaced && c.position).map(cabinet => ({
      instanceId: cabinet.instanceId,
      definitionId: cabinet.definitionId,
      itemType: cabinet.category === 'Appliance' ? 'Appliance' : 'Cabinet' as const,
      x: cabinet.position!.x,
      y: 0,
      z: cabinet.position!.z,
      rotation: cabinet.position!.rotation,
      width: cabinet.dimensions.width,
      depth: cabinet.dimensions.depth,
      height: cabinet.dimensions.height,
      hinge: 'Left' as const,
      cabinetNumber: cabinet.cabinetNumber,
      finishColor: cabinet.materials?.exteriorFinish,
      handleType: cabinet.hardware?.handleType,
    }));
  }, [cabinets]);

  const roomConfig = useMemo(() => ({
    width: currentRoom?.config.width || 4000,
    depth: currentRoom?.config.depth || 3000,
    height: currentRoom?.config.height || 2400,
    shape: 'Rectangle' as const,
    cutoutWidth: currentRoom?.config.cutoutWidth || 0,
    cutoutDepth: currentRoom?.config.cutoutDepth || 0,
  }), [currentRoom]);

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);


  const clampPositionToRoom = useCallback((room: TradeRoom, cabinet: ConfiguredCabinet, position: { x: number; y: number; z: number; rotation: number }) => {
    const maxX = Math.max(0, room.config.width - cabinet.dimensions.width);
    const maxZ = Math.max(0, room.config.depth - cabinet.dimensions.depth);
    return {
      ...position,
      x: Math.min(Math.max(position.x, 0), maxX),
      z: Math.min(Math.max(position.z, 0), maxZ),
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

  const getCabinetPrice = useCallback((cabinet: ConfiguredCabinet) => {
    const catalogItem = catalogById.get(cabinet.definitionId);
    if (!catalogItem) return 0;
    const basePrice = catalogItem.price ?? 0;
    const widthScale = cabinet.dimensions.width / (catalogItem.defaultWidth || cabinet.dimensions.width || 1);
    return Math.max(0, basePrice * widthScale);
  }, [catalogById]);

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
    selectCabinet(instanceId);
  };

  const handleCabinetPlace = async (instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => {
    if (!currentRoom) return;
    const sourceCabinet = cabinets.find(c => c.instanceId === instanceId);
    if (!sourceCabinet) return;

    const clamped = clampPositionToRoom(currentRoom, sourceCabinet, position);
    placeCabinet(currentRoom.id, instanceId, clamped);
    setDirty(true);
  };

  const handleItemMove = useCallback(async (id: string, updates: Partial<PlacedItem>) => {
    if (!currentRoom) return;
    const cabinet = cabinets.find(c => c.instanceId === id);
    if (cabinet && updates.x !== undefined && updates.z !== undefined) {
      const position = { x: updates.x, y: 0, z: updates.z, rotation: updates.rotation ?? cabinet.position?.rotation ?? 0 };
      await handleCabinetPlace(id, position);
    }
  }, [currentRoom, cabinets, handleCabinetPlace]);

  const handleQuickAddProduct = useCallback(async (productId: string) => {
    if (!currentRoom) return;
    const catalogItem = catalog.find(item => item.id === productId);
    if (!catalogItem) {
      toast.error('Product not found');
      return;
    }

    const defaultWidth = catalogItem.defaultWidth || 600;
    const defaultHeight = catalogItem.defaultHeight || 720;
    const defaultDepth = catalogItem.defaultDepth || 580;

    const position = calculateDefaultPosition(currentRoom, cabinets, defaultWidth);

    const category = catalogItem.itemType === 'Appliance'
      ? 'Appliance'
      : catalogItem.renderConfig?.category
        || getCategoryFromSpecGroup(catalogItem.specGroup)
        || catalogItem.category
        || 'Base';

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
    });

    await persistCabinet(newCabinet);
    selectCabinet(newCabinet.instanceId);
    setEditDialogCabinet(newCabinet);
    setEditDialogOpen(true);

    toast.success(`${catalogItem.name} added`, {
      description: 'Saved to job and available to other sessions.'
    });
  }, [currentRoom, catalog, cabinets, addCabinet, selectCabinet, calculateDefaultPosition, persistCabinet]);


  const handleDuplicateCabinet = useCallback(async (cabinet: ConfiguredCabinet) => {
    if (!currentRoom) return;
    const duplicated = duplicateCabinet(currentRoom.id, cabinet.instanceId);
    if (!duplicated) {
      toast.error('Failed to duplicate cabinet');
      return;
    }

    try {
      await persistCabinet(duplicated);
      setDirty(true);
      selectCabinet(duplicated.instanceId);
      toast.success(`${duplicated.cabinetNumber} duplicated`);
    } catch {
      toast.error('Duplicate created locally but failed to persist');
    }
  }, [currentRoom, duplicateCabinet, persistCabinet, selectCabinet]);

  const handleRemoveCabinet = useCallback(async (cabinet: ConfiguredCabinet) => {
    if (!currentRoom) return;

    removeCabinet(currentRoom.id, cabinet.instanceId);

    if (!jobId || jobId === 'new') {
      setDirty(true);
      return;
    }
    try {
      await removeCabinetFromJob({ jobId, roomId: currentRoom.id, instanceId: cabinet.instanceId });
      setDirty(true);
      toast.success(`${cabinet.cabinetNumber} removed`);
    } catch {
      toast.error('Removed locally but failed to persist');
    }
  }, [currentRoom, jobId, removeCabinet, removeCabinetFromJob]);

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
    try {
      await persistCabinet(merged);
    } catch {
      toast.error('Cabinet updated locally but failed to persist');
    }
  }, [currentRoom, getCabinetById, replaceCabinet, persistCabinet]);

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

  const handleExportJson = useCallback(() => {
    if (!currentRoom) return;
    const exportedAt = new Date().toISOString();
    const exportPayload = {
      exportType: 'trade-room-plan',
      exportedAt,
      pricing: {
        source: 'bom',
        version: pricingVersion ?? `trade-bom-${exportedAt}`,
        hash: pricingHash,
        roomTotal,
        perCabinetTotals,
      },
      room: {
        id: currentRoom.id,
        name: currentRoom.name,
        config: currentRoom.config,
        dimensions: currentRoom.dimensions,
        materialDefaults: currentRoom.materialDefaults,
        hardwareDefaults: currentRoom.hardwareDefaults,
      },
      cabinets: cabinets.map((cabinet) => {
        const catalogItem = catalog.find((item) => item.id === cabinet.definitionId);
        return {
          ...cabinet,
          estimatedTotal: perCabinetTotals[cabinet.instanceId] ?? 0,
          catalogPrice: catalogItem?.price ?? null,
        };
      }),
      bomSummary: quoteBOM
        ? {
            grandTotal: quoteBOM.grandTotal,
            consolidatedSheets: quoteBOM.consolidatedSheets,
            consolidatedEdgeTape: quoteBOM.consolidatedEdgeTape,
            consolidatedHardware: quoteBOM.consolidatedHardware,
            cabinets: quoteBOM.cabinets,
          }
        : null,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentRoom.name.replace(/\s+/g, '-').toLowerCase()}-plan-export.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('Plan exported', {
      description: `Room total ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(roomTotal)}`,
    });
  }, [cabinets, catalog, currentRoom, perCabinetTotals, pricingHash, pricingVersion, quoteBOM, roomTotal]);


  useEffect(() => {
    if (!jobId || jobId === 'new' || !currentRoom) return;
    if (!quoteBOM) return;

    const snapshot = {
      roomId: currentRoom.id,
      roomTotal,
      perCabinetTotals,
      bomSummary: {
        grandTotal: quoteBOM.grandTotal,
        cabinets: quoteBOM.cabinets,
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
    });

    if (quoteFingerprint === lastPersistedQuoteRef.current) return;

    if (quotePersistRef.current) {
      clearTimeout(quotePersistRef.current);
    }

    quotePersistRef.current = setTimeout(() => {
      lastPersistedQuoteRef.current = quoteFingerprint;
      void persistQuoteSnapshot({ jobId, snapshot });
      void persistJobTotals({
        jobId,
        subtotal: quoteBOM.grandTotal.subtotalExGst,
        tax: quoteBOM.grandTotal.gst,
        total: quoteBOM.grandTotal.total,
      });
    }, 500);

    return () => {
      if (quotePersistRef.current) {
        clearTimeout(quotePersistRef.current);
        quotePersistRef.current = null;
      }
    };
  }, [currentRoom, jobId, perCabinetTotals, persistJobTotals, persistQuoteSnapshot, pricingHash, pricingVersion, quoteBOM, roomTotal]);

  // Sync dialog cabinet with latest state when cabinet updates
  useEffect(() => {
    if (editDialogOpen && editDialogCabinet) {
      const updated = cabinets.find(c => c.instanceId === editDialogCabinet.instanceId);
      if (updated) {
        setEditDialogCabinet(updated);
      }
    }
  }, [cabinets, editDialogOpen, editDialogCabinet?.instanceId]);

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
            <div className="flex items-center gap-1 border rounded-md p-1 mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cameraControls?.zoomIn()}><ZoomIn className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cameraControls?.zoomOut()}><ZoomOut className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cameraControls?.fitAll()}><Maximize className="w-4 h-4" /></Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowCatalog(!showCatalog)}>
              {showCatalog ? <PanelLeftClose className="w-4 h-4 mr-1" /> : <PanelLeft className="w-4 h-4 mr-1" />}
              Catalog
            </Button>

            <Button variant="outline" size="sm" onClick={handleExportJson}>
              <FileDown className="w-4 h-4 mr-1" />
              Export JSON
            </Button>

            <Button variant="outline" size="sm" onClick={() => exportJobPdf()}>
              <FileDown className="w-4 h-4 mr-1" />
              Export PDF
            </Button>

            <Button
              size="sm"
              className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy"
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

        <div className="flex-1 flex overflow-hidden">
          {showCatalog && (
            <div className="w-64 border-r">
              <UnifiedCatalog
                userType={catalogMode}
                onSelectProduct={handleQuickAddProduct}
                placementItemId={placementItemId}
                onCancelPlacement={() => setPlacementItemId(null)}
              />
            </div>
          )}

          <div
            className="flex-1 flex flex-col"
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
                onDragStart={(id) => setDraggedItemId(id)}
                onDragEnd={() => setDraggedItemId(null)}
                onCameraControlsReady={setCameraControls}
                is3D={true}
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
            className="w-72"
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
