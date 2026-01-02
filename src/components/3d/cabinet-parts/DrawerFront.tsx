import React from 'react';
import * as THREE from 'three';

interface DrawerFrontProps {
  width: number;      // Width in meters
  height: number;     // Height in meters
  thickness: number;  // Thickness in meters (typically 18mm)
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  gap?: number;       // Gap around drawer in meters
  showBox?: boolean;  // Show inner drawer box outline
}

/**
 * Drawer front panel component
 * Grain runs horizontally
 */
const DrawerFront: React.FC<DrawerFrontProps> = ({
  width,
  height,
  thickness,
  position,
  color,
  roughness = 0.5,
  metalness = 0.0,
  map,
  gap = 0.002,
  showBox = true,
}) => {
  // Rotate texture 90 degrees for horizontal grain
  const texture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = Math.PI / 2;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('DrawerFront: Texture clone failed:', e);
      return null;
    }
  }, [map]);

  const actualWidth = width - gap * 2;
  const actualHeight = height - gap * 2;
  
  // Drawer box dimensions (behind the front)
  const boxWidth = actualWidth - 0.036; // Allow for side runners
  const boxHeight = height - 0.03; // Slightly smaller
  const boxDepth = 0.45; // Standard drawer depth

  return (
    <group position={position}>
      {/* Drawer front panel */}
      <mesh>
        <boxGeometry args={[actualWidth, actualHeight, thickness]} />
        <meshStandardMaterial 
          color={color}
          roughness={roughness}
          metalness={metalness}
          map={texture}
        />
      </mesh>
      
      {/* Drawer box outline (visible from side/behind) */}
      {showBox && (
        <mesh position={[0, 0, -boxDepth / 2 - thickness / 2]}>
          <boxGeometry args={[boxWidth, boxHeight * 0.8, boxDepth]} />
          <meshStandardMaterial 
            color="#f0f0f0" 
            roughness={0.7}
            metalness={0.0}
          />
        </mesh>
      )}
      
      {/* Runner indicators (sides of drawer) */}
      {showBox && (
        <>
          <mesh position={[-actualWidth / 2 + 0.01, 0, -0.1]}>
            <boxGeometry args={[0.012, 0.03, 0.2]} />
            <meshStandardMaterial color="#555555" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[actualWidth / 2 - 0.01, 0, -0.1]}>
            <boxGeometry args={[0.012, 0.03, 0.2]} />
            <meshStandardMaterial color="#555555" metalness={0.6} roughness={0.4} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default DrawerFront;
