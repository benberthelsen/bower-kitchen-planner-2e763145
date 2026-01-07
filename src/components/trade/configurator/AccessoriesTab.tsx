import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfiguredCabinet, CabinetAccessories } from '@/contexts/TradeRoomContext';
import { Layers, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AccessoriesTabProps {
  cabinet: ConfiguredCabinet;
  onUpdate: (accessories: Partial<CabinetAccessories>) => void;
}

const specialFittings = [
  { id: 'lazy-susan', name: 'Lazy Susan', description: 'Rotating corner organizer' },
  { id: 'pull-out-waste', name: 'Pull-Out Waste', description: 'Concealed bin system' },
  { id: 'cutlery-divider', name: 'Cutlery Divider', description: 'Drawer organization insert' },
  { id: 'spice-rack', name: 'Spice Rack', description: 'Pull-out spice organizer' },
  { id: 'pot-drawer', name: 'Pot Drawer', description: 'Deep drawer for cookware' },
  { id: 'wine-rack', name: 'Wine Rack', description: 'Built-in wine storage' },
];

export function AccessoriesTab({ cabinet, onUpdate }: AccessoriesTabProps) {
  const handleShelfCountChange = (delta: number) => {
    const newCount = Math.max(0, Math.min(6, cabinet.accessories.shelfCount + delta));
    onUpdate({ shelfCount: newCount });
  };

  const handleFittingToggle = (fittingId: string) => {
    const currentFittings = cabinet.accessories.specialFittings;
    const newFittings = currentFittings.includes(fittingId)
      ? currentFittings.filter(f => f !== fittingId)
      : [...currentFittings, fittingId];
    onUpdate({ specialFittings: newFittings });
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2 text-trade-navy mb-4">
        <Layers className="w-5 h-5" />
        <h3 className="font-semibold">Accessories & Fittings</h3>
      </div>
      
      {/* Shelf Count */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Number of Shelves</Label>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleShelfCountChange(-1)}
            disabled={cabinet.accessories.shelfCount <= 0}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="text-center text-2xl font-bold text-trade-navy">
              {cabinet.accessories.shelfCount}
            </div>
            <Slider
              value={[cabinet.accessories.shelfCount]}
              onValueChange={([value]) => onUpdate({ shelfCount: value })}
              min={0}
              max={6}
              step={1}
              className="mt-2"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleShelfCountChange(1)}
            disabled={cabinet.accessories.shelfCount >= 6}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Adjustable Shelves Toggle */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Adjustable Shelves</Label>
          <p className="text-xs text-muted-foreground">Shelves with adjustable pin positions</p>
        </div>
        <Switch
          checked={cabinet.accessories.adjustableShelves}
          onCheckedChange={(checked) => onUpdate({ adjustableShelves: checked })}
        />
      </div>
      
      {/* Dividers Toggle */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Internal Dividers</Label>
          <p className="text-xs text-muted-foreground">Add vertical dividers for organization</p>
        </div>
        <Switch
          checked={cabinet.accessories.dividers}
          onCheckedChange={(checked) => onUpdate({ dividers: checked })}
        />
      </div>
      
      {/* Soft Close Upgrade */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Soft-Close Upgrade</Label>
          <p className="text-xs text-muted-foreground">Premium soft-close on all doors</p>
        </div>
        <Switch
          checked={cabinet.accessories.softCloseUpgrade}
          onCheckedChange={(checked) => onUpdate({ softCloseUpgrade: checked })}
        />
      </div>
      
      {/* Special Fittings */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Special Fittings</Label>
        <div className="grid gap-2">
          {specialFittings.map((fitting) => (
            <label
              key={fitting.id}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                cabinet.accessories.specialFittings.includes(fitting.id)
                  ? 'border-trade-amber bg-trade-amber/10'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <Checkbox
                checked={cabinet.accessories.specialFittings.includes(fitting.id)}
                onCheckedChange={() => handleFittingToggle(fitting.id)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{fitting.name}</div>
                <div className="text-xs text-muted-foreground">{fitting.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
