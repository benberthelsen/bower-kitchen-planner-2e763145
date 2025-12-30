import React from 'react';
import * as THREE from 'three';

interface ShelfProps {
  width: number;      // Width in meters
  depth: number;      // Depth in meters
  thickness: number;  // Thickness in meters (typically 18mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  setback?: number;   // How far back from front (meters)
  adjustable?: boolean;
}

/**
 * Shelf component for cabinets
 * Grain runs front-to-back (horizontal when viewed from front)
 */
const Shelf: React.FC<ShelfProps> = ({
  width,
  depth,
  thickness,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
  setback = 0,
  adjustable = true,
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

  const adjustedDepth = depth - setback;
  const adjustedPosition: [number, number, number] = [
    position[0],
    position[1],
    position[2] - setback / 2
  ];

  return (
    <group>
      <mesh position={adjustedPosition}>
        <boxGeometry args={[width, thickness, adjustedDepth]} />
        <meshStandardMaterial 
          color={color}
          roughness={roughness}
          metalness={metalness}
          map={texture}
        />
      </mesh>
      
      {/* Adjustable shelf hole indicators (subtle indents on gables) */}
      {adjustable && (
        <>
          {/* Left side pins */}
          <mesh position={[-(width / 2) + 0.005, position[1], position[2] + depth / 2 - 0.037]}>
            <cylinderGeometry args={[0.003, 0.003, 0.01, 8]} />
            <meshStandardMaterial color="#888888" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[-(width / 2) + 0.005, position[1], position[2] - depth / 2 + 0.037]}>
            <cylinderGeometry args={[0.003, 0.003, 0.01, 8]} />
            <meshStandardMaterial color="#888888" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Right side pins */}
          <mesh position={[(width / 2) - 0.005, position[1], position[2] + depth / 2 - 0.037]}>
            <cylinderGeometry args={[0.003, 0.003, 0.01, 8]} />
            <meshStandardMaterial color="#888888" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[(width / 2) - 0.005, position[1], position[2] - depth / 2 + 0.037]}>
            <cylinderGeometry args={[0.003, 0.003, 0.01, 8]} />
            <meshStandardMaterial color="#888888" metalness={0.6} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default Shelf;
