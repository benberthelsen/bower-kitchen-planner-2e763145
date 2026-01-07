import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RoomConfig } from './index';
import RoomDimensionEditor from './RoomDimensionEditor';
import roomRectangular from '@/assets/room-rectangular.png';
import roomLShaped from '@/assets/room-l-shaped.png';
import roomUShaped from '@/assets/room-u-shaped.png';
import roomGalley from '@/assets/room-galley.png';
import roomPeninsula from '@/assets/room-peninsula.png';
import roomIsland from '@/assets/room-island.png';

interface RoomShapeStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

export default function RoomShapeStep({ config, updateConfig }: RoomShapeStepProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<RoomConfig['shape'] | null>(null);

  const shapes = [
    {
      id: 'rectangular' as const,
      name: 'Rectangular',
      description: 'Standard rectangular kitchen layout',
      image: roomRectangular,
    },
    {
      id: 'l-shaped' as const,
      name: 'L-Shaped',
      description: 'Corner kitchen with L-shaped layout',
      image: roomLShaped,
    },
    {
      id: 'u-shaped' as const,
      name: 'U-Shaped',
      description: 'Three-wall wraparound layout',
      image: roomUShaped,
    },
    {
      id: 'galley' as const,
      name: 'Galley',
      description: 'Parallel counters in corridor style',
      image: roomGalley,
    },
    {
      id: 'peninsula' as const,
      name: 'Peninsula',
      description: 'L-shape with extending counter',
      image: roomPeninsula,
    },
    {
      id: 'island' as const,
      name: 'Island',
      description: 'Open layout with central island',
      image: roomIsland,
    },
  ];

  const handleShapeClick = (shapeId: RoomConfig['shape']) => {
    setSelectedShape(shapeId);
    setEditorOpen(true);
  };

  const handleDimensionsApply = (dimensions: Partial<RoomConfig>) => {
    if (selectedShape) {
      updateConfig({ 
        shape: selectedShape,
        ...dimensions 
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Room Details */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="roomName" className="text-trade-navy font-medium">
            Room Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="roomName"
            placeholder="e.g., Kitchen, Laundry, Bathroom"
            value={config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            className="mt-1.5 border-trade-border"
          />
        </div>
        
        <div>
          <Label htmlFor="roomDescription" className="text-trade-navy font-medium">
            Description <span className="text-trade-muted">(optional)</span>
          </Label>
          <Textarea
            id="roomDescription"
            placeholder="Add any notes about this room..."
            value={config.description}
            onChange={(e) => updateConfig({ description: e.target.value })}
            className="mt-1.5 border-trade-border resize-none"
            rows={3}
          />
        </div>
      </div>

      {/* Shape Selection */}
      <div>
        <Label className="text-trade-navy font-medium block mb-3">
          Room Layout Shape
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {shapes.map((shape) => (
            <button
              key={shape.id}
              onClick={() => handleShapeClick(shape.id)}
              className={cn(
                "relative p-4 rounded-xl border-2 transition-all text-center group",
                config.shape === shape.id
                  ? "border-trade-amber bg-trade-amber/5 shadow-lg"
                  : "border-trade-border bg-white hover:border-trade-amber/50 hover:bg-trade-amber/5"
              )}
            >
              {/* Selected indicator */}
              {config.shape === shape.id && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-trade-amber rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              
              {/* Image */}
              <div className="h-16 mb-2 flex items-center justify-center">
                <img 
                  src={shape.image} 
                  alt={shape.name}
                  className="h-full w-auto object-contain rounded"
                />
              </div>
              
              {/* Label */}
              <h4 className={cn(
                "font-display font-semibold text-xs",
                config.shape === shape.id ? "text-trade-amber" : "text-trade-navy"
              )}>
                {shape.name}
              </h4>
              <p className="text-[10px] text-trade-muted mt-0.5 line-clamp-2">
                {shape.description}
              </p>
            </button>
          ))}
        </div>
        <p className="text-xs text-trade-muted mt-3 text-center">
          Click a shape to configure room dimensions
        </p>
      </div>

      {/* Room Dimension Editor Dialog */}
      <RoomDimensionEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onApply={handleDimensionsApply}
        shape={selectedShape || config.shape}
        initialDimensions={{
          roomWidth: config.roomWidth,
          roomDepth: config.roomDepth,
          roomHeight: config.roomHeight,
          cutoutWidth: config.cutoutWidth,
          cutoutDepth: config.cutoutDepth,
          islandWidth: config.islandWidth,
          islandDepth: config.islandDepth,
          peninsulaLength: config.peninsulaLength,
          peninsulaWidth: config.peninsulaWidth,
          leftWingDepth: config.leftWingDepth,
          rightWingDepth: config.rightWingDepth,
          corridorWidth: config.corridorWidth,
        }}
      />
    </div>
  );
}
