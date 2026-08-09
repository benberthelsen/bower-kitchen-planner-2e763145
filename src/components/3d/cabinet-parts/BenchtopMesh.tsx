import React from 'react';
import * as THREE from 'three';
import { cloneTextureForSurface } from '../materials/physicalTexture';
import { rectangularCutoutSegments } from './benchtopCutout';
import { rectangularBenchtopGeometry } from './benchtopGeometry';
import { lShapeCornerGeometry, type CornerReturnSide } from './cornerGeometry';

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
  backOverhang?: number;  // Back overhang in meters
  leftOverhang?: number;  // Left side overhang
  rightOverhang?: number; // Right side overhang
  /** Physical start of the cabinet on its joined benchtop run. */
  textureRunOffsetM?: number;
  hasSinkCutout?: boolean;
  sinkCutoutWidth?: number;
  sinkCutoutDepth?: number;
  
  // Corner cabinet support
  isCorner?: boolean;
  cornerType?: 'l-shape' | 'blind' | 'diagonal';
  leftArmDepth?: number;
  rightArmDepth?: number;
  returnSide?: CornerReturnSide;
}

interface TexturedSurfaceBoxProps {
  width: number;
  depth: number;
  thickness: number;
  position: [number, number, number];
  color: string;
  roughness: number;
  metalness: number;
  sourceMap?: THREE.Texture | null;
  originXM: number;
  originYM: number;
}

/** One physical piece of a larger top. Every piece receives its position on
 * the supplier sheet, so split sink geometry and neighbouring cabinet modules
 * still read as one continuous slab. */
const TexturedSurfaceBox: React.FC<TexturedSurfaceBoxProps> = ({
  width,
  depth,
  thickness,
  position,
  color,
  roughness,
  metalness,
  sourceMap,
  originXM,
  originYM,
}) => {
  const texture = React.useMemo(() => cloneTextureForSurface(
    sourceMap,
    width,
    depth,
    { rotateQuarterTurn: true, originXM, originYM },
  ), [sourceMap, width, depth, originXM, originYM]);
  React.useEffect(() => () => texture?.dispose(), [texture]);

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
  backOverhang = 0,
  leftOverhang = 0,
  rightOverhang = 0,
  textureRunOffsetM = 0,
  hasSinkCutout = false,
  sinkCutoutWidth = 0.5,
  sinkCutoutDepth = 0.4,
  isCorner = false,
  cornerType = 'blind',
  leftArmDepth = 0.575,
  rightArmDepth = 0.575,
  returnSide = 'Left',
}) => {
  // L-shape corner benchtop: two perpendicular slabs matching CornerCarcass geometry
  // Left arm runs along left wall (X = -width/2), extends in Z direction
  // Right arm runs along back wall (Z = -depth/2), extends in X direction
  if (isCorner && cornerType === 'l-shape') {
    // L-shaped benchtop covering the full footprint minus the notch,
    // with the standard front overhang on the two notch faces
    // (matches CornerCarcass notch geometry).
    const cornerGeometry = lShapeCornerGeometry(width, depth, leftArmDepth, rightArmDepth, returnSide);
    const notchX = -width / 2 + Math.min(leftArmDepth, width - 0.05);
    const notchZ = cornerGeometry.backDoorPlaneZ;

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
        <group scale={[cornerGeometry.mirrorX, 1, 1]}>
          {/* Back arm slab */}
          <TexturedSurfaceBox
            width={width}
            depth={slabADepth}
            thickness={thickness}
            position={[0, 0, slabAZ]}
            color={color}
            roughness={roughness}
            metalness={metalness}
            sourceMap={map}
            originXM={textureRunOffsetM}
            originYM={0}
          />

          {/* Side-return slab */}
          {slabBDepth > 0.01 && (
            <TexturedSurfaceBox
              width={slabBWidth}
              depth={slabBDepth}
              thickness={thickness}
              position={[slabBX, 0, slabBZ]}
              color={color}
              roughness={roughness}
              metalness={metalness}
              sourceMap={map}
              originXM={textureRunOffsetM}
              originYM={slabADepth}
            />
          )}
        </group>
      </group>
    );
  }

  // Standard rectangular benchtop
  const { totalWidth, totalDepth, xOffset, zOffset } = rectangularBenchtopGeometry(
    width,
    depth,
    {
      front: overhang,
      back: backOverhang,
      left: leftOverhang,
      right: rightOverhang,
    },
  );
  const slabRunOriginM = textureRunOffsetM - leftOverhang;
  const slabCrossOriginM = -backOverhang;

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
          <TexturedSurfaceBox
            key={index}
            width={segment.width}
            depth={segment.depth}
            thickness={thickness}
            position={[segment.x, 0, segment.z]}
            color={color}
            roughness={roughness}
            metalness={metalness}
            sourceMap={map}
            originXM={slabRunOriginM + segment.x + totalWidth / 2 - segment.width / 2}
            originYM={slabCrossOriginM + segment.z + totalDepth / 2 - segment.depth / 2}
          />
        ))}
      </group>
    );
  }

  return (
    <TexturedSurfaceBox
      width={totalWidth}
      depth={totalDepth}
      thickness={thickness}
      position={[position[0] + xOffset, position[1], position[2] + zOffset]}
      color={color}
      roughness={roughness}
      metalness={metalness}
      sourceMap={map}
      originXM={slabRunOriginM}
      originYM={slabCrossOriginM}
    />
  );
};

export default BenchtopMesh;
