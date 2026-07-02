import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ConfiguredCabinet, CabinetDimensions, CabinetConstruction } from '@/contexts/TradeRoomContext';
import { useCatalogItem } from '@/hooks/useCatalog';
import { Ruler, ArrowsUpFromLine, Box, DoorOpen } from 'lucide-react';

interface DimensionsTabProps {
  cabinet: ConfiguredCabinet;
  onUpdate: (dimensions: Partial<CabinetDimensions>) => void;
  onUpdateConstruction?: (construction: Partial<CabinetConstruction>) => void;
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

/**
 * Number field that lets you type freely (including clearing it) and only
 * applies the value on blur / Enter. The previous version clamped on every
 * keystroke, so typing "575" snapped the first digit to the minimum and you
 * could never enter a value by hand.
 */
function MmInput({
  value,
  min,
  max,
  onCommit,
  className,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    onCommit(n); // caller clamps to [min, max]
  };

  return (
    <Input
      type="number"
      value={editing ? text : value}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
      min={min}
      max={max}
    />
  );
}

export function DimensionsTab({ cabinet, onUpdate, onUpdateConstruction, constraints = {} }: DimensionsTabProps) {
  const limits = { ...defaultConstraints, ...constraints };

  // Render config tells us the cabinet's shape (corner type, door count).
  const rc = useCatalogItem(cabinet.definitionId)?.renderConfig;
  const nm = cabinet.productName || '';
  const nameIsCorner = /corner/i.test(nm);
  const isLShapeCorner = rc?.cornerType === 'l-shape' || (nameIsCorner && !/diagonal|blind|open|angle/i.test(nm));
  const hasDoors = (rc?.doorCount ?? 0) > 0 || !!rc?.isSink || nameIsCorner;
  const secondWidth = cabinet.construction?.secondWidth ?? cabinet.dimensions.width;
  const hingeSide = cabinet.construction?.hingeSide ?? 'Left';

  const handleSecondWidthChange = (value: number) => {
    const clamped = Math.min(Math.max(value, limits.minWidth), limits.maxWidth);
    onUpdateConstruction?.({ secondWidth: clamped });
  };

  // Corner legs (arms) have independent return depths (MV: Cabinet Depth Left/Right).
  const leftLegDepth = cabinet.construction?.cabinetDepthLeft ?? cabinet.dimensions.depth;
  const rightLegDepth = cabinet.construction?.cabinetDepthRight ?? cabinet.dimensions.depth;
  const handleLeftLegDepthChange = (value: number) => {
    const clamped = Math.min(Math.max(value, limits.minDepth), limits.maxDepth);
    onUpdateConstruction?.({ cabinetDepthLeft: clamped });
  };
  const handleRightLegDepthChange = (value: number) => {
    const clamped = Math.min(Math.max(value, limits.minDepth), limits.maxDepth);
    onUpdateConstruction?.({ cabinetDepthRight: clamped });
  };

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
            {isLShapeCorner ? 'Width (Wall 1)' : 'Width'}
          </Label>
          <div className="flex items-center gap-2">
            <MmInput
              value={cabinet.dimensions.width}
              onCommit={handleWidthChange}
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
      
      {/* Second Width (Wall 2) — L-shape corner cabinets only */}
      {isLShapeCorner && (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Box className="w-4 h-4 text-muted-foreground" />
            Second Width (Wall 2)
          </Label>
          <div className="flex items-center gap-2">
            <MmInput
              value={secondWidth}
              onCommit={handleSecondWidthChange}
              className="w-20 h-8 text-right"
              min={limits.minWidth}
              max={limits.maxWidth}
            />
            <span className="text-sm text-muted-foreground w-8">mm</span>
          </div>
        </div>
        <Slider
          value={[secondWidth]}
          onValueChange={([value]) => handleSecondWidthChange(value)}
          min={limits.minWidth}
          max={limits.maxWidth}
          step={50}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground italic">
          A corner spans two walls. Width is Wall 1, this is Wall 2 — set both to your wall runs (e.g. 900 × 900). The Depth below is the cabinet's return depth.
        </p>
      </div>
      )}
      
      {/* Height */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <ArrowsUpFromLine className="w-4 h-4 text-muted-foreground" />
            Height
          </Label>
          <div className="flex items-center gap-2">
            <MmInput
              value={cabinet.dimensions.height}
              onCommit={handleHeightChange}
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
        <p className="text-xs text-muted-foreground italic">
          Height to top of carcase, including the toe kick — the benchtop sits on top, so the finished bench height is higher.
        </p>
      </div>
      
      {/* Depth — single for standard cabinets; two independent legs for L-corners */}
      {!isLShapeCorner ? (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Box className="w-4 h-4 text-muted-foreground rotate-45" />
            Depth
          </Label>
          <div className="flex items-center gap-2">
            <MmInput
              value={cabinet.dimensions.depth}
              onCommit={handleDepthChange}
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
      ) : (
      <>
        {/* Left leg (arm) return depth — independent */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Box className="w-4 h-4 text-muted-foreground rotate-45" />
              Left Leg Depth
            </Label>
            <div className="flex items-center gap-2">
              <MmInput value={leftLegDepth} onCommit={handleLeftLegDepthChange} className="w-20 h-8 text-right" min={limits.minDepth} max={limits.maxDepth} />
              <span className="text-sm text-muted-foreground w-8">mm</span>
            </div>
          </div>
          <Slider value={[leftLegDepth]} onValueChange={([v]) => handleLeftLegDepthChange(v)} min={limits.minDepth} max={limits.maxDepth} step={50} className="w-full" />
        </div>
        {/* Right leg (arm) return depth — independent */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Box className="w-4 h-4 text-muted-foreground rotate-45" />
              Right Leg Depth
            </Label>
            <div className="flex items-center gap-2">
              <MmInput value={rightLegDepth} onCommit={handleRightLegDepthChange} className="w-20 h-8 text-right" min={limits.minDepth} max={limits.maxDepth} />
              <span className="text-sm text-muted-foreground w-8">mm</span>
            </div>
          </div>
          <Slider value={[rightLegDepth]} onValueChange={([v]) => handleRightLegDepthChange(v)} min={limits.minDepth} max={limits.maxDepth} step={50} className="w-full" />
          <p className="text-xs text-muted-foreground italic">
            Each leg's return depth is independent. The two wall runs are Width (Wall 1) and Second Width (Wall 2) above.
          </p>
        </div>
      </>
      )}

      {/* Door Handing (hinge side) */}
      {hasDoors && (
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <DoorOpen className="w-4 h-4 text-muted-foreground" />
          Door Handing
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {(['Left', 'Right'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => onUpdateConstruction?.({ hingeSide: side })}
              className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                hingeSide === side
                  ? 'border-trade-amber bg-trade-amber/10'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              Hinge {side}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground italic">
          Which side the door is hinged (handle sits on the opposite edge). For two-door and corner units this records the lead door for manufacturing.
        </p>
      </div>
      )}
      
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
