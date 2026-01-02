import React from 'react';
import * as THREE from 'three';

interface TopPanelProps {
  width: number;      // Width in meters
  depth: number;      // Depth in meters
  thickness: number;  // Thickness in meters (typically 18mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
}

/**
 * Top panel component for wall cabinets
 * Grain runs front-to-back (horizontal when viewed from front)
 */
const TopPanel: React.FC<TopPanelProps> = ({
  width,
  depth,
  thickness,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
}) => {
  // Rotate texture for horizontal grain (front to back)
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = Math.PI / 2; // Rotate 90 degrees for horizontal
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);

  return (
    <mesh position={position}>
      <boxGeometry args={[width, thickness, depth]} />
      <meshStandardMaterial 
        color={color}
        roughness={roughness}
        metalness={metalness}
        map={texture}
      />
    </mesh>
  );
};

export default TopPanel;
