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
        <svg viewBox="0 0 100 60" className="w-full h-full">
          {/* Base */}
          <path
            d="M10 50 L30 40 L90 40 L90 20 L30 20 L10 30 Z"
            fill="currentColor"
            className="text-trade-amber/20"
          />
          {/* Top face */}
          <path
            d="M10 30 L30 20 L90 20 L70 10 L10 10 Z"
            fill="currentColor"
            className="text-trade-amber/40"
          />
          {/* Left face */}
          <path
            d="M10 10 L10 30 L10 50 L10 30 Z"
            fill="currentColor"
            className="text-trade-amber/30"
          />
          {/* Outline */}
          <path
            d="M10 50 L30 40 L90 40 L90 20 L70 10 L10 10 L10 50"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-trade-amber"
          />
          <path
            d="M10 30 L30 20 M30 20 L30 40 M30 20 L90 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-trade-amber"
          />
        </svg>
      ),
    },
    {
      id: 'l-shaped',
      name: 'L-Shaped Room',
      description: 'Corner kitchen with L-shaped layout',
      icon: (
        <svg viewBox="0 0 100 60" className="w-full h-full">
          {/* Main section */}
          <path
            d="M10 50 L40 40 L40 25 L70 25 L90 15 L90 5 L50 5 L30 15 L10 15 Z"
            fill="currentColor"
            className="text-trade-amber/20"
          />
          {/* Top face main */}
          <path
            d="M10 15 L30 5 L50 5 L30 15 Z"
            fill="currentColor"
            className="text-trade-amber/40"
          />
          {/* Top face extension */}
          <path
            d="M50 5 L90 5 L70 15 L30 15 Z"
            fill="currentColor"
            className="text-trade-amber/35"
          />
          {/* Outline */}
          <path
            d="M10 50 L40 40 L40 25 L70 25 L90 15 L90 5 L50 5 L30 5 L10 15 L10 50"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-trade-amber"
          />
          <path
            d="M30 15 L30 45 M30 15 L70 15 L70 25 M50 5 L30 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-trade-amber"
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
