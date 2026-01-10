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
  
  // Corner cabinet support
  isCorner?: boolean;
  cornerType?: 'l-shape' | 'blind' | 'diagonal';
  leftArmDepth?: number;
  rightArmDepth?: number;
}

/**
 * Benchtop/countertop component for base cabinets
 * Extends over cabinet with configurable overhang
 * Supports L-shaped corner cabinet benchtops
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
  isCorner = false,
  cornerType = 'blind',
  leftArmDepth = 0.575,
  rightArmDepth = 0.575,
}) => {
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);

  const materialProps = {
    color,
    roughness,
    metalness,
    map: texture,
  };

  // L-shape corner benchtop: two perpendicular slabs
  if (isCorner && cornerType === 'l-shape') {
    const armOpeningWidth = 0.45; // 450mm standard opening (matches CornerCarcass)
    const frontOverhang = overhang;
    
    // Left arm benchtop slab
    const leftSlabWidth = armOpeningWidth + frontOverhang;
    const leftSlabDepth = leftArmDepth + frontOverhang;
    const leftSlabX = -width / 2 + armOpeningWidth / 2;
    const leftSlabZ = -depth / 2 + leftArmDepth / 2 + frontOverhang / 2;
    
    // Right arm benchtop slab (extends from corner junction)
    const rightSlabWidth = rightArmDepth - armOpeningWidth + frontOverhang;
    const rightSlabDepth = armOpeningWidth + frontOverhang;
    const rightSlabX = -width / 2 + armOpeningWidth + rightSlabWidth / 2;
    const rightSlabZ = -depth / 2 + armOpeningWidth / 2;
    
    return (
      <group position={position}>
        {/* Left arm benchtop slab */}
        <mesh position={[leftSlabX, 0, leftSlabZ]}>
          <boxGeometry args={[leftSlabWidth, thickness, leftSlabDepth]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        
        {/* Right arm benchtop slab */}
        <mesh position={[rightSlabX, 0, rightSlabZ]}>
          <boxGeometry args={[rightSlabWidth, thickness, rightSlabDepth]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      </group>
    );
  }

  // Standard rectangular benchtop
  const totalWidth = width + leftOverhang + rightOverhang;
  const totalDepth = depth + overhang;
  
  // Position offset to account for overhangs
  const xOffset = (rightOverhang - leftOverhang) / 2;
  const zOffset = overhang / 2;

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
