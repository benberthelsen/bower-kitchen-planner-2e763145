import React from 'react';
import * as THREE from 'three';

interface CornerCarcassProps {
  // For L-shape: both arms use width as front width, leftArmDepth/rightArmDepth for depths
  width: number;           // Width of the cabinet (in meters) 
  height: number;          // Height of the carcass (in meters)
  depth: number;           // Standard depth (for blind/diagonal) (in meters)
  cornerType: 'l-shape' | 'blind' | 'diagonal';
  
  // L-shape specific: arm depths
  leftArmDepth?: number;   // Depth of left arm (in meters), defaults to depth
  rightArmDepth?: number;  // Depth of right arm (in meters), defaults to depth
  
  // Blind corner specific
  blindDepth?: number;     // Blind extension depth (in meters)
  blindSide?: 'Left' | 'Right'; // Which side has the blind
  fillerWidth?: number;    // Width of filler strip (in meters)
  hasReturnFiller?: boolean; // Whether to show return filler
  
  gableThickness?: number;
  color: string;
  roughness: number;
  metalness?: number;
  map?: THREE.Texture | null;
}

/**
 * Corner Carcass geometry with proper L-shape, blind, and diagonal configurations
 * Creates realistic corner cabinet structures as seen in kitchen design software
 * 
 * L-SHAPE CORNER CABINET (viewed from above, installed in room corner):
 * 
 *     BACK WALL (along Z=0)
 *     ────────────────────────
 *     │                      
 *     │   ┌────────┐         
 *     │   │ CORNER │─────────│  
 *     │   │ SPACE  │  RIGHT  │ (right arm front faces +Z)
 *     │   │        │   ARM   │
 *     │   └────────┴─────────│
 *     │   
 *  L  │   ┌────────┐
 *  E  │   │  LEFT  │  (left arm front faces +X)
 *  F  │   │  ARM   │
 *  T  │   └────────┘
 *     │
 *   WALL
 *
 * The cabinet sits in the corner with:
 * - Left arm running along the left wall (back against -X)
 * - Right arm running along the back wall (back against -Z) 
 * - An internal corner where they meet
 * - Front openings face into the room (+X for left arm, +Z for right arm)
 */
const CornerCarcass: React.FC<CornerCarcassProps> = ({
  width,
  height,
  depth,
  cornerType,
  leftArmDepth,
  rightArmDepth,
  blindDepth = 0.15,
  blindSide = 'Left',
  fillerWidth = 0.075,
  hasReturnFiller = false,
  gableThickness = 0.018,
  color,
  roughness,
  metalness = 0,
  map,
}) => {
  const bottomThickness = 0.018;
  const backThickness = 0.006;
  
  // Use provided arm depths or fall back to standard depth (575mm = 0.575m)
  const leftDepth = leftArmDepth ?? depth;
  const rightDepth = rightArmDepth ?? depth;
  
  // Clone texture for vertical grain on gables
  const verticalTexture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = 0;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('CornerCarcass: Texture clone failed:', e);
      return null;
    }
  }, [map]);
  
  // Clone texture for horizontal grain on bottom/back
  const horizontalTexture = React.useMemo(() => {
    if (!map) return null;
    try {
      const cloned = map.clone();
      cloned.rotation = Math.PI / 2;
      cloned.center.set(0.5, 0.5);
      cloned.needsUpdate = true;
      return cloned;
    } catch (e) {
      console.warn('CornerCarcass: Texture clone failed:', e);
      return null;
    }
  }, [map]);
  
  const materialProps = {
    color,
    roughness,
    metalness,
  };
  
  // L-shape (pie-cut) corner: the cabinet fills its full width × depth square
  // footprint EXCEPT for a notch at the front-right. The two faces bounding
  // the notch are where the pie-cut door pair sits, flush with the adjoining
  // cabinet runs on each wall (Microvellum-style).
  //
  //   notchX = -width/2 + leftArmDepth   (inner corner, X)
  //   notchZ = -depth/2 + rightArmDepth  (inner corner, Z)
  //
  //   Plan view (corner of room at back-left):
  //   ┌──────────────────────────┐  ← back wall (z = -depth/2)
  //   │          BACK ARM        │
  //   │      (full width)        │
  //   ├──────────┬───────────────┘  ← notchZ (door faces +Z here)
  //   │   LEFT   │    open notch
  //   │   ARM    │
  //   └──────────┘  ← front (z = +depth/2)
  //              ↑ notchX (door faces +X here)
  if (cornerType === 'l-shape') {
    const notchX = -width / 2 + Math.min(leftDepth, width - 0.05);
    const notchZ = -depth / 2 + Math.min(rightDepth, depth - 0.05);
    const leftArmWidth = notchX + width / 2;     // X extent of left arm
    const backArmDepth = notchZ + depth / 2;     // Z extent of back arm
    const leftArmFrontLen = depth / 2 - notchZ;  // left arm portion in front of back arm

    return (
      <group>
        {/* ===== BACK ARM (full width, z ∈ [-depth/2, notchZ]) ===== */}
        {/* Back panel against the back wall */}
        <mesh position={[0, 0, -depth / 2 + backThickness / 2]}>
          <boxGeometry args={[width - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
        </mesh>
        {/* Right end gable (butts the next cabinet in the back-wall run) */}
        <mesh position={[width / 2 - gableThickness / 2, 0, (-depth / 2 + notchZ) / 2]}>
          <boxGeometry args={[gableThickness, height, backArmDepth]} />
          <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
        </mesh>
        {/* Bottom panel of back arm */}
        <mesh position={[0, -height / 2 + bottomThickness / 2, (-depth / 2 + notchZ) / 2 + backThickness / 2]}>
          <boxGeometry args={[width - gableThickness * 2, bottomThickness, backArmDepth - backThickness]} />
          <meshStandardMaterial key={horizontalTexture ? horizontalTexture.uuid : 'flat'} {...materialProps} map={horizontalTexture} />
        </mesh>

        {/* ===== LEFT ARM (x ∈ [-width/2, notchX], continues to the front) ===== */}
        {/* Outer gable along the left wall, full depth */}
        <mesh position={[-width / 2 + gableThickness / 2, 0, 0]}>
          <boxGeometry args={[gableThickness, height, depth]} />
          <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
        </mesh>
        {/* Front end closure of left arm (butts the next cabinet in the left-wall run) */}
        <mesh position={[(-width / 2 + notchX) / 2, 0, depth / 2 - gableThickness / 2]}>
          <boxGeometry args={[leftArmWidth, height, gableThickness]} />
          <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
        </mesh>
        {/* Bottom panel of left arm front portion */}
        <mesh position={[(-width / 2 + notchX) / 2, -height / 2 + bottomThickness / 2, (notchZ + depth / 2) / 2]}>
          <boxGeometry args={[leftArmWidth - gableThickness, bottomThickness, leftArmFrontLen]} />
          <meshStandardMaterial key={horizontalTexture ? horizontalTexture.uuid : 'flat'} {...materialProps} map={horizontalTexture} />
        </mesh>

        {/* No internal corner post: the pie-cut bi-fold pair is hinged leaf-to-leaf
            and closes across the notch itself — a full-height post here reads as a
            stray vertical fragment between the door leaves. */}
      </group>
    );
  }
  
  // Diagonal corner: 45-degree angled front with two gables meeting at corner
  if (cornerType === 'diagonal') {
    const diagonalWidth = Math.sqrt(2) * width * 0.4;
    
    return (
      <group>
        {/* Left gable - along left wall */}
        <mesh position={[-width / 2 + gableThickness / 2, 0, depth / 4]}>
          <boxGeometry args={[gableThickness, height, depth / 2]} />
          <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Right gable - along back wall */}
        <mesh position={[width / 4, 0, -depth / 2 + gableThickness / 2]}>
          <boxGeometry args={[width / 2, height, gableThickness]} />
          <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Angled front panel (45 degrees) */}
        <mesh 
          position={[0, 0, depth / 4]} 
          rotation={[0, -Math.PI / 4, 0]}
        >
          <boxGeometry args={[diagonalWidth, height, gableThickness]} />
          <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Bottom panel */}
        <mesh position={[-width / 8, -height / 2 + bottomThickness / 2, -depth / 8]}>
          <boxGeometry args={[width * 0.6, bottomThickness, depth * 0.6]} />
          <meshStandardMaterial key={horizontalTexture ? horizontalTexture.uuid : 'flat'} {...materialProps} map={horizontalTexture} />
        </mesh>
        
        {/* Back panels - two pieces at 90 degrees */}
        <mesh position={[-width / 8, 0, -depth / 2 + gableThickness + backThickness / 2]}>
          <boxGeometry args={[width / 3, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
        </mesh>
        <mesh position={[-width / 2 + gableThickness + backThickness / 2, 0, -depth / 8]}>
          <boxGeometry args={[backThickness, height - bottomThickness * 2, depth / 3]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
        </mesh>
        
        {/* Interior shelf */}
        <mesh position={[-width / 8, 0, -depth / 8]}>
          <boxGeometry args={[width * 0.4, 0.018, depth * 0.4]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.6} />
        </mesh>
      </group>
    );
  }
  
  // Blind corner: standard rectangular carcass that stays INSIDE its
  // width × depth bounding box (the old version drew a blind extension
  // outside the box, which clashed with walls and neighbouring cabinets).
  // The blind half of the front is covered by a blank panel rendered by
  // CabinetAssembler; the accessible half gets the door.
  return (
    <group>
      {/* Left gable */}
      <mesh position={[-width / 2 + gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
      </mesh>

      {/* Right gable */}
      <mesh position={[width / 2 - gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial key={verticalTexture ? verticalTexture.uuid : 'flat'} {...materialProps} map={verticalTexture} />
      </mesh>

      {/* Bottom panel */}
      <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
        <boxGeometry args={[width - gableThickness * 2, bottomThickness, depth - backThickness]} />
        <meshStandardMaterial key={horizontalTexture ? horizontalTexture.uuid : 'flat'} {...materialProps} map={horizontalTexture} />
      </mesh>

      {/* Back panel */}
      <mesh position={[0, 0, -depth / 2 + backThickness / 2]}>
        <boxGeometry args={[width - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
      </mesh>

      {/* Interior shelf */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[width - gableThickness * 2 - 0.01, 0.018, depth * 0.8]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.6} />
      </mesh>
    </group>
  );
};

export default CornerCarcass;
