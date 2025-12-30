import React from 'react';

interface BackPanelProps {
  width: number;      // Width in meters
  height: number;     // Height in meters
  thickness?: number; // Thickness in meters (default 3mm)
  position: [number, number, number];
  color?: string;
  insetFromEdge?: number; // How far from gable edges (meters)
}

/**
 * Back panel component for cabinets
 * Typically thin (3mm) backing board
 */
const BackPanel: React.FC<BackPanelProps> = ({
  width,
  height,
  thickness = 0.003,
  position,
  color = '#f5f5f5',
  insetFromEdge = 0.018, // Sits in dado in gables
}) => {
  const actualWidth = width - insetFromEdge * 2;
  const actualHeight = height - insetFromEdge * 2;

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
