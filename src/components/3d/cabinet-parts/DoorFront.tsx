import React from 'react';
import * as THREE from 'three';

interface DoorFrontProps {
  width: number;      // Width in meters
  height: number;     // Height in meters
  thickness: number;  // Thickness in meters (typically 18mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  gap?: number;       // Gap around door in meters
  hingeLeft?: boolean; // Which side hinges are on
}

/**
 * Door front panel component
 * Grain runs vertically
 */
const DoorFront: React.FC<DoorFrontProps> = ({
  width,
  height,
  thickness,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
  gap = 0.002,
  hingeLeft = true,
}) => {
  // No rotation for vertical grain
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = 0;
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);

  const actualWidth = width - gap * 2;
  const actualHeight = height - gap * 2;

  // Hinge cup positions (visible on inside of door)
  const hingeX = hingeLeft ? -actualWidth / 2 + 0.02 : actualWidth / 2 - 0.02;
  const hingeTopY = actualHeight / 2 - 0.1;
  const hingeBottomY = -actualHeight / 2 + 0.1;

  return (
    <group position={position}>
      {/* Door panel */}
      <mesh>
        <boxGeometry args={[actualWidth, actualHeight, thickness]} />
        <meshStandardMaterial 
          color={color}
          roughness={roughness}
          metalness={metalness}
          map={texture}
        />
      </mesh>
      
      {/* Hinge cups (on back of door) */}
      <mesh position={[hingeX, hingeTopY, -thickness / 2 - 0.005]}>
        <cylinderGeometry args={[0.017, 0.017, 0.012, 16]} />
        <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[hingeX, hingeBottomY, -thickness / 2 - 0.005]}>
        <cylinderGeometry args={[0.017, 0.017, 0.012, 16]} />
        <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
};

export default DoorFront;
