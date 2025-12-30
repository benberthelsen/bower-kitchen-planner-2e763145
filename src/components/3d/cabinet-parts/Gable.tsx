import React from 'react';
import * as THREE from 'three';

interface GableProps {
  width: number;      // Thickness of gable (typically 18mm in meters)
  height: number;     // Height in meters
  depth: number;      // Depth in meters
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  grainRotation?: number; // Radians to rotate grain (0 = vertical)
}

/**
 * Gable (side panel) component for cabinets
 * Grain runs vertically by default
 */
const Gable: React.FC<GableProps> = ({
  width,
  height,
  depth,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
  grainRotation = 0,
}) => {
  // Clone texture if needed to set rotation for this instance
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = grainRotation;
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map, grainRotation]);

  return (
    <mesh position={position}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial 
        color={color}
        roughness={roughness}
        metalness={metalness}
        map={texture}
      />
    </mesh>
  );
};

export default Gable;
