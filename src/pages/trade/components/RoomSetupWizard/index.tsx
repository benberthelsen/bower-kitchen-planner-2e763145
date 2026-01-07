import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import RoomShapeStep from './RoomShapeStep';
import MaterialDefaultsStep from './MaterialDefaultsStep';
import HardwareDefaultsStep from './HardwareDefaultsStep';
import DimensionDefaultsStep from './DimensionDefaultsStep';
import GapDefaultsStep from './GapDefaultsStep';

export interface RoomConfig {
  // Step 1: Shape
  name: string;
  description: string;
  shape: 'rectangular' | 'l-shaped' | 'u-shaped' | 'galley' | 'peninsula' | 'island';
  
  // Room Dimensions (floor plan)
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
  
  // Step 2: Materials
  exteriorMaterial: string;
  exteriorEdge: string;
  doorStyle: string;
  carcaseMaterial: string;
  carcaseEdge: string;
  
  // Step 3: Hardware
  hingeStyle: string;
  drawerStyle: string;
  supplyHardware: boolean;
  adjustableLegs: boolean;
  
  // Step 4: Dimensions
  toeKickHeight: number;
  shelfSetback: number;
  baseHeight: number;
  baseDepth: number;
  wallHeight: number;
  wallDepth: number;
  tallHeight: number;
  tallDepth: number;
  
  // Step 5: Gaps
  doorGap: number;
  drawerGap: number;
  leftGap: number;
  rightGap: number;
  upperTopMargin: number;
  upperBottomMargin: number;
  baseTopMargin: number;
}

const defaultConfig: RoomConfig = {
  name: '',
  description: '',
  shape: 'rectangular',
  // Room dimensions
  roomWidth: 4000,
  roomDepth: 3500,
  roomHeight: 2700,
  cutoutWidth: 2000,
  cutoutDepth: 2000,
  islandWidth: 2000,
  islandDepth: 900,
  peninsulaLength: 1800,
  peninsulaWidth: 600,
  leftWingDepth: 1500,
  rightWingDepth: 1500,
  corridorWidth: 1200,
  // Materials
  exteriorMaterial: 'Antique Wiluna White Pearl - 16.5mm Formica MR MDF',
  exteriorEdge: '1mm Antique Wiluna White Formica Pearl',
  doorStyle: 'Melamine',
  carcaseMaterial: 'White Carcase Available - 16.5mm Shop Materials HMR PB',
  carcaseEdge: '1mm Carcase White Shop Materials Available',
  hingeStyle: 'Blum Inserta',
  drawerStyle: 'Blum Metabox',
  supplyHardware: true,
  adjustableLegs: true,
  toeKickHeight: 150,
  shelfSetback: 5,
  baseHeight: 720,
  baseDepth: 560,
  wallHeight: 700,
  wallDepth: 300,
  tallHeight: 2100,
  tallDepth: 590,
  doorGap: 2,
  drawerGap: 2,
  leftGap: 1.7,
  rightGap: 1.7,
  upperTopMargin: 0,
  upperBottomMargin: 0,
  baseTopMargin: 3,
};

const steps = [
  { id: 1, name: 'Room Shape', shortName: 'Shape' },
  { id: 2, name: 'Material Defaults', shortName: 'Materials' },
  { id: 3, name: 'Hardware Defaults', shortName: 'Hardware' },
  { id: 4, name: 'Size Defaults', shortName: 'Dimensions' },
  { id: 5, name: 'Gap Defaults', shortName: 'Gaps' },
];

interface RoomSetupWizardProps {
  onComplete: (config: RoomConfig) => void;
  onCancel: () => void;
  initialConfig?: Partial<RoomConfig>;
}

export default function RoomSetupWizard({ onComplete, onCancel, initialConfig }: RoomSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<RoomConfig>({ ...defaultConfig, ...initialConfig });

  const updateConfig = (updates: Partial<RoomConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(config);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) {
      return config.name.trim().length > 0;
    }
    return true;
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <RoomShapeStep config={config} updateConfig={updateConfig} />;
      case 2:
        return <MaterialDefaultsStep config={config} updateConfig={updateConfig} />;
      case 3:
        return <HardwareDefaultsStep config={config} updateConfig={updateConfig} />;
      case 4:
        return <DimensionDefaultsStep config={config} updateConfig={updateConfig} />;
      case 5:
        return <GapDefaultsStep config={config} updateConfig={updateConfig} />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-trade-surface-elevated rounded-xl border border-trade-border overflow-hidden">
      {/* Step Indicator */}
      <div className="bg-trade-navy px-6 py-4">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <button
                onClick={() => step.id < currentStep && setCurrentStep(step.id)}
                disabled={step.id > currentStep}
                className={cn(
                  "flex items-center gap-2 transition-all",
                  step.id === currentStep && "scale-105",
                  step.id > currentStep && "opacity-40 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  step.id < currentStep && "bg-trade-success text-white",
                  step.id === currentStep && "bg-trade-amber text-white",
                  step.id > currentStep && "bg-white/20 text-white/60"
                )}>
                  {step.id < currentStep ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
                <span className={cn(
                  "hidden sm:block text-sm font-medium",
                  step.id === currentStep ? "text-white" : "text-white/60"
                )}>
                  {step.shortName}
                </span>
              </button>
              
              {index < steps.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-2",
                  step.id < currentStep ? "bg-trade-success" : "bg-white/20"
                )} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step Title */}
      <div className="bg-trade-amber/10 border-b border-trade-border px-6 py-3">
        <h3 className="font-display font-semibold text-trade-navy text-center">
          Step {currentStep}: {steps[currentStep - 1].name}
        </h3>
      </div>

      {/* Step Content */}
      <div className="p-6 min-h-[400px]">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="border-t border-trade-border px-6 py-4 flex items-center justify-between bg-trade-surface/50">
        <Button
          variant="outline"
          onClick={onCancel}
          className="border-trade-border"
        >
          Cancel
        </Button>
        
        <div className="flex items-center gap-3">
          {currentStep > 1 && (
            <Button
              variant="outline"
              onClick={handlePrevious}
              className="border-trade-border"
            >
              Previous
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="bg-trade-navy hover:bg-trade-navy-light text-white min-w-[120px]"
          >
            {currentStep === steps.length ? 'Save Room' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
