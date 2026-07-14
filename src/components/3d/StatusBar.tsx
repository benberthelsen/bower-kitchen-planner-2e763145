import React from 'react';
import { MousePointer, Move, Hand, Plus } from 'lucide-react';

interface StatusBarProps {
  mode: 'select' | 'place' | 'drag';
  placementItemName?: string;
  snapStatus?: string;
  selectedInfo?: string;
}

const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  placementItemName,
  snapStatus,
  selectedInfo,
}) => {
  const getModeInfo = () => {
    switch (mode) {
      case 'place':
        return {
          icon: <Plus size={14} />,
          text: `Placing: ${placementItemName || 'Cabinet'}`,
          hint: 'Click to place • Escape to cancel',
          color: 'bg-green-500',
        };
      case 'drag':
        return {
          icon: <Move size={14} />,
          text: 'Dragging',
          hint: 'Release to drop',
          color: 'bg-blue-500',
        };
      default:
        return {
          icon: <MousePointer size={14} />,
          text: 'Select',
          hint: selectedInfo || 'Click cabinet to select • Drag to move',
          color: 'bg-gray-500',
        };
    }
  };

  const info = getModeInfo();

  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-3 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 px-3 py-2 z-20">
      {/* Mode indicator */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${info.color}`} />
        <span className="text-xs font-medium text-gray-700">{info.text}</span>
      </div>
      
      {/* Snap status */}
      {snapStatus && (
        <>
          <div className="w-px h-4 bg-gray-200" />
          <span className="text-xs text-green-600 font-medium">{snapStatus}</span>
        </>
      )}
      
      {/* Hint */}
      <div className="w-px h-4 bg-gray-200" />
      <span className="text-xs text-gray-500">{info.hint}</span>
    </div>
  );
};

export default StatusBar;
