import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ConfiguredCabinet, CabinetHardware } from '@/contexts/TradeRoomContext';
import { Wrench, GripHorizontal } from 'lucide-react';
import { HANDLE_OPTIONS, HINGE_OPTIONS, DRAWER_OPTIONS } from '@/constants';

interface HardwareTabProps {
  cabinet: ConfiguredCabinet;
  onUpdate: (hardware: Partial<CabinetHardware>) => void;
}

const handleColors = [
  { id: 'matte-black', name: 'Matte Black', hex: '#1a1a1a' },
  { id: 'brushed-nickel', name: 'Brushed Nickel', hex: '#c0c0c0' },
  { id: 'chrome', name: 'Chrome', hex: '#e8e8e8' },
  { id: 'brass', name: 'Brass', hex: '#b5a642' },
  { id: 'copper', name: 'Copper', hex: '#b87333' },
  { id: 'white', name: 'White', hex: '#ffffff' },
];

export function HardwareTab({ cabinet, onUpdate }: HardwareTabProps) {
  const selectedHandle = HANDLE_OPTIONS.find(h => h.id === cabinet.hardware.handleType);
  const selectedColor = handleColors.find(c => c.id === cabinet.hardware.handleColor) || handleColors[0];

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2 text-trade-navy mb-4">
        <Wrench className="w-5 h-5" />
        <h3 className="font-semibold">Hardware Options</h3>
      </div>
      
      {/* Handle Type */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Handle Style</Label>
        <div className="grid grid-cols-2 gap-2">
          {HANDLE_OPTIONS.map((handle) => (
            <button
              key={handle.id}
              onClick={() => onUpdate({ handleType: handle.id })}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                cabinet.hardware.handleType === handle.id
                  ? 'border-trade-amber bg-trade-amber/10'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <div className="w-12 h-12 flex items-center justify-center">
                {handle.type === 'Bar' && (
                  <div className="w-10 h-2 bg-current rounded-full" style={{ color: selectedColor.hex }} />
                )}
                {handle.type === 'Knob' && (
                  <div className="w-4 h-4 bg-current rounded-full" style={{ color: selectedColor.hex }} />
                )}
                {handle.type === 'Lip' && (
                  <div className="w-8 h-1 bg-current rounded-t-full" style={{ color: selectedColor.hex }} />
                )}
                {handle.type === 'None' && (
                  <GripHorizontal className="w-6 h-6 text-muted-foreground/50" />
                )}
              </div>
              <span className="text-sm font-medium">{handle.name}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Handle Color */}
      {cabinet.hardware.handleType !== 'none' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Handle Finish</Label>
          <div className="flex flex-wrap gap-2">
            {handleColors.map((color) => (
              <button
                key={color.id}
                onClick={() => onUpdate({ handleColor: color.id })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                  cabinet.hardware.handleColor === color.id
                    ? 'border-trade-amber bg-trade-amber/10'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full border border-border shadow-sm"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="text-sm">{color.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Hinge Type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Hinge Type</Label>
        <Select
          value={cabinet.hardware.hingeType}
          onValueChange={(value) => onUpdate({ hingeType: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select hinge type" />
          </SelectTrigger>
          <SelectContent>
            {HINGE_OPTIONS.map((hinge) => (
              <SelectItem key={hinge} value={hinge.toLowerCase().replace(/\s+/g, '-')}>
                {hinge}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Drawer Type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Drawer Runner Type</Label>
        <Select
          value={cabinet.hardware.drawerType}
          onValueChange={(value) => onUpdate({ drawerType: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select drawer type" />
          </SelectTrigger>
          <SelectContent>
            {DRAWER_OPTIONS.map((drawer) => (
              <SelectItem key={drawer} value={drawer.toLowerCase().replace(/\s+/g, '-')}>
                {drawer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Soft Close Toggle */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Soft-Close Upgrade</Label>
          <p className="text-xs text-muted-foreground">Add soft-close to all hinges and drawers</p>
        </div>
        <Switch
          checked={cabinet.hardware.softClose}
          onCheckedChange={(checked) => onUpdate({ softClose: checked })}
        />
      </div>
    </div>
  );
}
