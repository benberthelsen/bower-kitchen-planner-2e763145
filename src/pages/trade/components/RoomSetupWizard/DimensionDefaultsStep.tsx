import React, { useRef } from 'react';
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
import { cn } from '@/lib/utils';

interface DimensionDefaultsStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

type DimensionKey = 'toeKickHeight' | 'shelfSetback' | 'baseHeight' | 'baseDepth' | 'wallHeight' | 'wallDepth' | 'tallHeight' | 'tallDepth';

function DimensionInput({ 
  id,
  label, 
  value, 
  onChange, 
  tooltip,
  min = 0,
  max = 3000,
  isHighlighted = false
}: { 
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
  min?: number;
  max?: number;
  isHighlighted?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-2 -m-2 rounded-lg transition-all",
      isHighlighted && "bg-trade-amber/10 ring-2 ring-trade-amber"
    )}>
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

interface DimensionLabelProps {
  value: number;
  inputId: string;
  className: string;
  onFocus: (id: string) => void;
}

function DimensionLabel({ value, inputId, className, onFocus }: DimensionLabelProps) {
  const handleClick = () => {
    onFocus(inputId);
    const input = document.getElementById(inputId);
    if (input) {
      input.focus();
      (input as HTMLInputElement).select();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "bg-trade-navy/90 px-2.5 py-1 rounded text-xs font-bold text-white shadow-md",
        "hover:bg-trade-amber hover:text-white transition-colors cursor-pointer pointer-events-auto",
        "border border-white/20 hover:border-trade-amber",
        className
      )}
    >
      {value}
    </button>
  );
}

export default function DimensionDefaultsStep({ config, updateConfig }: DimensionDefaultsStepProps) {
  const [highlightedField, setHighlightedField] = React.useState<string | null>(null);

  const handleLabelFocus = (id: string) => {
    setHighlightedField(id);
    setTimeout(() => setHighlightedField(null), 2000);
  };

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
              isHighlighted={highlightedField === 'toeKickHeight'}
            />
            <DimensionInput
              id="shelfSetback"
              label="Shelf Setback:"
              value={config.shelfSetback}
              onChange={(v) => updateConfig({ shelfSetback: v })}
              tooltip="How far shelves are set back from the front edge"
              min={0}
              max={50}
              isHighlighted={highlightedField === 'shelfSetback'}
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
              isHighlighted={highlightedField === 'baseHeight'}
            />
            <DimensionInput
              id="baseDepth"
              label="Base Depth:"
              value={config.baseDepth}
              onChange={(v) => updateConfig({ baseDepth: v })}
              tooltip="Default depth of base cabinets"
              min={400}
              max={700}
              isHighlighted={highlightedField === 'baseDepth'}
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
              isHighlighted={highlightedField === 'wallHeight'}
            />
            <DimensionInput
              id="wallDepth"
              label="Wall Depth:"
              value={config.wallDepth}
              onChange={(v) => updateConfig({ wallDepth: v })}
              tooltip="Default depth of wall/upper cabinets"
              min={200}
              max={400}
              isHighlighted={highlightedField === 'wallDepth'}
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
              isHighlighted={highlightedField === 'tallHeight'}
            />
            <DimensionInput
              id="tallDepth"
              label="Tall Depth:"
              value={config.tallDepth}
              onChange={(v) => updateConfig({ tallDepth: v })}
              tooltip="Default depth of tall/pantry cabinets"
              min={400}
              max={700}
              isHighlighted={highlightedField === 'tallDepth'}
            />
          </div>
        </div>

        {/* Visual Diagram */}
        <div className="bg-trade-surface rounded-xl p-6 flex items-center justify-center relative">
          <img 
            src={kitchenDiagram} 
            alt="Kitchen cabinet dimensions diagram"
            className="w-full max-w-md object-contain"
          />
          {/* Overlay dimension labels - clickable */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Tall Cabinet Height - left side vertical */}
            <DimensionLabel
              value={config.tallHeight}
              inputId="tallHeight"
              onFocus={handleLabelFocus}
              className="absolute top-[35%] left-[5%]"
            />
            {/* Wall Cabinet Height - right side upper */}
            <DimensionLabel
              value={config.wallHeight}
              inputId="wallHeight"
              onFocus={handleLabelFocus}
              className="absolute top-[22%] right-[5%]"
            />
            {/* Wall Cabinet Depth - right side */}
            <DimensionLabel
              value={config.wallDepth}
              inputId="wallDepth"
              onFocus={handleLabelFocus}
              className="absolute top-[12%] right-[18%]"
            />
            {/* Base Cabinet Height - right side middle */}
            <DimensionLabel
              value={config.baseHeight}
              inputId="baseHeight"
              onFocus={handleLabelFocus}
              className="absolute top-[58%] right-[5%]"
            />
            {/* Base Cabinet Depth - right side */}
            <DimensionLabel
              value={config.baseDepth}
              inputId="baseDepth"
              onFocus={handleLabelFocus}
              className="absolute top-[48%] right-[18%]"
            />
            {/* Tall Cabinet Depth - bottom left */}
            <DimensionLabel
              value={config.tallDepth}
              inputId="tallDepth"
              onFocus={handleLabelFocus}
              className="absolute bottom-[12%] left-[18%]"
            />
            {/* Toe Kick Height - bottom front */}
            <DimensionLabel
              value={config.toeKickHeight}
              inputId="toeKickHeight"
              onFocus={handleLabelFocus}
              className="absolute bottom-[18%] left-[5%]"
            />
            {/* Shelf Setback - inside cabinet */}
            <DimensionLabel
              value={config.shelfSetback}
              inputId="shelfSetback"
              onFocus={handleLabelFocus}
              className="absolute top-[52%] left-[35%]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
