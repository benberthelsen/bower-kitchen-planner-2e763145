import React, { useMemo } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { CATALOG } from '../../constants';
import * as THREE from 'three';

interface PlacementGhostProps {
  position: [number, number, number];
  rotation: number;
  isValid: boolean;
}

const PlacementGhost: React.FC<PlacementGhostProps> = ({ position, rotation, isValid }) => {
  const { placementItemId, globalDimensions } = usePlanner();

  const def = useMemo(() => {
    if (!placementItemId) return null;
    return CATALOG.find(c => c.id === placementItemId);
  }, [placementItemId]);

  if (!def) return null;

  // Calculate dimensions based on category
  let width = def.defaultWidth;
  let depth = def.defaultDepth;
  let height = def.defaultHeight;
  let posY = 0;

  if (def.itemType === 'Cabinet') {
    if (def.category === 'Base') {
      height = globalDimensions.baseHeight + globalDimensions.toeKickHeight;
      depth = globalDimensions.baseDepth;
    } else if (def.category === 'Wall') {
      height = globalDimensions.wallHeight;
      depth = globalDimensions.wallDepth;
      posY = globalDimensions.toeKickHeight + globalDimensions.baseHeight + 
             globalDimensions.benchtopThickness + globalDimensions.splashbackHeight;
    } else if (def.category === 'Tall') {
      height = globalDimensions.tallHeight;
      depth = globalDimensions.tallDepth;
    }
  }

  const widthM = width / 1000;
  const heightM = height / 1000;
  const depthM = depth / 1000;
  const posYM = posY / 1000 + heightM / 2;

  const color = isValid ? '#22c55e' : '#ef4444';

  return (
    <group position={[position[0], posYM, position[2]]} rotation={[0, -THREE.MathUtils.degToRad(rotation), 0]}>
      {/* Ghost mesh */}
      <mesh>
        <boxGeometry args={[widthM, heightM, depthM]} />
        <meshStandardMaterial 
          color={color} 
          transparent 
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
      
      {/* Wireframe outline */}
      <mesh>
        <boxGeometry args={[widthM + 0.01, heightM + 0.01, depthM + 0.01]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.8} />
      </mesh>
      
      {/* Ground indicator */}
      <mesh position={[0, -heightM / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.max(widthM, depthM) * 0.6, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
    </group>
  );
};

export default PlacementGhost;
