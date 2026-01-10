import React from 'react';
import { usePlanner } from '@/store/PlannerContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw, Ruler, Layers, Settings2 } from 'lucide-react';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { Separator } from '@/components/ui/separator';

/**
 * ConstructionTab - Controls global manufacturing variables (Microvellum-style)
 * Allows users to adjust board thicknesses, reveals, and 32mm system settings
 */
const ConstructionTab: React.FC = () => {
  const { globalDimensions, setGlobalDimensions } = usePlanner();

  const handleChange = (key: keyof typeof globalDimensions, value: number) => {
    setGlobalDimensions({ ...globalDimensions, [key]: value });
  };

  const resetToDefaults = () => {
    setGlobalDimensions({
      ...globalDimensions,
      boardThickness: DEFAULT_GLOBAL_DIMENSIONS.boardThickness,
      backPanelSetback: DEFAULT_GLOBAL_DIMENSIONS.backPanelSetback,
      topReveal: DEFAULT_GLOBAL_DIMENSIONS.topReveal,
      sideReveal: DEFAULT_GLOBAL_DIMENSIONS.sideReveal,
      handleDrillSpacing: DEFAULT_GLOBAL_DIMENSIONS.handleDrillSpacing,
      doorGap: DEFAULT_GLOBAL_DIMENSIONS.doorGap,
      drawerGap: DEFAULT_GLOBAL_DIMENSIONS.drawerGap,
    });
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Construction Standards</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={resetToDefaults} className="text-xs">
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Microvellum-compliant manufacturing parameters for cabinet construction
      </p>

      <Separator />

      {/* Board Thicknesses */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Board Thicknesses</h4>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Gable / Shelf Thickness</Label>
            <Select
              value={String(globalDimensions.boardThickness)}
              onValueChange={(v) => handleChange('boardThickness', parseInt(v))}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16">16mm</SelectItem>
                <SelectItem value="18">18mm (Standard)</SelectItem>
                <SelectItem value="25">25mm</SelectItem>
                <SelectItem value="32">32mm</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Setbacks & Reveals */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Setbacks & Reveals</h4>
        </div>

        <div className="space-y-4">
          {/* Back Panel Setback */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Back Panel Setback</Label>
              <span className="text-xs text-muted-foreground">{globalDimensions.backPanelSetback}mm</span>
            </div>
            <Slider
              value={[globalDimensions.backPanelSetback]}
              onValueChange={([v]) => handleChange('backPanelSetback', v)}
              min={10}
              max={25}
              step={1}
              className="w-full"
            />
            <p className="text-[10px] text-muted-foreground">Distance from rear for hanging rails</p>
          </div>

          {/* Door Gap */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Door Gap</Label>
              <span className="text-xs text-muted-foreground">{globalDimensions.doorGap}mm</span>
            </div>
            <Slider
              value={[globalDimensions.doorGap]}
              onValueChange={([v]) => handleChange('doorGap', v)}
              min={1}
              max={5}
              step={0.5}
              className="w-full"
            />
          </div>

          {/* Drawer Gap */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Drawer Gap</Label>
              <span className="text-xs text-muted-foreground">{globalDimensions.drawerGap}mm</span>
            </div>
            <Slider
              value={[globalDimensions.drawerGap]}
              onValueChange={([v]) => handleChange('drawerGap', v)}
              min={1}
              max={5}
              step={0.5}
              className="w-full"
            />
          </div>

          {/* Top Reveal */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Top Reveal</Label>
              <span className="text-xs text-muted-foreground">{globalDimensions.topReveal}mm</span>
            </div>
            <Slider
              value={[globalDimensions.topReveal]}
              onValueChange={([v]) => handleChange('topReveal', v)}
              min={1}
              max={6}
              step={0.5}
              className="w-full"
            />
            <p className="text-[10px] text-muted-foreground">Gap above door fronts</p>
          </div>

          {/* Side Reveal */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Side Reveal</Label>
              <span className="text-xs text-muted-foreground">{globalDimensions.sideReveal}mm</span>
            </div>
            <Slider
              value={[globalDimensions.sideReveal]}
              onValueChange={([v]) => handleChange('sideReveal', v)}
              min={1}
              max={4}
              step={0.5}
              className="w-full"
            />
            <p className="text-[10px] text-muted-foreground">Gap beside door fronts</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* 32mm System */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">32mm System</h4>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Handle Drill Spacing</Label>
            <Select
              value={String(globalDimensions.handleDrillSpacing)}
              onValueChange={(v) => handleChange('handleDrillSpacing', parseInt(v))}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="32">32mm</SelectItem>
                <SelectItem value="64">64mm</SelectItem>
                <SelectItem value="96">96mm</SelectItem>
                <SelectItem value="128">128mm</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Center-to-center handle hole spacing</p>
          </div>
        </div>
      </div>

      {/* Info Footer */}
      <div className="mt-6 p-3 bg-muted/50 rounded-lg">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Microvellum Standards:</strong> These parameters follow industry-standard 
          32mm system drilling patterns. Changes apply to all cabinets in the project.
        </p>
      </div>
    </div>
  );
};

export default ConstructionTab;
