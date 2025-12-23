import React, { useState } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { PlacedItem } from '../../types';
import { CATALOG, TAP_OPTIONS } from '../../constants';
import * as THREE from 'three';

interface Props {
  item: PlacedItem;
}

const ApplianceMesh: React.FC<Props> = ({ item }) => {
  const { selectItem, selectedItemId, draggedItemId, startDrag, globalDimensions } = usePlanner();
  const def = CATALOG.find(c => c.id === item.definitionId);
  const isSelected = selectedItemId === item.instanceId;
  const isDragged = draggedItemId === item.instanceId;
  const [hovered, setHovered] = useState(false);

  const selectedTap = TAP_OPTIONS.find(t => t.id === item.tapId) || TAP_OPTIONS[0];

  if (!def) return null;

  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const depthM = item.depth / 1000;

  const isSink = def.sku.includes('SINK');
  const isCooktop = def.sku.includes('CT');
  const isDishwasher = def.sku.includes('DW');

  let posY = (item.y / 1000) + (heightM / 2);
  if (isSink || isCooktop) posY = item.y / 1000;

  const position: [number, number, number] = [item.x / 1000, posY, item.z / 1000];

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    selectItem(item.instanceId);
    startDrag(item.instanceId, item.x, item.z);
  };

  return (
    <group position={position} rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} onPointerDown={handlePointerDown} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      {(isSelected || hovered || isDragged) && (
        <mesh><boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} /><meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent /></mesh>
      )}
      
      {isSink && (
        <group>
          <mesh position={[0, -heightM / 2 + 0.01, 0]}><boxGeometry args={[widthM * 0.9, 0.02, depthM * 0.8]} /><meshStandardMaterial color="#e5e7eb" metalness={0.9} roughness={0.2} /></mesh>
          <mesh position={[0, -heightM / 2 + 0.05, 0]}><boxGeometry args={[widthM * 0.8, heightM - 0.05, depthM * 0.7]} /><meshStandardMaterial color="#d1d5db" metalness={0.8} roughness={0.3} /></mesh>
          <mesh position={[0, 0.15, -depthM / 2 + 0.05]}><cylinderGeometry args={[0.015, 0.015, 0.3, 8]} /><meshStandardMaterial color={selectedTap.hex} metalness={0.9} roughness={0.1} /></mesh>
        </group>
      )}
      
      {isCooktop && (
        <group>
          <mesh position={[0, 0.01, 0]}><boxGeometry args={[widthM, 0.02, depthM]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
          {[[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.025, z]}><cylinderGeometry args={[0.08, 0.08, 0.01, 32]} /><meshStandardMaterial color="#374151" metalness={0.5} /></mesh>
          ))}
        </group>
      )}
      
      {isDishwasher && (
        <group>
          <mesh><boxGeometry args={[widthM, heightM, depthM]} /><meshStandardMaterial color="#d1d5db" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0, heightM / 4, depthM / 2 + 0.01]}><boxGeometry args={[widthM - 0.02, 0.02, 0.01]} /><meshStandardMaterial color="#4b5563" /></mesh>
          <mesh position={[0, -heightM / 4, depthM / 2 + 0.01]}><boxGeometry args={[widthM - 0.02, 0.02, 0.01]} /><meshStandardMaterial color="#4b5563" /></mesh>
        </group>
      )}
    </group>
  );
};

export default ApplianceMesh;
