import React from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { HANDLE_OPTIONS, HINGE_OPTIONS, DRAWER_OPTIONS } from '../../constants';

const HardwareOptionsPanel: React.FC = () => {
  const { hardwareOptions, setHardwareOptions } = usePlanner();

  const update = (field: keyof typeof hardwareOptions, value: any) => {
    setHardwareOptions({ ...hardwareOptions, [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* Handle Selection */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Handle Style</label>
        <div className="grid grid-cols-2 gap-2">
          {HANDLE_OPTIONS.map(handle => (
            <button
              key={handle.id}
              onClick={() => update('handleId', handle.id)}
              className={`flex items-center gap-2 p-2 rounded border text-left transition-colors ${
                hardwareOptions.handleId === handle.id 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div 
                className="w-6 h-6 rounded-full border-2 border-gray-300"
                style={{ backgroundColor: handle.hex === 'transparent' ? '#f3f4f6' : handle.hex }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{handle.name}</div>
                {handle.price > 0 && <div className="text-[10px] text-gray-500">+${handle.price}/ea</div>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Hinge Type */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Hinge Type</label>
        <select
          value={hardwareOptions.hingeType}
          onChange={e => update('hingeType', e.target.value)}
          className="w-full px-2 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {HINGE_OPTIONS.map(hinge => (
            <option key={hinge} value={hinge}>{hinge}</option>
          ))}
        </select>
      </div>

      {/* Drawer Runner Type */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Drawer Runner</label>
        <select
          value={hardwareOptions.drawerType}
          onChange={e => update('drawerType', e.target.value)}
          className="w-full px-2 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {DRAWER_OPTIONS.map(drawer => (
            <option key={drawer} value={drawer}>{drawer}</option>
          ))}
        </select>
      </div>

      {/* Cabinet Top */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Cabinet Top Style</label>
        <select
          value={hardwareOptions.cabinetTop}
          onChange={e => update('cabinetTop', e.target.value)}
          className="w-full px-2 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="Rail On Flat">Rail On Flat</option>
          <option value="Full Top">Full Top</option>
          <option value="Open Top">Open Top</option>
        </select>
      </div>

      {/* Toggle Options */}
      <div className="space-y-3">
        <label className="flex items-center justify-between p-3 border rounded cursor-pointer hover:bg-gray-50">
          <div>
            <div className="text-sm font-medium">Supply Hardware</div>
            <div className="text-xs text-gray-500">Include hinges, runners, etc.</div>
          </div>
          <input
            type="checkbox"
            checked={hardwareOptions.supplyHardware}
            onChange={e => update('supplyHardware', e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
          />
        </label>

        <label className="flex items-center justify-between p-3 border rounded cursor-pointer hover:bg-gray-50">
          <div>
            <div className="text-sm font-medium">Adjustable Legs</div>
            <div className="text-xs text-gray-500">Plastic leveling feet</div>
          </div>
          <input
            type="checkbox"
            checked={hardwareOptions.adjustableLegs}
            onChange={e => update('adjustableLegs', e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
          />
        </label>
      </div>
    </div>
  );
};

export default HardwareOptionsPanel;
