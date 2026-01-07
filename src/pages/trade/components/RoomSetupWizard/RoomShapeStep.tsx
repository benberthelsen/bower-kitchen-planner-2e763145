import React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RoomConfig } from './index';

interface RoomShapeStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

export default function RoomShapeStep({ config, updateConfig }: RoomShapeStepProps) {
  const shapes = [
    {
      id: 'rectangular',
      name: 'Rectangular Room',
      description: 'Standard rectangular kitchen layout',
      icon: (
        <svg viewBox="0 0 100 70" className="w-full h-full">
          {/* Floor */}
          <path
            d="M15 55 L50 42 L85 55 L50 68 Z"
            fill="hsl(var(--trade-amber) / 0.15)"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Back wall */}
          <path
            d="M15 55 L15 25 L50 12 L50 42 Z"
            fill="hsl(var(--trade-amber) / 0.25)"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Right wall */}
          <path
            d="M50 42 L50 12 L85 25 L85 55 Z"
            fill="hsl(var(--trade-amber) / 0.2)"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Top edge highlight */}
          <path
            d="M15 25 L50 12 L85 25"
            fill="none"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="2"
          />
        </svg>
      ),
    },
    {
      id: 'l-shaped',
      name: 'L-Shaped Room',
      description: 'Corner kitchen with L-shaped layout',
      icon: (
        <svg viewBox="0 0 100 70" className="w-full h-full">
          {/* Floor - L shape */}
          <path
            d="M10 52 L32 43 L32 35 L58 25 L90 38 L90 55 L58 68 L58 60 L32 68 Z"
            fill="hsl(var(--trade-amber) / 0.15)"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Back wall left section */}
          <path
            d="M10 52 L10 28 L32 18 L32 43 Z"
            fill="hsl(var(--trade-amber) / 0.25)"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Back wall right section (upper) */}
          <path
            d="M32 35 L32 18 L58 8 L58 25 Z"
            fill="hsl(var(--trade-amber) / 0.25)"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Right wall */}
          <path
            d="M58 25 L58 8 L90 20 L90 38 Z"
            fill="hsl(var(--trade-amber) / 0.2)"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Inner corner floor step */}
          <path
            d="M32 43 L32 35 L58 25 L58 60"
            fill="none"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="1.5"
          />
          {/* Top edge highlight */}
          <path
            d="M10 28 L32 18 L58 8 L90 20"
            fill="none"
            stroke="hsl(var(--trade-amber))"
            strokeWidth="2"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
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
        <div className="grid grid-cols-2 gap-4">
          {shapes.map((shape) => (
            <button
              key={shape.id}
              onClick={() => updateConfig({ shape: shape.id as RoomConfig['shape'] })}
              className={cn(
                "relative p-6 rounded-xl border-2 transition-all text-left group",
                config.shape === shape.id
                  ? "border-trade-amber bg-trade-amber/5 shadow-lg"
                  : "border-trade-border bg-white hover:border-trade-amber/50 hover:bg-trade-amber/5"
              )}
            >
              {/* Selected indicator */}
              {config.shape === shape.id && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-trade-amber rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              
              {/* Icon */}
              <div className="h-24 mb-4">
                {shape.icon}
              </div>
              
              {/* Label */}
              <h4 className={cn(
                "font-display font-semibold text-lg",
                config.shape === shape.id ? "text-trade-amber" : "text-trade-navy"
              )}>
                {shape.name}
              </h4>
              <p className="text-sm text-trade-muted mt-1">
                {shape.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
