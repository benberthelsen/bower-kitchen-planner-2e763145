import React, { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ConfiguredCabinet, CabinetHardware } from '@/contexts/TradeRoomContext';
import { Wrench, Search } from 'lucide-react';
import { useMaterialsCatalog, HardwareOptionRow } from '@/hooks/useMaterialsCatalog';
import { getCabinetPartMapping } from '@/lib/pricing/cabinetPartMapping';

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

const priceLabel = (h: HardwareOptionRow) => (h.unitCost != null ? `$${h.unitCost.toFixed(2)}` : 'Needs price');

/** Searchable card grid of real, priced hardware from the supplier feed. */
function HardwarePicker({
  items,
  selectedId,
  onSelect,
  placeholder,
  searchable = false,
}: {
  items: HardwareOptionRow[];
  selectedId?: string;
  onSelect: (h: HardwareOptionRow) => void;
  placeholder: string;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase();
  const filtered = items
    .filter((h) => !searchable || `${h.name} ${h.brand ?? ''} ${h.series ?? ''}`.toLowerCase().includes(q))
    .slice(0, searchable ? 60 : 200);

  return (
    <div className="space-y-2">
      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto p-1">
        {filtered.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onSelect(h)}
            title={`${h.name}${h.brand ? ` · ${h.brand}` : ''} · ${priceLabel(h)}`}
            className={`flex flex-col items-start gap-0.5 p-2 rounded-lg border-2 text-left transition-all ${
              selectedId === h.id ? 'border-trade-amber bg-trade-amber/10' : 'border-border hover:border-muted-foreground/30'
            }`}
          >
            <span className="text-xs font-medium leading-tight line-clamp-2">{h.name}</span>
            <span className="text-[10px] text-muted-foreground">{h.brand || h.series || ''} · {priceLabel(h)}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="col-span-2 text-xs text-muted-foreground p-2">No hardware found.</p>}
      </div>
    </div>
  );
}

export function HardwareTab({ cabinet, onUpdate }: HardwareTabProps) {
  const { hinges, drawerRunners, handles } = useMaterialsCatalog();

  // Only show hardware this cabinet actually uses.
  const mapping = getCabinetPartMapping(cabinet.definitionId);
  const hasDoors = mapping ? mapping.config.numDoors > 0 : true;
  const hasDrawers = mapping ? mapping.config.numDrawers > 0 : true;

  const selectedColor = handleColors.find((c) => c.id === cabinet.hardware.handleColor) || handleColors[0];

  // Auto-fill shop-standard hardware when the saved value isn't a valid feed id.
  useEffect(() => {
    if (hasDoors && hinges.length > 0 && !hinges.some((h) => h.id === cabinet.hardware.hingeType)) {
      onUpdate({ hingeType: hinges[0].id });
    }
  }, [hasDoors, hinges, cabinet.hardware.hingeType, onUpdate]);
  useEffect(() => {
    if (hasDrawers && drawerRunners.length > 0 && !drawerRunners.some((d) => d.id === cabinet.hardware.drawerType)) {
      onUpdate({ drawerType: drawerRunners[0].id });
    }
  }, [hasDrawers, drawerRunners, cabinet.hardware.drawerType, onUpdate]);

  const handleOptions = useMemo(() => handles, [handles]);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2 text-trade-navy mb-4">
        <Wrench className="w-5 h-5" />
        <h3 className="font-semibold">Hardware</h3>
      </div>

      {/* Handle — real priced hardware + a None option */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Handle</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdate({ handleType: 'none' })}
            className={`p-2 rounded-lg border-2 text-left text-xs font-medium transition-all ${
              cabinet.hardware.handleType === 'none' ? 'border-trade-amber bg-trade-amber/10' : 'border-border hover:border-muted-foreground/30'
            }`}
          >
            No Handle
            <span className="block text-[10px] text-muted-foreground">Handleless / push</span>
          </button>
          {handleOptions.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onUpdate({ handleType: h.id })}
              title={`${h.name} · ${priceLabel(h)}`}
              className={`p-2 rounded-lg border-2 text-left transition-all ${
                cabinet.hardware.handleType === h.id ? 'border-trade-amber bg-trade-amber/10' : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <span className="text-xs font-medium leading-tight line-clamp-2">{h.name}</span>
              <span className="block text-[10px] text-muted-foreground">{h.brand || ''} · {priceLabel(h)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Handle finish */}
      {cabinet.hardware.handleType !== 'none' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Handle Finish</Label>
          <div className="flex flex-wrap gap-2">
            {handleColors.map((color) => (
              <button
                key={color.id}
                onClick={() => onUpdate({ handleColor: color.id })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                  cabinet.hardware.handleColor === color.id ? 'border-trade-amber bg-trade-amber/10' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="w-5 h-5 rounded-full border border-border shadow-sm" style={{ backgroundColor: color.hex }} />
                <span className="text-sm">{color.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hinge — only for cabinets with doors */}
      {hasDoors && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Hinge</Label>
          <HardwarePicker
            items={hinges}
            selectedId={cabinet.hardware.hingeType}
            onSelect={(h) => onUpdate({ hingeType: h.id })}
            placeholder="Search hinges…"
            searchable={hinges.length > 8}
          />
        </div>
      )}

      {/* Drawer runner — only for cabinets with drawers */}
      {hasDrawers && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Drawer Runner</Label>
          <HardwarePicker
            items={drawerRunners}
            selectedId={cabinet.hardware.drawerType}
            onSelect={(d) => onUpdate({ drawerType: d.id })}
            placeholder="Search drawer runners…"
            searchable
          />
        </div>
      )}

      {/* Soft Close */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Soft-Close Upgrade</Label>
          <p className="text-xs text-muted-foreground">Soft-close on all hinges and drawer runners</p>
        </div>
        <Switch checked={cabinet.hardware.softClose} onCheckedChange={(checked) => onUpdate({ softClose: checked })} />
      </div>
    </div>
  );
}
