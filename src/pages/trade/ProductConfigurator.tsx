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
  CabinetConstruction,
  useTradeRoom,
  defaultMaterialDefaults,
  defaultHardwareDefaults,
} from '@/contexts/TradeRoomContext';
import { useCatalogItem } from '@/hooks/useCatalog';
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
  PanelRightClose,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';

function buildNewCabinet(params: {
  productId: string;
  productName: string;
  category: 'Base' | 'Wall' | 'Tall' | 'Appliance';
  width: number;
  height: number;
  depth: number;
  currentRoom?: ReturnType<typeof useTradeRoom>['currentRoom'];
}): ConfiguredCabinet {
  const { productId, productName, category, width, height, depth, currentRoom } = params;

  return {
    instanceId: '',
    definitionId: productId,
    cabinetNumber: '',
    productName,
    category,
    dimensions: { width, height, depth },
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
}


function cloneCabinet(cabinet: ConfiguredCabinet): ConfiguredCabinet {
  return {
    ...cabinet,
    dimensions: { ...cabinet.dimensions },
    materials: { ...cabinet.materials },
    hardware: { ...cabinet.hardware },
    accessories: {
      ...cabinet.accessories,
      specialFittings: [...(cabinet.accessories.specialFittings || [])],
    },
    position: cabinet.position ? { ...cabinet.position } : undefined,
    createdAt: new Date(cabinet.createdAt),
    updatedAt: new Date(cabinet.updatedAt),
  };
}

export default function ProductConfigurator() {
  const { jobId, roomId, productId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    currentRoom,
    setCurrentRoom,
    getRoomById,
    addCabinet,
    replaceCabinet,
    removeCabinet,
  } = useTradeRoom();
  const { upsertCabinet } = useTradeJobPersistence(jobId);

  const catalogItem = useCatalogItem(productId || null);
  const [showPartsList, setShowPartsList] = useState(true);
  const [activeTab, setActiveTab] = useState('dimensions');

  const editId = searchParams.get('edit');
  const editingCabinet = useMemo(
    () => (editId && currentRoom ? currentRoom.cabinets.find((c) => c.instanceId === editId) || null : null),
    [editId, currentRoom],
  );
  const isEditing = Boolean(editingCabinet);
  const isEditRoute = Boolean(editId);

  useEffect(() => {
    if (!roomId) return;
    const room = getRoomById(roomId);
    setCurrentRoom(room);
  }, [roomId, getRoomById, setCurrentRoom]);

  const [cabinet, setCabinet] = useState<ConfiguredCabinet>(() =>
    buildNewCabinet({
      productId: productId || '',
      productName: catalogItem?.name || 'Cabinet',
      category: (catalogItem?.category as 'Base' | 'Wall' | 'Tall' | 'Appliance') || 'Base',
      width: catalogItem?.defaultWidth || 600,
      height: catalogItem?.defaultHeight || 720,
      depth: catalogItem?.defaultDepth || 580,
      currentRoom,
    }),
  );

  const [initialSnapshot, setInitialSnapshot] = useState<ConfiguredCabinet>(cabinet);

  useEffect(() => {
    if (editingCabinet) {
      const snapshot = cloneCabinet(editingCabinet);
      setCabinet(snapshot);
      setInitialSnapshot(snapshot);
      return;
    }

    if (catalogItem && !editId) {
      const next = buildNewCabinet({
        productId: productId || '',
        productName: catalogItem.name,
        category: (catalogItem.category as 'Base' | 'Wall' | 'Tall' | 'Appliance') || 'Base',
        width: catalogItem.defaultWidth,
        height: catalogItem.defaultHeight,
        depth: catalogItem.defaultDepth,
        currentRoom,
      });
      setCabinet(cloneCabinet(next));
      setInitialSnapshot(cloneCabinet(next));
    }
  }, [catalogItem, currentRoom, editId, editingCabinet, productId]);

  const persistCabinet = async (cabinetToPersist: ConfiguredCabinet) => {
    if (!jobId || jobId === 'new' || !roomId || !currentRoom) return;
    await upsertCabinet({ jobId, roomId, cabinet: cabinetToPersist, roomFallback: currentRoom });
  };

  const handleUpdateDimensions = (updates: Partial<CabinetDimensions>) => {
    setCabinet((prev) => ({
      ...prev,
      dimensions: { ...prev.dimensions, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleUpdateMaterials = (updates: Partial<CabinetMaterials>) => {
    setCabinet((prev) => ({
      ...prev,
      materials: { ...prev.materials, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleUpdateHardware = (updates: Partial<CabinetHardware>) => {
    setCabinet((prev) => ({
      ...prev,
      hardware: { ...prev.hardware, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleUpdateAccessories = (updates: Partial<CabinetAccessories>) => {
    setCabinet((prev) => ({
      ...prev,
      accessories: { ...prev.accessories, ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleUpdateConstruction = (updates: Partial<CabinetConstruction>) => {
    setCabinet((prev) => ({
      ...prev,
      construction: { ...(prev.construction || {}), ...updates },
      updatedAt: new Date(),
    }));
  };

  const handleReset = () => {
    setCabinet(cloneCabinet(initialSnapshot));
    toast.info(isEditing ? 'Changes reverted' : 'Configuration reset to defaults');
  };

  const handleAddToRoom = async () => {
    if (!roomId || !currentRoom) {
      toast.error('No room selected');
      return;
    }

    if (isEditRoute && !editingCabinet) {
      toast.error('Cabinet to edit could not be loaded');
      return;
    }

    try {
      if (isEditing && editingCabinet) {
        const previousCabinet = cloneCabinet(editingCabinet);
        const updatedCabinet: ConfiguredCabinet = {
          ...editingCabinet,
          ...cabinet,
          instanceId: editingCabinet.instanceId,
          cabinetNumber: editingCabinet.cabinetNumber,
          createdAt: editingCabinet.createdAt,
          updatedAt: new Date(),
          position: editingCabinet.position,
          isPlaced: editingCabinet.isPlaced,
        };

        replaceCabinet(roomId, updatedCabinet);
        try {
          await persistCabinet(updatedCabinet);
        } catch {
          replaceCabinet(roomId, previousCabinet);
          throw new Error('persist_failed');
        }

        toast.success(`${updatedCabinet.cabinetNumber} updated`, {
          description: 'Changes saved to room and persisted.',
        });
      } else {
        const newCabinet = addCabinet(roomId, {
          definitionId: cabinet.definitionId,
          productName: cabinet.productName,
          category: cabinet.category,
          dimensions: cabinet.dimensions,
          materials: cabinet.materials,
          hardware: cabinet.hardware,
          accessories: cabinet.accessories,
          construction: cabinet.construction,
          isPlaced: false,
        });

        try {
          await persistCabinet(newCabinet);
        } catch {
          removeCabinet(roomId, newCabinet.instanceId);
          throw new Error('persist_failed');
        }

        toast.success(`${cabinet.productName} added to room`, {
          description: `Cabinet ${newCabinet.cabinetNumber} configured successfully`,
        });
      }

      navigate(`/trade/job/${jobId}/room/${roomId}/planner`);
    } catch {
      toast.error(isEditing ? 'Failed to update cabinet' : 'Failed to add cabinet');
    }
  };

  const handleSaveAndContinue = async () => {
    if (isEditing || isEditRoute) {
      await handleAddToRoom();
      return;
    }

    if (!roomId || !currentRoom) {
      toast.error('No room selected');
      return;
    }

    try {
      const newCabinet = addCabinet(roomId, {
        definitionId: cabinet.definitionId,
        productName: cabinet.productName,
        category: cabinet.category,
        dimensions: cabinet.dimensions,
        materials: cabinet.materials,
        hardware: cabinet.hardware,
        accessories: cabinet.accessories,
        construction: cabinet.construction,
        isPlaced: false,
      });

      try {
        await persistCabinet(newCabinet);
      } catch {
        removeCabinet(roomId, newCabinet.instanceId);
        throw new Error('persist_failed');
      }

      toast.success(`${cabinet.productName} added`, {
        description: 'Select another product to configure',
      });

      navigate(`/trade/job/${jobId}/room/${roomId}/catalog`);
    } catch {
      toast.error('Failed to save cabinet');
    }
  };

  const handleBack = () => {
    if (roomId) {
      navigate(`/trade/job/${jobId}/room/${roomId}/planner`);
    } else {
      navigate(`/trade/catalog`);
    }
  };

  const dimensionConstraints = useMemo(() => {
    if (!catalogItem) return undefined;
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
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-trade-navy">{cabinet.productName}</h1>
              <p className="text-sm text-muted-foreground">
                {isEditRoute ? (isEditing ? `Editing ${cabinet.cabinetNumber}` : 'Loading cabinet...') : 'New Cabinet'} • {cabinet.category} • {cabinet.dimensions.width} × {cabinet.dimensions.height} × {cabinet.dimensions.depth}mm
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {isEditing ? 'Revert' : 'Reset'}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowPartsList(!showPartsList)}>
              {showPartsList ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className={`flex-1 p-4 ${showPartsList ? 'w-[45%]' : 'w-[60%]'} transition-all`}>
            <Preview3D cabinet={cabinet} className="h-full" />
          </div>

          <div className={`border-l bg-background ${showPartsList ? 'w-[30%]' : 'w-[40%]'} transition-all`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid grid-cols-4 m-4 mb-0">
                <TabsTrigger value="dimensions" className="flex items-center gap-1.5 text-xs"><Ruler className="w-3.5 h-3.5" /><span className="hidden sm:inline">Dimensions</span></TabsTrigger>
                <TabsTrigger value="materials" className="flex items-center gap-1.5 text-xs"><Palette className="w-3.5 h-3.5" /><span className="hidden sm:inline">Materials</span></TabsTrigger>
                <TabsTrigger value="hardware" className="flex items-center gap-1.5 text-xs"><Wrench className="w-3.5 h-3.5" /><span className="hidden sm:inline">Hardware</span></TabsTrigger>
                <TabsTrigger value="accessories" className="flex items-center gap-1.5 text-xs"><Layers className="w-3.5 h-3.5" /><span className="hidden sm:inline">Extras</span></TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <TabsContent value="dimensions" className="m-0 mt-0"><DimensionsTab cabinet={cabinet} onUpdate={handleUpdateDimensions} onUpdateConstruction={handleUpdateConstruction} constraints={dimensionConstraints} /></TabsContent>
                <TabsContent value="materials" className="m-0 mt-0"><MaterialsTab cabinet={cabinet} onUpdate={handleUpdateMaterials} /></TabsContent>
                <TabsContent value="hardware" className="m-0 mt-0"><HardwareTab cabinet={cabinet} onUpdate={handleUpdateHardware} /></TabsContent>
                <TabsContent value="accessories" className="m-0 mt-0"><AccessoriesTab cabinet={cabinet} onUpdate={handleUpdateAccessories} /></TabsContent>
              </ScrollArea>

              <div className="p-4 border-t space-y-2">
                <Button onClick={handleAddToRoom} disabled={isEditRoute && !isEditing} className="w-full bg-trade-amber hover:bg-trade-amber/90 text-trade-navy">
                  <Plus className="w-4 h-4 mr-2" />
                  {isEditing ? 'Update Cabinet' : 'Add to Room'}
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </Button>
                <Button variant="outline" onClick={handleSaveAndContinue} className="w-full" disabled={isEditing || (isEditRoute && !isEditing)}>
                  <Save className="w-4 h-4 mr-2" />
                  Save & Add Another
                </Button>
              </div>
            </Tabs>
          </div>

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
