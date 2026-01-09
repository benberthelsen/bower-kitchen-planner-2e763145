import React, { useMemo } from 'react';
import * as THREE from 'three';

interface EdgeOutlineProps {
  width: number;
  height: number;
  depth: number;
  color?: string;
  threshold?: number;
}

/**
 * EdgeOutline component - adds dark edge lines to cabinet panels
 * Creates a CAD/technical drawing aesthetic
 */
const EdgeOutline: React.FC<EdgeOutlineProps> = ({
  width,
  height,
  depth,
  color = '#555555',
  threshold = 15,
}) => {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(width, height, depth);
    return new THREE.EdgesGeometry(box, threshold);
  }, [width, height, depth, threshold]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} linewidth={1} />
    </lineSegments>
  );
};

export default EdgeOutline;
