import React from 'react';
import { Trash2, Copy, RotateCw, FlipHorizontal, Move } from 'lucide-react';

interface SelectionToolbarProps {
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: () => void;
  onFlipHinge: () => void;
  cabinetNumber?: string;
  sku?: string;
}

const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  onDelete,
  onDuplicate,
  onRotate,
  onFlipHinge,
  cabinetNumber,
  sku,
}) => {
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-1 z-20">
      {/* Cabinet info */}
      {cabinetNumber && (
        <>
          <div className="px-3 py-1.5 flex items-center gap-2">
            <span className="text-xs font-bold text-blue-600">{cabinetNumber}</span>
            {sku && <span className="text-xs text-gray-500">{sku}</span>}
          </div>
          <div className="w-px h-6 bg-gray-200" />
        </>
      )}
      
      <button
        onClick={onRotate}
        className="p-2 hover:bg-gray-100 rounded-md transition-colors group"
        title="Rotate 90° (R)"
      >
        <RotateCw size={18} className="text-gray-700 group-hover:text-blue-600" />
      </button>
      
      <button
        onClick={onFlipHinge}
        className="p-2 hover:bg-gray-100 rounded-md transition-colors group"
        title="Flip Hinge"
      >
        <FlipHorizontal size={18} className="text-gray-700 group-hover:text-blue-600" />
      </button>
      
      <button
        onClick={onDuplicate}
        className="p-2 hover:bg-gray-100 rounded-md transition-colors group"
        title="Duplicate (Ctrl+D)"
      >
        <Copy size={18} className="text-gray-700 group-hover:text-blue-600" />
      </button>
      
      <div className="w-px h-6 bg-gray-200 mx-1" />
      
      <button
        onClick={onDelete}
        className="p-2 hover:bg-red-50 rounded-md transition-colors group"
        title="Delete (Del)"
      >
        <Trash2 size={18} className="text-gray-700 group-hover:text-red-600" />
      </button>
    </div>
  );
};

export default SelectionToolbar;
