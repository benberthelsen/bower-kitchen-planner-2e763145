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
  // The cabinet sits in a corner - one arm goes along each wall
  if (cornerType === 'l-shape') {
    // L-shape layout (viewed from above):
    //
    //     ┌──────────────────┐
    //     │   Right Arm      │ <- rightDepth
    //     │     (depth)      │
    //     ├──────┬───────────┤
    //     │      │ Corner    │
    //     │ Left │  Post     │
    //     │ Arm  │           │
    //     │      │           │
    //     └──────┴───────────┘
    //     <- leftDepth ->
    //
    // Front faces are at Z = depth/2 (positive Z)
    // The corner post is where the two arms meet
    
    const leftArmWidth = leftDepth; // Left arm extends along the wall
    const rightArmWidth = rightDepth; // Right arm extends along the wall
    const postSize = gableThickness * 2; // Corner post
    
    return (
      <group>
        {/* ===== LEFT ARM (extends along left wall) ===== */}
        
        {/* Left arm - outer gable (along back of left arm) */}
        <mesh position={[
          -width / 2 + gableThickness / 2, 
          0, 
          depth / 2 - leftArmWidth / 2
        ]}>
          <boxGeometry args={[gableThickness, height, leftArmWidth]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Left arm - bottom panel */}
        <mesh position={[
          -width / 4, 
          -height / 2 + bottomThickness / 2, 
          depth / 2 - leftArmWidth / 2
        ]}>
          <boxGeometry args={[width / 2 - gableThickness, bottomThickness, leftArmWidth - gableThickness]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
        </mesh>
        
        {/* Left arm - back panel */}
        <mesh position={[
          -width / 4, 
          0, 
          depth / 2 - leftArmWidth + backThickness / 2
        ]}>
          <boxGeometry args={[width / 2 - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
        
        {/* ===== RIGHT ARM (extends along back wall) ===== */}
        
        {/* Right arm - outer gable (right side of right arm) */}
        <mesh position={[
          width / 2 - gableThickness / 2, 
          0, 
          -depth / 2 + rightArmWidth / 2
        ]}>
          <boxGeometry args={[gableThickness, height, rightArmWidth]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Right arm - bottom panel */}
        <mesh position={[
          width / 4, 
          -height / 2 + bottomThickness / 2, 
          -depth / 2 + rightArmWidth / 2
        ]}>
          <boxGeometry args={[width / 2 - gableThickness, bottomThickness, rightArmWidth - gableThickness]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
        </mesh>
        
        {/* Right arm - back panel (along left side of right arm) */}
        <mesh position={[
          width / 4, 
          0, 
          -depth / 2 + backThickness / 2
        ]}>
          <boxGeometry args={[width / 2 - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
        
        {/* ===== CORNER POST (where arms meet) ===== */}
        
        {/* Corner post - vertical piece at intersection */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[postSize, height, postSize]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Corner diagonal/connecting piece (optional decorative) */}
        <mesh 
          position={[0, 0, depth / 4]} 
          rotation={[0, Math.PI / 4, 0]}
        >
          <boxGeometry args={[gableThickness, height, width / 4]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
      </group>
    );
  }
  
  // Diagonal corner: angled front with two gables
  if (cornerType === 'diagonal') {
    const diagonalWidth = Math.sqrt(2) * (width * 0.4);
    
    return (
      <group>
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
        
        {/* Angled front panel (45 degrees) */}
        <mesh 
          position={[width / 3, 0, depth / 3]} 
          rotation={[0, Math.PI / 4, 0]}
        >
          <boxGeometry args={[diagonalWidth, height, gableThickness]} />
          <meshStandardMaterial {...materialProps} map={verticalTexture} />
        </mesh>
        
        {/* Bottom panel */}
        <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
          <boxGeometry args={[width - gableThickness * 2, bottomThickness, depth - gableThickness]} />
          <meshStandardMaterial {...materialProps} map={horizontalTexture} />
        </mesh>
        
        {/* Back panels (two pieces meeting at corner) */}
        <mesh position={[-width / 4, 0, -depth / 2 + backThickness / 2]}>
          <boxGeometry args={[width / 2 - gableThickness, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
        <mesh position={[-depth / 2 + backThickness / 2, 0, -width / 4]}>
          <boxGeometry args={[backThickness, height - bottomThickness * 2, width / 2 - gableThickness]} />
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
      {/* Main cabinet left gable */}
      <mesh position={[-width / 2 + gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Main cabinet right gable */}
      <mesh position={[width / 2 - gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Blind extension panel - blocks access to corner */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension / 2 : width / 2 + blindExtension / 2,
        0,
        depth / 2 - gableThickness / 2
      ]}>
        <boxGeometry args={[blindExtension, height, gableThickness]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Blind extension gable - outer edge */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension + gableThickness / 2 : width / 2 + blindExtension - gableThickness / 2,
        0,
        depth / 4
      ]}>
        <boxGeometry args={[gableThickness, height, depth / 2 - gableThickness]} />
        <meshStandardMaterial {...materialProps} map={verticalTexture} />
      </mesh>
      
      {/* Filler strip - covers gap between blind cabinet and wall/adjacent cabinet */}
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
      
      {/* Bottom panel - main cabinet */}
      <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
        <boxGeometry args={[width - gableThickness * 2, bottomThickness, depth - backThickness]} />
        <meshStandardMaterial {...materialProps} map={horizontalTexture} />
      </mesh>
      
      {/* Bottom panel - blind extension */}
      <mesh position={[
        isBlindLeft ? -width / 2 - blindExtension / 2 + gableThickness / 2 : width / 2 + blindExtension / 2 - gableThickness / 2,
        -height / 2 + bottomThickness / 2,
        depth / 4
      ]}>
        <boxGeometry args={[blindExtension - gableThickness, bottomThickness, depth / 2 - gableThickness]} />
        <meshStandardMaterial {...materialProps} map={horizontalTexture} />
      </mesh>
      
      {/* Back panel - main cabinet */}
      <mesh position={[0, 0, -depth / 2 + backThickness / 2]}>
        <boxGeometry args={[width - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
        <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
      </mesh>
    </group>
  );
};

export default CornerCarcass;
