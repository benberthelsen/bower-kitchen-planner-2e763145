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
  
  // L-shape corner: Two perpendicular arms forming an L
  // Coordinate system matches CabinetAssembler/Kickboard/BenchtopMesh:
  // - Cabinet bounding box is width x depth, centered at origin
  // - Left arm sits on the left side (near X = -width/2) and extends to the front (+Z)
  // - Right arm sits on the back side (near Z = -depth/2) and extends to the right (+X)
  if (cornerType === 'l-shape') {
    const armOpeningWidth = 0.45; // 450mm arm opening width (standard)

    // Clamp arm depths so we don't create impossible geometry
    const leftArm = Math.max(armOpeningWidth, leftDepth);
    const rightArm = Math.max(armOpeningWidth, rightDepth);

    return (
      <group>
        {/* ===== LEFT ARM (runs along left wall, extends in +Z) ===== */}
        <group position={[-width / 2 + armOpeningWidth / 2, 0, 0]}>
          {/* Outer/inner gables (run front-to-back) */}
          <mesh position={[-armOpeningWidth / 2 + gableThickness / 2, 0, 0]}>
            <boxGeometry args={[gableThickness, height, leftArm]} />
            <meshStandardMaterial {...materialProps} map={verticalTexture} />
          </mesh>
          <mesh position={[armOpeningWidth / 2 - gableThickness / 2, 0, 0]}>
            <boxGeometry args={[gableThickness, height, leftArm]} />
            <meshStandardMaterial {...materialProps} map={verticalTexture} />
          </mesh>

          {/* Back panel (against back wall, Z = -depth/2 within the arm) */}
          <mesh position={[0, 0, -leftArm / 2 + backThickness / 2]}>
            <boxGeometry args={[armOpeningWidth - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
          </mesh>

          {/* Bottom panel */}
          <mesh position={[0, -height / 2 + bottomThickness / 2, backThickness / 2]}>
            <boxGeometry args={[armOpeningWidth - gableThickness * 2, bottomThickness, leftArm - backThickness]} />
            <meshStandardMaterial {...materialProps} map={horizontalTexture} />
          </mesh>
        </group>

        {/* ===== RIGHT ARM (runs along back wall, extends in +X) ===== */}
        <group position={[0, 0, -depth / 2 + armOpeningWidth / 2]}>
          {/* Gables (run left-to-right) */}
          <mesh position={[0, 0, -armOpeningWidth / 2 + gableThickness / 2]}>
            <boxGeometry args={[rightArm, height, gableThickness]} />
            <meshStandardMaterial {...materialProps} map={verticalTexture} />
          </mesh>
          <mesh position={[0, 0, armOpeningWidth / 2 - gableThickness / 2]}>
            <boxGeometry args={[rightArm, height, gableThickness]} />
            <meshStandardMaterial {...materialProps} map={verticalTexture} />
          </mesh>

          {/* Back panel (against back wall) */}
          <mesh position={[0, 0, -armOpeningWidth / 2 + gableThickness + backThickness / 2]}>
            <boxGeometry args={[rightArm - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
          </mesh>

          {/* Bottom panel */}
          <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
            <boxGeometry args={[rightArm - gableThickness * 2, bottomThickness, armOpeningWidth - gableThickness * 2]} />
            <meshStandardMaterial {...materialProps} map={horizontalTexture} />
          </mesh>
        </group>

        {/* ===== CORNER JUNCTION (fills the overlap area so there's no hole) ===== */}
        <mesh
          position={[
            -width / 2 + armOpeningWidth / 2,
            -height / 2 + bottomThickness / 2,
            -depth / 2 + armOpeningWidth / 2,
          ]}
        >
          <boxGeometry args={[armOpeningWidth - gableThickness * 2, bottomThickness, armOpeningWidth - gableThickness * 2]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
        </mesh>
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
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Right gable - along back wall */}
        <mesh position={[width / 4, 0, -depth / 2 + gableThickness / 2]}>
          <boxGeometry args={[width / 2, height, gableThickness]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Angled front panel (45 degrees) */}
        <mesh 
          position={[0, 0, depth / 4]} 
          rotation={[0, -Math.PI / 4, 0]}
        >
          <boxGeometry args={[diagonalWidth, height, gableThickness]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Bottom panel */}
        <mesh position={[-width / 8, -height / 2 + bottomThickness / 2, -depth / 8]}>
          <boxGeometry args={[width * 0.6, bottomThickness, depth * 0.6]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
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
  
  // Blind corner: standard cabinet with blind extension into corner
  const isBlindLeft = blindSide === 'Left';
  const blindExtension = blindDepth;
  const totalWidth = width + blindExtension;
  
  return (
    <group>
      {/* Main cabinet - standard rectangular carcass */}
      
      {/* Left gable */}
      <mesh position={[-width / 2 + gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Right gable */}
      <mesh position={[width / 2 - gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Bottom panel - main cabinet */}
      <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
        <boxGeometry args={[width - gableThickness * 2, bottomThickness, depth - backThickness]} />
        <meshStandardMaterial {...materialProps} map={horizontalTexture} />
      </mesh>
      
      {/* Back panel - main cabinet */}
      <mesh position={[0, 0, -depth / 2 + backThickness / 2]}>
        <boxGeometry args={[width - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
      </mesh>
      
      {/* Interior shelf */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[width - gableThickness * 2 - 0.01, 0.018, depth * 0.8]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.6} />
      </mesh>
      
      {/* ===== BLIND EXTENSION ===== */}
      
      {/* Blind panel (blocks view into corner) */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension / 2 : width / 2 + blindExtension / 2,
        0,
        depth / 2 - gableThickness / 2
      ]}>
        <boxGeometry args={[blindExtension, height, gableThickness]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Blind extension gable (outer edge) */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension + gableThickness / 2 : width / 2 + blindExtension - gableThickness / 2,
        0,
        depth / 4
      ]}>
        <boxGeometry args={[gableThickness, height, depth / 2 - gableThickness]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Blind extension bottom */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension / 2 + gableThickness / 2 : width / 2 + blindExtension / 2 - gableThickness / 2,
        -height / 2 + bottomThickness / 2,
        depth / 4
      ]}>
        <boxGeometry args={[blindExtension - gableThickness, bottomThickness, depth / 2 - gableThickness]} />
        <meshStandardMaterial {...materialProps} map={horizontalTexture} />
      </mesh>
      
      {/* Filler strip */}
      {fillerWidth > 0 && (
        <mesh position={[
          isBlindLeft ? -width / 2 - blindExtension - fillerWidth / 2 : width / 2 + blindExtension + fillerWidth / 2,
          0,
          depth / 2 - 0.01
        ]}>
          <boxGeometry args={[fillerWidth, height, gableThickness]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
      )}
      
      {/* Return filler */}
      {hasReturnFiller && (
        <mesh position={[
          isBlindLeft ? -width / 2 - blindExtension - fillerWidth - gableThickness / 2 : width / 2 + blindExtension + fillerWidth + gableThickness / 2,
          0,
          depth / 4
        ]}>
          <boxGeometry args={[gableThickness, height, depth / 2]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
      )}
    </group>
  );
};

export default CornerCarcass;
