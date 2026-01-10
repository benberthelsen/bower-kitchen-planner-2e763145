import React from 'react';

interface BackPanelProps {
  width: number;      // Width in meters
  height: number;     // Height in meters
  thickness?: number; // Thickness in meters (default 3mm)
  position: [number, number, number];
  color?: string;
  insetFromEdge?: number; // How far from gable edges (meters) - dado depth
  setback?: number;       // Distance from rear of cabinet (meters) - for hanging rails
}

/**
 * Back panel component for cabinets
 * Typically thin (3mm) backing board
 * Positioned with setback for hanging rails (16mm standard)
 */
const BackPanel: React.FC<BackPanelProps> = ({
  width,
  height,
  thickness = 0.003,       // 3mm backing board
  position,
  color = '#f5f5f5',
  insetFromEdge = 0.009,   // 9mm dado depth into gables
  setback = 0.016,         // 16mm setback for hanging rails (Microvellum standard)
}) => {
  // Calculate actual panel size (inset from gable edges for dado joint)
  const actualWidth = width - insetFromEdge * 2;
  const actualHeight = height - insetFromEdge * 2;

  // Position is adjusted to account for setback from rear
  // The position passed in should be the center of where the back panel sits
  return (
    <mesh position={position}>
      <boxGeometry args={[actualWidth, actualHeight, thickness]} />
      <meshStandardMaterial 
        color={color}
        roughness={0.8}
        metalness={0.0}
      />
    </mesh>
  );
};

export default BackPanel;
