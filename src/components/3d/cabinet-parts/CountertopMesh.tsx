import React from 'react';
import * as THREE from 'three';

interface CountertopMeshProps {
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
  isSelected?: boolean;
  hovered?: boolean;
}

/**
 * Countertop/Benchtop component - renders as a flat slab without cabinet structure
 * Used for standalone countertop products from the catalog
 */
const CountertopMesh: React.FC<CountertopMeshProps> = ({
  width,
  depth,
  thickness,
  position,
  color,
  roughness = 0.3,
  metalness = 0.0,
  map,
  overhang = 0.02,
  leftOverhang = 0,
  rightOverhang = 0,
  hasSinkCutout = false,
  sinkCutoutWidth = 0.5,
  sinkCutoutDepth = 0.4,
  isSelected = false,
  hovered = false,
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

  return (
    <group position={[position[0] + xOffset, position[1], position[2] + zOffset]}>
      {/* Selection/hover highlight */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[totalWidth + 0.02, thickness + 0.02, totalDepth + 0.02]} />
          <meshBasicMaterial color="#3b82f6" wireframe opacity={0.5} transparent />
        </mesh>
      )}

      {/* Main countertop slab */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[totalWidth, thickness, totalDepth]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>

      {/* Edge profile - subtle bevel effect */}
      <mesh position={[0, -thickness / 2 + 0.002, totalDepth / 2 - 0.005]}>
        <boxGeometry args={[totalWidth, 0.004, 0.01]} />
        <meshStandardMaterial color={color} roughness={roughness * 0.8} />
      </mesh>

      {/* Sink cutout indicator if applicable */}
      {hasSinkCutout && (
        <>
          {/* Sink void */}
          <mesh position={[0, 0.002, 0]}>
            <boxGeometry args={[sinkCutoutWidth, thickness + 0.004, sinkCutoutDepth]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
          </mesh>
          
          {/* Sink rim */}
          <mesh position={[0, thickness / 2 + 0.002, 0]}>
            <boxGeometry args={[sinkCutoutWidth + 0.02, 0.003, sinkCutoutDepth + 0.02]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.3} />
          </mesh>
        </>
      )}

      {/* Splashback attachment indicator */}
      <mesh position={[0, thickness / 2 + 0.05, -totalDepth / 2 + 0.005]}>
        <boxGeometry args={[totalWidth - 0.02, 0.1, 0.01]} />
        <meshStandardMaterial color={color} roughness={roughness} transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

export default CountertopMesh;
