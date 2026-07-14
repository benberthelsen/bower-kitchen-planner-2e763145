import React, { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ConfiguredCabinet, CabinetHardware } from '@/contexts/TradeRoomContext';
import { Wrench, Search } from 'lucide-react';
import { useMaterialsCatalog, HardwareOptionRow } from '@/hooks/useMaterialsCatalog';
import { getCabinetPartMapping } from '@/lib/pricing/cabinetPartMapping';
import {
  classifyHandleStyle,
  finishHexFromName,
  HANDLE_STYLE_GROUPS,
  HANDLE_FINISH_COLORS,
  HandleStyleGroup,
} from '@/lib/handleStyles';

interface HardwareTabProps {
  cabinet: ConfiguredCabinet;
  onUpdate: (hardware: Partial<CabinetHardware>) => void;
}

const priceLabel = (h: HardwareOptionRow) => (h.unitCost != null ? `$${h.unitCost.toFixed(2)}` : 'Needs price');

/** Product photo with graceful fallback to a neutral placeholder. */
function HandleThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-14 rounded bg-muted/60 flex items-center justify-center">
        <Wrench className="w-4 h-4 text-muted-foreground/50" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-14 object-contain rounded bg-white"
    />
  );
}

/**
 * Handle picker: catalog handles grouped by visual style (matching the 3D
 * models), searchable, with supplier product photos. Profile-system fittings
 * (end caps, corners…) are classified as accessories and not shown.
 */
function HandlePicker({
  handles,
  selectedId,
  onSelect,
}: {
  handles: HardwareOptionRow[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byGroup = new Map<HandleStyleGroup, HardwareOptionRow[]>();
    for (const h of handles) {
      const style = classifyHandleStyle(h.name, h.series, h.hardwareType);
      if (style === 'accessory') continue; // end caps, corners etc. — not handles
      if (q && !`${h.name} ${h.brand ?? ''} ${h.series ?? ''}`.toLowerCase().includes(q)) continue;
      const list = byGroup.get(style) ?? [];
      list.push(h);
      byGroup.set(style, list);
    }
    // Keep the defined display order; sort within a group by price then name.
    return HANDLE_STYLE_GROUPS
      .map((g) => ({
        ...g,
        items: (byGroup.get(g.key) ?? []).sort(
          (a, b) => (a.unitCost ?? Infinity) - (b.unitCost ?? Infinity) || a.name.localeCompare(b.name),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [handles, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search handles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* No Handle pinned above the scrolling catalog */}
      <button
        type="button"
        onClick={() => onSelect('none')}
        className={`w-full p-2 rounded-lg border-2 text-left text-xs font-medium transition-all ${
          selectedId === 'none' ? 'border-trade-amber bg-trade-amber/10' : 'border-border hover:border-muted-foreground/30'
        }`}
      >
        No Handle
        <span className="block text-[10px] text-muted-foreground">Handleless / push to open</span>
      </button>

      <div className="max-h-[380px] overflow-y-auto rounded-lg border border-border/60">
        {grouped.map((group) => (
          <div key={group.key}>
            <div className="sticky top-0 z-10 px-3 py-1.5 bg-muted/95 backdrop-blur-sm border-y border-border/60 first:border-t-0">
              <span className="text-xs font-semibold">{group.label}</span>
              <span className="ml-2 text-[10px] text-muted-foreground">
                {group.description} · {group.items.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-2">
              {group.items.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onSelect(h.id)}
                  title={`${h.name}${h.brand ? ` · ${h.brand}` : ''} · ${priceLabel(h)}`}
                  className={`flex flex-col gap-1 p-2 rounded-lg border-2 text-left transition-all ${
                    selectedId === h.id ? 'border-trade-amber bg-trade-amber/10' : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <HandleThumb src={h.imageUrl} alt={h.name} />
                  <span className="text-xs font-medium leading-tight line-clamp-2">{h.name}</span>
                  <span className="text-[10px] text-muted-foreground">{h.brand || h.series || ''} · {priceLabel(h)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-xs text-muted-foreground p-3">No handles match "{search}".</p>
        )}
      </div>
    </div>
  );
}

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

  // The product's material fixes its colour for brass/wood/etc. — the finish
  // swatches only apply to plated finishes.
  const selectedHandleRow = handles.find((h) => h.id === cabinet.hardware.handleType);
  const finishLocked = selectedHandleRow ? finishHexFromName(selectedHandleRow.name) !== null : false;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2 text-trade-navy mb-4">
        <Wrench className="w-5 h-5" />
        <h3 className="font-semibold">Hardware</h3>
      </div>

      {/* Handle — real priced hardware grouped by style, searchable, with photos */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Handle</Label>
        <HandlePicker
          handles={handles}
          selectedId={cabinet.hardware.handleType}
          onSelect={(id) => onUpdate({ handleType: id })}
        />
      </div>

      {/* Handle finish */}
      {cabinet.hardware.handleType !== 'none' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Handle Finish</Label>
          {finishLocked ? (
            <p className="text-xs text-muted-foreground">
              This handle's material sets its colour — finish options don't apply.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {HANDLE_FINISH_COLORS.map((color) => (
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
          )}
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
