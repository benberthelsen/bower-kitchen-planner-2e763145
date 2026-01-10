import React, { useMemo } from 'react';
import * as THREE from 'three';

interface EdgeOutlineProps {
  width: number;
  height: number;
  depth: number;
  color?: string;
  threshold?: number;
  opacity?: number;    // Control visibility (0-1)
  visible?: boolean;   // Option to hide edges entirely
}

/**
 * EdgeOutline component - adds subtle edge lines to cabinet panels
 * Creates a refined technical drawing aesthetic without being too harsh
 */
const EdgeOutline: React.FC<EdgeOutlineProps> = ({
  width,
  height,
  depth,
  color = '#888888',       // Lighter default for subtlety
  threshold = 15,
  opacity = 0.6,           // Semi-transparent for softer look
  visible = true,
}) => {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(width, height, depth);
    return new THREE.EdgesGeometry(box, threshold);
  }, [width, height, depth, threshold]);

  if (!visible) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial 
        color={color} 
        linewidth={1} 
        transparent={opacity < 1}
        opacity={opacity}
      />
    </lineSegments>
  );
};

export default EdgeOutline;
