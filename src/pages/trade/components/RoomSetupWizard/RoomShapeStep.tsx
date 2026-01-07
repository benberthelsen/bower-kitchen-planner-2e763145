import React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RoomConfig } from './index';
import roomRectangular from '@/assets/room-rectangular.png';
import roomLShaped from '@/assets/room-l-shaped.png';
import roomUShaped from '@/assets/room-u-shaped.png';
import roomGalley from '@/assets/room-galley.png';
import roomPeninsula from '@/assets/room-peninsula.png';

interface RoomShapeStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

export default function RoomShapeStep({ config, updateConfig }: RoomShapeStepProps) {
  const shapes = [
    {
      id: 'rectangular',
      name: 'Rectangular',
      description: 'Standard rectangular kitchen layout',
      image: roomRectangular,
    },
    {
      id: 'l-shaped',
      name: 'L-Shaped',
      description: 'Corner kitchen with L-shaped layout',
      image: roomLShaped,
    },
    {
      id: 'u-shaped',
      name: 'U-Shaped',
      description: 'Three-wall wraparound layout',
      image: roomUShaped,
    },
    {
      id: 'galley',
      name: 'Galley',
      description: 'Parallel counters in corridor style',
      image: roomGalley,
    },
    {
      id: 'peninsula',
      name: 'Peninsula',
      description: 'L-shape with extending counter',
      image: roomPeninsula,
    },
  ];

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {shapes.map((shape) => (
            <button
              key={shape.id}
              onClick={() => updateConfig({ shape: shape.id as RoomConfig['shape'] })}
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
              <div className="h-20 mb-3 flex items-center justify-center">
                <img 
                  src={shape.image} 
                  alt={shape.name}
                  className="h-full w-auto object-contain"
                />
              </div>
              
              {/* Label */}
              <h4 className={cn(
                "font-display font-semibold text-sm",
                config.shape === shape.id ? "text-trade-amber" : "text-trade-navy"
              )}>
                {shape.name}
              </h4>
              <p className="text-xs text-trade-muted mt-1 line-clamp-2">
                {shape.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
