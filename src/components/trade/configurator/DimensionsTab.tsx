import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ConfiguredCabinet, CabinetDimensions } from '@/contexts/TradeRoomContext';
import { Ruler, ArrowsUpFromLine, Box } from 'lucide-react';

interface DimensionsTabProps {
  cabinet: ConfiguredCabinet;
  onUpdate: (dimensions: Partial<CabinetDimensions>) => void;
  constraints?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    minDepth?: number;
    maxDepth?: number;
  };
}

const defaultConstraints = {
  minWidth: 150,
  maxWidth: 1200,
  minHeight: 200,
  maxHeight: 2400,
  minDepth: 200,
  maxDepth: 700,
};

export function DimensionsTab({ cabinet, onUpdate, constraints = {} }: DimensionsTabProps) {
  const limits = { ...defaultConstraints, ...constraints };
  
  const handleWidthChange = (value: number) => {
    const clamped = Math.min(Math.max(value, limits.minWidth), limits.maxWidth);
    onUpdate({ width: clamped });
  };
  
  const handleHeightChange = (value: number) => {
    const clamped = Math.min(Math.max(value, limits.minHeight), limits.maxHeight);
    onUpdate({ height: clamped });
  };
  
  const handleDepthChange = (value: number) => {
    const clamped = Math.min(Math.max(value, limits.minDepth), limits.maxDepth);
    onUpdate({ depth: clamped });
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2 text-trade-navy mb-4">
        <Ruler className="w-5 h-5" />
        <h3 className="font-semibold">Cabinet Dimensions</h3>
      </div>
      
      {/* Width */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Box className="w-4 h-4 text-muted-foreground" />
            Width
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={cabinet.dimensions.width}
              onChange={(e) => handleWidthChange(parseInt(e.target.value) || limits.minWidth)}
              className="w-20 h-8 text-right"
              min={limits.minWidth}
              max={limits.maxWidth}
            />
            <span className="text-sm text-muted-foreground w-8">mm</span>
          </div>
        </div>
        <Slider
          value={[cabinet.dimensions.width]}
          onValueChange={([value]) => handleWidthChange(value)}
          min={limits.minWidth}
          max={limits.maxWidth}
          step={50}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{limits.minWidth}mm</span>
          <span>{limits.maxWidth}mm</span>
        </div>
      </div>
      
      {/* Height */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <ArrowsUpFromLine className="w-4 h-4 text-muted-foreground" />
            Height
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={cabinet.dimensions.height}
              onChange={(e) => handleHeightChange(parseInt(e.target.value) || limits.minHeight)}
              className="w-20 h-8 text-right"
              min={limits.minHeight}
              max={limits.maxHeight}
            />
            <span className="text-sm text-muted-foreground w-8">mm</span>
          </div>
        </div>
        <Slider
          value={[cabinet.dimensions.height]}
          onValueChange={([value]) => handleHeightChange(value)}
          min={limits.minHeight}
          max={limits.maxHeight}
          step={50}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{limits.minHeight}mm</span>
          <span>{limits.maxHeight}mm</span>
        </div>
      </div>
      
      {/* Depth */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Box className="w-4 h-4 text-muted-foreground rotate-45" />
            Depth
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={cabinet.dimensions.depth}
              onChange={(e) => handleDepthChange(parseInt(e.target.value) || limits.minDepth)}
              className="w-20 h-8 text-right"
              min={limits.minDepth}
              max={limits.maxDepth}
            />
            <span className="text-sm text-muted-foreground w-8">mm</span>
          </div>
        </div>
        <Slider
          value={[cabinet.dimensions.depth]}
          onValueChange={([value]) => handleDepthChange(value)}
          min={limits.minDepth}
          max={limits.maxDepth}
          step={50}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{limits.minDepth}mm</span>
          <span>{limits.maxDepth}mm</span>
        </div>
      </div>
      
      {/* Visual Reference */}
      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h4 className="text-sm font-medium mb-3 text-center">Size Reference</h4>
        <div className="flex justify-center">
          <svg viewBox="0 0 200 150" className="w-full max-w-[200px]">
            {/* Cabinet outline */}
            <rect
              x="40"
              y="20"
              width="120"
              height="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-trade-navy"
            />
            
            {/* Width dimension */}
            <line x1="40" y1="135" x2="160" y2="135" stroke="currentColor" strokeWidth="1" className="text-trade-amber" />
            <line x1="40" y1="130" x2="40" y2="140" stroke="currentColor" strokeWidth="1" className="text-trade-amber" />
            <line x1="160" y1="130" x2="160" y2="140" stroke="currentColor" strokeWidth="1" className="text-trade-amber" />
            <text x="100" y="148" textAnchor="middle" fontSize="10" className="fill-trade-amber font-medium">
              {cabinet.dimensions.width}mm
            </text>
            
            {/* Height dimension */}
            <line x1="175" y1="20" x2="175" y2="120" stroke="currentColor" strokeWidth="1" className="text-trade-amber" />
            <line x1="170" y1="20" x2="180" y2="20" stroke="currentColor" strokeWidth="1" className="text-trade-amber" />
            <line x1="170" y1="120" x2="180" y2="120" stroke="currentColor" strokeWidth="1" className="text-trade-amber" />
            <text x="185" y="75" textAnchor="start" fontSize="10" className="fill-trade-amber font-medium" transform="rotate(90 185 75)">
              {cabinet.dimensions.height}mm
            </text>
            
            {/* Depth indicator */}
            <text x="100" y="75" textAnchor="middle" fontSize="10" className="fill-muted-foreground">
              D: {cabinet.dimensions.depth}mm
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
