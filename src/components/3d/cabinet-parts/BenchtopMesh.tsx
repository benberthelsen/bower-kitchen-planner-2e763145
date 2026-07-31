import React from 'react';
import * as THREE from 'three';
import { cloneTextureForSurface } from '../materials/physicalTexture';
import { rectangularCutoutSegments } from './benchtopCutout';

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
    return cloneTextureForSurface(map, width, depth, { rotateQuarterTurn: true });
  }, [map, width, depth]);
  React.useEffect(() => () => texture?.dispose(), [texture]);

  const materialProps = {
    color,
    roughness,
    metalness,
    map: texture,
  };

  // L-shape corner benchtop: two perpendicular slabs matching CornerCarcass geometry
  // Left arm runs along left wall (X = -width/2), extends in Z direction
  // Right arm runs along back wall (Z = -depth/2), extends in X direction
  if (isCorner && cornerType === 'l-shape') {
    // L-shaped benchtop covering the full footprint minus the notch,
    // with the standard front overhang on the two notch faces
    // (matches CornerCarcass notch geometry).
    const notchX = -width / 2 + Math.min(leftArmDepth, width - 0.05);
    const notchZ = -depth / 2 + Math.min(rightArmDepth, depth - 0.05);

    // Slab A: back arm — full width, from back wall to notch face (+ overhang)
    const slabADepth = (notchZ + depth / 2) + overhang;
    const slabAZ = -depth / 2 + slabADepth / 2;

    // Slab B: left arm front portion — from slab A's front edge to the cabinet front
    const slabBWidth = (notchX + width / 2) + overhang;
    const slabBDepth = depth / 2 - (notchZ + overhang);
    const slabBX = -width / 2 + slabBWidth / 2;
    const slabBZ = notchZ + overhang + slabBDepth / 2;

    return (
      <group position={position}>
        {/* Back arm slab */}
        <mesh position={[0, 0, slabAZ]}>
          <boxGeometry args={[width, thickness, slabADepth]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>

        {/* Left arm slab */}
        {slabBDepth > 0.01 && (
          <mesh position={[slabBX, 0, slabBZ]}>
            <boxGeometry args={[slabBWidth, thickness, slabBDepth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        )}
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
    // The slab group shifts for its overhangs, while the appliance remains
    // centred on the cabinet. Express the opening in the shifted local space
    // so unequal fillers do not move the sink cut-out away from its bowl.
    const cutoutSegments = rectangularCutoutSegments(
      totalWidth,
      totalDepth,
      sinkCutoutWidth,
      sinkCutoutDepth,
      -xOffset,
      -zOffset,
    );

    return (
      <group position={[position[0] + xOffset, position[1], position[2] + zOffset]}>
        {cutoutSegments.map((segment, index) => (
          <mesh key={index} position={[segment.x, 0, segment.z]}>
            <boxGeometry args={[segment.width, thickness, segment.depth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        ))}
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
