import React from 'react';
import * as THREE from 'three';

interface CornerCarcassProps {
  width: number;       // Width of the L-shape arm (in meters)
  height: number;      // Height of the carcass (in meters)
  depth: number;       // Depth of the L-shape arm (in meters)
  cornerType: 'l-shape' | 'blind' | 'diagonal';
  blindWidth?: number; // Width of blind section (in meters) for blind cabinets
  gableThickness?: number;
  color: string;
  roughness: number;
  metalness?: number;
  map?: THREE.Texture | null;
}

/**
 * Corner Carcass geometry with proper wireframe gables
 * Creates Microvellum-compliant corner cabinet structures
 */
const CornerCarcass: React.FC<CornerCarcassProps> = ({
  width,
  height,
  depth,
  cornerType,
  blindWidth = 0.15,
  gableThickness = 0.018,
  color,
  roughness,
  metalness = 0,
  map,
}) => {
  const bottomThickness = 0.018;
  const backThickness = 0.003;
  
  // Clone texture for vertical grain on gables
  const verticalTexture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = 0;
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);
  
  // Clone texture for horizontal grain on bottom/back
  const horizontalTexture = React.useMemo(() => {
    if (!map) return null;
    const cloned = map.clone();
    cloned.rotation = Math.PI / 2;
    cloned.center.set(0.5, 0.5);
    cloned.needsUpdate = true;
    return cloned;
  }, [map]);
  
  // L-shape corner: Two gable arms forming an L
  if (cornerType === 'l-shape') {
    const armWidth = width;
    const armDepth = depth;
    
    return (
      <group>
        {/* Front-facing arm left gable */}
        <mesh position={[-armWidth / 2 + gableThickness / 2, 0, armDepth / 4]}>
          <boxGeometry args={[gableThickness, height, armDepth / 2 + gableThickness]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={verticalTexture}
          />
        </mesh>
        
        {/* Front-facing arm right gable (corner post) */}
        <mesh position={[armWidth / 4, 0, -armDepth / 4 + gableThickness / 2]}>
          <boxGeometry args={[armWidth / 2, height, gableThickness]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={verticalTexture}
          />
        </mesh>
        
        {/* Side arm right gable */}
        <mesh position={[armWidth / 2 - gableThickness / 2, 0, -armDepth / 4]}>
          <boxGeometry args={[gableThickness, height, armDepth / 2]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={verticalTexture}
          />
        </mesh>
        
        {/* Side arm back gable */}
        <mesh position={[0, 0, -armDepth / 2 + gableThickness / 2]}>
          <boxGeometry args={[armWidth / 2 + gableThickness, height, gableThickness]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={verticalTexture}
          />
        </mesh>
        
        {/* L-shaped bottom panel */}
        <mesh position={[0, -height / 2 + bottomThickness / 2, armDepth / 4]}>
          <boxGeometry args={[armWidth - gableThickness * 2, bottomThickness, armDepth / 2]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={horizontalTexture}
          />
        </mesh>
        <mesh position={[armWidth / 4 - gableThickness, -height / 2 + bottomThickness / 2, -armDepth / 4]}>
          <boxGeometry args={[armWidth / 2 - gableThickness, bottomThickness, armDepth / 2 - gableThickness * 2]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={horizontalTexture}
          />
        </mesh>
        
        {/* Back panels (L-shaped) */}
        <mesh position={[-armWidth / 2 + gableThickness + backThickness / 2, 0, 0]}>
          <boxGeometry args={[backThickness, height - bottomThickness * 2, armDepth / 2]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
        <mesh position={[armWidth / 4, 0, -armDepth / 2 + gableThickness + backThickness / 2]}>
          <boxGeometry args={[armWidth / 2 - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
      </group>
    );
  }
  
  // Diagonal corner: angled front with two gables
  if (cornerType === 'diagonal') {
    const diagonalWidth = width * 0.4;
    
    return (
      <group>
        {/* Left gable */}
        <mesh position={[-width / 2 + gableThickness / 2, 0, 0]}>
          <boxGeometry args={[gableThickness, height, depth]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={verticalTexture}
          />
        </mesh>
        
        {/* Right gable */}
        <mesh position={[width / 2 - gableThickness / 2, 0, 0]}>
          <boxGeometry args={[gableThickness, height, depth]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={verticalTexture}
          />
        </mesh>
        
        {/* Angled corner gable (45 degrees) */}
        <mesh 
          position={[width / 3, 0, depth / 3]} 
          rotation={[0, Math.PI / 4, 0]}
        >
          <boxGeometry args={[diagonalWidth, height, gableThickness]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={verticalTexture}
          />
        </mesh>
        
        {/* Bottom panel */}
        <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
          <boxGeometry args={[width - gableThickness * 2, bottomThickness, depth - gableThickness]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={horizontalTexture}
          />
        </mesh>
        
        {/* Back panels */}
        <mesh position={[0, 0, -depth / 2 + backThickness / 2]}>
          <boxGeometry args={[width - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
          <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
        </mesh>
      </group>
    );
  }
  
  // Blind corner: standard box with blind extension
  return (
    <group>
      {/* Main cabinet left gable */}
      <mesh position={[-width / 2 + gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial 
          color={color} 
          roughness={roughness} 
          metalness={metalness}
          map={verticalTexture}
        />
      </mesh>
      
      {/* Main cabinet right gable */}
      <mesh position={[width / 2 - gableThickness / 2, 0, 0]}>
        <boxGeometry args={[gableThickness, height, depth]} />
        <meshStandardMaterial 
          color={color} 
          roughness={roughness} 
          metalness={metalness}
          map={verticalTexture}
        />
      </mesh>
      
      {/* Blind panel (blocking off corner access) */}
      <mesh position={[-width / 2 - blindWidth / 2, 0, depth / 2 - gableThickness / 2]}>
        <boxGeometry args={[blindWidth, height, gableThickness]} />
        <meshStandardMaterial 
          color={color} 
          roughness={roughness} 
          metalness={metalness}
          map={verticalTexture}
        />
      </mesh>
      
      {/* Blind extension gable */}
      <mesh position={[-width / 2 - blindWidth + gableThickness / 2, 0, depth / 4]}>
        <boxGeometry args={[gableThickness, height, depth / 2 - gableThickness]} />
        <meshStandardMaterial 
          color={color} 
          roughness={roughness * 0.9} 
          metalness={metalness}
          map={verticalTexture}
        />
      </mesh>
      
      {/* Bottom panel */}
      <mesh position={[0, -height / 2 + bottomThickness / 2, 0]}>
        <boxGeometry args={[width - gableThickness * 2, bottomThickness, depth - backThickness]} />
        <meshStandardMaterial 
          color={color} 
          roughness={roughness} 
          metalness={metalness}
          map={horizontalTexture}
        />
      </mesh>
      
      {/* Back panel */}
      <mesh position={[0, 0, -depth / 2 + backThickness / 2]}>
        <boxGeometry args={[width - gableThickness * 2, height - bottomThickness * 2, backThickness]} />
        <meshStandardMaterial color="#d4d4d4" roughness={0.7} />
      </mesh>
    </group>
  );
};

export default CornerCarcass;
