import React, { useState } from 'react';
import { ConfiguredCabinet, CabinetDimensions, CabinetMaterials, CabinetHardware, useTradeRoom } from '@/contexts/TradeRoomContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FINISH_OPTIONS, HANDLE_OPTIONS } from '@/constants';
import { 
  X, 
  Maximize2, 
  Ruler, 
  Palette, 
  Wrench,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineConfiguratorProps {
  roomId: string;
  cabinet: ConfiguredCabinet;
  onClose: () => void;
  onOpenFull: () => void;
  className?: string;
}

export function InlineConfigurator({
  roomId,
  cabinet,
  onClose,
  onOpenFull,
  className,
}: InlineConfiguratorProps) {
  const { updateCabinet } = useTradeRoom();
  const [activeTab, setActiveTab] = useState('dimensions');

  const handleUpdateDimensions = (updates: Partial<CabinetDimensions>) => {
    updateCabinet(roomId, cabinet.instanceId, {
      dimensions: { ...cabinet.dimensions, ...updates },
    });
  };

  const handleUpdateMaterials = (updates: Partial<CabinetMaterials>) => {
    updateCabinet(roomId, cabinet.instanceId, {
      materials: { ...cabinet.materials, ...updates },
    });
  };

  const handleUpdateHardware = (updates: Partial<CabinetHardware>) => {
    updateCabinet(roomId, cabinet.instanceId, {
      hardware: { ...cabinet.hardware, ...updates },
    });
  };

  return (
    <div className={cn("bg-background border-t", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-trade-amber">
            {cabinet.cabinetNumber}
          </span>
          <span className="font-medium text-trade-navy truncate max-w-[200px]">
            {cabinet.productName}
          </span>
          <span className="text-xs text-muted-foreground">
            {cabinet.dimensions.width} × {cabinet.dimensions.height} × {cabinet.dimensions.depth}mm
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onOpenFull}>
            <Maximize2 className="w-4 h-4 mr-1" />
            Full Editor
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Compact Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="p-3">
        <TabsList className="grid grid-cols-3 mb-3">
          <TabsTrigger value="dimensions" className="text-xs">
            <Ruler className="w-3.5 h-3.5 mr-1" />
            Dimensions
          </TabsTrigger>
          <TabsTrigger value="materials" className="text-xs">
            <Palette className="w-3.5 h-3.5 mr-1" />
            Materials
          </TabsTrigger>
          <TabsTrigger value="hardware" className="text-xs">
            <Wrench className="w-3.5 h-3.5 mr-1" />
            Hardware
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dimensions" className="mt-0">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Width (mm)</Label>
              <Input
                type="number"
                value={cabinet.dimensions.width}
                onChange={(e) => handleUpdateDimensions({ width: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Height (mm)</Label>
              <Input
                type="number"
                value={cabinet.dimensions.height}
                onChange={(e) => handleUpdateDimensions({ height: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Depth (mm)</Label>
              <Input
                type="number"
                value={cabinet.dimensions.depth}
                onChange={(e) => handleUpdateDimensions({ depth: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="materials" className="mt-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Exterior Finish</Label>
              <Select
                value={cabinet.materials.exteriorFinish}
                onValueChange={(value) => handleUpdateMaterials({ exteriorFinish: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINISH_OPTIONS.map((finish) => (
                    <SelectItem key={finish.id} value={finish.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full border"
                          style={{ backgroundColor: finish.hex }}
                        />
                        {finish.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Door Style</Label>
              <Select
                value={cabinet.materials.doorStyle}
                onValueChange={(value) => handleUpdateMaterials({ doorStyle: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slab">Slab</SelectItem>
                  <SelectItem value="shaker">Shaker</SelectItem>
                  <SelectItem value="raised-panel">Raised Panel</SelectItem>
                  <SelectItem value="glass">Glass Insert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hardware" className="mt-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Handle Type</Label>
              <Select
                value={cabinet.hardware.handleType}
                onValueChange={(value) => handleUpdateHardware({ handleType: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HANDLE_OPTIONS.map((handle) => (
                    <SelectItem key={handle.id} value={handle.id}>
                      {handle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-5">
              <Label className="text-xs text-muted-foreground">Soft Close</Label>
              <Switch
                checked={cabinet.hardware.softClose}
                onCheckedChange={(checked) => handleUpdateHardware({ softClose: checked })}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
