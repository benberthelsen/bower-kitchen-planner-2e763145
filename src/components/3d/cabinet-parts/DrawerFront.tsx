import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import EdgeOutline from './EdgeOutline';
import HandleMesh, { HandleType } from './HandleMesh';

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
  /** When provided, overrides local open/close state (global toggle) */
  forceOpen?: boolean;
  /** Handle mounted ON the drawer front so it slides WITH the drawer when open
   *  (instead of floating at the closed position). */
  handle?: { type: HandleType; color: string; length?: number };
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
  forceOpen,
  handle,
}) => {
  const [localOpen, setLocalOpen] = useState(false);
  // forceOpen prop overrides per-click local state (global scene toggle)
  const isOpen = forceOpen !== undefined ? forceOpen : localOpen;
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

  const actualWidth = width - gap * 2;
  const actualHeight = height - gap * 2;

  // Horizontal woodgrain at a consistent scale — NOT stretched to fit. The 90°
  // rotation swaps the texture axes, so tiling the (rotated) vertical axis by
  // the width/height ratio spreads the grain across a wide drawer front instead
  // of smearing one texture image over the whole panel.
  const texture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = Math.PI / 2; // grain runs horizontally
      cloned.center.set(0.5, 0.5);
      cloned.wrapS = THREE.RepeatWrapping;
      cloned.wrapT = THREE.RepeatWrapping;
      cloned.repeat.set(1, Math.max(1, actualWidth / actualHeight));
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('DrawerFront: Texture clone failed:', e);
      return null;
    }
  }, [map, actualWidth, actualHeight]);
  
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
    if (forceOpen === undefined) setLocalOpen(o => !o);
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
            key={texture ? texture.uuid : 'flat'}
            color={color}
            roughness={roughness}
            metalness={metalness}
            map={texture}
          />
        </mesh>
        
        {/* Handle mounted ON the drawer front — inside the sliding group so it
            travels with the drawer when it opens (fixes the handle staying put). */}
        {handle && handle.type !== 'None' && (
          <HandleMesh
            type={handle.type}
            color={handle.color}
            position={[
              0,
              // Profile rails sit along the top edge; other handles centre vertically.
              handle.type === 'Profile' ? actualHeight / 2 - 0.018 : 0,
              thickness / 2 + 0.015,
            ]}
            rotation={Math.PI / 2}
            length={handle.type === 'Profile' ? actualWidth : handle.length}
          />
        )}

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
      
      {/* Runner indicators — only visible when drawer is open (hidden inside closed cabinet) */}
      {showBox && isOpen && (
        <>
          {/* Left runner */}
          <mesh position={[-actualWidth / 2 + runnerClearance + boxSideThickness / 2, -actualHeight / 2 + boxHeight / 2, -0.15]}>
            <boxGeometry args={[0.010, 0.025, 0.35]} />
            <meshStandardMaterial color="#888888" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Right runner */}
          <mesh position={[actualWidth / 2 - runnerClearance - boxSideThickness / 2, -actualHeight / 2 + boxHeight / 2, -0.15]}>
            <boxGeometry args={[0.010, 0.025, 0.35]} />
            <meshStandardMaterial color="#888888" metalness={0.7} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default DrawerFront;
