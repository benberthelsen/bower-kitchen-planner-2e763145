import React from 'react';
import * as THREE from 'three';

interface BenchtopMeshProps {
  width: number;      // Width in meters
  depth: number;      // Depth in meters
  thickness: number;  // Thickness in meters (typically 33mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  overhang?: number;  // Front overhang in meters
  leftOverhang?: number;  // Left side overhang
  rightOverhang?: number; // Right side overhang
  hasSinkCutout?: boolean;
  sinkCutoutWidth?: number;
  sinkCutoutDepth?: number;
}

/**
 * Benchtop/countertop component for base cabinets
 * Extends over cabinet with configurable overhang
 */
const BenchtopMesh: React.FC<BenchtopMeshProps> = ({
  width,
  depth,
  thickness,
  position,
  color,
  roughness = 0.3,
  metalness = 0.0,
  map,
  overhang = 0,
  leftOverhang = 0,
  rightOverhang = 0,
  hasSinkCutout = false,
  sinkCutoutWidth = 0.5,
  sinkCutoutDepth = 0.4,
}) => {
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);

  const totalWidth = width + leftOverhang + rightOverhang;
  const totalDepth = depth + overhang;
  
  // Position offset to account for overhangs
  const xOffset = (rightOverhang - leftOverhang) / 2;
  const zOffset = overhang / 2;

  const materialProps = {
    color,
    roughness,
    metalness,
    map: texture,
  };

  if (hasSinkCutout) {
    // Create benchtop with sink cutout using shape geometry
    return (
      <group position={[position[0] + xOffset, position[1], position[2] + zOffset]}>
        {/* Main benchtop body */}
        <mesh>
          <boxGeometry args={[totalWidth, thickness, totalDepth]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        
        {/* Sink cutout (dark void) */}
        <mesh position={[0, 0.001, 0]}>
          <boxGeometry args={[sinkCutoutWidth, thickness + 0.002, sinkCutoutDepth]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
        
        {/* Sink rim (stainless indication) */}
        <mesh position={[0, thickness / 2 + 0.001, 0]}>
          <boxGeometry args={[sinkCutoutWidth + 0.02, 0.003, sinkCutoutDepth + 0.02]} />
          <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[position[0] + xOffset, position[1], position[2] + zOffset]}>
      <boxGeometry args={[totalWidth, thickness, totalDepth]} />
      <meshStandardMaterial {...materialProps} />
    </mesh>
  );
};

export default BenchtopMesh;
