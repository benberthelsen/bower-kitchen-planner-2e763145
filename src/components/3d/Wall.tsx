import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WallProps {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  thickness?: number;
  isOrbiting?: boolean;
}

const Wall: React.FC<WallProps> = ({ position, rotation, width, height, thickness = 0.2, isOrbiting = false }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isForeground, setIsForeground] = useState(false);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    // Get wall normal
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyEuler(new THREE.Euler(...rotation));
    // Direction from camera to wall
    const viewDir = new THREE.Vector3().subVectors(meshRef.current.position, camera.position);
    const dot = viewDir.dot(normal);
    // Wall is in foreground if camera is looking at its back face (dot > 0)
    const shouldBeForeground = dot > 0.1;
    if (isForeground !== shouldBeForeground) setIsForeground(shouldBeForeground);
  });

  // Only make transparent when orbiting AND wall is in foreground
  const shouldBeTransparent = isOrbiting && isForeground;

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <boxGeometry args={[width, height, thickness]} />
      <meshStandardMaterial 
        color="#e5e7eb" 
        transparent 
        opacity={shouldBeTransparent ? 0.15 : 1} 
        depthWrite={!shouldBeTransparent} 
        side={THREE.DoubleSide} 
      />
    </mesh>
  );
};

export default Wall;
