import React from 'react';
import * as THREE from 'three';

interface FalseFrontProps {
  width: number;      // Width in meters
  height: number;     // Height in meters (typically 50-100mm)
  thickness: number;  // Thickness in meters (typically 18mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  gap?: number;       // Gap around panel in meters
}

/**
 * False front (decorative drawer front) for sink cabinets
 * Only rendered when the product specifies "False Front" in name
 * Grain runs horizontally
 */
const FalseFront: React.FC<FalseFrontProps> = ({
  width,
  height,
  thickness,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
  gap = 0.002,
}) => {
  // Rotate texture for horizontal grain (like drawer front)
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = Math.PI / 2;
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);

  const actualWidth = width - gap * 2;
  const actualHeight = height - gap * 2;

  return (
    <mesh position={position}>
      <boxGeometry args={[actualWidth, actualHeight, thickness]} />
      <meshStandardMaterial 
        color={color}
        roughness={roughness}
        metalness={metalness}
        map={texture}
      />
    </mesh>
  );
};

export default FalseFront;
