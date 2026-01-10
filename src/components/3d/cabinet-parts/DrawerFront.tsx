import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import EdgeOutline from './EdgeOutline';

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
  showEdges?: boolean;
  interactive?: boolean; // Enable click-to-open animation
}

/**
 * Drawer front panel component
 * Grain runs horizontally
 * Click to animate drawer sliding open
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
  showEdges = true,
  interactive = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentSlide = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  
  // Target slide distance: 350mm (typical drawer extension)
  const targetSlide = isOpen ? 0.35 : 0;
  
  // Animate drawer slide
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    
    // Smooth interpolation toward target
    const diff = targetSlide - currentSlide.current;
    if (Math.abs(diff) > 0.001) {
      currentSlide.current += diff * Math.min(delta * 8, 1);
      groupRef.current.position.z = currentSlide.current;
    }
  });

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
  // Standard Blum/Hettich runner clearance: 13mm each side
  const runnerClearance = 0.013;
  const boxSideThickness = 0.016; // 16mm drawer sides
  const boxWidth = actualWidth - (runnerClearance + boxSideThickness) * 2;
  const boxHeight = Math.max(0.08, actualHeight * 0.7); // Drawer box is ~70% of front height, min 80mm
  const boxDepth = 0.45; // Standard 450mm drawer depth
  const boxBottomThickness = 0.010; // 10mm drawer bottom

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <group position={position}>
      {/* Animated drawer group */}
      <group ref={groupRef}>
        {/* Drawer front panel */}
        <mesh
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
          <EdgeOutline width={actualWidth} height={actualHeight} depth={thickness} />
        )}
        
        {/* Drawer box (visible from side/behind) - more realistic construction */}
        {showBox && (
          <group position={[0, -actualHeight / 2 + boxHeight / 2 + 0.01, -boxDepth / 2 - thickness / 2]}>
            {/* Left drawer side */}
            <mesh position={[-boxWidth / 2 - boxSideThickness / 2, 0, 0]}>
              <boxGeometry args={[boxSideThickness, boxHeight, boxDepth]} />
              <meshStandardMaterial color="#f0f0f0" roughness={0.7} metalness={0.0} />
            </mesh>
            {/* Right drawer side */}
            <mesh position={[boxWidth / 2 + boxSideThickness / 2, 0, 0]}>
              <boxGeometry args={[boxSideThickness, boxHeight, boxDepth]} />
              <meshStandardMaterial color="#f0f0f0" roughness={0.7} metalness={0.0} />
            </mesh>
            {/* Drawer back */}
            <mesh position={[0, 0, -boxDepth / 2 + boxSideThickness / 2]}>
              <boxGeometry args={[boxWidth, boxHeight, boxSideThickness]} />
              <meshStandardMaterial color="#f0f0f0" roughness={0.7} metalness={0.0} />
            </mesh>
            {/* Drawer bottom */}
            <mesh position={[0, -boxHeight / 2 + boxBottomThickness / 2, 0]}>
              <boxGeometry args={[boxWidth + boxSideThickness * 2, boxBottomThickness, boxDepth]} />
              <meshStandardMaterial color="#e8e8e8" roughness={0.8} metalness={0.0} />
            </mesh>
            {/* Drawer box edges */}
            {showEdges && (
              <EdgeOutline width={boxWidth + boxSideThickness * 2} height={boxHeight} depth={boxDepth} color="#999999" />
            )}
          </group>
        )}
      </group>
      
      {/* Runner indicators (fixed to cabinet, not animated) */}
      {showBox && (
        <>
          {/* Left runner */}
          <mesh position={[-actualWidth / 2 + 0.006, -actualHeight / 2 + boxHeight / 2, -0.15]}>
            <boxGeometry args={[0.012, 0.040, 0.35]} />
            <meshStandardMaterial color="#888888" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Right runner */}
          <mesh position={[actualWidth / 2 - 0.006, -actualHeight / 2 + boxHeight / 2, -0.15]}>
            <boxGeometry args={[0.012, 0.040, 0.35]} />
            <meshStandardMaterial color="#888888" metalness={0.7} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default DrawerFront;
