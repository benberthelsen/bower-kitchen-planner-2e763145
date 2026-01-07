import React, { useState } from 'react';
import { ConfiguredCabinet, CabinetDimensions, CabinetMaterials, CabinetHardware, useTradeRoom } from '@/contexts/TradeRoomContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FINISH_OPTIONS, HANDLE_OPTIONS } from '@/constants';
import { 
  Ruler, 
  Palette, 
  Wrench,
  MapPin,
  RotateCw,
  Maximize2
} from 'lucide-react';

interface CabinetEditDialogProps {
  roomId: string;
  cabinet: ConfiguredCabinet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFullEditor: () => void;
}

export function CabinetEditDialog({
  roomId,
  cabinet,
  open,
  onOpenChange,
  onOpenFullEditor,
}: CabinetEditDialogProps) {
  const { updateCabinet } = useTradeRoom();
  const [activeTab, setActiveTab] = useState('dimensions');

  if (!cabinet) return null;

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

  const categoryColors: Record<string, string> = {
    Base: 'bg-blue-500/10 text-blue-600',
    Wall: 'bg-green-500/10 text-green-600',
    Tall: 'bg-purple-500/10 text-purple-600',
    Appliance: 'bg-orange-500/10 text-orange-600',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold text-trade-amber">
              {cabinet.cabinetNumber}
            </span>
            <DialogTitle className="text-trade-navy">
              {cabinet.productName}
            </DialogTitle>
          </div>
          
          {/* Position & Category Info */}
          <div className="flex items-center gap-3 mt-2 pt-2 border-t">
            <Badge 
              variant="secondary" 
              className={categoryColors[cabinet.category] || 'bg-gray-500/10 text-gray-600'}
            >
              {cabinet.category}
            </Badge>
            {cabinet.position && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                X: {Math.round(cabinet.position.x)}mm, Z: {Math.round(cabinet.position.z)}mm
              </span>
            )}
            {cabinet.position && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RotateCw className="w-3 h-3" />
                {cabinet.position.rotation}°
              </span>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="dimensions">
              <Ruler className="w-4 h-4 mr-1.5" />
              Dimensions
            </TabsTrigger>
            <TabsTrigger value="materials">
              <Palette className="w-4 h-4 mr-1.5" />
              Materials
            </TabsTrigger>
            <TabsTrigger value="hardware">
              <Wrench className="w-4 h-4 mr-1.5" />
              Hardware
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dimensions" className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Width (mm)</Label>
                <Input
                  type="number"
                  value={cabinet.dimensions.width}
                  onChange={(e) => handleUpdateDimensions({ width: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Height (mm)</Label>
                <Input
                  type="number"
                  value={cabinet.dimensions.height}
                  onChange={(e) => handleUpdateDimensions({ height: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Depth (mm)</Label>
                <Input
                  type="number"
                  value={cabinet.dimensions.depth}
                  onChange={(e) => handleUpdateDimensions({ depth: Number(e.target.value) })}
                />
              </div>
            </div>
            
            {/* Visual dimension preview */}
            <div className="p-4 bg-muted/30 rounded-lg">
              <div className="text-xs text-muted-foreground mb-2">Cabinet Dimensions</div>
              <div className="flex items-center justify-center gap-6 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-trade-navy">{cabinet.dimensions.width}</div>
                  <div className="text-xs text-muted-foreground">Width</div>
                </div>
                <span className="text-muted-foreground">×</span>
                <div className="text-center">
                  <div className="font-semibold text-trade-navy">{cabinet.dimensions.height}</div>
                  <div className="text-xs text-muted-foreground">Height</div>
                </div>
                <span className="text-muted-foreground">×</span>
                <div className="text-center">
                  <div className="font-semibold text-trade-navy">{cabinet.dimensions.depth}</div>
                  <div className="text-xs text-muted-foreground">Depth</div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="materials" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Exterior Finish</Label>
                <Select
                  value={cabinet.materials.exteriorFinish}
                  onValueChange={(value) => handleUpdateMaterials({ exteriorFinish: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINISH_OPTIONS.map((finish) => (
                      <SelectItem key={finish.id} value={finish.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full border"
                            style={{ backgroundColor: finish.hex }}
                          />
                          {finish.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Door Style</Label>
                <Select
                  value={cabinet.materials.doorStyle}
                  onValueChange={(value) => handleUpdateMaterials({ doorStyle: value })}
                >
                  <SelectTrigger>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Carcase Finish</Label>
                <Select
                  value={cabinet.materials.carcaseFinish}
                  onValueChange={(value) => handleUpdateMaterials({ carcaseFinish: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINISH_OPTIONS.slice(0, 5).map((finish) => (
                      <SelectItem key={finish.id} value={finish.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full border"
                            style={{ backgroundColor: finish.hex }}
                          />
                          {finish.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Edge Banding</Label>
                <Select
                  value={cabinet.materials.edgeBanding}
                  onValueChange={(value) => handleUpdateMaterials({ edgeBanding: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="matching">Matching</SelectItem>
                    <SelectItem value="contrasting">Contrasting</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="hardware" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Handle Type</Label>
                <Select
                  value={cabinet.hardware.handleType}
                  onValueChange={(value) => handleUpdateHardware({ handleType: value })}
                >
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Handle Color</Label>
                <Select
                  value={cabinet.hardware.handleColor}
                  onValueChange={(value) => handleUpdateHardware({ handleColor: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="matte-black">Matte Black</SelectItem>
                    <SelectItem value="brushed-nickel">Brushed Nickel</SelectItem>
                    <SelectItem value="chrome">Chrome</SelectItem>
                    <SelectItem value="brass">Brass</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hinge Type</Label>
                <Select
                  value={cabinet.hardware.hingeType}
                  onValueChange={(value) => handleUpdateHardware({ hingeType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft-close">Soft Close</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="push-open">Push Open</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Drawer Type</Label>
                <Select
                  value={cabinet.hardware.drawerType}
                  onValueChange={(value) => handleUpdateHardware({ drawerType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft-close">Soft Close</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="push-open">Push Open</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div>
                <Label>Soft Close Upgrade</Label>
                <p className="text-xs text-muted-foreground">Apply soft close to all hinges and drawers</p>
              </div>
              <Switch
                checked={cabinet.hardware.softClose}
                onCheckedChange={(checked) => handleUpdateHardware({ softClose: checked })}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onOpenFullEditor}>
            <Maximize2 className="w-4 h-4 mr-1.5" />
            Full Editor
          </Button>
          <Button onClick={() => onOpenChange(false)} className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
