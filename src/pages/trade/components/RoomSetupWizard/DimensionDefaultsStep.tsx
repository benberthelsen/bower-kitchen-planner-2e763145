import React from 'react';
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

interface DimensionDefaultsStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

function DimensionInput({ 
  label, 
  value, 
  onChange, 
  tooltip,
  min = 0,
  max = 3000 
}: { 
  label: string;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-trade-amber font-medium min-w-[140px] flex items-center gap-1.5">
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
              label="Toe Kick Height:"
              value={config.toeKickHeight}
              onChange={(v) => updateConfig({ toeKickHeight: v })}
              tooltip="Height of the toe kick / plinth below base cabinets"
              min={100}
              max={200}
            />
            <DimensionInput
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
              label="Base Height:"
              value={config.baseHeight}
              onChange={(v) => updateConfig({ baseHeight: v })}
              tooltip="Default height of base cabinets (excluding toe kick)"
              min={600}
              max={900}
            />
            <DimensionInput
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
              label="Wall Height:"
              value={config.wallHeight}
              onChange={(v) => updateConfig({ wallHeight: v })}
              tooltip="Default height of wall/upper cabinets"
              min={300}
              max={1200}
            />
            <DimensionInput
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
              label="Tall Height:"
              value={config.tallHeight}
              onChange={(v) => updateConfig({ tallHeight: v })}
              tooltip="Default height of tall/pantry cabinets"
              min={1800}
              max={2400}
            />
            <DimensionInput
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
          <svg viewBox="0 0 400 500" className="w-full max-w-sm">
            {/* Wall Cabinet */}
            <g transform="translate(120, 20)">
              {/* Back face */}
              <path 
                d="M0 0 L160 0 L160 100 L0 100 Z" 
                fill="hsl(var(--trade-amber) / 0.15)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Top face */}
              <path 
                d="M0 0 L40 -20 L200 -20 L160 0 Z" 
                fill="hsl(var(--trade-amber) / 0.25)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Right face */}
              <path 
                d="M160 0 L200 -20 L200 80 L160 100 Z" 
                fill="hsl(var(--trade-amber) / 0.2)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Dimension labels */}
              <text x="220" y="40" className="text-xs fill-trade-navy font-medium">{config.wallHeight}</text>
              <line x1="210" y1="-20" x2="210" y2="80" stroke="hsl(var(--trade-navy))" strokeWidth="1" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
              
              <text x="100" y="-35" className="text-xs fill-trade-navy font-medium text-center">{config.wallDepth}</text>
            </g>

            {/* Tall Cabinet */}
            <g transform="translate(20, 80)">
              {/* Back face */}
              <path 
                d="M0 0 L60 0 L60 320 L0 320 Z" 
                fill="hsl(var(--trade-amber) / 0.15)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Top face */}
              <path 
                d="M0 0 L30 -15 L90 -15 L60 0 Z" 
                fill="hsl(var(--trade-amber) / 0.25)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Right face */}
              <path 
                d="M60 0 L90 -15 L90 305 L60 320 Z" 
                fill="hsl(var(--trade-amber) / 0.2)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Dimension label */}
              <text x="-25" y="160" className="text-xs fill-trade-navy font-medium">{config.tallHeight}</text>
              <text x="45" y="-25" className="text-xs fill-trade-navy font-medium">{config.tallDepth}</text>
            </g>

            {/* Base Cabinet */}
            <g transform="translate(120, 280)">
              {/* Back face */}
              <path 
                d="M0 0 L160 0 L160 120 L0 120 Z" 
                fill="hsl(var(--trade-amber) / 0.15)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Top face */}
              <path 
                d="M0 0 L50 -30 L210 -30 L160 0 Z" 
                fill="hsl(var(--trade-amber) / 0.25)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Right face */}
              <path 
                d="M160 0 L210 -30 L210 90 L160 120 Z" 
                fill="hsl(var(--trade-amber) / 0.2)"
                stroke="hsl(var(--trade-amber))"
                strokeWidth="2"
              />
              {/* Legs */}
              <rect x="10" y="120" width="8" height="25" fill="hsl(var(--trade-navy))" />
              <rect x="50" y="120" width="8" height="25" fill="hsl(var(--trade-navy))" />
              <rect x="100" y="120" width="8" height="25" fill="hsl(var(--trade-navy))" />
              <rect x="145" y="120" width="8" height="25" fill="hsl(var(--trade-navy))" />
              
              {/* Dimension labels */}
              <text x="230" y="60" className="text-xs fill-trade-navy font-medium">{config.baseHeight}</text>
              <text x="105" y="-40" className="text-xs fill-trade-navy font-medium">{config.baseDepth}</text>
              
              {/* Toe kick dimension */}
              <text x="180" y="135" className="text-xs fill-trade-navy font-medium">{config.toeKickHeight}</text>
              
              {/* Shelf setback */}
              <text x="10" y="155" className="text-xs fill-trade-navy font-medium">{config.shelfSetback}</text>
            </g>

            {/* Arrow marker definition */}
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--trade-navy))" />
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}
