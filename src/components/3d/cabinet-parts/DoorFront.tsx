import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import EdgeOutline from './EdgeOutline';
import HandleMesh, { HandleType } from './HandleMesh';

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
  showHinges?: boolean; // render hinge cups (turn off for corner doors where they'd show in the open notch)
  interactive?: boolean; // Enable click-to-open animation
  /** When provided, overrides local open/close state (global toggle) */
  forceOpen?: boolean;
  /** Handle mounted ON the door (x,y are offsets from the door centre, in metres),
   *  so it swings WITH the door instead of floating in place. */
  handle?: { type: HandleType; color: string; x: number; y: number; rotation?: number; length?: number };
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
  showHinges = true,
  interactive = true,
  forceOpen,
  handle,
}) => {
  const [localOpen, setLocalOpen] = useState(false);
  // forceOpen prop overrides per-click local state (global scene toggle)
  const isOpen = forceOpen !== undefined ? forceOpen : localOpen;
  const currentRotation = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  // Target rotation: 45° open — enough to see inside while the door still
  // reads as a door (same presentation as the pie-cut corner bi-fold).
  const targetRotation = isOpen ? (hingeLeft ? -Math.PI / 4 : Math.PI / 4) : 0;
  
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

  const actualWidth = width - gap * 2;
  const actualHeight = height - gap * 2;

  // Vertical woodgrain with a consistent, real-world scale — NOT stretched to
  // fit the panel. One board spans the width (a door is a single board wide),
  // and the grain tiles along the height by the door's aspect ratio so a tall
  // door shows more grain length instead of a vertically-smeared texture.
  const texture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = 0; // grain runs vertically
      cloned.center.set(0.5, 0.5);
      cloned.wrapS = THREE.ClampToEdgeWrapping;
      cloned.wrapT = THREE.RepeatWrapping;
      cloned.repeat.set(1, Math.max(1, actualHeight / actualWidth));
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('DoorFront: Texture clone failed:', e);
      return null;
    }
  }, [map, actualWidth, actualHeight]);

  // Hinge position offset from center (door pivots around hinge edge)
  const hingeOffset = hingeLeft ? -actualWidth / 2 : actualWidth / 2;
  
  // Hinge cup positions (visible on inside of door)
  const hingeX = hingeLeft ? -actualWidth / 2 + 0.02 : actualWidth / 2 - 0.02;
  const hingeTopY = actualHeight / 2 - 0.1;
  const hingeBottomY = -actualHeight / 2 + 0.1;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    // Only toggle local state when not driven by forceOpen prop
    if (forceOpen === undefined) setLocalOpen(o => !o);
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
          {/* key forces material recreation when the texture arrives async —
              assigning map onto a compiled material won't recompile the shader */}
          <meshStandardMaterial
            key={texture ? texture.uuid : 'flat'}
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
        {showHinges && (
          <>
            <mesh position={[hingeX - hingeOffset, hingeTopY, -thickness / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.017, 0.017, 0.012, 16]} />
              <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[hingeX - hingeOffset, hingeBottomY, -thickness / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.017, 0.017, 0.012, 16]} />
              <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
            </mesh>
          </>
        )}

        {/* Handle mounted ON the door — lives in the rotating group so it
            swings with the door instead of floating in front of the carcass. */}
        {handle && handle.type !== 'None' && (
          <HandleMesh
            type={handle.type}
            color={handle.color}
            // Profile rails span the full door width (handleless look), so they
            // are centred horizontally instead of using the 32mm-system offset.
            position={[
              -hingeOffset + (handle.type === 'Profile' ? 0 : handle.x),
              handle.y,
              thickness / 2 + 0.015,
            ]}
            rotation={handle.rotation ?? 0}
            length={handle.type === 'Profile' ? actualWidth : handle.length}
          />
        )}
      </group>
    </group>
  );
};

export default DoorFront;
