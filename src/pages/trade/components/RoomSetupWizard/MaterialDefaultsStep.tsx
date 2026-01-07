import React from 'react';
import { Search, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RoomConfig } from './index';

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

function MaterialPreview({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div 
        className="w-20 h-28 rounded-lg border-2 border-trade-border shadow-inner"
        style={{ backgroundColor: color }}
      />
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
  showSearch = true 
}: { 
  label: string;
  value: string;
  options: { id: string; name: string; color?: string }[];
  onChange: (value: string) => void;
  showSearch?: boolean;
}) {
  const selectedOption = options.find(o => o.name === value) || options[0];
  
  return (
    <div className="space-y-2">
      <Label className="text-trade-navy font-medium">{label}</Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10 border-trade-border bg-white"
        />
        {showSearch && (
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-muted" />
        )}
      </div>
    </div>
  );
}

export default function MaterialDefaultsStep({ config, updateConfig }: MaterialDefaultsStepProps) {
  const exteriorColor = materialOptions.find(m => m.name === config.exteriorMaterial)?.color || '#F5F0E6';
  const carcaseColor = carcaseMaterials.find(m => m.name === config.carcaseMaterial)?.color || '#F8F8F8';

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
            <MaterialPreview color={exteriorColor} label="Preview" />
            
            <div className="flex-1 space-y-4">
              <MaterialSelector
                label="Material"
                value={config.exteriorMaterial}
                options={materialOptions}
                onChange={(value) => updateConfig({ exteriorMaterial: value })}
              />
              
              <MaterialSelector
                label="Edge"
                value={config.exteriorEdge}
                options={edgeOptions}
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
            <p><span className="text-trade-amber font-medium">Door:</span> {config.doorStyle}</p>
            <p><span className="text-trade-amber font-medium">Materials:</span> {config.exteriorMaterial}</p>
            <p><span className="text-trade-amber font-medium">Edge Materials:</span> {config.exteriorEdge}</p>
          </div>
        </div>

        {/* Carcase Section */}
        <div className="space-y-6">
          <div className="bg-trade-navy text-white px-4 py-2 rounded-lg font-display font-semibold">
            Carcase (Interior)
          </div>
          
          <div className="flex gap-6">
            <MaterialPreview color={carcaseColor} label="Preview" />
            
            <div className="flex-1 space-y-4">
              <MaterialSelector
                label="Material"
                value={config.carcaseMaterial}
                options={carcaseMaterials}
                onChange={(value) => updateConfig({ carcaseMaterial: value })}
              />
              
              <MaterialSelector
                label="Edge"
                value={config.carcaseEdge}
                options={edgeOptions}
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

          {/* Material Details */}
          <div className="bg-trade-surface rounded-lg p-4 text-sm space-y-1">
            <p><span className="text-trade-amber font-medium">Type:</span> Melamine</p>
            <p><span className="text-trade-amber font-medium">Materials:</span> {config.carcaseMaterial}</p>
            <p><span className="text-trade-amber font-medium">Edge Materials:</span> {config.carcaseEdge}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
