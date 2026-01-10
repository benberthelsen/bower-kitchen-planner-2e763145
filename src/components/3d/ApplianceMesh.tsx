import React, { useState } from 'react';
import { PlacedItem, GlobalDimensions } from '../../types';
import { TAP_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS } from '../../constants';
import { useCatalogItem } from '../../hooks/useCatalog';
import * as THREE from 'three';

interface ApplianceMeshProps {
  item: PlacedItem;
  // Optional props - if provided, these override context values
  globalDimensions?: GlobalDimensions;
  isSelected?: boolean;
  isDragged?: boolean;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, x: number, z: number) => void;
}

const ApplianceMesh: React.FC<ApplianceMeshProps> = ({ 
  item,
  globalDimensions: dimensionsProp,
  isSelected: isSelectedProp,
  isDragged: isDraggedProp,
  onSelect,
  onDragStart,
}) => {
  const globalDimensions = dimensionsProp ?? DEFAULT_GLOBAL_DIMENSIONS;
  const isSelected = isSelectedProp ?? false;
  const isDragged = isDraggedProp ?? false;

  const handleSelect = onSelect;
  const handleDragStart = onDragStart;

  const def = useCatalogItem(item.definitionId);
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
    handleSelect?.(item.instanceId);
    handleDragStart?.(item.instanceId, item.x, item.z);
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