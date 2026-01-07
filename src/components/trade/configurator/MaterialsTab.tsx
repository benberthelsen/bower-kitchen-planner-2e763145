import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfiguredCabinet, CabinetMaterials } from '@/contexts/TradeRoomContext';
import { Palette, Search } from 'lucide-react';
import { FINISH_OPTIONS } from '@/constants';

interface MaterialsTabProps {
  cabinet: ConfiguredCabinet;
  onUpdate: (materials: Partial<CabinetMaterials>) => void;
}

const doorStyles = [
  { id: 'slab', name: 'Slab / Flat Panel' },
  { id: 'shaker', name: 'Shaker' },
  { id: 'raised-panel', name: 'Raised Panel' },
  { id: 'beadboard', name: 'Beadboard' },
  { id: 'glass-insert', name: 'Glass Insert' },
];

const edgeBandingOptions = [
  { id: 'matching', name: 'Matching Edge' },
  { id: 'contrasting', name: 'Contrasting Edge' },
  { id: 'abs-black', name: 'ABS Black' },
  { id: 'abs-white', name: 'ABS White' },
  { id: 'timber', name: 'Timber Veneer' },
];

const carcaseOptions = [
  { id: 'white-melamine', name: 'White Melamine', color: '#ffffff' },
  { id: 'light-grey-melamine', name: 'Light Grey Melamine', color: '#e5e5e5' },
  { id: 'natural-birch', name: 'Natural Birch', color: '#dfc89a' },
  { id: 'matching-exterior', name: 'Match Exterior', color: null },
];

export function MaterialsTab({ cabinet, onUpdate }: MaterialsTabProps) {
  const [exteriorSearch, setExteriorSearch] = React.useState('');
  
  const filteredFinishes = FINISH_OPTIONS.filter(finish =>
    finish.name.toLowerCase().includes(exteriorSearch.toLowerCase())
  );

  const selectedExterior = FINISH_OPTIONS.find(f => f.id === cabinet.materials.exteriorFinish);
  const selectedCarcase = carcaseOptions.find(c => c.id === cabinet.materials.carcaseFinish);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2 text-trade-navy mb-4">
        <Palette className="w-5 h-5" />
        <h3 className="font-semibold">Materials & Finishes</h3>
      </div>
      
      {/* Exterior Finish */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Exterior Finish</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search finishes..."
            value={exteriorSearch}
            onChange={(e) => setExteriorSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-4 gap-2 max-h-[160px] overflow-y-auto p-1">
          {filteredFinishes.map((finish) => (
            <button
              key={finish.id}
              onClick={() => onUpdate({ exteriorFinish: finish.id })}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                cabinet.materials.exteriorFinish === finish.id
                  ? 'border-trade-amber bg-trade-amber/10'
                  : 'border-transparent hover:border-muted-foreground/30'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full border border-border shadow-sm"
                style={{ backgroundColor: finish.hex }}
              />
              <span className="text-xs text-center leading-tight line-clamp-2">{finish.name}</span>
            </button>
          ))}
        </div>
        {selectedExterior && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <div
              className="w-6 h-6 rounded-full border border-border"
              style={{ backgroundColor: selectedExterior.hex }}
            />
            <span className="text-sm font-medium">{selectedExterior.name}</span>
          </div>
        )}
      </div>
      
      {/* Door Style */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Door Style</Label>
        <Select
          value={cabinet.materials.doorStyle}
          onValueChange={(value) => onUpdate({ doorStyle: value })}
        >
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
      
      {/* Carcase Material */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Carcase Material</Label>
        <div className="grid grid-cols-2 gap-2">
          {carcaseOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => onUpdate({ carcaseFinish: option.id })}
              className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left ${
                cabinet.materials.carcaseFinish === option.id
                  ? 'border-trade-amber bg-trade-amber/10'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <div
                className="w-6 h-6 rounded border border-border flex-shrink-0"
                style={{ 
                  backgroundColor: option.color || selectedExterior?.hex || '#ffffff',
                  backgroundImage: option.color === null ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)' : undefined,
                  backgroundSize: '8px 8px',
                  backgroundPosition: '0 0, 4px 4px',
                }}
              />
              <span className="text-sm">{option.name}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Edge Banding */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Edge Banding</Label>
        <Select
          value={cabinet.materials.edgeBanding}
          onValueChange={(value) => onUpdate({ edgeBanding: value })}
        >
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
