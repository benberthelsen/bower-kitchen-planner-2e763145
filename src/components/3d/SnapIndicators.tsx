import React from 'react';
import { Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedItem } from '../../types';
import { getRotatedBounds } from '../../utils/snapping';

interface SnapIndicatorsProps {
  draggedItem: PlacedItem | null;
  snappedToItemId: string | null;
  snapEdge: 'left' | 'right' | 'front' | 'back' | undefined;
  items: PlacedItem[];
}

const SnapIndicators: React.FC<SnapIndicatorsProps> = ({
  draggedItem,
  snappedToItemId,
  snapEdge,
  items,
}) => {
  if (!draggedItem || !snappedToItemId || !snapEdge) return null;

  const snappedItem = items.find(i => i.instanceId === snappedToItemId);
  if (!snappedItem) return null;

  const draggedBounds = getRotatedBounds(draggedItem);
  const snappedBounds = getRotatedBounds(snappedItem);

  // Calculate snap line positions
  let linePoints: [THREE.Vector3, THREE.Vector3] | null = null;
  let labelPosition: [number, number, number] | null = null;

  const yPos = Math.max(draggedItem.height, snappedItem.height) / 1000 / 2 + 0.05;

  switch (snapEdge) {
    case 'right':
      // Dragged right edge → Snapped left edge
      linePoints = [
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.back / 1000),
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.front / 1000),
      ];
      labelPosition = [draggedBounds.right / 1000, yPos + 0.1, (draggedBounds.back + draggedBounds.front) / 2 / 1000];
      break;
    case 'left':
      // Dragged left edge → Snapped right edge
      linePoints = [
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.back / 1000),
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.front / 1000),
      ];
      labelPosition = [draggedBounds.left / 1000, yPos + 0.1, (draggedBounds.back + draggedBounds.front) / 2 / 1000];
      break;
    case 'front':
      // Dragged front edge → Snapped back edge
      linePoints = [
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.front / 1000),
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.front / 1000),
      ];
      labelPosition = [(draggedBounds.left + draggedBounds.right) / 2 / 1000, yPos + 0.1, draggedBounds.front / 1000];
      break;
    case 'back':
      // Dragged back edge → Snapped front edge
      linePoints = [
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.back / 1000),
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.back / 1000),
      ];
      labelPosition = [(draggedBounds.left + draggedBounds.right) / 2 / 1000, yPos + 0.1, draggedBounds.back / 1000];
      break;
  }

  if (!linePoints || !labelPosition) return null;

  return (
    <group>
      {/* Snap indicator line */}
      <Line
        points={linePoints}
        color="#22c55e"
        lineWidth={3}
        dashed={false}
      />
      
      {/* Glow effect line behind */}
      <Line
        points={linePoints}
        color="#22c55e"
        lineWidth={8}
        opacity={0.3}
        transparent
      />
      
      {/* Label showing "0mm" for flush snap */}
      <Text
        position={labelPosition}
        fontSize={0.08}
        color="#22c55e"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.005}
        outlineColor="#000000"
      >
        SNAP
      </Text>
      
      {/* Highlight box around snapped cabinet */}
      <mesh
        position={[
          snappedBounds.centerX / 1000,
          snappedItem.height / 1000 / 2,
          snappedBounds.centerZ / 1000,
        ]}
      >
        <boxGeometry args={[
          (snappedBounds.right - snappedBounds.left) / 1000 + 0.02,
          snappedItem.height / 1000 + 0.02,
          (snappedBounds.front - snappedBounds.back) / 1000 + 0.02,
        ]} />
        <meshBasicMaterial
          color="#22c55e"
          transparent
          opacity={0.15}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
};

export default SnapIndicators;
