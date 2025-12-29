import React from 'react';
import { Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedItem, RoomConfig } from '../../types';
import { getRotatedBounds } from '../../utils/snapping';
import { usePlanner } from '../../store/PlannerContext';

interface SnapIndicatorsProps {
  draggedItem: PlacedItem | null;
  snappedToItemId: string | null;
  snapEdge: 'left' | 'right' | 'front' | 'back' | undefined;
  items: PlacedItem[];
}

// Wall snap indicator component
const WallSnapLine: React.FC<{
  wall: 'back' | 'left' | 'right' | 'front';
  item: PlacedItem;
  room: RoomConfig;
}> = ({ wall, item, room }) => {
  const bounds = getRotatedBounds(item);
  const yPos = item.height / 1000 / 2 + 0.02;
  const lineHeight = item.height / 1000;
  
  let linePoints: [THREE.Vector3, THREE.Vector3];
  let verticalPoints: [THREE.Vector3, THREE.Vector3];
  let labelPosition: [number, number, number];
  let labelText = 'WALL';

  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;

  switch (wall) {
    case 'back':
      linePoints = [
        new THREE.Vector3(bounds.left / 1000, yPos, 0),
        new THREE.Vector3(bounds.right / 1000, yPos, 0),
      ];
      verticalPoints = [
        new THREE.Vector3((bounds.left + bounds.right) / 2000, 0.01, bounds.back / 1000),
        new THREE.Vector3((bounds.left + bounds.right) / 2000, 0.01, 0),
      ];
      labelPosition = [(bounds.left + bounds.right) / 2000, yPos + 0.15, 0.05];
      break;
    case 'left':
      linePoints = [
        new THREE.Vector3(0, yPos, bounds.back / 1000),
        new THREE.Vector3(0, yPos, bounds.front / 1000),
      ];
      verticalPoints = [
        new THREE.Vector3(bounds.left / 1000, 0.01, (bounds.back + bounds.front) / 2000),
        new THREE.Vector3(0, 0.01, (bounds.back + bounds.front) / 2000),
      ];
      labelPosition = [0.05, yPos + 0.15, (bounds.back + bounds.front) / 2000];
      break;
    case 'right':
      linePoints = [
        new THREE.Vector3(widthM, yPos, bounds.back / 1000),
        new THREE.Vector3(widthM, yPos, bounds.front / 1000),
      ];
      verticalPoints = [
        new THREE.Vector3(bounds.right / 1000, 0.01, (bounds.back + bounds.front) / 2000),
        new THREE.Vector3(widthM, 0.01, (bounds.back + bounds.front) / 2000),
      ];
      labelPosition = [widthM - 0.05, yPos + 0.15, (bounds.back + bounds.front) / 2000];
      break;
    case 'front':
      linePoints = [
        new THREE.Vector3(bounds.left / 1000, yPos, depthM),
        new THREE.Vector3(bounds.right / 1000, yPos, depthM),
      ];
      verticalPoints = [
        new THREE.Vector3((bounds.left + bounds.right) / 2000, 0.01, bounds.front / 1000),
        new THREE.Vector3((bounds.left + bounds.right) / 2000, 0.01, depthM),
      ];
      labelPosition = [(bounds.left + bounds.right) / 2000, yPos + 0.15, depthM - 0.05];
      break;
  }

  return (
    <group>
      {/* Wall edge highlight line */}
      <Line
        points={linePoints}
        color="#3b82f6"
        lineWidth={4}
        dashed={false}
      />
      {/* Glow effect */}
      <Line
        points={linePoints}
        color="#3b82f6"
        lineWidth={10}
        opacity={0.25}
        transparent
      />
      {/* Connection line from cabinet to wall */}
      <Line
        points={verticalPoints}
        color="#3b82f6"
        lineWidth={2}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
      {/* Label */}
      <Text
        position={labelPosition}
        fontSize={0.06}
        color="#3b82f6"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.004}
        outlineColor="#000000"
      >
        {labelText}
      </Text>
    </group>
  );
};

// Cabinet-to-cabinet alignment indicator
const CabinetAlignmentLine: React.FC<{
  draggedBounds: ReturnType<typeof getRotatedBounds>;
  snappedBounds: ReturnType<typeof getRotatedBounds>;
  snapEdge: 'left' | 'right' | 'front' | 'back';
  draggedItem: PlacedItem;
  snappedItem: PlacedItem;
}> = ({ draggedBounds, snappedBounds, snapEdge, draggedItem, snappedItem }) => {
  const yPos = Math.max(draggedItem.height, snappedItem.height) / 1000 / 2 + 0.05;
  
  let mainLinePoints: [THREE.Vector3, THREE.Vector3];
  let alignmentLinePoints: [THREE.Vector3, THREE.Vector3] | null = null;
  let labelPosition: [number, number, number];
  let showBackAlignment = false;

  // Check if backs are aligned
  const backAligned = Math.abs(draggedBounds.back - snappedBounds.back) < 20;
  const frontAligned = Math.abs(draggedBounds.front - snappedBounds.front) < 20;

  switch (snapEdge) {
    case 'right':
      // Dragged right edge → Snapped left edge
      mainLinePoints = [
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.back / 1000),
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.front / 1000),
      ];
      labelPosition = [draggedBounds.right / 1000, yPos + 0.12, (draggedBounds.back + draggedBounds.front) / 2 / 1000];
      
      // Show back alignment line if aligned
      if (backAligned) {
        showBackAlignment = true;
        alignmentLinePoints = [
          new THREE.Vector3(draggedBounds.left / 1000, 0.02, draggedBounds.back / 1000),
          new THREE.Vector3(snappedBounds.right / 1000, 0.02, snappedBounds.back / 1000),
        ];
      }
      break;
    case 'left':
      mainLinePoints = [
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.back / 1000),
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.front / 1000),
      ];
      labelPosition = [draggedBounds.left / 1000, yPos + 0.12, (draggedBounds.back + draggedBounds.front) / 2 / 1000];
      
      if (backAligned) {
        showBackAlignment = true;
        alignmentLinePoints = [
          new THREE.Vector3(snappedBounds.left / 1000, 0.02, snappedBounds.back / 1000),
          new THREE.Vector3(draggedBounds.right / 1000, 0.02, draggedBounds.back / 1000),
        ];
      }
      break;
    case 'front':
      mainLinePoints = [
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.front / 1000),
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.front / 1000),
      ];
      labelPosition = [(draggedBounds.left + draggedBounds.right) / 2 / 1000, yPos + 0.12, draggedBounds.front / 1000];
      break;
    case 'back':
      mainLinePoints = [
        new THREE.Vector3(draggedBounds.left / 1000, yPos, draggedBounds.back / 1000),
        new THREE.Vector3(draggedBounds.right / 1000, yPos, draggedBounds.back / 1000),
      ];
      labelPosition = [(draggedBounds.left + draggedBounds.right) / 2 / 1000, yPos + 0.12, draggedBounds.back / 1000];
      break;
  }

  return (
    <group>
      {/* Main snap line at the connection */}
      <Line
        points={mainLinePoints}
        color="#22c55e"
        lineWidth={4}
        dashed={false}
      />
      
      {/* Glow effect */}
      <Line
        points={mainLinePoints}
        color="#22c55e"
        lineWidth={10}
        opacity={0.3}
        transparent
      />
      
      {/* Back alignment line */}
      {showBackAlignment && alignmentLinePoints && (
        <>
          <Line
            points={alignmentLinePoints}
            color="#f59e0b"
            lineWidth={2}
            dashed
            dashSize={0.04}
            gapSize={0.02}
          />
          {/* Alignment indicator dots */}
          <mesh position={[alignmentLinePoints[0].x, 0.03, alignmentLinePoints[0].z]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
          <mesh position={[alignmentLinePoints[1].x, 0.03, alignmentLinePoints[1].z]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        </>
      )}
      
      {/* SNAP label */}
      <Text
        position={labelPosition}
        fontSize={0.07}
        color="#22c55e"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.004}
        outlineColor="#000000"
        fontWeight="bold"
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
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>
      
      {/* Edge highlight on dragged cabinet */}
      <mesh
        position={[
          draggedBounds.centerX / 1000,
          draggedItem.height / 1000 / 2,
          draggedBounds.centerZ / 1000,
        ]}
      >
        <boxGeometry args={[
          (draggedBounds.right - draggedBounds.left) / 1000 + 0.015,
          draggedItem.height / 1000 + 0.015,
          (draggedBounds.front - draggedBounds.back) / 1000 + 0.015,
        ]} />
        <meshBasicMaterial
          color="#22c55e"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
};

// Detect wall snap based on item position and rotation
const detectWallSnap = (item: PlacedItem, room: RoomConfig, threshold: number = 30): 'back' | 'left' | 'right' | 'front' | null => {
  const bounds = getRotatedBounds(item);
  const rotation = item.rotation % 360;
  
  // Check distance to each wall
  const distToBack = bounds.back;
  const distToLeft = bounds.left;
  const distToRight = room.width - bounds.right;
  const distToFront = room.depth - bounds.front;
  
  // Check if snapped to any wall (within threshold)
  if (distToBack < threshold && (rotation === 0 || rotation === 180)) return 'back';
  if (distToLeft < threshold && (rotation === 270 || rotation === 90)) return 'left';
  if (distToRight < threshold && (rotation === 90 || rotation === 270)) return 'right';
  if (distToFront < threshold && (rotation === 180 || rotation === 0)) return 'front';
  
  return null;
};

const SnapIndicators: React.FC<SnapIndicatorsProps> = ({
  draggedItem,
  snappedToItemId,
  snapEdge,
  items,
}) => {
  const { room } = usePlanner();
  
  if (!draggedItem) return null;

  // Check for wall snap
  const wallSnap = detectWallSnap(draggedItem, room, 30);
  
  // If snapped to a cabinet
  if (snappedToItemId && snapEdge) {
    const snappedItem = items.find(i => i.instanceId === snappedToItemId);
    if (!snappedItem) return null;

    const draggedBounds = getRotatedBounds(draggedItem);
    const snappedBounds = getRotatedBounds(snappedItem);

    return (
      <group>
        <CabinetAlignmentLine
          draggedBounds={draggedBounds}
          snappedBounds={snappedBounds}
          snapEdge={snapEdge}
          draggedItem={draggedItem}
          snappedItem={snappedItem}
        />
        {/* Also show wall snap if applicable */}
        {wallSnap && (
          <WallSnapLine wall={wallSnap} item={draggedItem} room={room} />
        )}
      </group>
    );
  }
  
  // If only wall snap (no cabinet snap)
  if (wallSnap) {
    return (
      <group>
        <WallSnapLine wall={wallSnap} item={draggedItem} room={room} />
        {/* Highlight dragged cabinet when wall snapped */}
        {(() => {
          const bounds = getRotatedBounds(draggedItem);
          return (
            <mesh
              position={[
                bounds.centerX / 1000,
                draggedItem.height / 1000 / 2,
                bounds.centerZ / 1000,
              ]}
            >
              <boxGeometry args={[
                (bounds.right - bounds.left) / 1000 + 0.015,
                draggedItem.height / 1000 + 0.015,
                (bounds.front - bounds.back) / 1000 + 0.015,
              ]} />
              <meshBasicMaterial
                color="#3b82f6"
                transparent
                opacity={0.1}
                side={THREE.BackSide}
              />
            </mesh>
          );
        })()}
      </group>
    );
  }

  return null;
};

export default SnapIndicators;
