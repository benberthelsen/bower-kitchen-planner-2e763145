import React, { useEffect, useState } from 'react';
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
import { useMaterialsCatalog } from '@/hooks/useMaterialsCatalog';
import { useCatalogItem } from '@/hooks/useCatalog';
import { distributeDrawerHeights, DRAWER_BOX_FACE_OFFSET_MM } from '@/lib/drawerHeights';
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
  onCabinetPatch?: (instanceId: string, updates: Partial<ConfiguredCabinet>) => Promise<void> | void;
}

export function CabinetEditDialog({
  roomId,
  cabinet,
  open,
  onOpenChange,
  onOpenFullEditor,
  onCabinetPatch,
}: CabinetEditDialogProps) {
  const { updateCabinet, getRoomById } = useTradeRoom();
  const { hinges, drawerRunners } = useMaterialsCatalog();
  const hingeChoices = hinges.length > 0
    ? hinges.map(h => ({ value: h.id, label: h.name }))
    : [{ value: 'soft-close', label: 'Soft Close' }, { value: 'standard', label: 'Standard' }, { value: 'push-open', label: 'Push Open' }];
  const drawerChoices = drawerRunners.length > 0
    ? drawerRunners.map(d => ({ value: d.id, label: d.name }))
    : [{ value: 'soft-close', label: 'Soft Close' }, { value: 'standard', label: 'Standard' }, { value: 'push-open', label: 'Push Open' }];
  const [activeTab, setActiveTab] = useState('dimensions');
  const catalogItem = useCatalogItem(cabinet?.definitionId ?? null);

  useEffect(() => {
    if (!open) setActiveTab('dimensions');
  }, [open]);

  // Local draft for the W/H/D fields so the user can clear a field and type a
  // fresh value. Committing (with the min clamps) happens on blur/Enter — the
  // old code clamped on every keystroke, so clearing "600" to type "900"
  // momentarily hit Number('')=0 → clamped to 150 and blocked the edit.
  const [dimDraft, setDimDraft] = useState<{ width: string; height: string; depth: string }>(
    { width: '', height: '', depth: '' },
  );
  useEffect(() => {
    if (!cabinet) return;
    setDimDraft({
      width: String(cabinet.dimensions.width),
      height: String(cabinet.dimensions.height),
      depth: String(cabinet.dimensions.depth),
    });
  }, [cabinet?.instanceId, cabinet?.dimensions.width, cabinet?.dimensions.height, cabinet?.dimensions.depth]);

  if (!cabinet) return null;

  // Cabinets inherit materials/hardware from the room defaults and only store a
  // value when explicitly overridden — so the quick-editor selects must fall back
  // to the room defaults, otherwise they render blank (the full editor already
  // resolves this). Effective = per-cabinet value → room default.
  const room = getRoomById(roomId);
  const md = room?.materialDefaults;
  const hd = room?.hardwareDefaults;
  const eff = {
    exteriorFinish: cabinet.materials.exteriorFinish || md?.exteriorFinish,
    doorStyle: cabinet.materials.doorStyle || md?.doorStyle,
    carcaseFinish: cabinet.materials.carcaseFinish || md?.carcaseFinish,
    edgeBanding: cabinet.materials.edgeBanding || md?.edgeBanding,
    handleType: cabinet.hardware.handleType || hd?.handleType,
    handleColor: cabinet.hardware.handleColor || hd?.handleColor,
    hingeType: cabinet.hardware.hingeType || hd?.hingeType,
    drawerType: cabinet.hardware.drawerType || hd?.drawerType,
  };

  const isCornerCabinet = /corner|pie[-_ ]?cut|blind|diagonal/i.test(cabinet.definitionId || '');
  // Dishwasher / appliance openings can carry a benchtop-support top rail.
  const isApplianceOpening = /dishwasher|_opening|appliance/i.test(cabinet.definitionId || '');

  // #20 — per-drawer front heights
  const drawerCount = catalogItem?.renderConfig?.drawerCount ?? 0;
  const drawerOpening = Math.max(0, cabinet.dimensions.height - (cabinet.category === 'Wall' ? 0 : 135));
  const customFaces = cabinet.construction?.drawerFrontHeights;
  const hasCustomFaces = !!customFaces && customFaces.length === drawerCount;
  // Show the user's raw values while editing (no live re-normalisation — that
  // made typed values jump). Scaling to the opening happens in render/BOM.
  const effectiveFaces = drawerCount > 0
    ? (hasCustomFaces
        ? customFaces.map((h) => Math.round(h))
        : distributeDrawerHeights(drawerCount, drawerOpening).map((h) => Math.round(h)))
    : [];
  const facesSum = effectiveFaces.reduce((a, b) => a + b, 0);

  const handleUpdateConstruction = (updates: Partial<NonNullable<ConfiguredCabinet['construction']>>) => {
    const next = { ...(cabinet.construction || {}), ...updates };
    updateCabinet(roomId, cabinet.instanceId, { construction: next });
    // Route through the parent save path too (review #6) — dims/materials/
    // hardware all do this; without it corner depths & drawer-face edits update
    // context but never persist, so they can be silently lost on save/reload.
    onCabinetPatch?.(cabinet.instanceId, { construction: next });
  };

  const handleUpdateDimensions = (updates: Partial<CabinetDimensions>) => {
    const next = {
      width: Math.max(150, updates.width ?? cabinet.dimensions.width),
      height: Math.max(200, updates.height ?? cabinet.dimensions.height),
      depth: Math.max(200, updates.depth ?? cabinet.dimensions.depth),
    };

    updateCabinet(roomId, cabinet.instanceId, { dimensions: next });
    onCabinetPatch?.(cabinet.instanceId, { dimensions: next });
  };

  // Commit a dimension draft field (blur/Enter). Empty/invalid falls back to the
  // current value; the min clamps live in handleUpdateDimensions.
  const commitDimension = (field: 'width' | 'height' | 'depth') => {
    const val = Number(dimDraft[field]);
    if (Number.isFinite(val) && val > 0) {
      handleUpdateDimensions({ [field]: val });
    } else {
      // reset the field back to the live value
      setDimDraft((d) => ({ ...d, [field]: String(cabinet.dimensions[field]) }));
    }
  };

  const handleUpdateMaterials = (updates: Partial<CabinetMaterials>) => {
    const next = { ...cabinet.materials, ...updates };
    updateCabinet(roomId, cabinet.instanceId, { materials: next });
    onCabinetPatch?.(cabinet.instanceId, { materials: next });
  };

  const handleUpdateHardware = (updates: Partial<CabinetHardware>) => {
    const next = { ...cabinet.hardware, ...updates };
    updateCabinet(roomId, cabinet.instanceId, { hardware: next });
    onCabinetPatch?.(cabinet.instanceId, { hardware: next });
  };

  const handleUpdateMounting = (y: number) => {
    const next = { ...(cabinet.position ?? { x: 0, y: 0, z: 0, rotation: 0 }), y: Math.max(0, y) };
    updateCabinet(roomId, cabinet.instanceId, { position: next });
    onCabinetPatch?.(cabinet.instanceId, { position: next });
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
                  value={dimDraft.width}
                  onChange={(e) => setDimDraft((d) => ({ ...d, width: e.target.value }))}
                  onBlur={() => commitDimension('width')}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              </div>
              <div className="space-y-2">
                <Label>Height (mm)</Label>
                <Input
                  type="number"
                  value={dimDraft.height}
                  onChange={(e) => setDimDraft((d) => ({ ...d, height: e.target.value }))}
                  onBlur={() => commitDimension('height')}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              </div>
              <div className="space-y-2">
                <Label>Depth (mm)</Label>
                <Input
                  type="number"
                  value={dimDraft.depth}
                  onChange={(e) => setDimDraft((d) => ({ ...d, depth: e.target.value }))}
                  onBlur={() => commitDimension('depth')}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              </div>
            </div>

            {isApplianceOpening && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <Label>Top rail</Label>
                  <p className="text-xs text-muted-foreground">Front + back rails across the opening to carry the benchtop.</p>
                </div>
                <Switch
                  checked={cabinet.construction?.topRail !== false}
                  onCheckedChange={(checked) => handleUpdateConstruction({ topRail: checked })}
                />
              </div>
            )}

            {/* Wall/upper cabinets are mounted up off the floor */}
            {cabinet.category === 'Wall' && (
              <div className="space-y-2">
                <Label>Mounting Height — floor to underside (mm)</Label>
                <Input
                  type="number"
                  value={cabinet.position?.y || 1350}
                  onChange={(e) => handleUpdateMounting(Number(e.target.value))}
                />
                <div className="text-xs text-muted-foreground">Standard 1350mm floor to underside (editable).</div>
              </div>
            )}

            {/* #20 — Drawer front heights (mm, top → bottom) */}
            {drawerCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Drawer Front Heights (mm, top → bottom)</Label>
                  {customFaces && customFaces.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleUpdateConstruction({ drawerFrontHeights: undefined })}
                    >
                      Reset to standard
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {effectiveFaces.map((face, i) => (
                    <div key={i} className="space-y-1">
                      <div className="text-[10px] text-muted-foreground text-center">D{i + 1}</div>
                      <Input
                        type="number"
                        min={DRAWER_BOX_FACE_OFFSET_MM + 40}
                        value={face}
                        onChange={(e) => {
                          const next = [...effectiveFaces];
                          next[i] = Math.max(1, Number(e.target.value) || 0);
                          handleUpdateConstruction({ drawerFrontHeights: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total {facesSum}mm of ~{drawerOpening}mm opening. Drawer box side = face − {DRAWER_BOX_FACE_OFFSET_MM}mm.
                  {hasCustomFaces && Math.abs(facesSum - drawerOpening) > 2 ? ' Heights will be scaled proportionally to fit the opening.' : ''}
                </div>
              </div>
            )}

            {/* Corner cabinet construction prompts (Microvellum names) */}
            {isCornerCabinet && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cabinet Depth Left (mm)</Label>
                  <Input
                    type="number"
                    value={cabinet.construction?.cabinetDepthLeft ?? 575}
                    onChange={(e) => handleUpdateConstruction({ cabinetDepthLeft: Number(e.target.value) })}
                  />
                  <div className="text-xs text-muted-foreground">
                    PieCut Distance Left: {Math.max(0, cabinet.dimensions.width - (cabinet.construction?.cabinetDepthLeft ?? 575))}mm
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cabinet Depth Right (mm)</Label>
                  <Input
                    type="number"
                    value={cabinet.construction?.cabinetDepthRight ?? 575}
                    onChange={(e) => handleUpdateConstruction({ cabinetDepthRight: Number(e.target.value) })}
                  />
                  <div className="text-xs text-muted-foreground">
                    PieCut Distance Right: {Math.max(0, cabinet.dimensions.depth - (cabinet.construction?.cabinetDepthRight ?? 575))}mm
                  </div>
                </div>
              </div>
            )}

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
                  value={eff.exteriorFinish}
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
                  value={eff.doorStyle}
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
                  value={eff.carcaseFinish}
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
                  value={eff.edgeBanding}
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
                  value={eff.handleType}
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
                  value={eff.handleColor}
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
                  value={eff.hingeType}
                  onValueChange={(value) => handleUpdateHardware({ hingeType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hingeChoices.map((h) => (
                      <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Drawer Type</Label>
                <Select
                  value={eff.drawerType}
                  onValueChange={(value) => handleUpdateHardware({ drawerType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {drawerChoices.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
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
