import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Preview3D } from '@/components/trade/configurator/Preview3D';
import { DimensionsTab } from '@/components/trade/configurator/DimensionsTab';
import { MaterialsTab } from '@/components/trade/configurator/MaterialsTab';
import { HardwareTab } from '@/components/trade/configurator/HardwareTab';
import { AccessoriesTab } from '@/components/trade/configurator/AccessoriesTab';
import { PartsListPanel } from '@/components/trade/configurator/PartsListPanel';
import { 
  ConfiguredCabinet, 
  CabinetDimensions, 
  CabinetMaterials, 
  CabinetHardware, 
  CabinetAccessories,
  useTradeRoom,
  defaultMaterialDefaults,
  defaultHardwareDefaults
} from '@/contexts/TradeRoomContext';
import { useCatalog, useCatalogItem } from '@/hooks/useCatalog';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Ruler, 
  Palette, 
  Wrench, 
  Layers, 
  Plus, 
  Save,
  RotateCcw,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ProductConfigurator() {
  const { jobId, roomId, productId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentRoom, addCabinet } = useTradeRoom();
  
  const catalogItem = useCatalogItem(productId || null);
  const [showPartsList, setShowPartsList] = useState(true);
  const [activeTab, setActiveTab] = useState('dimensions');
  
  // Initialize cabinet state from catalog item or editing cabinet
  const [cabinet, setCabinet] = useState<ConfiguredCabinet>(() => {
    const editId = searchParams.get('edit');
    const editingCabinet = editId && currentRoom?.cabinets.find(c => c.instanceId === editId);
    
    if (editingCabinet) {
      return editingCabinet;
    }
    
    // Create new cabinet from catalog item defaults
    return {
      instanceId: '',
      definitionId: productId || '',
      cabinetNumber: '',
      productName: catalogItem?.name || 'Cabinet',
      category: (catalogItem?.category as 'Base' | 'Wall' | 'Tall' | 'Appliance') || 'Base',
      dimensions: {
        width: catalogItem?.defaultWidth || 600,
        height: catalogItem?.defaultHeight || 720,
        depth: catalogItem?.defaultDepth || 580,
      },
      materials: {
        exteriorFinish: currentRoom?.materialDefaults.exteriorFinish || defaultMaterialDefaults.exteriorFinish,
        carcaseFinish: currentRoom?.materialDefaults.carcaseFinish || defaultMaterialDefaults.carcaseFinish,
        doorStyle: currentRoom?.materialDefaults.doorStyle || defaultMaterialDefaults.doorStyle,
        edgeBanding: currentRoom?.materialDefaults.edgeBanding || defaultMaterialDefaults.edgeBanding,
      },
      hardware: {
        handleType: currentRoom?.hardwareDefaults.handleType || defaultHardwareDefaults.handleType,
        handleColor: 'matte-black',
        hingeType: currentRoom?.hardwareDefaults.hingeType || defaultHardwareDefaults.hingeType,
        drawerType: currentRoom?.hardwareDefaults.drawerType || defaultHardwareDefaults.drawerType,
        softClose: currentRoom?.hardwareDefaults.softClose ?? defaultHardwareDefaults.softClose,
      },
      accessories: {
        shelfCount: 2,
        adjustableShelves: true,
        dividers: false,
        softCloseUpgrade: false,
        specialFittings: [],
      },
      isPlaced: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  // Update cabinet when catalog item loads
  useEffect(() => {
    if (catalogItem && !searchParams.get('edit')) {
      setCabinet(prev => ({
        ...prev,
        productName: catalogItem.name,
        category: (catalogItem.category as 'Base' | 'Wall' | 'Tall' | 'Appliance') || 'Base',
        dimensions: {
          width: catalogItem.defaultWidth,
          height: catalogItem.defaultHeight,
          depth: catalogItem.defaultDepth,
        },
      }));
    }
  }, [catalogItem, searchParams]);

  const handleUpdateDimensions = (updates: Partial<CabinetDimensions>) => {
    setCabinet(prev => ({
      ...prev,
      dimensions: { ...prev.dimensions, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleUpdateMaterials = (updates: Partial<CabinetMaterials>) => {
    setCabinet(prev => ({
      ...prev,
      materials: { ...prev.materials, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleUpdateHardware = (updates: Partial<CabinetHardware>) => {
    setCabinet(prev => ({
      ...prev,
      hardware: { ...prev.hardware, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleUpdateAccessories = (updates: Partial<CabinetAccessories>) => {
    setCabinet(prev => ({
      ...prev,
      accessories: { ...prev.accessories, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleReset = () => {
    if (catalogItem) {
      setCabinet(prev => ({
        ...prev,
        dimensions: {
          width: catalogItem.defaultWidth,
          height: catalogItem.defaultHeight,
          depth: catalogItem.defaultDepth,
        },
        updatedAt: new Date(),
      }));
      toast.info('Dimensions reset to defaults');
    }
  };

  const handleAddToRoom = () => {
    if (!roomId) {
      toast.error('No room selected');
      return;
    }
    
    const newCabinet = addCabinet(roomId, {
      definitionId: cabinet.definitionId,
      productName: cabinet.productName,
      category: cabinet.category,
      dimensions: cabinet.dimensions,
      materials: cabinet.materials,
      hardware: cabinet.hardware,
      accessories: cabinet.accessories,
      isPlaced: false,
    });
    
    toast.success(`${cabinet.productName} added to room`, {
      description: `Cabinet ${newCabinet.cabinetNumber} configured successfully`,
    });
    
    navigate(`/trade/job/${jobId}/room/${roomId}/planner`);
  };

  const handleSaveAndContinue = () => {
    if (!roomId) {
      toast.error('No room selected');
      return;
    }
    
    addCabinet(roomId, {
      definitionId: cabinet.definitionId,
      productName: cabinet.productName,
      category: cabinet.category,
      dimensions: cabinet.dimensions,
      materials: cabinet.materials,
      hardware: cabinet.hardware,
      accessories: cabinet.accessories,
      isPlaced: false,
    });
    
    toast.success(`${cabinet.productName} added`, {
      description: 'Select another product to configure',
    });
    
    navigate(`/trade/job/${jobId}/room/${roomId}/catalog`);
  };

  const handleBack = () => {
    if (roomId) {
      navigate(`/trade/job/${jobId}/room/${roomId}/catalog`);
    } else {
      navigate(`/trade/catalog`);
    }
  };

  const dimensionConstraints = useMemo(() => {
    if (!catalogItem) return undefined;
    // Could derive from catalog item metadata
    return {
      minWidth: 150,
      maxWidth: 1200,
      minHeight: cabinet.category === 'Base' ? 600 : 200,
      maxHeight: cabinet.category === 'Tall' ? 2400 : cabinet.category === 'Wall' ? 900 : 900,
      minDepth: cabinet.category === 'Wall' ? 200 : 400,
      maxDepth: cabinet.category === 'Wall' ? 400 : 700,
    };
  }, [catalogItem, cabinet.category]);

  return (
    <TradeLayout>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-trade-navy">{cabinet.productName}</h1>
              <p className="text-sm text-muted-foreground">
                {cabinet.category} Cabinet • {cabinet.dimensions.width} × {cabinet.dimensions.height} × {cabinet.dimensions.depth}mm
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowPartsList(!showPartsList)}
            >
              {showPartsList ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* 3D Preview */}
          <div className={`flex-1 p-4 ${showPartsList ? 'w-[45%]' : 'w-[60%]'} transition-all`}>
            <Preview3D cabinet={cabinet} className="h-full" />
          </div>
          
          {/* Configuration Panel */}
          <div className={`border-l bg-background ${showPartsList ? 'w-[30%]' : 'w-[40%]'} transition-all`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid grid-cols-4 m-4 mb-0">
                <TabsTrigger value="dimensions" className="flex items-center gap-1.5 text-xs">
                  <Ruler className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dimensions</span>
                </TabsTrigger>
                <TabsTrigger value="materials" className="flex items-center gap-1.5 text-xs">
                  <Palette className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Materials</span>
                </TabsTrigger>
                <TabsTrigger value="hardware" className="flex items-center gap-1.5 text-xs">
                  <Wrench className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hardware</span>
                </TabsTrigger>
                <TabsTrigger value="accessories" className="flex items-center gap-1.5 text-xs">
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Extras</span>
                </TabsTrigger>
              </TabsList>
              
              <ScrollArea className="flex-1">
                <TabsContent value="dimensions" className="m-0 mt-0">
                  <DimensionsTab 
                    cabinet={cabinet} 
                    onUpdate={handleUpdateDimensions}
                    constraints={dimensionConstraints}
                  />
                </TabsContent>
                <TabsContent value="materials" className="m-0 mt-0">
                  <MaterialsTab cabinet={cabinet} onUpdate={handleUpdateMaterials} />
                </TabsContent>
                <TabsContent value="hardware" className="m-0 mt-0">
                  <HardwareTab cabinet={cabinet} onUpdate={handleUpdateHardware} />
                </TabsContent>
                <TabsContent value="accessories" className="m-0 mt-0">
                  <AccessoriesTab cabinet={cabinet} onUpdate={handleUpdateAccessories} />
                </TabsContent>
              </ScrollArea>
              
              {/* Action Buttons */}
              <div className="p-4 border-t space-y-2">
                <Button onClick={handleAddToRoom} className="w-full bg-trade-amber hover:bg-trade-amber/90 text-trade-navy">
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Room
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </Button>
                <Button variant="outline" onClick={handleSaveAndContinue} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  Save & Add Another
                </Button>
              </div>
            </Tabs>
          </div>
          
          {/* Parts List Panel */}
          {showPartsList && (
            <div className="w-[25%] min-w-[280px]">
              <PartsListPanel cabinet={cabinet} className="h-full" />
            </div>
          )}
        </div>
      </div>
    </TradeLayout>
  );
}
