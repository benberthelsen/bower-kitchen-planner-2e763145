import React from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { GlobalDimensions } from '../../types';
import { DEFAULT_GLOBAL_DIMENSIONS } from '../../constants';

const DimensionInput = ({ 
  label, 
  value, 
  onChange, 
  min = 0, 
  max = 3000, 
  step = 1,
  suffix = 'mm'
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) => (
  <div>
    <label className="block text-[10px] text-gray-500 mb-0.5">{label}</label>
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        step={step}
        className="w-full px-2 py-1.5 pr-8 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{suffix}</span>
    </div>
  </div>
);

const GlobalDimensionsPanel: React.FC = () => {
  const { globalDimensions, setGlobalDimensions } = usePlanner();

  const update = (field: keyof GlobalDimensions, value: number) => {
    setGlobalDimensions({ ...globalDimensions, [field]: value });
  };

  const resetToDefaults = () => {
    setGlobalDimensions(DEFAULT_GLOBAL_DIMENSIONS);
  };

  return (
    <div className="space-y-4">
      {/* Base Cabinet Defaults */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Base Cabinets</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DimensionInput label="Height" value={globalDimensions.baseHeight} onChange={v => update('baseHeight', v)} min={600} max={900} step={10} />
          <DimensionInput label="Depth" value={globalDimensions.baseDepth} onChange={v => update('baseDepth', v)} min={400} max={700} step={5} />
          <DimensionInput label="Toe Kick" value={globalDimensions.toeKickHeight} onChange={v => update('toeKickHeight', v)} min={50} max={200} step={5} />
          <DimensionInput label="Shelf Setback" value={globalDimensions.shelfSetback} onChange={v => update('shelfSetback', v)} min={0} max={50} step={1} />
        </div>
      </div>

      {/* Wall Cabinet Defaults */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Wall Cabinets</h3>
        <div className="grid grid-cols-2 gap-2">
          <DimensionInput label="Height" value={globalDimensions.wallHeight} onChange={v => update('wallHeight', v)} min={300} max={1200} step={10} />
          <DimensionInput label="Depth" value={globalDimensions.wallDepth} onChange={v => update('wallDepth', v)} min={200} max={500} step={5} />
        </div>
      </div>

      {/* Tall Cabinet Defaults */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Tall Cabinets</h3>
        <div className="grid grid-cols-2 gap-2">
          <DimensionInput label="Height" value={globalDimensions.tallHeight} onChange={v => update('tallHeight', v)} min={1800} max={2700} step={10} />
          <DimensionInput label="Depth" value={globalDimensions.tallDepth} onChange={v => update('tallDepth', v)} min={400} max={700} step={5} />
        </div>
      </div>

      {/* Benchtop & Splashback */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Benchtop & Splashback</h3>
        <div className="grid grid-cols-2 gap-2">
          <DimensionInput label="Thickness" value={globalDimensions.benchtopThickness} onChange={v => update('benchtopThickness', v)} min={20} max={60} step={1} />
          <DimensionInput label="Overhang" value={globalDimensions.benchtopOverhang} onChange={v => update('benchtopOverhang', v)} min={0} max={100} step={5} />
          <DimensionInput label="Splashback Height" value={globalDimensions.splashbackHeight} onChange={v => update('splashbackHeight', v)} min={0} max={900} step={10} />
        </div>
      </div>

      {/* Gaps & Margins */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Gaps & Margins</h3>
        <div className="grid grid-cols-2 gap-2">
          <DimensionInput label="Door Gap" value={globalDimensions.doorGap} onChange={v => update('doorGap', v)} min={1} max={5} step={0.5} />
          <DimensionInput label="Drawer Gap" value={globalDimensions.drawerGap} onChange={v => update('drawerGap', v)} min={1} max={5} step={0.5} />
          <DimensionInput label="Left Gap" value={globalDimensions.leftGap} onChange={v => update('leftGap', v)} min={0} max={10} step={0.5} />
          <DimensionInput label="Right Gap" value={globalDimensions.rightGap} onChange={v => update('rightGap', v)} min={0} max={10} step={0.5} />
          <DimensionInput label="Top Margin" value={globalDimensions.topMargin} onChange={v => update('topMargin', v)} min={0} max={20} step={1} />
          <DimensionInput label="Bottom Margin" value={globalDimensions.bottomMargin} onChange={v => update('bottomMargin', v)} min={0} max={20} step={1} />
          <DimensionInput label="Wall Gap" value={globalDimensions.wallGap} onChange={v => update('wallGap', v)} min={0} max={20} step={1} />
        </div>
      </div>

      {/* Reset Button */}
      <div className="pt-3 border-t">
        <button
          onClick={resetToDefaults}
          className="w-full px-3 py-2 text-sm border rounded hover:bg-gray-50 text-gray-600"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};

export default GlobalDimensionsPanel;
