import React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RoomConfig } from './index';

interface HardwareDefaultsStepProps {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

const hingeOptions = [
  { id: 'blum-inserta', name: 'Blum Inserta', description: 'Soft-close concealed hinge' },
  { id: 'blum-clip-top', name: 'Blum Clip Top', description: 'Tool-free installation' },
  { id: 'hettich-sensys', name: 'Hettich Sensys', description: 'Silent close system' },
  { id: 'grass-tiomos', name: 'Grass Tiomos', description: 'Premium soft-close' },
];

const drawerOptions = [
  { id: 'blum-metabox', name: 'Blum Metabox', description: 'Steel drawer system' },
  { id: 'blum-tandembox', name: 'Blum Tandembox', description: 'Premium drawer system' },
  { id: 'blum-legrabox', name: 'Blum Legrabox', description: 'Sleek design drawer' },
  { id: 'hettich-innotech', name: 'Hettich InnoTech', description: 'Modern drawer system' },
];

const supplyMethods = [
  { id: 'assembled', name: 'Assembled', description: 'Ready to install', icon: '🏠' },
  { id: 'flatpack', name: 'Flat Pack', description: 'Assembly required', icon: '📦' },
];

const hardwareInclusions = [
  { id: 'supply-hardware', name: 'Supply Hardware', description: 'Include all hardware', icon: '🔧' },
  { id: 'drill-only', name: 'Drill Panels Only', description: 'No hardware included', icon: '🔩' },
];

const legOptions = [
  { id: 'adjustable', name: 'Adjustable Legs', description: 'Height adjustable cabinet legs', icon: '⬆️' },
  { id: 'no-legs', name: 'No Adjustable Legs', description: 'Fixed height installation', icon: '➖' },
];

function OptionCard({ 
  selected, 
  onClick, 
  icon, 
  name, 
  description 
}: { 
  selected: boolean; 
  onClick: () => void;
  icon: string;
  name: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-4 rounded-xl border-2 transition-all text-left",
        selected
          ? "border-trade-amber bg-trade-amber/5"
          : "border-trade-border bg-white hover:border-trade-amber/50"
      )}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-trade-amber rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
      <div className="text-2xl mb-2">{icon}</div>
      <h4 className={cn(
        "font-semibold",
        selected ? "text-trade-amber" : "text-trade-navy"
      )}>
        {name}
      </h4>
      <p className="text-xs text-trade-muted mt-0.5">{description}</p>
    </button>
  );
}

export default function HardwareDefaultsStep({ config, updateConfig }: HardwareDefaultsStepProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <p className="text-center text-trade-muted">
        Configure default hardware selections for this room.
      </p>

      {/* Supply Method */}
      <div>
        <Label className="text-trade-navy font-medium flex items-center gap-2 mb-3">
          Product Supply Method
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-4 w-4 text-trade-muted" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">Choose whether cabinets are delivered assembled or as flat pack for on-site assembly.</p>
            </TooltipContent>
          </Tooltip>
        </Label>
        <div className="grid grid-cols-2 gap-4">
          {supplyMethods.map((method) => (
            <OptionCard
              key={method.id}
              selected={method.id === 'assembled' ? config.supplyHardware : !config.supplyHardware}
              onClick={() => updateConfig({ supplyHardware: method.id === 'assembled' })}
              icon={method.icon}
              name={method.name}
              description={method.description}
            />
          ))}
        </div>
      </div>

      {/* Hardware Inclusions */}
      <div>
        <Label className="text-trade-navy font-medium flex items-center gap-2 mb-3">
          Hardware Inclusions
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-4 w-4 text-trade-muted" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">Select whether hardware (hinges, runners, handles) should be included.</p>
            </TooltipContent>
          </Tooltip>
        </Label>
        <div className="grid grid-cols-2 gap-4">
          {hardwareInclusions.map((option) => (
            <OptionCard
              key={option.id}
              selected={option.id === 'supply-hardware' ? config.supplyHardware : !config.supplyHardware}
              onClick={() => updateConfig({ supplyHardware: option.id === 'supply-hardware' })}
              icon={option.icon}
              name={option.name}
              description={option.description}
            />
          ))}
        </div>
      </div>

      {/* Adjustable Legs */}
      <div>
        <Label className="text-trade-navy font-medium flex items-center gap-2 mb-3">
          Adjustable Legs
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-4 w-4 text-trade-muted" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">Adjustable legs allow for leveling on uneven floors.</p>
            </TooltipContent>
          </Tooltip>
        </Label>
        <div className="grid grid-cols-2 gap-4">
          {legOptions.map((option) => (
            <OptionCard
              key={option.id}
              selected={option.id === 'adjustable' ? config.adjustableLegs : !config.adjustableLegs}
              onClick={() => updateConfig({ adjustableLegs: option.id === 'adjustable' })}
              icon={option.icon}
              name={option.name}
              description={option.description}
            />
          ))}
        </div>
      </div>

      {/* Hinge & Drawer Selection */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-3">
          <Label className="text-trade-navy font-medium flex items-center gap-2">
            Default Hinge Style
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-trade-muted" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Select the default hinge brand and style for door cabinets.</p>
              </TooltipContent>
            </Tooltip>
          </Label>
          <Select 
            value={config.hingeStyle} 
            onValueChange={(value) => updateConfig({ hingeStyle: value })}
          >
            <SelectTrigger className="border-trade-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hingeOptions.map((hinge) => (
                <SelectItem key={hinge.id} value={hinge.name}>
                  <div>
                    <span className="font-medium">{hinge.name}</span>
                    <span className="text-trade-muted text-xs ml-2">- {hinge.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Hinge Image Placeholder */}
          <div className="bg-trade-surface rounded-lg p-4 flex items-center justify-center h-32">
            <div className="text-center text-trade-muted">
              <div className="text-4xl mb-2">🔧</div>
              <p className="text-sm">{config.hingeStyle}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-trade-navy font-medium flex items-center gap-2">
            Default Drawer Style
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-trade-muted" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Select the default drawer runner system for drawer cabinets.</p>
              </TooltipContent>
            </Tooltip>
          </Label>
          <Select 
            value={config.drawerStyle} 
            onValueChange={(value) => updateConfig({ drawerStyle: value })}
          >
            <SelectTrigger className="border-trade-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {drawerOptions.map((drawer) => (
                <SelectItem key={drawer.id} value={drawer.name}>
                  <div>
                    <span className="font-medium">{drawer.name}</span>
                    <span className="text-trade-muted text-xs ml-2">- {drawer.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Drawer Image Placeholder */}
          <div className="bg-trade-surface rounded-lg p-4 flex items-center justify-center h-32">
            <div className="text-center text-trade-muted">
              <div className="text-4xl mb-2">🗄️</div>
              <p className="text-sm">{config.drawerStyle}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
