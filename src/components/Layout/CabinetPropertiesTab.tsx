import React from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { CATALOG, TAP_OPTIONS, APPLIANCE_MODELS, HANDLE_OPTIONS } from '../../constants';
import { PlacedItem, CatalogItemDefinition } from '../../types';
import { Trash2, RotateCcw, FlipHorizontal } from 'lucide-react';

interface Props {
  item: PlacedItem;
  def: CatalogItemDefinition;
}

const CabinetPropertiesTab: React.FC<Props> = ({ item, def }) => {
  const { updateItem, removeItem, recordHistory, hardwareOptions, setHardwareOptions } = usePlanner();

  const handleChange = (field: keyof PlacedItem, value: any) => {
    recordHistory();
    updateItem(item.instanceId, { [field]: value });
  };

  const handleDimensionChange = (field: 'width' | 'height' | 'depth', value: number) => {
    recordHistory();
    updateItem(item.instanceId, { [field]: Math.max(100, Math.min(3000, value)) });
  };

  const isSinkCabinet = def.sku.includes('SINK');
  const isOvenCabinet = def.sku.includes('OV');
  const isCornerCabinet = def.sku.includes('BC') || def.sku.includes('LC') || def.sku.includes('Corner');
  const isPanel = def.sku.includes('PNL') || def.sku.includes('FILLER');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">{def.name}</div>
            <div className="text-xs text-gray-500 font-mono">{def.sku}</div>
          </div>
          <div className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
            {item.cabinetNumber || 'C--'}
          </div>
        </div>
      </div>

      {/* Dimensions */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Dimensions (mm)</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Width</label>
            <input
              type="number"
              value={item.width}
              onChange={e => handleDimensionChange('width', Number(e.target.value))}
              step={50}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Height</label>
            <input
              type="number"
              value={item.height}
              onChange={e => handleDimensionChange('height', Number(e.target.value))}
              step={50}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Depth</label>
            <input
              type="number"
              value={item.depth}
              onChange={e => handleDimensionChange('depth', Number(e.target.value))}
              step={50}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Position & Rotation */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Position</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">X</label>
            <input
              type="number"
              value={Math.round(item.x)}
              onChange={e => handleChange('x', Number(e.target.value))}
              step={50}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Z</label>
            <input
              type="number"
              value={Math.round(item.z)}
              onChange={e => handleChange('z', Number(e.target.value))}
              step={50}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Rotation</label>
            <select
              value={item.rotation}
              onChange={e => handleChange('rotation', Number(e.target.value))}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hinge / Door Opening */}
      {!isPanel && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Door Hinge Side</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleChange('hinge', 'Left')}
              className={`flex-1 px-3 py-2 text-sm rounded border ${item.hinge === 'Left' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
            >
              Left
            </button>
            <button
              onClick={() => handleChange('hinge', 'Right')}
              className={`flex-1 px-3 py-2 text-sm rounded border ${item.hinge === 'Right' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
            >
              Right
            </button>
          </div>
        </div>
      )}

      {/* End Panels */}
      {!isPanel && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">End Panels</label>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 flex-1 px-3 py-2 border rounded cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={item.endPanelLeft || false}
                onChange={e => handleChange('endPanelLeft', e.target.checked)}
                className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm">Left</span>
            </label>
            <label className="flex items-center gap-2 flex-1 px-3 py-2 border rounded cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={item.endPanelRight || false}
                onChange={e => handleChange('endPanelRight', e.target.checked)}
                className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm">Right</span>
            </label>
          </div>
        </div>
      )}

      {/* Fillers */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Filler Strips (mm)</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Left Filler</label>
            <input
              type="number"
              value={item.fillerLeft || 0}
              onChange={e => handleChange('fillerLeft', Math.max(0, Number(e.target.value)))}
              step={5}
              min={0}
              max={100}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Right Filler</label>
            <input
              type="number"
              value={item.fillerRight || 0}
              onChange={e => handleChange('fillerRight', Math.max(0, Number(e.target.value)))}
              step={5}
              min={0}
              max={100}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Corner Cabinet Options */}
      {isCornerCabinet && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Blind Side</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleChange('blindSide', 'Left')}
              className={`flex-1 px-3 py-2 text-sm rounded border ${item.blindSide === 'Left' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
            >
              Left
            </button>
            <button
              onClick={() => handleChange('blindSide', 'Right')}
              className={`flex-1 px-3 py-2 text-sm rounded border ${item.blindSide === 'Right' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
            >
              Right
            </button>
          </div>
        </div>
      )}

      {/* Sink Cabinet Options */}
      {isSinkCabinet && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Tap Style</label>
          <select
            value={item.tapId || TAP_OPTIONS[0].id}
            onChange={e => handleChange('tapId', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {TAP_OPTIONS.map(tap => (
              <option key={tap.id} value={tap.id}>{tap.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Oven Cabinet Options */}
      {isOvenCabinet && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Appliance</label>
          <select
            value={item.applianceId || APPLIANCE_MODELS[0].id}
            onChange={e => handleChange('applianceId', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {APPLIANCE_MODELS.map(app => (
              <option key={app.id} value={app.id}>{app.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Handle Selection */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Handle Style</label>
        <select
          value={hardwareOptions.handleId}
          onChange={e => setHardwareOptions({ ...hardwareOptions, handleId: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {HANDLE_OPTIONS.map(h => (
            <option key={h.id} value={h.id}>{h.name} {h.price > 0 ? `(+$${h.price})` : ''}</option>
          ))}
        </select>
      </div>

      {/* Quick Actions */}
      <div className="pt-3 border-t space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => { recordHistory(); updateItem(item.instanceId, { rotation: (item.rotation + 90) % 360 }); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            <RotateCcw size={14} />
            Rotate 90°
          </button>
          <button
            onClick={() => { recordHistory(); updateItem(item.instanceId, { hinge: item.hinge === 'Left' ? 'Right' : 'Left' }); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            <FlipHorizontal size={14} />
            Flip Hinge
          </button>
        </div>
        <button
          onClick={() => removeItem(item.instanceId)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
        >
          <Trash2 size={14} />
          Delete Cabinet
        </button>
      </div>
    </div>
  );
};

export default CabinetPropertiesTab;
