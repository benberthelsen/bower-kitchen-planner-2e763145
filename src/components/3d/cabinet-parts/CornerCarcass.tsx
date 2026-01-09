import React from 'react';
import * as THREE from 'three';

interface CornerCarcassProps {
  // For L-shape: both arms use width as front width, leftArmDepth/rightArmDepth for depths
  width: number;           // Width of the cabinet front (in meters)
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
 * Creates Microvellum-compliant corner cabinet structures
 * 
 * L-SHAPE GEOMETRY (viewed from above, cabinet sits in corner):
 * 
 *        Back Wall
 *    ┌─────────────────┐
 *    │                 │ Right Arm (extends along back wall)
 *    │     ┌───────────┤
 *    │     │           │
 *    │     │   CORNER  │
 *    │     │           │
 *    ├─────┘           │
 *    │                 │ Left Arm (extends along left wall)  
 *    │                 │
 *    └─────────────────┘
 *         Left Wall
 *
 * The cabinet origin (0,0,0) is at the CENTER of the cabinet bounds.
 * - Left arm extends along -X axis (against left wall)
 * - Right arm extends along -Z axis (against back wall)
 * - Front faces point outward (+Z for left arm, +X for right arm)
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
  const backThickness = 0.003;
  
  // Use provided arm depths or fall back to standard depth
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
  
  // L-shape corner: Two arms forming an L
  if (cornerType === 'l-shape') {
    // L-shape dimensions:
    // - Total width = leftDepth + rightDepth (both arms contribute)
    // - Left arm: width = cabinet width, extends leftDepth into corner
    // - Right arm: width = cabinet width, extends rightDepth into corner
    
    // The cabinet is centered, so we need to position elements relative to center
    const totalWidth = Math.max(width, leftDepth + rightDepth * 0.3);
    const totalDepth = Math.max(depth, rightDepth + leftDepth * 0.3);
    
    // Arm dimensions
    const leftArmFrontWidth = width * 0.5; // Front opening width of left arm
    const rightArmFrontWidth = width * 0.5; // Front opening width of right arm
    
    return (
      <group>
        {/* ===== LEFT ARM (extends along -Z from corner, front faces +X) ===== */}
        
        {/* Left arm - outer gable (left side, full height) */}
        <mesh position={[
          -width / 2 + gableThickness / 2, 
          0, 
          -depth / 2 + leftDepth / 2
        ]}>
          <boxGeometry args={[gableThickness, height, leftDepth]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Left arm - bottom panel */}
        <mesh position={[
          -width / 4 + gableThickness / 2, 
          -height / 2 + bottomThickness / 2, 
          -depth / 2 + leftDepth / 2
        ]}>
          <boxGeometry args={[width / 2 - gableThickness, bottomThickness, leftDepth - gableThickness]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
        </mesh>
        
        {/* Left arm - back panel (against left wall, faces +X) */}
        <mesh position={[
          -width / 2 + gableThickness + backThickness / 2, 
          0, 
          -depth / 2 + leftDepth / 2
        ]}>
          <boxGeometry args={[backThickness, height - bottomThickness * 2, leftDepth - gableThickness * 2]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
        
        {/* ===== RIGHT ARM (extends along -X from corner, front faces +Z) ===== */}
        
        {/* Right arm - outer gable (right side, full height) */}
        <mesh position={[
          width / 2 - rightDepth / 2, 
          0, 
          -depth / 2 + gableThickness / 2
        ]}>
          <boxGeometry args={[rightDepth, height, gableThickness]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Right arm - bottom panel */}
        <mesh position={[
          width / 2 - rightDepth / 2, 
          -height / 2 + bottomThickness / 2, 
          -depth / 4 + gableThickness / 2
        ]}>
          <boxGeometry args={[rightDepth - gableThickness, bottomThickness, depth / 2 - gableThickness]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
        </mesh>
        
        {/* Right arm - back panel (against back wall, faces +Z) */}
        <mesh position={[
          width / 2 - rightDepth / 2, 
          0, 
          -depth / 2 + gableThickness + backThickness / 2
        ]}>
          <boxGeometry args={[rightDepth - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
        
        {/* ===== CORNER JUNCTION ===== */}
        
        {/* Corner post - vertical piece where arms meet */}
        <mesh position={[
          -width / 4 + gableThickness, 
          0, 
          -depth / 4 + gableThickness
        ]}>
          <boxGeometry args={[gableThickness * 2, height, gableThickness * 2]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Diagonal front panel - angled piece across the open corner front */}
        <group position={[0, 0, depth / 4]} rotation={[0, -Math.PI / 4, 0]}>
          <mesh>
            <boxGeometry args={[width * 0.5, height, gableThickness]} />
            <meshStandardMaterial {...materialProps} map={verticalTexture} />
          </mesh>
        </group>
      </group>
    );
  }
  
  // Diagonal corner: angled front with two gables meeting at corner
  if (cornerType === 'diagonal') {
    const diagonalWidth = Math.sqrt(2) * (width * 0.4);
    const angleOffset = width * 0.25;
    
    return (
      <group>
        {/* Left gable - extends along left wall */}
        <mesh position={[-width / 2 + gableThickness / 2, 0, 0]}>
          <boxGeometry args={[gableThickness, height, depth]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Right gable - extends along back wall */}
        <mesh position={[0, 0, -depth / 2 + gableThickness / 2]}>
          <boxGeometry args={[width, height, gableThickness]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Angled front panel (45 degrees) - the diagonal face */}
        <mesh 
          position={[angleOffset, 0, angleOffset]} 
          rotation={[0, -Math.PI / 4, 0]}
        >
          <boxGeometry args={[diagonalWidth, height, gableThickness]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Bottom panel - triangular-ish shape */}
        <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
          <boxGeometry args={[width - gableThickness * 2, bottomThickness, depth - gableThickness]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
        </mesh>
        
        {/* Back panels - two pieces meeting at corner */}
        <mesh position={[-width / 4, 0, -depth / 2 + gableThickness + backThickness / 2]}>
          <boxGeometry args={[width / 2 - gableThickness, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
        <mesh position={[-width / 2 + gableThickness + backThickness / 2, 0, -depth / 4]}>
          <boxGeometry args={[backThickness, height - bottomThickness * 2, depth / 2 - gableThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
      </group>
    );
  }
  
  // Blind corner: standard cabinet with blind extension into corner
  const isBlindLeft = blindSide === 'Left';
  const blindExtension = blindDepth;
  
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
        <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
      </mesh>
      
      {/* ===== BLIND EXTENSION ===== */}
      
      {/* Blind panel - blocks access to corner (front face of blind section) */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension / 2 : width / 2 + blindExtension / 2,
        0,
        depth / 2 - gableThickness / 2
      ]}>
        <boxGeometry args={[blindExtension, height, gableThickness]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Blind extension gable - outer edge of blind section */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension + gableThickness / 2 : width / 2 + blindExtension - gableThickness / 2,
        0,
        depth / 4
      ]}>
        <boxGeometry args={[gableThickness, height, depth / 2 - gableThickness]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Blind extension bottom panel */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension / 2 + gableThickness / 2 : width / 2 + blindExtension / 2 - gableThickness / 2,
        -height / 2 + bottomThickness / 2,
        depth / 4
      ]}>
        <boxGeometry args={[blindExtension - gableThickness, bottomThickness, depth / 2 - gableThickness]} />
        <meshStandardMaterial {...materialProps} map={horizontalTexture} />
      </mesh>
      
      {/* Filler strip - covers gap between blind cabinet and wall */}
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
      
      {/* Return filler - perpendicular strip for proper corner fit */}
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
