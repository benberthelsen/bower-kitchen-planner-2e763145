import React from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { RoomShape } from '../../types';

const RoomConfigPanel: React.FC = () => {
  const { room, setRoom } = usePlanner();

  const updateRoom = (field: keyof typeof room, value: any) => {
    setRoom({ ...room, [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* Room Shape */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Room Shape</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updateRoom('shape', 'Rectangle')}
            className={`p-3 rounded border flex flex-col items-center gap-2 transition-colors ${
              room.shape === 'Rectangle' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <svg width="48" height="36" viewBox="0 0 48 36">
              <rect x="4" y="4" width="40" height="28" fill="none" stroke={room.shape === 'Rectangle' ? '#3b82f6' : '#9ca3af'} strokeWidth="2" />
            </svg>
            <span className="text-xs font-medium">Rectangle</span>
          </button>
          <button
            onClick={() => updateRoom('shape', 'LShape')}
            className={`p-3 rounded border flex flex-col items-center gap-2 transition-colors ${
              room.shape === 'LShape' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <svg width="48" height="36" viewBox="0 0 48 36">
              <path d="M4 4 H44 V20 H24 V32 H4 Z" fill="none" stroke={room.shape === 'LShape' ? '#3b82f6' : '#9ca3af'} strokeWidth="2" />
            </svg>
            <span className="text-xs font-medium">L-Shape</span>
          </button>
        </div>
      </div>

      {/* Main Dimensions */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Room Dimensions (mm)</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Width</label>
            <input
              type="number"
              value={room.width}
              onChange={e => updateRoom('width', Math.max(1000, Number(e.target.value)))}
              step={100}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Depth</label>
            <input
              type="number"
              value={room.depth}
              onChange={e => updateRoom('depth', Math.max(1000, Number(e.target.value)))}
              step={100}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Height</label>
            <input
              type="number"
              value={room.height}
              onChange={e => updateRoom('height', Math.max(2000, Math.min(3500, Number(e.target.value))))}
              step={100}
              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* L-Shape Cutout Dimensions */}
      {room.shape === 'LShape' && (
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Cutout Dimensions (mm)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Cutout Width</label>
              <input
                type="number"
                value={room.cutoutWidth}
                onChange={e => updateRoom('cutoutWidth', Math.max(500, Math.min(room.width - 500, Number(e.target.value))))}
                step={100}
                className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Cutout Depth</label>
              <input
                type="number"
                value={room.cutoutDepth}
                onChange={e => updateRoom('cutoutDepth', Math.max(500, Math.min(room.depth - 500, Number(e.target.value))))}
                step={100}
                className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            The cutout is positioned at the top-right corner of the room.
          </p>
        </div>
      )}

      {/* Room Preview */}
      <div className="pt-3 border-t">
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Preview</label>
        <div className="bg-gray-100 rounded p-4 flex items-center justify-center">
          <svg 
            viewBox={`0 0 ${Math.max(room.width, room.shape === 'LShape' ? room.width : 0)} ${room.depth}`} 
            className="w-full max-h-24"
            style={{ aspectRatio: `${room.width}/${room.depth}` }}
          >
            {room.shape === 'Rectangle' ? (
              <rect 
                x="0" 
                y="0" 
                width={room.width} 
                height={room.depth} 
                fill="#e5e7eb" 
                stroke="#6b7280" 
                strokeWidth={room.width / 50}
              />
            ) : (
              <path 
                d={`M0 0 H${room.width} V${room.depth - room.cutoutDepth} H${room.cutoutWidth} V${room.depth} H0 Z`}
                fill="#e5e7eb" 
                stroke="#6b7280" 
                strokeWidth={room.width / 50}
              />
            )}
          </svg>
        </div>
        <div className="text-center text-[10px] text-gray-500 mt-2">
          {(room.width / 1000).toFixed(1)}m × {(room.depth / 1000).toFixed(1)}m
          {room.shape === 'LShape' && ` (cutout: ${(room.cutoutWidth / 1000).toFixed(1)}m × ${(room.cutoutDepth / 1000).toFixed(1)}m)`}
        </div>
      </div>
    </div>
  );
};

export default RoomConfigPanel;
