import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import EdgeOutline from './EdgeOutline';

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
  showEdges?: boolean;
  interactive?: boolean; // Enable click-to-open animation
}

/**
 * Door front panel component
 * Grain runs vertically
 * Click to animate door opening (swings on hinges)
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
  showEdges = true,
  interactive = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentRotation = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  
  // Target rotation: 100 degrees open (swing outward from cabinet front)
  const targetRotation = isOpen ? (hingeLeft ? -Math.PI * 0.55 : Math.PI * 0.55) : 0;
  
  // Animate door rotation
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    
    // Smooth interpolation toward target
    const diff = targetRotation - currentRotation.current;
    if (Math.abs(diff) > 0.001) {
      currentRotation.current += diff * Math.min(delta * 8, 1);
      groupRef.current.rotation.y = currentRotation.current;
    }
  });

  // No rotation for vertical grain
  const texture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = 0;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('DoorFront: Texture clone failed:', e);
      return null;
    }
  }, [map]);

  const actualWidth = width - gap * 2;
  const actualHeight = height - gap * 2;

  // Hinge position offset from center (door pivots around hinge edge)
  const hingeOffset = hingeLeft ? -actualWidth / 2 : actualWidth / 2;
  
  // Hinge cup positions (visible on inside of door)
  const hingeX = hingeLeft ? -actualWidth / 2 + 0.02 : actualWidth / 2 - 0.02;
  const hingeTopY = actualHeight / 2 - 0.1;
  const hingeBottomY = -actualHeight / 2 + 0.1;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <group position={position}>
      {/* Pivot point at hinge edge */}
      <group position={[hingeOffset, 0, 0]} ref={groupRef}>
        {/* Door panel - offset back to hinge */}
        <mesh 
          position={[-hingeOffset, 0, 0]}
          onClick={handleClick}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = interactive ? 'pointer' : 'default'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        >
          <boxGeometry args={[actualWidth, actualHeight, thickness]} />
          <meshStandardMaterial 
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={texture}
          />
        </mesh>
        
        {/* Edge outline for technical drawing aesthetic */}
        {showEdges && (
          <group position={[-hingeOffset, 0, 0]}>
            <EdgeOutline width={actualWidth} height={actualHeight} depth={thickness} />
          </group>
        )}
        
        {/* Hinge cups (on back of door) */}
        <mesh position={[hingeX - hingeOffset, hingeTopY, -thickness / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.017, 0.017, 0.012, 16]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[hingeX - hingeOffset, hingeBottomY, -thickness / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.017, 0.017, 0.012, 16]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
};

export default DoorFront;
