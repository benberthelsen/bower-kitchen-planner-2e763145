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

interface GapDefaultsStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

function GapInput({ 
  label, 
  value, 
  onChange, 
  tooltip,
  step = 0.1 
}: { 
  label: string;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
  step?: number;
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
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-24 border-trade-border text-center"
          step={step}
          min={0}
          max={20}
        />
        <span className="text-trade-muted text-sm">mm</span>
      </div>
    </div>
  );
}

function CabinetPreview({ type, doorGap, drawerGap }: { type: 'door' | 'drawer'; doorGap: number; drawerGap: number }) {
  const gap = type === 'door' ? doorGap : drawerGap;
  
  return (
    <div className="bg-trade-surface rounded-lg p-4">
      <svg viewBox="0 0 120 140" className="w-full h-32">
        {/* Cabinet body */}
        <rect x="10" y="10" width="100" height="100" fill="hsl(var(--trade-amber) / 0.1)" stroke="hsl(var(--trade-amber))" strokeWidth="2" rx="2" />
        
        {type === 'door' ? (
          /* Single door with gap visualization */
          <>
            <rect x="15" y="15" width="90" height="90" fill="hsl(var(--trade-amber) / 0.3)" stroke="hsl(var(--trade-amber))" strokeWidth="1.5" rx="1" />
            {/* Gap indicators */}
            <line x1="60" y1="5" x2="60" y2="15" stroke="hsl(var(--trade-navy))" strokeWidth="1" strokeDasharray="2,2" />
            <text x="60" y="130" textAnchor="middle" className="text-[10px] fill-trade-navy">{gap}mm gap</text>
          </>
        ) : (
          /* Three drawers */
          <>
            <rect x="15" y="15" width="90" height="26" fill="hsl(var(--trade-amber) / 0.3)" stroke="hsl(var(--trade-amber))" strokeWidth="1.5" rx="1" />
            <rect x="15" y="45" width="90" height="26" fill="hsl(var(--trade-amber) / 0.3)" stroke="hsl(var(--trade-amber))" strokeWidth="1.5" rx="1" />
            <rect x="15" y="75" width="90" height="26" fill="hsl(var(--trade-amber) / 0.3)" stroke="hsl(var(--trade-amber))" strokeWidth="1.5" rx="1" />
            {/* Gap indicators */}
            <line x1="5" y1="41" x2="15" y2="41" stroke="hsl(var(--trade-navy))" strokeWidth="1" strokeDasharray="2,2" />
            <line x1="5" y1="45" x2="15" y2="45" stroke="hsl(var(--trade-navy))" strokeWidth="1" strokeDasharray="2,2" />
            <text x="60" y="130" textAnchor="middle" className="text-[10px] fill-trade-navy">{gap}mm gap</text>
          </>
        )}
      </svg>
      <p className="text-center text-sm text-trade-navy font-medium mt-2">
        {type === 'door' ? 'Door Cabinet' : 'Drawer Cabinet'}
      </p>
    </div>
  );
}

function MarginPreview({ leftGap, rightGap, topMargin }: { leftGap: number; rightGap: number; topMargin: number }) {
  return (
    <div className="bg-trade-surface rounded-lg p-4">
      <svg viewBox="0 0 140 100" className="w-full h-24">
        {/* Wall cabinet representation */}
        <rect x="20" y="10" width="100" height="60" fill="hsl(var(--trade-amber) / 0.1)" stroke="hsl(var(--trade-amber))" strokeWidth="2" rx="2" />
        <rect x="25" y="15" width="90" height="50" fill="hsl(var(--trade-amber) / 0.3)" stroke="hsl(var(--trade-amber))" strokeWidth="1.5" rx="1" />
        
        {/* Left gap indicator */}
        <line x1="5" y1="40" x2="20" y2="40" stroke="hsl(var(--trade-navy))" strokeWidth="1" />
        <text x="12" y="55" textAnchor="middle" className="text-[8px] fill-trade-navy">{leftGap}</text>
        
        {/* Right gap indicator */}
        <line x1="120" y1="40" x2="135" y2="40" stroke="hsl(var(--trade-navy))" strokeWidth="1" />
        <text x="127" y="55" textAnchor="middle" className="text-[8px] fill-trade-navy">{rightGap}</text>
        
        {/* Top margin */}
        <line x1="70" y1="0" x2="70" y2="10" stroke="hsl(var(--trade-navy))" strokeWidth="1" strokeDasharray="2,2" />
        <text x="70" y="85" textAnchor="middle" className="text-[8px] fill-trade-navy">{topMargin}mm top</text>
      </svg>
      <p className="text-center text-sm text-trade-navy font-medium mt-2">
        Wall Cabinet Margins
      </p>
    </div>
  );
}

export default function GapDefaultsStep({ config, updateConfig }: GapDefaultsStepProps) {
  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-center text-trade-muted mb-6">
        Configure default gap and margin settings for doors and drawers.
      </p>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Gap Inputs */}
        <div className="space-y-6">
          {/* Preset Selector */}
          <div className="flex items-center gap-3">
            <Label className="text-trade-navy font-medium min-w-[140px]">Gap Preset:</Label>
            <Select defaultValue="standard2">
              <SelectTrigger className="w-48 border-trade-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard1">Standard 1.0</SelectItem>
                <SelectItem value="standard2">Standard 2.0</SelectItem>
                <SelectItem value="tight">Tight Fit</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <h4 className="font-display font-semibold text-trade-navy">Door & Drawer Gaps</h4>
            <GapInput
              label="Door Gap:"
              value={config.doorGap}
              onChange={(v) => updateConfig({ doorGap: v })}
              tooltip="Gap between doors and cabinet frame"
            />
            <GapInput
              label="Drawer Gap:"
              value={config.drawerGap}
              onChange={(v) => updateConfig({ drawerGap: v })}
              tooltip="Gap between drawer fronts"
            />
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <h4 className="font-display font-semibold text-trade-navy">Side Margins</h4>
            <GapInput
              label="Left Gap:"
              value={config.leftGap}
              onChange={(v) => updateConfig({ leftGap: v })}
              tooltip="Gap on the left side of cabinet doors"
            />
            <GapInput
              label="Right Gap:"
              value={config.rightGap}
              onChange={(v) => updateConfig({ rightGap: v })}
              tooltip="Gap on the right side of cabinet doors"
            />
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <h4 className="font-display font-semibold text-trade-navy">Wall Cabinet Margins</h4>
            <GapInput
              label="Upper Top Margin:"
              value={config.upperTopMargin}
              onChange={(v) => updateConfig({ upperTopMargin: v })}
              tooltip="Margin at the top of wall cabinet doors"
            />
            <GapInput
              label="Upper Bottom Margin:"
              value={config.upperBottomMargin}
              onChange={(v) => updateConfig({ upperBottomMargin: v })}
              tooltip="Margin at the bottom of wall cabinet doors"
            />
          </div>

          <div className="border-t border-trade-border pt-4 space-y-4">
            <h4 className="font-display font-semibold text-trade-navy">Base Cabinet Margins</h4>
            <GapInput
              label="Base Top Margin:"
              value={config.baseTopMargin}
              onChange={(v) => updateConfig({ baseTopMargin: v })}
              tooltip="Margin at the top of base cabinet doors (below benchtop)"
            />
          </div>
        </div>

        {/* Visual Previews */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CabinetPreview type="door" doorGap={config.doorGap} drawerGap={config.drawerGap} />
            <CabinetPreview type="drawer" doorGap={config.doorGap} drawerGap={config.drawerGap} />
          </div>
          <MarginPreview leftGap={config.leftGap} rightGap={config.rightGap} topMargin={config.upperTopMargin} />
          
          {/* Summary */}
          <div className="bg-trade-navy/5 rounded-lg p-4 mt-4">
            <h4 className="font-display font-semibold text-trade-navy mb-3">Gap Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-trade-muted">Door Gap:</span>
                <span className="font-medium text-trade-navy">{config.doorGap}mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-trade-muted">Drawer Gap:</span>
                <span className="font-medium text-trade-navy">{config.drawerGap}mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-trade-muted">Left/Right:</span>
                <span className="font-medium text-trade-navy">{config.leftGap}/{config.rightGap}mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-trade-muted">Top Margins:</span>
                <span className="font-medium text-trade-navy">{config.upperTopMargin}/{config.baseTopMargin}mm</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
