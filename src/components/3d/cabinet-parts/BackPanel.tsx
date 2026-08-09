import React from 'react';
import type * as THREE from 'three';
import EdgeOutline from './EdgeOutline';

interface BackPanelProps {
  width: number;      // Width in meters
  height: number;     // Height in meters
  thickness?: number; // Thickness in meters (default 3mm)
  position: [number, number, number];
  color?: string;
  roughness?: number;
  map?: THREE.Texture | null;
  insetFromEdge?: number; // How far from gable edges (meters) - dado depth
  setback?: number;       // Distance from rear of cabinet (meters) - for hanging rails
  showEdges?: boolean;    // Show edge outlines for technical drawing look
}

/**
 * Back panel component for cabinets
 * Typically thin (3mm) backing board
 * Positioned with setback for hanging rails (16mm standard)
 * Now visible and properly rendered with edge details
 */
const BackPanel: React.FC<BackPanelProps> = ({
  width,
  height,
  thickness = 0.003,       // 3mm backing board
  position,
  color = '#f0f0f0',       // Slightly darker to distinguish from interior
  roughness = 0.85,
  map,
  insetFromEdge = 0.009,   // 9mm dado depth into gables
  setback = 0.016,         // 16mm setback for hanging rails (Microvellum standard)
  showEdges = true,
}) => {
  // Calculate actual panel size (inset from gable edges for dado joint)
  const actualWidth = width - insetFromEdge * 2;
  const actualHeight = height - insetFromEdge * 2;

  // Back panel with visible material and edge details
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[actualWidth, actualHeight, thickness]} />
        <meshStandardMaterial 
          color={color}
          roughness={roughness}
          metalness={0.0}
          map={map}
          side={2} // DoubleSide - visible from both sides
        />
      </mesh>
      {/* Subtle edge outline for definition */}
      {showEdges && (
        <EdgeOutline 
          width={actualWidth} 
          height={actualHeight} 
          depth={thickness} 
          color="#cccccc"
        />
      )}
    </group>
  );
};

export default BackPanel;
