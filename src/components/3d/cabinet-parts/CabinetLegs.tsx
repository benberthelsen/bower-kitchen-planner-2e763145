import React from 'react';

interface CabinetLegsProps {
  width: number;       // Cabinet width in meters
  depth: number;       // Cabinet depth in meters
  height: number;      // Leg height (kick height) in meters
  legDiameter?: number; // Leg diameter in meters
  setback?: number;    // Distance from edge in meters
}

/**
 * Cabinet Legs component - renders adjustable leg posts
 * Based on Bower Cabinetry style with black plastic legs
 */
const CabinetLegs: React.FC<CabinetLegsProps> = ({
  width,
  depth,
  height,
  legDiameter = 0.035, // 35mm standard leg
  setback = 0.05,      // 50mm from edge
}) => {
  // Calculate number of legs based on cabinet width
  const legCount = width > 0.8 ? 6 : 4;
  const hasMiddleLeg = legCount === 6;
  
  // Leg positions (corners + optional middle)
  const positions: [number, number, number][] = [
    // Front left
    [-width / 2 + setback, -height / 2 + 0.01, depth / 2 - setback],
    // Front right
    [width / 2 - setback, -height / 2 + 0.01, depth / 2 - setback],
    // Back left
    [-width / 2 + setback, -height / 2 + 0.01, -depth / 2 + setback],
    // Back right
    [width / 2 - setback, -height / 2 + 0.01, -depth / 2 + setback],
  ];
  
  // Add middle legs for wider cabinets
  if (hasMiddleLeg) {
    positions.push(
      [0, -height / 2 + 0.01, depth / 2 - setback], // Front middle
      [0, -height / 2 + 0.01, -depth / 2 + setback], // Back middle
    );
  }
  
  const legHeight = height - 0.015; // Slightly shorter than kick space
  const footDiameter = legDiameter * 1.3; // Foot is wider than leg
  const footHeight = 0.008; // 8mm foot

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
