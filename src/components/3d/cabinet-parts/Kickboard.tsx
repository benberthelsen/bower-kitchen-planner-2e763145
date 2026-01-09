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
}

/**
 * Kickboard (toe kick) component for base/tall cabinets
 * Grain runs horizontally
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
