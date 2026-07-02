import React from 'react';
import * as THREE from 'three';
import EdgeOutline from './EdgeOutline';

interface KickboardProps {
  width: number;      // Width in meters
  height: number;     // Height in meters (typically 135mm)
  thickness?: number; // Thickness in meters (typically 16mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  setback?: number;   // How far back from front (meters)
  showEdges?: boolean;
  
  // Corner cabinet support
  isCorner?: boolean;
  cornerType?: 'l-shape' | 'blind' | 'diagonal';
  depth?: number;           // Cabinet depth in meters (for corner kickboards)
  leftArmDepth?: number;    // L-shape left arm depth in meters
  rightArmDepth?: number;   // L-shape right arm depth in meters
}

/**
 * Kickboard (toe kick) component for base/tall cabinets
 * Grain runs horizontally
 * Supports L-shape corner cabinets with kickboards on both arm fronts
 */
const Kickboard: React.FC<KickboardProps> = ({
  width,
  height,
  thickness = 0.016,
  position,
  color,
  roughness = 0.6,
  metalness = 0.0,
  map,
  setback = 0.04, // Standard 40mm setback
  showEdges = true,
  isCorner = false,
  cornerType = 'blind',
  depth = 0.56,
  leftArmDepth = 0.575,
  rightArmDepth = 0.575,
}) => {
  // Rotate texture for horizontal grain
  const texture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = Math.PI / 2;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('Kickboard: Texture clone failed:', e);
      return null;
    }
  }, [map]);

  // L-shape (pie-cut) corner cabinet: kickboards run under the two notch
  // faces where the doors sit (matches CornerCarcass notch geometry).
  if (isCorner && cornerType === 'l-shape') {
    const notchX = -width / 2 + Math.min(leftArmDepth, width - 0.05);
    const notchZ = -depth / 2 + Math.min(rightArmDepth, depth - 0.05);
    // Both kicks are set back from their door faces; extend each to the other's
    // setback line so they meet cleanly at the inner corner (no gap).
    const kickInnerX = notchX - setback;
    const kickInnerZ = notchZ - setback;

    // Kick A: under door 1, faces +Z (plane z = kickInnerZ)
    const kickAWidth = (width / 2 - kickInnerX) - 0.002;
    const kickAX = (kickInnerX + width / 2) / 2;
    const kickAZ = kickInnerZ;

    // Kick B: under door 2, faces +X (plane x = kickInnerX)
    const kickBWidth = (depth / 2 - kickInnerZ) - 0.002;
    const kickBX = kickInnerX;
    const kickBZ = (kickInnerZ + depth / 2) / 2;

    return (
      <group position={position}>
        {/* Kick under door 1 - faces +Z */}
        <mesh position={[kickAX, 0, kickAZ]}>
          <boxGeometry args={[kickAWidth, height, thickness]} />
          <meshStandardMaterial
            key={texture ? texture.uuid : 'flat'}
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={texture}
          />
        </mesh>
        {showEdges && (
          <group position={[kickAX, 0, kickAZ]}>
            <EdgeOutline width={kickAWidth} height={height} depth={thickness} />
          </group>
        )}

        {/* Kick under door 2 - faces +X (rotated 90 degrees) */}
        <group position={[kickBX, 0, kickBZ]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh>
            <boxGeometry args={[kickBWidth, height, thickness]} />
            <meshStandardMaterial
              key={texture ? texture.uuid : 'flat'}
              color={color}
              roughness={roughness}
              metalness={metalness}
              map={texture}
            />
          </mesh>
          {showEdges && (
            <EdgeOutline width={kickBWidth} height={height} depth={thickness} />
          )}
        </group>
      </group>
    );
  }

  // Standard rectangular kickboard
  const kickWidth = width - 0.002;

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[kickWidth, height, thickness]} />
        <meshStandardMaterial
          key={texture ? texture.uuid : 'flat'}
          color={color}
          roughness={roughness}
          metalness={metalness}
          map={texture}
        />
      </mesh>
      {showEdges && (
        <EdgeOutline width={kickWidth} height={height} depth={thickness} />
      )}
    </group>
  );
};

export default Kickboard;
