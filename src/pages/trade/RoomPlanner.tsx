import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  useTradeRoom, 
  TradeRoom, 
  ConfiguredCabinet,
  defaultMaterialDefaults,
  defaultHardwareDefaults
} from '@/contexts/TradeRoomContext';
import { PlannerScene } from '@/components/trade/planner/PlannerScene';
import { CabinetListPanel } from '@/components/trade/planner/CabinetListPanel';
import { InlineConfigurator } from '@/components/trade/planner/InlineConfigurator';
import { PlacementToolbar } from '@/components/trade/planner/PlacementToolbar';
import { useCatalogItem } from '@/hooks/useCatalog';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { 
  ArrowLeft, 
  Save, 
  FileDown, 
  RotateCcw,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Box,
  PanelLeft,
  PanelLeftClose,
  Plus
} from 'lucide-react';

export default function RoomPlanner() {
  const { jobId, roomId } = useParams();
  const navigate = useNavigate();
  const { 
    currentRoom, 
    setCurrentRoom, 
    rooms, 
    addRoom,
    addCabinet,
    updateCabinet,
    placeCabinet,
    selectedCabinetId,
    selectCabinet,
    getSelectedCabinet,
    getCabinetsByRoom
  } = useTradeRoom();

  const [showCatalog, setShowCatalog] = useState(true);
  const [showInlineConfig, setShowInlineConfig] = useState(false);

  // Initialize room if needed
  useEffect(() => {
    if (roomId && !currentRoom) {
      // Try to find existing room
      const existingRoom = rooms.find(r => r.id === roomId);
      if (existingRoom) {
        setCurrentRoom(existingRoom);
      } else {
        // Create a new demo room
        const newRoom = addRoom({
          name: 'Kitchen',
          description: 'Main kitchen area',
          shape: 'rectangular',
          config: {
            width: 4000,
            depth: 3000,
            height: 2400,
            shape: 'Rectangle',
            cutoutWidth: 0,
            cutoutDepth: 0,
          },
          dimensions: DEFAULT_GLOBAL_DIMENSIONS,
          materialDefaults: defaultMaterialDefaults,
          hardwareDefaults: defaultHardwareDefaults,
        });
        setCurrentRoom(newRoom);
      }
    }
  }, [roomId, currentRoom, rooms, addRoom, setCurrentRoom]);

  const selectedCabinet = getSelectedCabinet();
  const cabinets = currentRoom ? getCabinetsByRoom(currentRoom.id) : [];

  // Show inline config when cabinet is selected
  useEffect(() => {
    if (selectedCabinetId) {
      setShowInlineConfig(true);
    }
  }, [selectedCabinetId]);

  const handleCabinetSelect = (instanceId: string | null) => {
    selectCabinet(instanceId);
    if (!instanceId) {
      setShowInlineConfig(false);
    }
  };

  const handleCabinetPlace = (instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => {
    if (currentRoom) {
      placeCabinet(currentRoom.id, instanceId, position);
    }
  };

  const handleAddProduct = (productId: string) => {
    if (!currentRoom) return;
    
    // Navigate to full configurator
    navigate(`/trade/job/${jobId}/room/${currentRoom.id}/configure/${productId}`);
  };

  const handleQuickAddProduct = useCallback((productId: string) => {
    if (!currentRoom) return;
    
    // Quick add with defaults - place at center of room
    const catalogItem = getCatalogItemForQuickAdd(productId);
    if (!catalogItem) return;

    const newCabinet = addCabinet(currentRoom.id, {
      definitionId: productId,
      productName: catalogItem.name,
      category: (catalogItem.category as 'Base' | 'Wall' | 'Tall' | 'Appliance') || 'Base',
      dimensions: {
        width: catalogItem.defaultWidth || 600,
        height: catalogItem.defaultHeight || 720,
        depth: catalogItem.defaultDepth || 580,
      },
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
      position: {
        x: currentRoom.config.width / 2,
        y: 0,
        z: currentRoom.config.depth / 2,
        rotation: 0,
      },
    });

    selectCabinet(newCabinet.instanceId);
    toast.success(`${catalogItem.name} added`, { description: 'Drag to position in the scene' });
  }, [currentRoom, addCabinet, selectCabinet]);

  const handleEditCabinet = (cabinet: ConfiguredCabinet) => {
    if (!currentRoom) return;
    navigate(`/trade/job/${jobId}/room/${currentRoom.id}/configure/${cabinet.definitionId}?edit=${cabinet.instanceId}`);
  };

  const handleCloseInlineConfig = () => {
    setShowInlineConfig(false);
    selectCabinet(null);
  };

  const handleOpenFullEditor = () => {
    if (selectedCabinet && currentRoom) {
      navigate(`/trade/job/${jobId}/room/${currentRoom.id}/configure/${selectedCabinet.definitionId}?edit=${selectedCabinet.instanceId}`);
    }
  };

  // Helper function to get catalog item info (simplified)
  function getCatalogItemForQuickAdd(productId: string) {
    // This would normally come from useCatalog hook
    // For now, return mock data
    return {
      id: productId,
      name: 'Cabinet',
      category: 'Base',
      defaultWidth: 600,
      defaultHeight: 720,
      defaultDepth: 580,
    };
  }

  if (!currentRoom) {
    return (
      <TradeLayout>
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <Box className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Loading Room...</h2>
            <p className="text-sm text-muted-foreground">Setting up your workspace</p>
          </div>
        </div>
      </TradeLayout>
    );
  }

  return (
    <TradeLayout>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate(`/trade/job/${jobId}`)}
            >
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
            {/* View Controls */}
            <div className="flex items-center gap-1 border rounded-md p-1 mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Redo2 className="w-4 h-4" />
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Maximize className="w-4 h-4" />
              </Button>
            </div>

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
            <Button variant="outline" size="sm">
              <FileDown className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button size="sm" className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy">
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Catalog Sidebar */}
          {showCatalog && (
            <PlacementToolbar onSelectProduct={handleAddProduct} />
          )}

          {/* 3D Scene */}
          <div className="flex-1 flex flex-col">
            <PlannerScene
              room={currentRoom}
              cabinets={cabinets}
              onCabinetSelect={handleCabinetSelect}
              onCabinetPlace={handleCabinetPlace}
              className="flex-1"
            />

            {/* Inline Configurator */}
            {showInlineConfig && selectedCabinet && (
              <InlineConfigurator
                roomId={currentRoom.id}
                cabinet={selectedCabinet}
                onClose={handleCloseInlineConfig}
                onOpenFull={handleOpenFullEditor}
              />
            )}
          </div>

          {/* Cabinet List Panel */}
          <CabinetListPanel
            roomId={currentRoom.id}
            cabinets={cabinets}
            onEditCabinet={handleEditCabinet}
            onSelectCabinet={handleCabinetSelect}
            className="w-72"
          />
        </div>
      </div>
    </TradeLayout>
  );
}
