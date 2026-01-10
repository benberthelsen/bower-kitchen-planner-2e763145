import React from 'react';

interface CabinetLegsProps {
  width: number;       // Cabinet width in meters
  depth: number;       // Cabinet depth in meters
  height: number;      // Leg height (kick height) in meters
  legDiameter?: number; // Leg diameter in meters
  setback?: number;    // Distance from edge in meters
  
  // Corner cabinet support
  isCorner?: boolean;
  cornerType?: 'l-shape' | 'blind' | 'diagonal';
  leftArmDepth?: number;   // L-shape left arm depth in meters
  rightArmDepth?: number;  // L-shape right arm depth in meters
}

/**
 * Cabinet Legs component - renders adjustable leg posts
 * Based on Bower Cabinetry style with black plastic legs
 * Supports L-shape corner cabinets with proper leg placement
 */
const CabinetLegs: React.FC<CabinetLegsProps> = ({
  width,
  depth,
  height,
  legDiameter = 0.035, // 35mm standard leg
  setback = 0.05,      // 50mm from edge
  isCorner = false,
  cornerType = 'blind',
  leftArmDepth = 0.575,
  rightArmDepth = 0.575,
}) => {
  const legHeight = height - 0.015; // Slightly shorter than kick space
  const footDiameter = legDiameter * 1.3; // Foot is wider than leg
  const footHeight = 0.008; // 8mm foot

  // Generate leg positions based on cabinet type
  const getPositions = (): [number, number, number][] => {
    const yBase = -height / 2 + 0.01;
    
    // L-shape corner cabinet: legs follow the L pattern
    if (isCorner && cornerType === 'l-shape') {
      const armFrontWidth = Math.min(leftArmDepth, rightArmDepth) * 0.8;
      const cornerSize = width - armFrontWidth;
      
      // L-shaped leg placement:
      // - Left arm runs along left wall (back at -X, front opens +X)
      // - Right arm runs along back wall (back at -Z, front opens +Z)
      return [
        // Left arm - outer wall side
        [-width / 2 + setback, yBase, leftArmDepth / 2 - setback],          // Front outer left
        [-width / 2 + setback, yBase, -cornerSize / 2 + setback],            // Back outer left
        
        // Left arm - inner side (before corner)
        [-width / 2 + armFrontWidth - setback, yBase, leftArmDepth / 2 - setback], // Front inner left
        
        // Right arm - outer wall side  
        [rightArmDepth / 2 - setback, yBase, -depth / 2 + setback],          // Back outer right
        [-cornerSize / 2 + setback, yBase, -depth / 2 + setback],            // Back inner right (near corner)
        
        // Right arm - inner side (at front)
        [rightArmDepth / 2 - setback, yBase, -depth / 2 + armFrontWidth - setback], // Front inner right
        
        // Corner junction
        [-width / 2 + armFrontWidth - setback, yBase, -depth / 2 + armFrontWidth - setback], // Corner post
      ];
    }
    
    // Diagonal corner: triangular leg pattern
    if (isCorner && cornerType === 'diagonal') {
      return [
        // Left wall side
        [-width / 2 + setback, yBase, depth / 4],
        [-width / 2 + setback, yBase, -depth / 4],
        
        // Back wall side
        [width / 4, yBase, -depth / 2 + setback],
        [-width / 4, yBase, -depth / 2 + setback],
        
        // Diagonal front
        [-width / 4, yBase, depth / 4],
        [width / 4, yBase, -depth / 4],
      ];
    }
    
    // Standard rectangular cabinet
    const hasMiddleLeg = width > 0.8;
    
    const positions: [number, number, number][] = [
      // Front left
      [-width / 2 + setback, yBase, depth / 2 - setback],
      // Front right
      [width / 2 - setback, yBase, depth / 2 - setback],
      // Back left
      [-width / 2 + setback, yBase, -depth / 2 + setback],
      // Back right
      [width / 2 - setback, yBase, -depth / 2 + setback],
    ];
    
    // Add middle legs for wider cabinets
    if (hasMiddleLeg) {
      positions.push(
        [0, yBase, depth / 2 - setback], // Front middle
        [0, yBase, -depth / 2 + setback], // Back middle
      );
    }
    
    return positions;
  };

  const positions = getPositions();

  return (
    <group>
      {positions.map((pos, i) => (
        <group key={`leg-${i}`} position={pos}>
          {/* Leg post - black plastic cylinder */}
          <mesh position={[0, legHeight / 2, 0]}>
            <cylinderGeometry args={[legDiameter / 2, legDiameter / 2, legHeight, 12]} />
            <meshStandardMaterial 
              color="#1a1a1a" 
              roughness={0.7} 
              metalness={0.1} 
            />
          </mesh>
          
          {/* Foot base - slightly wider disc */}
          <mesh position={[0, footHeight / 2, 0]}>
            <cylinderGeometry args={[footDiameter / 2, footDiameter / 2 * 1.1, footHeight, 12]} />
            <meshStandardMaterial 
              color="#2a2a2a" 
              roughness={0.8} 
              metalness={0.0} 
            />
          </mesh>
          
          {/* Adjustment ring - subtle detail */}
          <mesh position={[0, legHeight * 0.7, 0]}>
            <cylinderGeometry args={[legDiameter / 2 + 0.002, legDiameter / 2 + 0.002, 0.015, 12]} />
            <meshStandardMaterial 
              color="#333333" 
              roughness={0.5} 
              metalness={0.2} 
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export default CabinetLegs;
