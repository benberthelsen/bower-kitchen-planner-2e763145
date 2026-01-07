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
        <svg viewBox="0 0 100 80" className="w-full h-full">
          {/* Top face */}
          <path
            d="M20 25 L50 10 L80 25 L50 40 Z"
            fill="hsl(var(--trade-amber))"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="2"
          />
          {/* Front face */}
          <path
            d="M20 25 L20 50 L50 65 L50 40 Z"
            fill="hsl(var(--trade-amber))"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="2"
          />
          {/* Right face */}
          <path
            d="M50 40 L50 65 L80 50 L80 25 Z"
            fill="hsl(var(--trade-amber) / 0.7)"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="2"
          />
          {/* Inner lines for depth */}
          <path
            d="M30 30 L50 20 L70 30"
            fill="none"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="1.5"
          />
          <path
            d="M30 30 L30 48 M50 20 L50 38"
            fill="none"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="1.5"
          />
        </svg>
      ),
    },
    {
      id: 'l-shaped',
      name: 'L-Shaped Room',
      description: 'Corner kitchen with L-shaped layout',
      icon: (
        <svg viewBox="0 0 100 80" className="w-full h-full">
          {/* Top face - L shape */}
          <path
            d="M15 30 L40 18 L40 25 L60 15 L85 28 L60 40 L60 33 L40 43 Z"
            fill="hsl(var(--trade-amber))"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="2"
          />
          {/* Left front face */}
          <path
            d="M15 30 L15 55 L40 68 L40 43 Z"
            fill="hsl(var(--trade-amber))"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="2"
          />
          {/* Inner step front face */}
          <path
            d="M40 43 L40 68 L60 58 L60 33 Z"
            fill="hsl(var(--trade-amber) / 0.85)"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="2"
          />
          {/* Right face */}
          <path
            d="M60 40 L60 58 L85 45 L85 28 Z"
            fill="hsl(var(--trade-amber) / 0.7)"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="2"
          />
          {/* Inner detail lines */}
          <path
            d="M25 35 L40 27 L40 33 L55 25"
            fill="none"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="1.5"
          />
          <path
            d="M25 35 L25 52"
            fill="none"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="1.5"
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
