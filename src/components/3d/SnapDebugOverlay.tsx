import React from 'react';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedItem, RoomConfig, GlobalDimensions } from '../../types';
import { getRotatedBounds, getEffectiveDimensions } from '../../utils/snapping/bounds';
import { SnapResult } from '../../utils/snapping/types';

interface SnapDebugOverlayProps {
  items: PlacedItem[];
  room: RoomConfig;
  globalDimensions: GlobalDimensions;
  draggedItem: PlacedItem | null;
  snapResult?: SnapResult | null;
  visible: boolean;
}

// Render bounding box wireframe for a cabinet
const CabinetBoundsBox: React.FC<{ item: PlacedItem; isDragged: boolean }> = ({ item, isDragged }) => {
  const bounds = getRotatedBounds(item);
  const dims = getEffectiveDimensions(item);
  
  const y = item.y / 1000;
  const height = item.height / 1000;
  
  // Convert mm to meters
  const left = bounds.left / 1000;
  const right = bounds.right / 1000;
  const back = bounds.back / 1000;
  const front = bounds.front / 1000;
  
  // 8 corners of the bounding box
  const corners = [
    [left, y, back],
    [right, y, back],
    [right, y, front],
    [left, y, front],
    [left, y + height, back],
    [right, y + height, back],
    [right, y + height, front],
    [left, y + height, front],
  ] as [number, number, number][];
  
  // 12 edges of the box
  const edges: [[number, number, number], [number, number, number]][] = [
    // Bottom face
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
    // Top face
    [corners[4], corners[5]],
    [corners[5], corners[6]],
    [corners[6], corners[7]],
    [corners[7], corners[4]],
    // Vertical edges
    [corners[0], corners[4]],
    [corners[1], corners[5]],
    [corners[2], corners[6]],
    [corners[3], corners[7]],
  ];
  
  const color = isDragged ? '#ff00ff' : '#00ff00';
  
  return (
    <group>
      {edges.map((edge, i) => (
        <Line
          key={i}
          points={edge}
          color={color}
          lineWidth={isDragged ? 2 : 1}
          dashed={!isDragged}
          dashSize={0.05}
          gapSize={0.03}
        />
      ))}
      <Html position={[item.x / 1000, y + height + 0.1, item.z / 1000]} center>
        <div className="bg-black/80 text-white text-[10px] px-1 py-0.5 rounded whitespace-nowrap font-mono">
          {Math.round(dims.width)}×{Math.round(dims.depth)} r:{item.rotation}°
        </div>
      </Html>
    </group>
  );
};

// Render wall inner planes (where cabinets can snap to)
const WallInnerPlanes: React.FC<{ room: RoomConfig; wallGap: number }> = ({ room, wallGap }) => {
  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;
  const heightM = room.height / 1000;
  const gapM = wallGap / 1000;
  
  // Create lines showing the inner boundary (where cabinet edges stop)
  const planes = [
    // Back wall inner plane (z = wallGap)
    { 
      points: [[0, 0, gapM], [widthM, 0, gapM], [widthM, heightM, gapM], [0, heightM, gapM], [0, 0, gapM]] as [number, number, number][],
      label: 'BACK',
      labelPos: [widthM / 2, heightM + 0.1, gapM] as [number, number, number],
      color: '#ff6b6b',
    },
    // Left wall inner plane (x = wallGap)
    {
      points: [[gapM, 0, 0], [gapM, 0, depthM], [gapM, heightM, depthM], [gapM, heightM, 0], [gapM, 0, 0]] as [number, number, number][],
      label: 'LEFT',
      labelPos: [gapM, heightM + 0.1, depthM / 2] as [number, number, number],
      color: '#4ecdc4',
    },
    // Right wall inner plane (x = room.width - wallGap)
    {
      points: [[widthM - gapM, 0, 0], [widthM - gapM, 0, depthM], [widthM - gapM, heightM, depthM], [widthM - gapM, heightM, 0], [widthM - gapM, 0, 0]] as [number, number, number][],
      label: 'RIGHT',
      labelPos: [widthM - gapM, heightM + 0.1, depthM / 2] as [number, number, number],
      color: '#ffe66d',
    },
    // Front wall inner plane (z = room.depth - wallGap)
    {
      points: [[0, 0, depthM - gapM], [widthM, 0, depthM - gapM], [widthM, heightM, depthM - gapM], [0, heightM, depthM - gapM], [0, 0, depthM - gapM]] as [number, number, number][],
      label: 'FRONT',
      labelPos: [widthM / 2, heightM + 0.1, depthM - gapM] as [number, number, number],
      color: '#a855f7',
    },
  ];
  
  return (
    <group>
      {planes.map((plane, i) => (
        <group key={i}>
          <Line
            points={plane.points}
            color={plane.color}
            lineWidth={1.5}
            dashed
            dashSize={0.1}
            gapSize={0.05}
          />
          {/* Floor boundary line (more visible) */}
          <Line
            points={[plane.points[0], plane.points[1]]}
            color={plane.color}
            lineWidth={3}
          />
          <Html position={plane.labelPos} center>
            <div 
              className="text-[9px] px-1 py-0.5 rounded font-mono font-bold"
              style={{ backgroundColor: plane.color, color: '#000' }}
            >
              {plane.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
};

// Show snap target indicator
const SnapTargetIndicator: React.FC<{ 
  snapResult: SnapResult | null; 
  items: PlacedItem[];
}> = ({ snapResult, items }) => {
  if (!snapResult) return null;
  
  const { snappedTo, snappedItemId, wallId, snapEdge } = snapResult;
  
  // Show wall snap target
  if (snappedTo === 'wall' && wallId) {
    return (
      <Html position={[snapResult.x / 1000, 1.5, snapResult.z / 1000]} center>
        <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-bold animate-pulse">
          WALL: {wallId.toUpperCase()} → {snapEdge}
        </div>
      </Html>
    );
  }
  
  // Show cabinet snap target
  if (snappedTo === 'cabinet' && snappedItemId) {
    const targetItem = items.find(i => i.instanceId === snappedItemId);
    if (targetItem) {
      return (
        <group>
          {/* Highlight the target cabinet */}
          <mesh position={[targetItem.x / 1000, targetItem.y / 1000 + targetItem.height / 2000, targetItem.z / 1000]}>
            <boxGeometry args={[targetItem.width / 1000 + 0.02, targetItem.height / 1000 + 0.02, targetItem.depth / 1000 + 0.02]} />
            <meshBasicMaterial color="#00ff00" transparent opacity={0.2} />
          </mesh>
          <Html position={[snapResult.x / 1000, 1.5, snapResult.z / 1000]} center>
            <div className="bg-green-600 text-white text-xs px-2 py-1 rounded-full font-bold animate-pulse">
              CABINET → {snapEdge}
            </div>
          </Html>
        </group>
      );
    }
  }
  
  // Show corner snap
  if (snappedTo === 'corner') {
    return (
      <Html position={[snapResult.x / 1000, 1.5, snapResult.z / 1000]} center>
        <div className="bg-orange-600 text-white text-xs px-2 py-1 rounded-full font-bold animate-pulse">
          CORNER SNAP
        </div>
      </Html>
    );
  }
  
  // Grid snap (default)
  if (snappedTo === 'grid') {
    return (
      <Html position={[snapResult.x / 1000, 0.5, snapResult.z / 1000]} center>
        <div className="bg-gray-600 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
          GRID
        </div>
      </Html>
    );
  }
  
  return null;
};

// Debug info panel
const DebugInfoPanel: React.FC<{ 
  draggedItem: PlacedItem | null;
  snapResult: SnapResult | null;
  room: RoomConfig;
  wallGap: number;
}> = ({ draggedItem, snapResult, room, wallGap }) => {
  return (
    <Html position={[0.1, 2.5, 0.1]} style={{ pointerEvents: 'none' }}>
      <div className="bg-black/90 text-white text-[10px] p-2 rounded font-mono min-w-[180px]">
        <div className="text-yellow-400 font-bold mb-1">🔧 SNAP DEBUG</div>
        <div className="border-t border-gray-600 pt-1 mt-1">
          <div>Room: {room.width}×{room.depth}mm</div>
          <div>Wall gap: {wallGap}mm</div>
        </div>
        {draggedItem && (
          <div className="border-t border-gray-600 pt-1 mt-1">
            <div className="text-cyan-400">Dragging:</div>
            <div>Pos: ({Math.round(draggedItem.x)}, {Math.round(draggedItem.z)})</div>
            <div>Size: {draggedItem.width}×{draggedItem.depth}</div>
            <div>Rot: {draggedItem.rotation}°</div>
          </div>
        )}
        {snapResult && (
          <div className="border-t border-gray-600 pt-1 mt-1">
            <div className="text-green-400">Snap result:</div>
            <div>Type: {snapResult.snappedTo}</div>
            <div>Pos: ({Math.round(snapResult.x)}, {Math.round(snapResult.z)})</div>
            {snapResult.wallId && <div>Wall: {snapResult.wallId}</div>}
            {snapResult.snapEdge && <div>Edge: {snapResult.snapEdge}</div>}
          </div>
        )}
        <div className="border-t border-gray-600 pt-1 mt-1 text-gray-400">
          Press D to toggle
        </div>
      </div>
    </Html>
  );
};

const SnapDebugOverlay: React.FC<SnapDebugOverlayProps> = ({
  items,
  room,
  globalDimensions,
  draggedItem,
  snapResult,
  visible,
}) => {
  if (!visible) return null;
  
  const wallGap = globalDimensions.wallGap;
  
  return (
    <group>
      {/* Wall inner planes */}
      <WallInnerPlanes room={room} wallGap={wallGap} />
      
      {/* Cabinet bounding boxes */}
      {items.map(item => (
        <CabinetBoundsBox
          key={item.instanceId}
          item={item}
          isDragged={draggedItem?.instanceId === item.instanceId}
        />
      ))}
      
      {/* Snap target indicator */}
      <SnapTargetIndicator snapResult={snapResult || null} items={items} />
      
      {/* Debug info panel */}
      <DebugInfoPanel
        draggedItem={draggedItem}
        snapResult={snapResult || null}
        room={room}
        wallGap={wallGap}
      />
    </group>
  );
};

export default SnapDebugOverlay;
