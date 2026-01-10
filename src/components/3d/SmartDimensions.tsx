import React from 'react';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedItem, RoomConfig } from '../../types';

const DimLabel = ({ position, text }: { position: [number, number, number]; text: string }) => (
  <Html position={position} center zIndexRange={[100, 0]}>
    <div className="px-1.5 py-0.5 bg-white/90 rounded border border-gray-200 text-[10px] font-mono font-medium text-gray-700 shadow-sm pointer-events-none whitespace-nowrap select-none">
      {text}
    </div>
  </Html>
);

interface SmartDimensionsProps {
  items: PlacedItem[];
  selectedItemId: string | null;
  draggedItemId: string | null;
  room: RoomConfig;
}

const SmartDimensions: React.FC<SmartDimensionsProps> = ({
  items,
  selectedItemId,
  draggedItemId,
  room,
}) => {
  const activeItem = items.find(i => i.instanceId === (draggedItemId || selectedItemId));

  if (!activeItem) return null;

  const widthM = (activeItem.width || 0) / 1000;
  const depthM = (activeItem.depth || 0) / 1000;
  const heightM = (activeItem.height || 0) / 1000;
  const xM = (activeItem.x || 0) / 1000;
  const yM = (activeItem.y || 0) / 1000;
  const zM = (activeItem.z || 0) / 1000;

  if (
    !Number.isFinite(widthM) ||
    !Number.isFinite(depthM) ||
    !Number.isFinite(heightM) ||
    !Number.isFinite(xM) ||
    !Number.isFinite(yM) ||
    !Number.isFinite(zM)
  )
    return null;

  const isRotatedOdd = ((activeItem.rotation || 0) % 180) !== 0;
  const halfW = (isRotatedOdd ? depthM : widthM) / 2;
  const halfD = (isRotatedOdd ? widthM : depthM) / 2;

  const leftEdge = xM - halfW;
  const backEdge = zM - halfD;

  const lineY = yM + 0.02;

  return (
    <group>
      {leftEdge > 0.1 && (
        <>
          <Line points={[[0, lineY, zM], [leftEdge, lineY, zM]]} color="#ef4444" lineWidth={2} />
          <DimLabel position={[leftEdge / 2, lineY + 0.1, zM]} text={`${Math.round(leftEdge * 1000)}`} />
        </>
      )}
      {backEdge > 0.1 && (
        <>
          <Line points={[[xM, lineY, 0], [xM, lineY, backEdge]]} color="#ef4444" lineWidth={2} />
          <DimLabel position={[xM, lineY + 0.1, backEdge / 2]} text={`${Math.round(backEdge * 1000)}`} />
        </>
      )}
    </group>
  );
};

export default SmartDimensions;

