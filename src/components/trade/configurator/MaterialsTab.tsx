import React, { useState, useMemo, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfiguredCabinet, CabinetMaterials } from '@/contexts/TradeRoomContext';
import { Palette, Search } from 'lucide-react';
import { useMaterialsCatalog, MaterialOptionRow } from '@/hooks/useMaterialsCatalog';

interface MaterialsTabProps {
  cabinet: ConfiguredCabinet;
  onUpdate: (materials: Partial<CabinetMaterials>) => void;
}

// Only Slab / Flat Panel is offered for now (the others can be re-enabled later).
const doorStyles = [
  { id: 'slab', name: 'Slab / Flat Panel' },
];

const edgeBandingOptions = [
  { id: 'matching', name: 'Matching Edge' },
  { id: 'contrasting', name: 'Contrasting Edge' },
  { id: 'abs-black', name: 'ABS Black' },
  { id: 'abs-white', name: 'ABS White' },
  { id: 'timber', name: 'Timber Veneer' },
];

/** Small swatch that shows the supplier image when available, else a placeholder. */
function Swatch({ url, size = 'w-8 h-8' }: { url?: string | null; size?: string }) {
  const [errored, setErrored] = useState(false);
  if (url && !errored) {
    return (
      <img
        src={url}
        alt=""
        className={`${size} rounded object-cover border border-border`}
        onError={() => setErrored(true)}
      />
    );
  }
  return <div className={`${size} rounded border border-border bg-muted`} />;
}

function priceLabel(m: MaterialOptionRow): string {
  return m.areaCost != null ? `$${m.areaCost.toFixed(2)}/m²` : 'Needs price';
}

/** Searchable grid of real, priced materials from the supplier feed. */
function MaterialPicker({
  materials,
  selectedId,
  onSelect,
  placeholder,
}: {
  materials: MaterialOptionRow[];
  selectedId?: string;
  onSelect: (m: MaterialOptionRow) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('All');
  const brands = useMemo(
    () => ['All', ...Array.from(new Set(materials.map((m) => m.brand).filter(Boolean) as string[])).sort()],
    [materials],
  );
  const q = search.toLowerCase();
  const filtered = useMemo(
    () => materials.filter((m) =>
      (brand === 'All' || m.brand === brand) &&
      (!q || `${m.name} ${m.brand ?? ''} ${m.finish ?? ''} ${m.itemCode}`.toLowerCase().includes(q))),
    [materials, brand, q],
  );
  const shown = filtered.slice(0, 150);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      {brands.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrand(b)}
              className={`text-[11px] px-2 py-1 rounded-full border transition-all ${
                brand === b ? 'border-trade-amber bg-trade-amber/10 text-trade-navy' : 'border-border text-muted-foreground hover:border-muted-foreground/40'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">
        Showing {shown.length} of {filtered.length}{filtered.length > shown.length ? ' — refine to narrow' : ''}
      </div>
      <div className="grid grid-cols-3 gap-2 max-h-[260px] overflow-y-auto p-1">
        {shown.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            title={`${m.name}${m.brand ? ` · ${m.brand}` : ''} · ${priceLabel(m)}`}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all text-center ${
              selectedId === m.id ? 'border-trade-amber bg-trade-amber/10' : 'border-transparent hover:border-muted-foreground/30'
            }`}
          >
            <Swatch url={m.thumbnailUrl || m.sampleImageUrl} />
            <span className="text-[11px] leading-tight line-clamp-2">{m.name}</span>
            <span className="text-[10px] text-muted-foreground">{priceLabel(m)}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-3 text-xs text-muted-foreground p-2">No materials match "{search}".</p>
        )}
      </div>
    </div>
  );
}

export function MaterialsTab({ cabinet, onUpdate }: MaterialsTabProps) {
  const { boardMaterials, carcassMaterials, defaultCarcass, materials, isLoading } = useMaterialsCatalog();

  // Default the carcase to the standard Polytec carcass board when it isn't
  // already set to a valid board material.
  useEffect(() => {
    if (!defaultCarcass) return;
    const current = cabinet.materials.carcaseFinish;
    if (!current || !boardMaterials.some((m) => m.id === current)) {
      onUpdate({ carcaseFinish: defaultCarcass.id });
    }
  }, [defaultCarcass, boardMaterials, cabinet.materials.carcaseFinish, onUpdate]);

  // Slab is the only door style offered for now — keep the cabinet on it.
  useEffect(() => {
    if (cabinet.materials.doorStyle !== 'slab') onUpdate({ doorStyle: 'slab' });
  }, [cabinet.materials.doorStyle, onUpdate]);

  // Carcase picker lists the dedicated carcass range first.
  const carcaseList = useMemo(
    () => [...carcassMaterials, ...boardMaterials.filter((m) => !/carcass/i.test(m.name || ''))],
    [carcassMaterials, boardMaterials],
  );

  const selectedExterior = materials.find((m) => m.id === cabinet.materials.exteriorFinish);
  const selectedCarcase = materials.find((m) => m.id === cabinet.materials.carcaseFinish);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2 text-trade-navy mb-4">
        <Palette className="w-5 h-5" />
        <h3 className="font-semibold">Materials & Finishes</h3>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading material catalogue…</p>}

      {/* Exterior / door finish — real priced materials */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Exterior / Door Finish</Label>
        <MaterialPicker
          materials={boardMaterials}
          selectedId={cabinet.materials.exteriorFinish}
          onSelect={(m) => onUpdate({ exteriorFinish: m.id })}
          placeholder="Search door finishes…"
        />
        {selectedExterior && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <Swatch url={selectedExterior.thumbnailUrl || selectedExterior.sampleImageUrl} size="w-6 h-6" />
            <span className="text-sm font-medium">{selectedExterior.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{priceLabel(selectedExterior)}</span>
          </div>
        )}
      </div>

      {/* Door Style */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Door Style</Label>
        <Select value={cabinet.materials.doorStyle} onValueChange={(value) => onUpdate({ doorStyle: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select door style" />
          </SelectTrigger>
          <SelectContent>
            {doorStyles.map((style) => (
              <SelectItem key={style.id} value={style.id}>
                {style.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Carcase material — real priced materials, plus Match Exterior */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Carcase Material</Label>
          {cabinet.materials.exteriorFinish && (
            <button
              type="button"
              onClick={() => onUpdate({ carcaseFinish: cabinet.materials.exteriorFinish })}
              className="text-xs text-trade-amber hover:underline"
            >
              Match exterior
            </button>
          )}
        </div>
        <MaterialPicker
          materials={carcaseList}
          selectedId={cabinet.materials.carcaseFinish}
          onSelect={(m) => onUpdate({ carcaseFinish: m.id })}
          placeholder="Search carcase boards (Polytec Carcass range first)…"
        />
        {selectedCarcase && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <Swatch url={selectedCarcase.thumbnailUrl || selectedCarcase.sampleImageUrl} size="w-6 h-6" />
            <span className="text-sm font-medium">{selectedCarcase.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{priceLabel(selectedCarcase)}</span>
          </div>
        )}
      </div>

      {/* Edge Banding */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Edge Banding</Label>
        <Select value={cabinet.materials.edgeBanding} onValueChange={(value) => onUpdate({ edgeBanding: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select edge banding" />
          </SelectTrigger>
          <SelectContent>
            {edgeBandingOptions.map((edge) => (
              <SelectItem key={edge.id} value={edge.id}>
                {edge.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
