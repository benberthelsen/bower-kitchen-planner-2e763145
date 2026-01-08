import { useState } from 'react';
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
  onFocus,
  onBlur,
}: { 
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
  min?: number;
  max?: number;
  onFocus?: () => void;
  onBlur?: () => void;
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
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-24 border-trade-border text-center"
          min={min}
          max={max}
        />
        <span className="text-trade-muted text-sm">mm</span>
      </div>
    </div>
  );
}

interface DimensionLineProps {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  label: string;
  value: number;
  labelX: string;
  labelY: string;
  isHighlighted: boolean;
}

function DimensionLine({ x1, y1, x2, y2, label, value, labelX, labelY, isHighlighted }: DimensionLineProps) {
  const strokeColor = isHighlighted ? 'hsl(var(--trade-amber))' : 'hsl(var(--muted-foreground))';
  const strokeWidth = isHighlighted ? 2 : 1.5;
  
  return (
    <g>
      {/* Main line */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        className="transition-all duration-200"
      />
      {/* Arrow terminators */}
      <circle cx={x1} cy={y1} r="3" fill={strokeColor} className="transition-all duration-200" />
      <circle cx={x2} cy={y2} r="3" fill={strokeColor} className="transition-all duration-200" />
      {/* Label background and text */}
      <g transform={`translate(${labelX}, ${labelY})`}>
        <rect
          x="-4"
          y="-12"
          width={Math.max(label.length * 6 + 35, 70)}
          height="16"
          rx="3"
          fill={isHighlighted ? 'hsl(var(--trade-amber) / 0.15)' : 'hsl(var(--background))'}
          stroke={strokeColor}
          strokeWidth="1"
          className="transition-all duration-200"
        />
        <text
          x="0"
          y="0"
          fontSize="10"
          fill={isHighlighted ? 'hsl(var(--trade-amber))' : 'hsl(var(--foreground))'}
          className="font-medium transition-all duration-200"
        >
          {label}: {value}
        </text>
      </g>
    </g>
  );
}

export default function DimensionDefaultsStep({ config, updateConfig }: DimensionDefaultsStepProps) {
  const [focusedDimension, setFocusedDimension] = useState<string | null>(null);

  const handleFocus = (id: string) => () => setFocusedDimension(id);
  const handleBlur = () => setFocusedDimension(null);

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
              onFocus={handleFocus('toeKickHeight')}
              onBlur={handleBlur}
            />
            <DimensionInput
              id="shelfSetback"
              label="Shelf Setback:"
              value={config.shelfSetback}
              onChange={(v) => updateConfig({ shelfSetback: v })}
              tooltip="How far shelves are set back from the front edge"
              min={0}
              max={50}
              onFocus={handleFocus('shelfSetback')}
              onBlur={handleBlur}
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
              onFocus={handleFocus('baseHeight')}
              onBlur={handleBlur}
            />
            <DimensionInput
              id="baseDepth"
              label="Base Depth:"
              value={config.baseDepth}
              onChange={(v) => updateConfig({ baseDepth: v })}
              tooltip="Default depth of base cabinets"
              min={400}
              max={700}
              onFocus={handleFocus('baseDepth')}
              onBlur={handleBlur}
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
              onFocus={handleFocus('wallHeight')}
              onBlur={handleBlur}
            />
            <DimensionInput
              id="wallDepth"
              label="Wall Depth:"
              value={config.wallDepth}
              onChange={(v) => updateConfig({ wallDepth: v })}
              tooltip="Default depth of wall/upper cabinets"
              min={200}
              max={400}
              onFocus={handleFocus('wallDepth')}
              onBlur={handleBlur}
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
              onFocus={handleFocus('tallHeight')}
              onBlur={handleBlur}
            />
            <DimensionInput
              id="tallDepth"
              label="Tall Depth:"
              value={config.tallDepth}
              onChange={(v) => updateConfig({ tallDepth: v })}
              tooltip="Default depth of tall/pantry cabinets"
              min={400}
              max={700}
              onFocus={handleFocus('tallDepth')}
              onBlur={handleBlur}
            />
          </div>
        </div>

        {/* Visual Diagram with SVG Overlay */}
        <div className="bg-trade-surface rounded-xl p-6 flex items-center justify-center">
          <div className="relative w-full max-w-lg">
            <img 
              src={kitchenDiagram} 
              alt="Kitchen cabinet dimensions diagram"
              className="w-full object-contain"
            />
            {/* SVG Dimension Overlay */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 400 350"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Tall Height - left side full height */}
              <DimensionLine
                x1="8%"
                y1="8%"
                x2="8%"
                y2="88%"
                label="Tall"
                value={config.tallHeight}
                labelX="2%"
                labelY="50%"
                isHighlighted={focusedDimension === 'tallHeight'}
              />
              
              {/* Wall Height - right side upper portion */}
              <DimensionLine
                x1="95%"
                y1="8%"
                x2="95%"
                y2="32%"
                label="Wall"
                value={config.wallHeight}
                labelX="78%"
                labelY="20%"
                isHighlighted={focusedDimension === 'wallHeight'}
              />
              
              {/* Base Height - right side lower portion */}
              <DimensionLine
                x1="95%"
                y1="52%"
                x2="95%"
                y2="82%"
                label="Base"
                value={config.baseHeight}
                labelX="78%"
                labelY="67%"
                isHighlighted={focusedDimension === 'baseHeight'}
              />
              
              {/* Toe Kick Height - bottom */}
              <DimensionLine
                x1="95%"
                y1="84%"
                x2="95%"
                y2="92%"
                label="Kick"
                value={config.toeKickHeight}
                labelX="78%"
                labelY="88%"
                isHighlighted={focusedDimension === 'toeKickHeight'}
              />
              
              {/* Base Depth - bottom horizontal */}
              <DimensionLine
                x1="35%"
                y1="96%"
                x2="70%"
                y2="96%"
                label="Base Depth"
                value={config.baseDepth}
                labelX="40%"
                labelY="99%"
                isHighlighted={focusedDimension === 'baseDepth'}
              />
              
              {/* Wall Depth - top horizontal */}
              <DimensionLine
                x1="55%"
                y1="4%"
                x2="75%"
                y2="4%"
                label="Wall Depth"
                value={config.wallDepth}
                labelX="55%"
                labelY="2%"
                isHighlighted={focusedDimension === 'wallDepth'}
              />
              
              {/* Tall Depth - mid horizontal */}
              <DimensionLine
                x1="15%"
                y1="4%"
                x2="35%"
                y2="4%"
                label="Tall Depth"
                value={config.tallDepth}
                labelX="15%"
                labelY="2%"
                isHighlighted={focusedDimension === 'tallDepth'}
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
