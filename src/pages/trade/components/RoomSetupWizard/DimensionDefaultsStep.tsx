import { HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RoomConfig } from './index';
import kitchenDiagram from '@/assets/kitchen-dimensions-diagram.png';

interface DimensionDefaultsStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

function DimensionInput({ 
  id,
  label, 
  value, 
  onChange, 
  tooltip,
  min = 0,
  max = 3000,
}: { 
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="text-trade-amber font-medium min-w-[140px] flex items-center gap-1.5">
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-3.5 w-3.5 text-trade-muted" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || 0)))}
          className="w-24 border-trade-border text-center"
          min={min}
          max={max}
        />
        <span className="text-trade-muted text-sm">mm</span>
      </div>
    </div>
  );
}

export default function DimensionDefaultsStep({ config, updateConfig }: DimensionDefaultsStepProps) {
  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-center text-trade-muted mb-6">
        Set default dimensions for cabinets. These can be overridden per product.
      </p>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Dimension Inputs */}
        <div className="space-y-6">
          {/* Preset Selector */}
          <div className="flex items-center gap-3">
            <Label className="text-trade-navy font-medium min-w-[140px]">Size Preset:</Label>
            <Select defaultValue="standard1">
              <SelectTrigger className="w-48 border-trade-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard1">Standard 1</SelectItem>
                <SelectItem value="standard2">Standard 2</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <DimensionInput
              id="toeKickHeight"
              label="Toe Kick Height:"
              value={config.toeKickHeight}
              onChange={(v) => updateConfig({ toeKickHeight: v })}
              tooltip="Height of the toe kick / plinth below base cabinets"
              min={100}
              max={200}
            />
            <DimensionInput
              id="shelfSetback"
              label="Shelf Setback:"
              value={config.shelfSetback}
              onChange={(v) => updateConfig({ shelfSetback: v })}
              tooltip="How far shelves are set back from the front edge"
              min={0}
              max={50}
            />
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <h4 className="font-display font-semibold text-trade-navy">Base Cabinets</h4>
            <DimensionInput
              id="baseHeight"
              label="Base Height:"
              value={config.baseHeight}
              onChange={(v) => updateConfig({ baseHeight: v })}
              tooltip="Default height of base cabinets (excluding toe kick)"
              min={600}
              max={900}
            />
            <DimensionInput
              id="baseDepth"
              label="Base Depth:"
              value={config.baseDepth}
              onChange={(v) => updateConfig({ baseDepth: v })}
              tooltip="Default depth of base cabinets"
              min={400}
              max={700}
            />
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <h4 className="font-display font-semibold text-trade-navy">Wall Cabinets</h4>
            <DimensionInput
              id="wallHeight"
              label="Wall Height:"
              value={config.wallHeight}
              onChange={(v) => updateConfig({ wallHeight: v })}
              tooltip="Default height of wall/upper cabinets"
              min={300}
              max={1200}
            />
            <DimensionInput
              id="wallDepth"
              label="Wall Depth:"
              value={config.wallDepth}
              onChange={(v) => updateConfig({ wallDepth: v })}
              tooltip="Default depth of wall/upper cabinets"
              min={200}
              max={400}
            />
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <h4 className="font-display font-semibold text-trade-navy">Tall Cabinets</h4>
            <DimensionInput
              id="tallHeight"
              label="Tall Height:"
              value={config.tallHeight}
              onChange={(v) => updateConfig({ tallHeight: v })}
              tooltip="Default height of tall/pantry cabinets"
              min={1800}
              max={2400}
            />
            <DimensionInput
              id="tallDepth"
              label="Tall Depth:"
              value={config.tallDepth}
              onChange={(v) => updateConfig({ tallDepth: v })}
              tooltip="Default depth of tall/pantry cabinets"
              min={400}
              max={700}
            />
          </div>
        </div>

        {/* Visual Diagram */}
        <div className="bg-trade-surface rounded-xl p-6 flex items-center justify-center">
          <img 
            src={kitchenDiagram} 
            alt="Kitchen cabinet dimensions diagram"
            className="w-full max-w-lg object-contain"
          />
        </div>
      </div>
    </div>
  );
}
