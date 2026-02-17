import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { getCategoryFromSpecGroup } from '@/constants/catalogGroups';
import { PlacedItem } from '@/types';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';
import {
  ArrowLeft,
  Save,
  ArrowLeft, 
  Save, 
  FileDown, 
  FileDown,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Box,
  PanelLeft,
  PanelLeftClose,
  PanelLeftClose
} from 'lucide-react';

export default function RoomPlanner() {
  const { jobId, roomId } = useParams();
  const navigate = useNavigate();
  const { catalog } = useCatalog('trade');
  const {
    currentRoom,
    setCurrentRoom,
    rooms,
    hydrateRooms,
  const { userType } = useAuth();
  const catalogMode = userType === 'trade' ? 'trade' : 'standard';
  const { catalog } = useCatalog(catalogMode);
  const { 
    currentRoom, 
    setCurrentRoom, 
    rooms, 
    addRoom,
    addCabinet,
    placeCabinet,
    selectedCabinetId,
    selectCabinet,
    getSelectedCabinet,
    getCabinetsByRoom,
  } = useTradeRoom();

  const { jobQuery, roomsFromServer, upsertCabinet, upsertJob, exportJobPdf } = useTradeJobPersistence(jobId);

  const [showCatalog, setShowCatalog] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogCabinet, setEditDialogCabinet] = useState<ConfiguredCabinet | null>(null);

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

  const getCabinetPrice = useCallback((cabinet: ConfiguredCabinet) => {
    const catalogItem = catalogById.get(cabinet.definitionId);
    if (!catalogItem) return 0;

    const basePrice = catalogItem.price ?? 0;
    const widthScale = cabinet.dimensions.width / (catalogItem.defaultWidth || cabinet.dimensions.width || 1);
    return Math.max(0, basePrice * widthScale);
  }, [catalogById]);

  const handleExportPlan = useCallback(() => {
    if (!currentRoom) return;

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      jobId: jobId ?? null,
      room: {
        id: currentRoom.id,
        name: currentRoom.name,
        config: currentRoom.config,
        dimensions: currentRoom.dimensions,
      },
      cabinets: cabinets.map((cabinet) => ({
        ...cabinet,
        estimatedPrice: getCabinetPrice(cabinet),
      })),
      totals: {
        cabinets: cabinets.length,
        estimatedPrice: cabinets.reduce((sum, c) => sum + getCabinetPrice(c), 0),
      },
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentRoom.name.replace(/\s+/g, '-').toLowerCase() || 'kitchen-plan'}-${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    toast.success('Plan exported', { description: 'Downloaded room plan JSON' });
  }, [currentRoom, cabinets, getCabinetPrice, jobId]);


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
      return { x: 50, y: 0, z: frontCabinet.position!.z + frontCabinet.dimensions.depth + 100, rotation: 0 };
    }

    return { x: newX, y: 0, z: lastCabinet.position!.z, rotation: lastCabinet.position!.rotation };
  }, []);

  const persistCabinet = useCallback(async (cabinet: ConfiguredCabinet) => {
    if (!jobId || jobId === 'new' || !currentRoom) return;
    await upsertCabinet({ jobId, roomId: currentRoom.id, cabinet });
  }, [jobId, currentRoom, upsertCabinet]);

  const handleCabinetSelect = (instanceId: string | null) => {
    selectCabinet(instanceId);
  };

  const handleCabinetPlace = async (instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => {
    if (!currentRoom) return;
    placeCabinet(currentRoom.id, instanceId, position);
    const updatedCab = currentRoom.cabinets.find(c => c.instanceId === instanceId);
    if (updatedCab) {
      await persistCabinet({ ...updatedCab, position, isPlaced: true, updatedAt: new Date() });
    }
  };

  const handleItemMove = useCallback(async (id: string, updates: Partial<PlacedItem>) => {
    if (!currentRoom) return;
    const cabinet = cabinets.find(c => c.instanceId === id);
    if (cabinet && updates.x !== undefined && updates.z !== undefined) {
      const position = { x: updates.x, y: 0, z: updates.z, rotation: updates.rotation ?? cabinet.position?.rotation ?? 0 };
      await handleCabinetPlace(id, position);
    }
  }, [currentRoom, cabinets]);

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
      : getCategoryFromSpecGroup(catalogItem.specGroup) || catalogItem.category || 'Base';
    // Calculate smart position
    const position = calculateDefaultPosition(
      currentRoom, 
      cabinets, 
      defaultWidth
    );

    // Determine category from Microvellum-derived render config first for accurate geometry
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
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border rounded-md p-1 mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info('Undo', { description: 'Coming soon' })}><Undo2 className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info('Redo', { description: 'Coming soon' })}><Redo2 className="w-4 h-4" /></Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info('Zoom In', { description: 'Use scroll wheel to zoom' })}><ZoomIn className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info('Zoom Out', { description: 'Use scroll wheel to zoom' })}><ZoomOut className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info('Fit to View', { description: 'Coming soon' })}><Maximize className="w-4 h-4" /></Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowCatalog(!showCatalog)}>
              {showCatalog ? <PanelLeftClose className="w-4 h-4 mr-1" /> : <PanelLeft className="w-4 h-4 mr-1" />}
              Catalog
            </Button>

            <Button variant="outline" size="sm" onClick={exportJobPdf}>
            {/* Toggle Catalog */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCatalog(!showCatalog)}
            >
              {showCatalog ? (
                <PanelLeftClose className="w-4 h-4 mr-1" />
              ) : (
                <PanelLeft className="w-4 h-4 mr-1" />
              )}
              Catalog
            </Button>

            {/* Actions */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportPlan}
            >
              <FileDown className="w-4 h-4 mr-1" />
              Export PDF
            </Button>
            <Button
              size="sm"
              className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy"
              onClick={async () => {
                if (!jobId || jobId === 'new') return;
                try {
                  await upsertJob({ id: jobId, name: jobQuery.data?.name || `Job ${jobId.slice(0, 8)}`, status: 'draft', rooms });
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
                userType="trade"
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
            className="w-72"
          />
        </div>

        <CabinetEditDialog
          roomId={currentRoom.id}
          cabinet={selectedCabinet || editDialogCabinet}
          open={editDialogOpen}
          onOpenChange={handleDialogOpenChange}
          onOpenFullEditor={handleOpenFullEditor}
        />
      </div>
    </TradeLayout>
  );
}
