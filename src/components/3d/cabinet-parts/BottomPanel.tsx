import React from 'react';
import * as THREE from 'three';

interface BottomPanelProps {
  width: number;      // Width in meters
  depth: number;      // Depth in meters
  thickness: number;  // Thickness in meters (typically 18mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  hasSinkCutout?: boolean;
  sinkCutoutWidth?: number;
  sinkCutoutDepth?: number;
}

/**
 * Bottom panel component for cabinets
 * Can include sink cutout for sink cabinets
 */
const BottomPanel: React.FC<BottomPanelProps> = ({
  width,
  depth,
  thickness,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
  hasSinkCutout = false,
  sinkCutoutWidth = 0.4,
  sinkCutoutDepth = 0.35,
}) => {
  // Rotate texture for horizontal grain (front to back)
  const texture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = Math.PI / 2;
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);

  if (hasSinkCutout) {
    // Render with cutout using multiple segments
    const frontDepth = (depth - sinkCutoutDepth) / 2;
    const backDepth = (depth - sinkCutoutDepth) / 2;
    const sideWidth = (width - sinkCutoutWidth) / 2;
    
    return (
      <group position={position}>
        {/* Front strip */}
        <mesh position={[0, 0, depth / 2 - frontDepth / 2]}>
          <boxGeometry args={[width, thickness, frontDepth]} />
          <meshStandardMaterial 
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={texture}
          />
        </mesh>
        
        {/* Back strip */}
        <mesh position={[0, 0, -depth / 2 + backDepth / 2]}>
          <boxGeometry args={[width, thickness, backDepth]} />
          <meshStandardMaterial 
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={texture}
          />
        </mesh>
        
        {/* Left side */}
        <mesh position={[-width / 2 + sideWidth / 2, 0, 0]}>
          <boxGeometry args={[sideWidth, thickness, sinkCutoutDepth]} />
          <meshStandardMaterial 
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={texture}
          />
        </mesh>
        
        {/* Right side */}
        <mesh position={[width / 2 - sideWidth / 2, 0, 0]}>
          <boxGeometry args={[sideWidth, thickness, sinkCutoutDepth]} />
          <meshStandardMaterial 
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={texture}
          />
        </mesh>
      </group>
    );
  }

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

export default BottomPanel;
