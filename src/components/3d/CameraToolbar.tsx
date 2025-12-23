import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Eye, Grid3X3 } from 'lucide-react';

interface CameraToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitAll: () => void;
  is3D: boolean;
  onToggleView: () => void;
}

const CameraToolbar: React.FC<CameraToolbarProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitAll,
  is3D,
  onToggleView,
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-1 z-20">
      <button
        onClick={onZoomIn}
        className="p-2 hover:bg-gray-100 rounded-md transition-colors"
        title="Zoom In"
      >
        <ZoomIn size={18} className="text-gray-700" />
      </button>
      
      <button
        onClick={onZoomOut}
        className="p-2 hover:bg-gray-100 rounded-md transition-colors"
        title="Zoom Out"
      >
        <ZoomOut size={18} className="text-gray-700" />
      </button>
      
      <div className="w-px h-6 bg-gray-200 mx-1" />
      
      <button
        onClick={onFitAll}
        className="p-2 hover:bg-gray-100 rounded-md transition-colors"
        title="Fit All"
      >
        <Maximize2 size={18} className="text-gray-700" />
      </button>
      
      <button
        onClick={onResetView}
        className="p-2 hover:bg-gray-100 rounded-md transition-colors"
        title="Reset View"
      >
        <RotateCcw size={18} className="text-gray-700" />
      </button>
      
      <div className="w-px h-6 bg-gray-200 mx-1" />
      
      <button
        onClick={onToggleView}
        className={`p-2 rounded-md transition-colors flex items-center gap-1.5 ${
          is3D ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
        }`}
        title={is3D ? 'Switch to 2D' : 'Switch to 3D'}
      >
        {is3D ? <Eye size={18} /> : <Grid3X3 size={18} />}
        <span className="text-xs font-medium">{is3D ? '3D' : '2D'}</span>
      </button>
    </div>
  );
};

export default CameraToolbar;
