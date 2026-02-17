import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoomConfig } from './index';

interface RoomDimensionEditorProps {
  open: boolean;
  onClose: () => void;
  onApply: (dimensions: Partial<RoomConfig>) => void;
  shape: RoomConfig['shape'];
  initialDimensions: {
    roomWidth: number;
    roomDepth: number;
    roomHeight: number;
    cutoutWidth?: number;
    cutoutDepth?: number;
    islandWidth?: number;
    islandDepth?: number;
    peninsulaLength?: number;
    peninsulaWidth?: number;
    leftWingDepth?: number;
    rightWingDepth?: number;
    corridorWidth?: number;
  };
}

const DimensionInput = ({ 
  label, 
  value, 
  onChange, 
  suffix = 'mm',
  min = 500,
  max = 15000
}: { 
  label: string; 
  value: number; 
  onChange: (val: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  
  return (
    <div className="space-y-1.5">
      <Label className="text-trade-navy font-medium text-sm">{label}</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
          className="pr-12 border-trade-border"
          min={min}
          max={max}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-trade-muted text-sm">
          {suffix}
        </span>
      </div>
    </div>
  );
};

export default function RoomDimensionEditor({ 
  open, 
  onClose, 
  onApply, 
  shape, 
  initialDimensions 
}: RoomDimensionEditorProps) {
  const [dimensions, setDimensions] = useState(initialDimensions);

  const updateDimension = (key: keyof typeof dimensions, value: number) => {
    setDimensions(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onApply(dimensions);
    onClose();
  };

  const shapeTitles: Record<RoomConfig['shape'], string> = {
    rectangular: 'Rectangular Room',
    'l-shaped': 'L-Shaped Room',
    'u-shaped': 'U-Shaped Room',
    galley: 'Galley Kitchen',
    peninsula: 'Peninsula Layout',
    island: 'Island Kitchen',
  };

  const renderFloorPlan = () => {
    const svgWidth = 280;
    const svgHeight = 220;
    const padding = 20;
    const scale = 0.04; // Scale down from mm to SVG units

    const w = dimensions.roomWidth * scale;
    const d = dimensions.roomDepth * scale;

    switch (shape) {
      case 'rectangular':
        return (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48">
            <rect 
              x={(svgWidth - w) / 2} 
              y={(svgHeight - d) / 2} 
              width={w} 
              height={d} 
              fill="hsl(var(--trade-amber) / 0.1)" 
              stroke="hsl(var(--trade-amber))" 
              strokeWidth="2"
            />
            {/* Width dimension */}
            <line 
              x1={(svgWidth - w) / 2} 
              y1={svgHeight - 15} 
              x2={(svgWidth + w) / 2} 
              y2={svgHeight - 15} 
              stroke="hsl(var(--trade-navy))" 
              strokeWidth="1"
            />
            <text 
              x={svgWidth / 2} 
              y={svgHeight - 5} 
              textAnchor="middle" 
              className="fill-trade-navy text-xs font-medium"
            >
              {dimensions.roomWidth}mm
            </text>
            {/* Depth dimension */}
            <line 
              x1={svgWidth - 15} 
              y1={(svgHeight - d) / 2} 
              x2={svgWidth - 15} 
              y2={(svgHeight + d) / 2} 
              stroke="hsl(var(--trade-navy))" 
              strokeWidth="1"
            />
            <text 
              x={svgWidth - 5} 
              y={svgHeight / 2} 
              textAnchor="middle" 
              className="fill-trade-navy text-xs font-medium"
              transform={`rotate(-90, ${svgWidth - 5}, ${svgHeight / 2})`}
            >
              {dimensions.roomDepth}mm
            </text>
          </svg>
        );

      case 'l-shaped': {
        const cw = (dimensions.cutoutWidth || 2000) * scale;
        const cd = (dimensions.cutoutDepth || 2000) * scale;
        return (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48">
            {/* L-shape path */}
            <path 
              d={`M ${padding} ${padding} 
                  L ${padding + w} ${padding} 
                  L ${padding + w} ${padding + d - cd} 
                  L ${padding + w - cw} ${padding + d - cd} 
                  L ${padding + w - cw} ${padding + d} 
                  L ${padding} ${padding + d} Z`}
              fill="hsl(var(--trade-amber) / 0.1)" 
              stroke="hsl(var(--trade-amber))" 
              strokeWidth="2"
            />
            {/* Dimension labels */}
            <text x={padding + w/2} y={svgHeight - 5} textAnchor="middle" className="fill-trade-navy text-xs font-medium">
              {dimensions.roomWidth}mm
            </text>
            <text x={5} y={padding + d/2} textAnchor="start" className="fill-trade-navy text-xs font-medium" transform={`rotate(-90, 10, ${padding + d/2})`}>
              {dimensions.roomDepth}mm
            </text>
            <text x={padding + w - cw/2} y={padding + d - cd + 15} textAnchor="middle" className="fill-trade-muted text-[10px]">
              Cutout: {dimensions.cutoutWidth}×{dimensions.cutoutDepth}
            </text>
          </svg>
        );
                );
      }

      case 'u-shaped': {
        const lw = (dimensions.leftWingDepth || 1500) * scale;
        const rw = (dimensions.rightWingDepth || 1500) * scale;
        return (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48">
            {/* U-shape */}
            <path 
              d={`M ${padding} ${padding} 
                  L ${padding + w} ${padding} 
                  L ${padding + w} ${padding + d} 
                  L ${padding + w - rw} ${padding + d} 
                  L ${padding + w - rw} ${padding + d * 0.4} 
                  L ${padding + lw} ${padding + d * 0.4} 
                  L ${padding + lw} ${padding + d} 
                  L ${padding} ${padding + d} Z`}
              fill="hsl(var(--trade-amber) / 0.1)" 
              stroke="hsl(var(--trade-amber))" 
              strokeWidth="2"
            />
            <text x={padding + w/2} y={svgHeight - 5} textAnchor="middle" className="fill-trade-navy text-xs font-medium">
              {dimensions.roomWidth}mm
            </text>
          </svg>
        );
                );
      }

      case 'galley': {
        const corridorW = (dimensions.corridorWidth || 1200) * scale;
        return (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48">
            {/* Two parallel walls */}
            <rect 
              x={padding} 
              y={(svgHeight - d) / 2} 
              width={w} 
              height={d} 
              fill="hsl(var(--trade-amber) / 0.1)" 
              stroke="hsl(var(--trade-amber))" 
              strokeWidth="2"
            />
            {/* Corridor indicator */}
            <rect 
              x={padding + 20} 
              y={(svgHeight - corridorW) / 2} 
              width={w - 40} 
              height={corridorW} 
              fill="none" 
              stroke="hsl(var(--trade-muted))" 
              strokeWidth="1"
              strokeDasharray="4 2"
            />
            <text x={padding + w/2} y={svgHeight / 2} textAnchor="middle" className="fill-trade-muted text-[10px]">
              Corridor: {dimensions.corridorWidth}mm
            </text>
          </svg>
        );
                );
      }

      case 'peninsula': {
        const pl = (dimensions.peninsulaLength || 1800) * scale;
        const pw = (dimensions.peninsulaWidth || 600) * scale;
        return (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48">
            {/* Main L-shape */}
            <rect 
              x={padding} 
              y={padding} 
              width={w} 
              height={d} 
              fill="hsl(var(--trade-amber) / 0.1)" 
              stroke="hsl(var(--trade-amber))" 
              strokeWidth="2"
            />
            {/* Peninsula */}
            <rect 
              x={padding + w - 20} 
              y={padding + d/2 - pw/2} 
              width={pl} 
              height={pw} 
              fill="hsl(var(--trade-amber) / 0.2)" 
              stroke="hsl(var(--trade-amber))" 
              strokeWidth="2"
            />
            <text x={padding + w + pl/2} y={padding + d/2 + 4} textAnchor="middle" className="fill-trade-navy text-[10px]">
              {dimensions.peninsulaLength}×{dimensions.peninsulaWidth}
            </text>
          </svg>
        );
                );
      }

      case 'island': {
        const iw = (dimensions.islandWidth || 2000) * scale;
        const id = (dimensions.islandDepth || 900) * scale;
        return (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48">
            {/* Room */}
            <rect 
              x={(svgWidth - w) / 2} 
              y={(svgHeight - d) / 2} 
              width={w} 
              height={d} 
              fill="hsl(var(--trade-amber) / 0.1)" 
              stroke="hsl(var(--trade-amber))" 
              strokeWidth="2"
            />
            {/* Island */}
            <rect 
              x={(svgWidth - iw) / 2} 
              y={(svgHeight - id) / 2} 
              width={iw} 
              height={id} 
              fill="hsl(var(--trade-navy) / 0.2)" 
              stroke="hsl(var(--trade-navy))" 
              strokeWidth="2"
            />
            <text x={svgWidth/2} y={svgHeight/2 + 4} textAnchor="middle" className="fill-trade-navy text-[10px] font-medium">
              Island: {dimensions.islandWidth}×{dimensions.islandDepth}
            </text>
          </svg>
        );
                );
      }

      default:
        return null;
    }
  };

  const renderInputs = () => {
    const commonInputs = (
      <>
        <DimensionInput 
          label="Room Width" 
          value={dimensions.roomWidth} 
          onChange={(v) => updateDimension('roomWidth', v)} 
        />
        <DimensionInput 
          label="Room Depth" 
          value={dimensions.roomDepth} 
          onChange={(v) => updateDimension('roomDepth', v)} 
        />
        <DimensionInput 
          label="Ceiling Height" 
          value={dimensions.roomHeight} 
          onChange={(v) => updateDimension('roomHeight', v)} 
        />
      </>
    );

    switch (shape) {
      case 'rectangular':
        return commonInputs;

      case 'l-shaped':
        return (
          <>
            {commonInputs}
            <DimensionInput 
              label="Cutout Width" 
              value={dimensions.cutoutWidth || 2000} 
              onChange={(v) => updateDimension('cutoutWidth', v)} 
            />
            <DimensionInput 
              label="Cutout Depth" 
              value={dimensions.cutoutDepth || 2000} 
              onChange={(v) => updateDimension('cutoutDepth', v)} 
            />
          </>
        );

      case 'u-shaped':
        return (
          <>
            {commonInputs}
            <DimensionInput 
              label="Left Wing Depth" 
              value={dimensions.leftWingDepth || 1500} 
              onChange={(v) => updateDimension('leftWingDepth', v)} 
            />
            <DimensionInput 
              label="Right Wing Depth" 
              value={dimensions.rightWingDepth || 1500} 
              onChange={(v) => updateDimension('rightWingDepth', v)} 
            />
          </>
        );

      case 'galley':
        return (
          <>
            {commonInputs}
            <DimensionInput 
              label="Corridor Width" 
              value={dimensions.corridorWidth || 1200} 
              onChange={(v) => updateDimension('corridorWidth', v)} 
              min={800}
              max={3000}
            />
          </>
        );

      case 'peninsula':
        return (
          <>
            {commonInputs}
            <DimensionInput 
              label="Peninsula Length" 
              value={dimensions.peninsulaLength || 1800} 
              onChange={(v) => updateDimension('peninsulaLength', v)} 
            />
            <DimensionInput 
              label="Peninsula Width" 
              value={dimensions.peninsulaWidth || 600} 
              onChange={(v) => updateDimension('peninsulaWidth', v)} 
              min={400}
              max={1200}
            />
          </>
        );

      case 'island':
        return (
          <>
            {commonInputs}
            <DimensionInput 
              label="Island Width" 
              value={dimensions.islandWidth || 2000} 
              onChange={(v) => updateDimension('islandWidth', v)} 
            />
            <DimensionInput 
              label="Island Depth" 
              value={dimensions.islandDepth || 900} 
              onChange={(v) => updateDimension('islandDepth', v)} 
              min={600}
              max={1500}
            />
          </>
        );

      default:
        return commonInputs;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-trade-navy font-display">
            Configure {shapeTitles[shape]} Dimensions
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Floor Plan Preview */}
          <div className="bg-trade-surface rounded-lg border border-trade-border p-4">
            <h4 className="text-sm font-medium text-trade-navy mb-3">Floor Plan Preview</h4>
            <div className="bg-white rounded border border-trade-border/50">
              {renderFloorPlan()}
            </div>
          </div>

          {/* Dimension Inputs */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-trade-navy">Room Dimensions</h4>
            <div className="grid grid-cols-1 gap-3">
              {renderInputs()}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-trade-border">
          <Button variant="outline" onClick={onClose} className="border-trade-border">
            Cancel
          </Button>
          <Button onClick={handleApply} className="bg-trade-navy hover:bg-trade-navy-light text-white">
            Apply Dimensions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
