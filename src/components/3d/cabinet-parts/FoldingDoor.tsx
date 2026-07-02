import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import EdgeOutline from './EdgeOutline';
import HandleMesh, { HandleType } from './HandleMesh';

interface FoldingDoorProps {
  width: number;      // total opening width (m)
  height: number;     // opening height (m)
  thickness: number;  // leaf thickness (m)
  position: [number, number, number]; // centre of the opening
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  hingeSide?: 'left' | 'right'; // which side the pair folds to
  forceOpen?: boolean;
  interactive?: boolean;
  handle?: { type: HandleType; color: string };
}

/**
 * Bi-fold door: two leaves hinged together that concertina to one side.
 * Closed, it reads as a split pair across the opening; open, the outer leaf
 * swings out and the inner leaf folds back against it. A true bi-fold opens
 * as a single linked pair (not two independent doors).
 */
const FoldingDoor: React.FC<FoldingDoorProps> = ({
  width,
  height,
  thickness,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
  hingeSide = 'left',
  forceOpen,
  interactive = true,
  handle,
}) => {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = forceOpen !== undefined ? forceOpen : localOpen;
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);
  const cur = useRef(0);

  // Fold magnitude (outer leaf swings ~90 deg, inner folds back onto it).
  const target = isOpen ? Math.PI * 0.5 : 0;

  useFrame((_, delta) => {
    const diff = target - cur.current;
    if (Math.abs(diff) > 0.001) {
      cur.current += diff * Math.min(delta * 8, 1);
      const t = cur.current;
      if (aRef.current) aRef.current.rotation.y = -t;     // outer leaf swings outward (+Z)
      if (bRef.current) bRef.current.rotation.y = 2 * t;  // inner leaf folds back against outer
    }
  });

  const texture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = 0;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch {
      return null;
    }
  }, [map]);

  const gap = 0.002;
  const leafW = width / 2 - gap;
  const leafH = height - gap * 2;
  // s = +1 leaves extend toward +X from the left hinge; -1 mirror for right hinge.
  const s = hingeSide === 'left' ? 1 : -1;
  const hingeX = hingeSide === 'left' ? -width / 2 : width / 2;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    if (forceOpen === undefined) setLocalOpen((o) => !o);
  };

  return (
    <group position={position}>
      {/* Outer leaf A - pivots at the opening's hinge edge */}
      <group position={[hingeX, 0, 0]} ref={aRef}>
        <mesh position={[s * leafW / 2, 0, 0]} onClick={handleClick}>
          <boxGeometry args={[leafW, leafH, thickness]} />
          <meshStandardMaterial key={texture ? texture.uuid : 'flat'} color={color} roughness={roughness} metalness={metalness} map={texture} />
        </mesh>
        <group position={[s * leafW / 2, 0, 0]}>
          <EdgeOutline width={leafW} height={leafH} depth={thickness} />
        </group>

        {/* Inner leaf B - hinged at A's far edge, folds back */}
        <group position={[s * leafW, 0, 0]} ref={bRef}>
          <mesh position={[s * leafW / 2, 0, 0]} onClick={handleClick}>
            <boxGeometry args={[leafW, leafH, thickness]} />
            <meshStandardMaterial key={texture ? texture.uuid : 'flat'} color={color} roughness={roughness} metalness={metalness} map={texture} />
          </mesh>
          <group position={[s * leafW / 2, 0, 0]}>
            <EdgeOutline width={leafW} height={leafH} depth={thickness} />
          </group>
          {handle && handle.type !== 'None' && (
            <HandleMesh
              type={handle.type}
              color={handle.color}
              position={[s * (leafW - 0.04), 0, thickness / 2 + 0.015]}
            />
          )}
        </group>
      </group>
    </group>
  );
};

export default FoldingDoor;
