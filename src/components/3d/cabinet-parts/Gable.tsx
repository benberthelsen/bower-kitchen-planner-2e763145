import React from 'react';
import * as THREE from 'three';
import EdgeOutline from './EdgeOutline';

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
  showEdges?: boolean;
  // Part-level materials: interior vs exterior faces
  interiorColor?: string;
  interiorRoughness?: number;
  interiorMetalness?: number;
  interiorMap?: THREE.Texture | null;
  isExposedEnd?: boolean; // True for end panels that show finished exterior
  side?: 'left' | 'right'; // Which side of cabinet (affects which face is interior)
}

/**
 * Gable (side panel) component for cabinets
 * Supports different materials for interior vs exterior faces
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
  showEdges = true,
  interiorColor,
  interiorRoughness,
  interiorMetalness,
  interiorMap,
  isExposedEnd = false,
  side = 'left',
}) => {
  // Clone texture if needed to set rotation for this instance
  const exteriorTexture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = grainRotation;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('Gable: Texture clone failed:', e);
      return null;
    }
  }, [map, grainRotation]);

  const interiorTexture = React.useMemo(() => {
    if (!interiorMap) return null;
    try {
      const cloned = interiorMap.clone();
      cloned.rotation = grainRotation;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('Gable: Interior texture clone failed:', e);
      return null;
    }
  }, [interiorMap, grainRotation]);

  // Determine if we need dual-material rendering
  const hasDualMaterial = isExposedEnd && interiorColor;
  
  // Use interior material props if provided, otherwise fallback to exterior
  const intColor = interiorColor || color;
  const intRoughness = interiorRoughness ?? roughness;
  const intMetalness = interiorMetalness ?? metalness;
  const intTexture = interiorTexture || exteriorTexture;

  if (hasDualMaterial) {
    // Dual-material gable: exterior finish on outer face, interior finish on inner face
    // For left gable: exterior is -X face, interior is +X face
    // For right gable: exterior is +X face, interior is -X face
    const halfWidth = width / 2;
    const exteriorX = side === 'left' ? -halfWidth / 2 : halfWidth / 2;
    const interiorX = side === 'left' ? halfWidth / 2 : -halfWidth / 2;
    
    return (
      <group position={position}>
        {/* Exterior half (finished face) */}
        <mesh position={[exteriorX, 0, 0]}>
          <boxGeometry args={[width / 2, height, depth]} />
          <meshStandardMaterial 
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={exteriorTexture}
          />
        </mesh>
        {/* Interior half (cabinet inside) */}
        <mesh position={[interiorX, 0, 0]}>
          <boxGeometry args={[width / 2, height, depth]} />
          <meshStandardMaterial 
            color={intColor}
            roughness={intRoughness}
            metalness={intMetalness}
            map={intTexture}
          />
        </mesh>
        {showEdges && (
          <EdgeOutline width={width} height={height} depth={depth} />
        )}
      </group>
    );
  }

  // Standard single-material gable
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial 
          color={color}
          roughness={roughness}
          metalness={metalness}
          map={exteriorTexture}
        />
      </mesh>
      {showEdges && (
        <EdgeOutline width={width} height={height} depth={depth} />
      )}
    </group>
  );
};

export default Gable;
