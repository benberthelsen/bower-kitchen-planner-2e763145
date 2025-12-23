import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WallProps {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  thickness?: number;
}

const Wall: React.FC<WallProps> = ({ position, rotation, width, height, thickness = 0.2 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [visible, setVisible] = useState(true);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyEuler(new THREE.Euler(...rotation));
    const viewDir = new THREE.Vector3().subVectors(meshRef.current.position, camera.position);
    const dot = viewDir.dot(normal);
    const shouldBeVisible = dot <= 0.1;
    if (visible !== shouldBeVisible) setVisible(shouldBeVisible);
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <boxGeometry args={[width, height, thickness]} />
      <meshStandardMaterial color="#e5e7eb" transparent opacity={visible ? 1 : 0.05} depthWrite={visible} side={THREE.DoubleSide} />
    </mesh>
  );
};

export default Wall;
