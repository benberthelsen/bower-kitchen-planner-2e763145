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
 * L-Shape Corner Carcass geometry
 * Creates the distinctive L-shaped cabinet structure for corner cabinets
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
  // For L-shape: Create custom geometry
  if (cornerType === 'l-shape') {
    // L-shape has two arms
    const armWidth = width;
    const armDepth = depth;
    
    return (
      <group>
        {/* Main arm (front-facing) */}
        <mesh position={[0, 0, armDepth / 4]}>
          <boxGeometry args={[armWidth, height, armDepth / 2]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={map}
          />
        </mesh>
        
        {/* Side arm (extending to the side) */}
        <mesh position={[armWidth / 4, 0, -armDepth / 4]}>
          <boxGeometry args={[armWidth / 2, height, armDepth / 2]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={map}
          />
        </mesh>
        
        {/* Corner fill piece */}
        <mesh position={[-armWidth / 4, 0, -armDepth / 4]}>
          <boxGeometry args={[armWidth / 2 - gableThickness, height, gableThickness]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={map}
          />
        </mesh>
      </group>
    );
  }
  
  // For diagonal corner: angled front
  if (cornerType === 'diagonal') {
    return (
      <group>
        {/* Main box */}
        <mesh>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={map}
          />
        </mesh>
        
        {/* Angled front indicator */}
        <mesh 
          position={[width / 4, 0, depth / 4]} 
          rotation={[0, Math.PI / 4, 0]}
        >
          <boxGeometry args={[width * 0.4, height, gableThickness]} />
          <meshStandardMaterial 
            color={color} 
            roughness={roughness} 
            metalness={metalness}
            map={map}
          />
        </mesh>
      </group>
    );
  }
  
  // For blind corner: standard box with blind extension indicator
  return (
    <group>
      {/* Main cabinet box */}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial 
          color={color} 
          roughness={roughness} 
          metalness={metalness}
          map={map}
        />
      </mesh>
      
      {/* Blind side panel indicator */}
      <mesh position={[-width / 2 - blindWidth / 2, 0, 0]}>
        <boxGeometry args={[blindWidth, height, depth * 0.3]} />
        <meshStandardMaterial 
          color={color} 
          roughness={roughness * 0.9} 
          metalness={metalness}
          map={map}
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  );
};

export default CornerCarcass;
