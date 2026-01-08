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
import { CabinetEditDialog } from '@/components/trade/planner/CabinetEditDialog';
import { PlacementToolbar } from '@/components/trade/planner/PlacementToolbar';
import { useCatalog } from '@/hooks/useCatalog';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { getCategoryFromSpecGroup } from '@/constants/catalogGroups';
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
  const { catalog } = useCatalog('trade');
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogCabinet, setEditDialogCabinet] = useState<ConfiguredCabinet | null>(null);

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

  // Calculate smart default position for new cabinets
  const calculateDefaultPosition = useCallback((
    room: TradeRoom,
    existingCabinets: ConfiguredCabinet[],
    newCabinetWidth: number
  ) => {
    const placedCabinets = existingCabinets.filter(c => c.isPlaced && c.position);
    
    if (placedCabinets.length === 0) {
      // First cabinet: center of back wall
      return {
        x: room.config.width / 2 - newCabinetWidth / 2,
        y: 0,
        z: 50, // Close to back wall
        rotation: 0
      };
    }
    
    // Find rightmost cabinet
    const sortedByX = [...placedCabinets].sort((a, b) => 
      (b.position!.x + b.dimensions.width) - (a.position!.x + a.dimensions.width)
    );
    const lastCabinet = sortedByX[0];
    
    // Calculate new X position (to the right of last cabinet with small gap)
    const newX = lastCabinet.position!.x + lastCabinet.dimensions.width + 10;
    
    // Check if fits in room, otherwise start new row
    if (newX + newCabinetWidth > room.config.width - 50) {
      // Start new row - find the frontmost Z position
      const sortedByZ = [...placedCabinets].sort((a, b) => 
        (b.position!.z + b.dimensions.depth) - (a.position!.z + a.dimensions.depth)
      );
      const frontCabinet = sortedByZ[0];
      
      return {
        x: 50,
        y: 0,
        z: frontCabinet.position!.z + frontCabinet.dimensions.depth + 100,
        rotation: 0
      };
    }
    
    // Place to the right with small gap
    return {
      x: newX,
      y: 0,
      z: lastCabinet.position!.z,
      rotation: lastCabinet.position!.rotation
    };
  }, []);

  const handleCabinetSelect = (instanceId: string | null) => {
    selectCabinet(instanceId);
  };

  const handleCabinetPlace = (instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => {
    if (currentRoom) {
      placeCabinet(currentRoom.id, instanceId, position);
    }
  };

  // Quick add product - places cabinet immediately and opens edit dialog
  const handleQuickAddProduct = useCallback((productId: string) => {
    if (!currentRoom) return;
    
    // Find catalog item for product info
    const catalogItem = catalog.find(item => item.id === productId);
    if (!catalogItem) {
      toast.error('Product not found');
      return;
    }

    const defaultWidth = catalogItem.defaultWidth || 600;
    const defaultHeight = catalogItem.defaultHeight || 720;
    const defaultDepth = catalogItem.defaultDepth || 580;

    // Calculate smart position
    const position = calculateDefaultPosition(
      currentRoom, 
      cabinets, 
      defaultWidth
    );

    // Determine category from specGroup (Appliances, Wall/Upper, Tall, or Base)
    const category = catalogItem.itemType === 'Appliance' 
      ? 'Appliance' 
      : getCategoryFromSpecGroup(catalogItem.specGroup) || catalogItem.category || 'Base';

    // Create cabinet with placement
    const newCabinet = addCabinet(currentRoom.id, {
      definitionId: productId,
      productName: catalogItem.name,
      category: category as 'Base' | 'Wall' | 'Tall' | 'Appliance',
      dimensions: {
        width: defaultWidth,
        height: defaultHeight,
        depth: defaultDepth,
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
      position,
    });

    // Select the new cabinet
    selectCabinet(newCabinet.instanceId);
    
    // Open the edit dialog
    setEditDialogCabinet(newCabinet);
    setEditDialogOpen(true);

    toast.success(`${catalogItem.name} added`, { 
      description: 'Configure options in the dialog or drag to reposition' 
    });
  }, [currentRoom, catalog, cabinets, addCabinet, selectCabinet, calculateDefaultPosition]);

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
    if (!open) {
      // Keep cabinet selected after closing dialog
    }
  };

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
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => toast.info('Undo', { description: 'Coming soon' })}
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => toast.info('Redo', { description: 'Coming soon' })}
              >
                <Redo2 className="w-4 h-4" />
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => toast.info('Zoom In', { description: 'Use scroll wheel to zoom' })}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => toast.info('Zoom Out', { description: 'Use scroll wheel to zoom' })}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => toast.info('Fit to View', { description: 'Coming soon' })}
              >
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
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => toast.info('Export PDF', { description: 'Coming soon' })}
            >
              <FileDown className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button 
              size="sm" 
              className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy"
              onClick={() => toast.success('Room saved', { description: 'Your changes have been saved' })}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Catalog Sidebar */}
          {showCatalog && (
            <PlacementToolbar onSelectProduct={handleQuickAddProduct} />
          )}

          {/* 3D Scene with Drop Zone */}
          <div 
            className="flex-1 flex flex-col"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.productId) {
                  handleQuickAddProduct(data.productId);
                }
              } catch (err) {
                // Ignore invalid drops
              }
            }}
          >
            <PlannerScene
              room={currentRoom}
              cabinets={cabinets}
              onCabinetSelect={handleCabinetSelect}
              onCabinetPlace={handleCabinetPlace}
              className="flex-1"
            />
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

        {/* Edit Dialog */}
        <CabinetEditDialog
          roomId={currentRoom.id}
          cabinet={editDialogCabinet}
          open={editDialogOpen}
          onOpenChange={handleDialogOpenChange}
          onOpenFullEditor={handleOpenFullEditor}
        />
      </div>
    </TradeLayout>
  );
}
