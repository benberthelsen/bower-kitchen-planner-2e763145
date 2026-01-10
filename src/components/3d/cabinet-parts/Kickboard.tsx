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

  // L-shape corner cabinet: render kickboards on both arm fronts
  // Matches CornerCarcass coordinate system
  if (isCorner && cornerType === 'l-shape') {
    const armOpeningWidth = 0.45; // 450mm standard opening
    
    // Left arm kickboard - at the front of left arm (positive Z edge)
    const leftKickWidth = armOpeningWidth - 0.002;
    const leftKickX = -width / 2 + armOpeningWidth / 2 + 0.009;
    const leftKickZ = -depth / 2 + leftArmDepth - setback;
    
    // Right arm kickboard - at the front of right arm (positive X edge)
    const rightKickWidth = armOpeningWidth - 0.002;
    const rightKickX = -width / 2 + rightArmDepth - setback;
    const rightKickZ = -depth / 2 + armOpeningWidth / 2 + 0.009;
    
    return (
      <group position={position}>
        {/* Left arm kickboard - faces +Z direction */}
        <group position={[leftKickX, 0, leftKickZ]}>
          <mesh>
            <boxGeometry args={[leftKickWidth, height, thickness]} />
            <meshStandardMaterial 
              color={color}
              roughness={roughness}
              metalness={metalness}
              map={texture}
            />
          </mesh>
          {showEdges && (
            <EdgeOutline width={leftKickWidth} height={height} depth={thickness} />
          )}
        </group>
        
        {/* Right arm kickboard - faces +X direction (rotated 90 degrees) */}
        <group position={[rightKickX, 0, rightKickZ]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh>
            <boxGeometry args={[rightKickWidth, height, thickness]} />
            <meshStandardMaterial 
              color={color}
              roughness={roughness}
              metalness={metalness}
              map={texture}
            />
          </mesh>
          {showEdges && (
            <EdgeOutline width={rightKickWidth} height={height} depth={thickness} />
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
