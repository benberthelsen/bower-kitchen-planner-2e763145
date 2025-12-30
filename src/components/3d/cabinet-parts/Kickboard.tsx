import React from 'react';
import * as THREE from 'three';

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
}) => {
  // Rotate texture for horizontal grain
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = Math.PI / 2;
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);

  return (
    <mesh position={position}>
      <boxGeometry args={[width - 0.02, height - 0.01, thickness]} />
      <meshStandardMaterial 
        color={color}
        roughness={roughness}
        metalness={metalness}
        map={texture}
      />
    </mesh>
  );
};

export default Kickboard;
