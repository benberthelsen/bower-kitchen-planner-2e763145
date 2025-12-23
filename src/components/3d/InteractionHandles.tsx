import React from 'react';
import { usePlanner } from '../../store/PlannerContext';
import * as THREE from 'three';

const InteractionHandles: React.FC = () => {
  const { selectedItemId, items, updateItem, viewMode } = usePlanner();
  const activeItem = items.find(i => i.instanceId === selectedItemId);

  if (!activeItem || viewMode === '2d') return null;

  const heightM = activeItem.height / 1000;
  const xM = activeItem.x / 1000;
  const yM = activeItem.y / 1000;
  const zM = activeItem.z / 1000;
  const rotRad = THREE.MathUtils.degToRad(activeItem.rotation);

  const handleRotateClick = (e: any) => {
    e.stopPropagation();
    const newRot = (activeItem.rotation + 90) % 360;
    updateItem(activeItem.instanceId, { rotation: newRot });
  };

  const groupPos: [number, number, number] = [xM, yM + heightM/2, zM];
  const groupRot: [number, number, number] = [0, -rotRad, 0];

  return (
    <group position={groupPos} rotation={groupRot}>
      <mesh position={[0, heightM/2 + 0.6, 0]} onClick={handleRotateClick}>
        <sphereGeometry args={[0.15]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0, heightM/2 + 0.3, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.6]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
    </group>
  );
};

export default InteractionHandles;
