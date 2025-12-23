import React, { useState } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { PlacedItem } from '../../types';
import { CATALOG } from '../../constants';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

interface Props {
  item: PlacedItem;
}

const StructureMesh: React.FC<Props> = ({ item }) => {
  const { selectItem, selectedItemId, draggedItemId, setDraggedItem, recordHistory } = usePlanner();
  const [hovered, setHovered] = useState(false);
  const def = CATALOG.find(c => c.id === item.definitionId);

  if (!def) return null;

  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const depthM = item.depth / 1000;
  const isSelected = selectedItemId === item.instanceId;
  const isDragged = draggedItemId === item.instanceId;

  const position: [number, number, number] = [item.x / 1000, (item.y / 1000) + (heightM / 2), item.z / 1000];

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    recordHistory();
    setDraggedItem(item.instanceId);
    selectItem(item.instanceId);
  };

  const isWindow = def.sku.includes('WIN');
  const isDoor = def.sku.includes('DR');

  return (
    <group position={position} rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} onClick={handlePointerDown} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      {(isSelected || hovered || isDragged) && (
        <mesh><boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} /><meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent /></mesh>
      )}
      
      {isWindow ? (
        <group>
          <mesh><boxGeometry args={[widthM, 0.05, 0.08]} /><meshStandardMaterial color="#6b7280" /></mesh>
          <mesh position={[0, heightM / 2 - 0.025, 0]}><boxGeometry args={[widthM, 0.05, 0.08]} /><meshStandardMaterial color="#6b7280" /></mesh>
          <mesh position={[0, -heightM / 2 + 0.025, 0]}><boxGeometry args={[widthM, 0.05, 0.08]} /><meshStandardMaterial color="#6b7280" /></mesh>
          <mesh><boxGeometry args={[widthM - 0.1, heightM - 0.1, 0.02]} /><meshStandardMaterial color="#87ceeb" transparent opacity={0.4} /></mesh>
        </group>
      ) : isDoor ? (
        <group>
          <mesh><boxGeometry args={[widthM, heightM, depthM]} /><meshStandardMaterial color="#8b4513" /></mesh>
          <mesh position={[widthM / 2 - 0.05, 0, depthM / 2 + 0.01]}><sphereGeometry args={[0.02]} /><meshStandardMaterial color="#d4af37" metalness={0.8} /></mesh>
        </group>
      ) : (
        <mesh><boxGeometry args={[widthM, heightM, depthM]} /><meshStandardMaterial color="#d1d5db" /></mesh>
      )}
    </group>
  );
};

export default StructureMesh;
