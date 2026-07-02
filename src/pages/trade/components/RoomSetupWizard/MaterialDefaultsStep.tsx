import React, { useMemo, useState } from 'react';
import { Search, Palette, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RoomConfig } from './index';
import { type MaterialOptionRow, useMaterialsCatalog } from '@/hooks/useMaterialsCatalog';

interface MaterialDefaultsStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

// Mock material options - will be replaced with database data
const materialOptions = [
  { id: 'wiluna-white', name: 'Antique Wiluna White Pearl - 16.5mm Formica MR MDF', color: '#F5F0E6' },
  { id: 'snow-white', name: 'Snow White - 16.5mm Laminex MR MDF', color: '#FFFFFF' },
  { id: 'natural-oak', name: 'Natural Oak - 16.5mm Polytec MR MDF', color: '#C4A77D' },
  { id: 'charcoal', name: 'Charcoal - 16.5mm Laminex MR MDF', color: '#36454F' },
];

const edgeOptions = [
  { id: 'wiluna-edge', name: '1mm Antique Wiluna White Formica Pearl', color: '#F5F0E6' },
  { id: 'white-edge', name: '1mm White Gloss Edge', color: '#FFFFFF' },
  { id: 'oak-edge', name: '1mm Natural Oak Edge', color: '#C4A77D' },
];

const doorStyles = [
  { id: 'melamine', name: 'Melamine' },
  { id: 'vinyl-wrap', name: 'Vinyl Wrap' },
  { id: 'painted', name: 'Painted 2-Pack' },
  { id: 'shaker', name: 'Shaker Style' },
];

const carcaseMaterials = [
  { id: 'white-carcase', name: 'White Carcase Available - 16.5mm Shop Materials HMR PB', color: '#F8F8F8' },
  { id: 'grey-carcase', name: 'Grey Carcase - 16.5mm Shop Materials HMR PB', color: '#9CA3AF' },
];

type PickerMaterial = {
  id: string;
  name: string;
  finish?: string | null;
  color?: string | null;
  sampleImageUrl?: string | null;
  areaCost?: number | null;
  priceStatus?: string | null;
  sheetLength?: number | null;
  sheetWidth?: number | null;
};

function toPickerMaterial(m: MaterialOptionRow): PickerMaterial {
  return {
    id: m.id,
    name: m.name,
    finish: m.finish,
    sampleImageUrl: m.sampleImageUrl,
    areaCost: m.areaCost,
    priceStatus: m.priceStatus,
    sheetLength: m.sheetLength,
    sheetWidth: m.sheetWidth,
  };
}

function MaterialPreview({ color, imageUrl, label }: { color: string; imageUrl?: string | null; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={label}
          className="w-20 h-28 rounded-lg border-2 border-trade-border object-cover bg-white shadow-inner"
        />
      ) : (
        <div
          className="w-20 h-28 rounded-lg border-2 border-trade-border shadow-inner"
          style={{ backgroundColor: color }}
        />
      )}
      <div className="flex-1">
        <p className="text-sm text-trade-muted">{label}</p>
      </div>
    </div>
  );
}

function MaterialSelector({
  label,
  value,
  options,
  onChange,
  showSearch = true,
  loading = false,
}: {
  label: string;
  value: string;
  options: { id: string; name: string; color?: string }[];
  onChange: (value: string) => void;
  showSearch?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  // `value` is the stored row id; show the human-readable name. (Falls back to
  // the raw value so legacy name-stored rooms still display.)
  const selectedName = options.find((o) => o.id === value)?.name ?? value;

  return (
    <div className="space-y-2">
      <Label className="text-trade-navy font-medium">{label}</Label>
      <div className="relative">
        <Input
          value={open ? query : selectedName}
          placeholder={selectedName || 'Search…'}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          className="pr-10 border-trade-border bg-white"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-muted animate-spin" />
        ) : showSearch ? (
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-muted" />
        ) : null}

        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-trade-border bg-white shadow-lg">
            {filtered.slice(0, 60).map((o) => (
              <button
                key={o.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-trade-surface flex items-center gap-2"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {o.color && (
                  <span className="w-4 h-4 rounded border border-trade-border inline-block flex-shrink-0" style={{ backgroundColor: o.color }} />
                )}
                <span className="truncate">{o.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Two-step picker: choose a COLOUR (deduped), then the FINISH available in
// that colour. Stores the matching material_pricing row id.
function ColourFinishSelector({
  label, materials, value, onChange, loading = false,
}: {
  label: string;
  materials: PickerMaterial[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = materials.find((m) => m.id === value) ?? materials.find((m) => m.name === value);
  const selectedColour = selected?.name ?? value;

  const colours = useMemo(() => {
    const byName = new Map<string, PickerMaterial>();
    for (const m of materials) {
      if (!byName.has(m.name)) byName.set(m.name, m);
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [materials]);

  const filteredColours = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? colours.filter((c) => c.name.toLowerCase().includes(q)) : colours;
  }, [colours, query]);

  const finishes = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; finish: string }[] = [];
    for (const m of materials) {
      if (m.name !== selectedColour) continue;
      const f = ((m.finish ?? '').trim()) || 'Standard';
      if (!seen.has(f)) { seen.add(f); list.push({ id: m.id, finish: f }); }
    }
    return list;
  }, [materials, selectedColour]);

  const pickColour = (colour: string) => {
    const first = materials.find((m) => m.name === colour);
    if (first) onChange(first.id);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-trade-navy font-medium">{label}</Label>
      <div className="relative">
        <Input
          value={open ? query : selectedColour}
          placeholder={selectedColour || 'Search colour…'}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          className="pr-10 border-trade-border bg-white"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-muted animate-spin" />
        ) : (
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-muted" />
        )}
        {open && filteredColours.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-trade-border bg-white shadow-lg">
            {filteredColours.slice(0, 80).map((c) => (
              <button
                key={c.name}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-trade-surface flex items-center gap-3"
                onMouseDown={(e) => { e.preventDefault(); pickColour(c.name); }}
              >
                {c.sampleImageUrl ? (
                  <img src={c.sampleImageUrl} alt="" className="h-9 w-9 rounded border border-trade-border object-cover bg-white" />
                ) : (
                  <span
                    className="h-9 w-9 rounded border border-trade-border"
                    style={{ backgroundColor: c.color ?? '#fff' }}
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{c.name}</span>
                  {c.priceStatus && c.priceStatus !== 'captured' && (
                    <span className="block text-xs text-trade-muted">{c.priceStatus.replace(/_/g, ' ')}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedColour && finishes.length > 0 && (
        <div>
          <Label className="text-xs text-trade-muted">Finish</Label>
          <select
            value={selected?.id ?? value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full mt-1 rounded-md border border-trade-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-trade-amber/40"
          >
            {finishes.map((f) => (
              <option key={f.id} value={f.id}>{f.finish}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default function MaterialDefaultsStep({ config, updateConfig }: MaterialDefaultsStepProps) {
  // Real materials/edges from the pricing database (admin imports).
  // Mock entries remain only as a fallback while the tables are empty.
  const { materials: dbMaterials, edges: dbEdges, isLoading } = useMaterialsCatalog();

  // Business rule: "Shop Materials" brand boards (16mm HMR Arctic White,
  // 15mm ply, etc.) are the shop's standing carcase/kick stock — they stay
  // OUT of the exterior list and lead the carcase list.
  const exteriorOptions = useMemo(
    () => (dbMaterials.length > 0
      ? dbMaterials.filter((m) => !/shop materials/i.test(m.brand ?? '')).map((m) => ({ id: m.id, name: m.name }))
      : materialOptions),
    [dbMaterials],
  );
  const carcaseOptions = useMemo(
    () => (dbMaterials.length > 0
      ? [...dbMaterials]
          .sort((a, b) => {
            const aShop = /shop materials/i.test(a.brand ?? '') ? 0 : 1;
            const bShop = /shop materials/i.test(b.brand ?? '') ? 0 : 1;
            return aShop - bShop || a.name.localeCompare(b.name);
          })
          .map((m) => ({ id: m.id, name: m.name }))
      : carcaseMaterials),
    [dbMaterials],
  );
  const edgeListOptions = useMemo(
    () => (dbEdges.length > 0 ? dbEdges.map((e) => ({ id: e.id, name: e.name })) : edgeOptions),
    [dbEdges],
  );

  // Full rows (keep finish) for the colour→finish pickers.
  const exteriorMatList = useMemo(
    () => (dbMaterials.length > 0
      ? dbMaterials.filter((m) => !/shop materials/i.test(m.brand ?? '')).map(toPickerMaterial)
      : materialOptions.map((m): PickerMaterial => ({ id: m.id, name: m.name, color: m.color }))),
    [dbMaterials],
  );
  const carcaseMatList = useMemo(
    () => (dbMaterials.length > 0
      ? [...dbMaterials]
          .sort((a, b) => {
            const aShop = /shop materials/i.test(a.brand ?? '') ? 0 : 1;
            const bShop = /shop materials/i.test(b.brand ?? '') ? 0 : 1;
            return aShop - bShop || a.name.localeCompare(b.name);
          })
          .map(toPickerMaterial)
      : carcaseMaterials.map((m): PickerMaterial => ({ id: m.id, name: m.name, color: m.color }))),
    [dbMaterials],
  );
  const labelWithFinish = (list: { id: string; name: string; finish?: string | null }[], id: string) => {
    const r = list.find((m) => m.id === id);
    return r ? `${r.name}${r.finish ? ' — ' + r.finish : ''}` : id;
  };

  const materialLabel = (list: PickerMaterial[], id: string) => {
    const r = list.find((m) => m.id === id) ?? list.find((m) => m.name === id);
    return r ? `${r.name}${r.finish ? ' - ' + r.finish : ''}` : id;
  };
  const exteriorSelected = exteriorMatList.find((m) => m.id === config.exteriorMaterial) ?? exteriorMatList.find((m) => m.name === config.exteriorMaterial);
  const carcaseSelected = carcaseMatList.find((m) => m.id === config.carcaseMaterial) ?? carcaseMatList.find((m) => m.name === config.carcaseMaterial);
  const exteriorColor = exteriorSelected?.color ?? '#F5F0E6';
  const carcaseColor = carcaseSelected?.color ?? '#F8F8F8';

  // Resolve stored ids to display names for the summary panels.
  const nameOf = (opts: { id: string; name: string }[], id: string) => opts.find((o) => o.id === id)?.name ?? id;
  const exteriorName = materialLabel(exteriorMatList, config.exteriorMaterial);
  const carcaseName = materialLabel(carcaseMatList, config.carcaseMaterial);
  const exteriorEdgeName = nameOf(edgeListOptions, config.exteriorEdge);
  const carcaseEdgeName = nameOf(edgeListOptions, config.carcaseEdge);
  const doorStyleName = nameOf(doorStyles, config.doorStyle);

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-center text-trade-muted mb-6">
        Set default materials for this room. Individual products can override these settings.
      </p>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Exterior Section */}
        <div className="space-y-6">
          <div className="bg-trade-navy text-white px-4 py-2 rounded-lg font-display font-semibold">
            Exterior Finish
          </div>
          
          <div className="flex gap-6">
            <MaterialPreview color={exteriorColor} imageUrl={exteriorSelected?.sampleImageUrl} label="Preview" />
            
            <div className="flex-1 space-y-4">
              <ColourFinishSelector
                label="Colour"
                value={config.exteriorMaterial}
                materials={exteriorMatList}
                loading={isLoading}
                onChange={(value) => updateConfig({ exteriorMaterial: value })}
              />
              
              <MaterialSelector
                label="Edge"
                value={config.exteriorEdge}
                options={edgeListOptions}
                loading={isLoading}
                onChange={(value) => updateConfig({ exteriorEdge: value })}
              />
              
              <MaterialSelector
                label="Door Style"
                value={config.doorStyle}
                options={doorStyles}
                onChange={(value) => updateConfig({ doorStyle: value })}
                showSearch={false}
              />
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full border-trade-navy text-trade-navy hover:bg-trade-navy hover:text-white"
          >
            <Palette className="h-4 w-4 mr-2" />
            Browse Colours
          </Button>

          {/* Material Details */}
          <div className="bg-trade-surface rounded-lg p-4 text-sm space-y-1">
            <p><span className="text-trade-amber font-medium">Type:</span> Melamine</p>
            <p><span className="text-trade-amber font-medium">Door:</span> {doorStyleName}</p>
            <p><span className="text-trade-amber font-medium">Materials:</span> {exteriorName}</p>
            <p><span className="text-trade-amber font-medium">Edge Materials:</span> {exteriorEdgeName}</p>
          </div>
        </div>

        {/* Carcase Section */}
        <div className="space-y-6">
          <div className="bg-trade-navy text-white px-4 py-2 rounded-lg font-display font-semibold">
            Carcase (Interior)
          </div>
          
          <div className="flex gap-6">
            <MaterialPreview color={carcaseColor} imageUrl={carcaseSelected?.sampleImageUrl} label="Preview" />
            
            <div className="flex-1 space-y-4">
              <ColourFinishSelector
                label="Colour"
                value={config.carcaseMaterial}
                materials={carcaseMatList}
                loading={isLoading}
                onChange={(value) => updateConfig({ carcaseMaterial: value })}
              />
              
              <MaterialSelector
                label="Edge"
                value={config.carcaseEdge}
                options={edgeListOptions}
                loading={isLoading}
                onChange={(value) => updateConfig({ carcaseEdge: value })}
              />
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full border-trade-navy text-trade-navy hover:bg-trade-navy hover:text-white"
          >
            <Palette className="h-4 w-4 mr-2" />
            Browse Colours
          </Button>

          {/* Carcase Details */}
          <div className="bg-trade-surface rounded-lg p-4 text-sm space-y-1">
            <p><span className="text-trade-amber font-medium">Type:</span> Melamine</p>
            <p><span className="text-trade-amber font-medium">Materials:</span> {carcaseName}</p>
            <p><span className="text-trade-amber font-medium">Edge Materials:</span> {carcaseEdgeName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
