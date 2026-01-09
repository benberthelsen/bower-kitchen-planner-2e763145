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
  roomCenter?: [number, number, number];
}

const Wall: React.FC<WallProps> = ({ 
  position, 
  rotation, 
  width, 
  height, 
  thickness = 0.2, 
  isOrbiting = false,
  roomCenter = [0, 0, 0]
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isForeground, setIsForeground] = useState(false);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    
    // Get wall normal (pointing into the room)
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyEuler(new THREE.Euler(...rotation));
    
    // Direction from wall to camera
    const wallPos = new THREE.Vector3(...position);
    const camDir = new THREE.Vector3().subVectors(camera.position, wallPos).normalize();
    
    // Direction from wall to room center
    const centerDir = new THREE.Vector3(roomCenter[0], roomCenter[1], roomCenter[2]).sub(wallPos).normalize();
    
    // Wall is "in the foreground" if camera is on the opposite side from the room center
    // i.e., camera and room center are on opposite sides of the wall
    const cameraSide = camDir.dot(normal);
    const centerSide = centerDir.dot(normal);
    
    // If camera is on the outside (negative dot with normal) and looking in
    const shouldBeForeground = cameraSide < -0.1 && centerSide > 0;
    
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
