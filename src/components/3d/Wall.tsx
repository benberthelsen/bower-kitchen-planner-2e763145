import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WallProps {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  thickness?: number;
  fadeWhenBlocking?: boolean;
  roomCenter?: [number, number, number];
}

const Wall: React.FC<WallProps> = ({ 
  position, 
  rotation, 
  width, 
  height, 
  thickness = 0.1, 
  fadeWhenBlocking = true,
  roomCenter = [0, 0, 0]
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Calculate wall normal once
  const wallNormal = useMemo(() => {
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyEuler(new THREE.Euler(...rotation));
    return normal;
  }, [rotation]);

  useFrame(({ camera }) => {
    if (!meshRef.current || !materialRef.current || !fadeWhenBlocking) return;
    
    const wallPos = new THREE.Vector3(...position);
    const roomCenterVec = new THREE.Vector3(roomCenter[0], roomCenter[1], roomCenter[2]);
    
    // Vector from wall to camera
    const toCamera = new THREE.Vector3().subVectors(camera.position, wallPos);
    // Vector from wall to room center
    const toCenter = new THREE.Vector3().subVectors(roomCenterVec, wallPos);
    
    // Check which side of the wall the camera and room center are on
    const cameraDot = toCamera.dot(wallNormal);
    const centerDot = toCenter.dot(wallNormal);
    
    // Wall is blocking if camera is on opposite side from room center
    // (camera behind wall, room center in front of wall)
    const isBlocking = cameraDot < 0 && centerDot > 0;
    
    // Smoothly transition opacity
    const targetOpacity = isBlocking ? 0 : 1;
    const currentOpacity = materialRef.current.opacity;
    const newOpacity = THREE.MathUtils.lerp(currentOpacity, targetOpacity, 0.15);
    
    materialRef.current.opacity = newOpacity;
    materialRef.current.depthWrite = newOpacity > 0.5;
    materialRef.current.visible = newOpacity > 0.01;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <boxGeometry args={[width, height, thickness]} />
      <meshStandardMaterial 
        ref={materialRef}
        color="#e5e7eb" 
        transparent 
        opacity={1}
        side={THREE.DoubleSide} 
      />
    </mesh>
  );
};

// Corner piece to join two walls
export const WallCorner: React.FC<{
  position: [number, number, number];
  height: number;
  thickness: number;
  fadeWhenBlocking?: boolean;
  roomCenter?: [number, number, number];
}> = ({ position, height, thickness, fadeWhenBlocking = true, roomCenter = [0, 0, 0] }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ camera }) => {
    if (!meshRef.current || !materialRef.current || !fadeWhenBlocking) return;
    
    const cornerPos = new THREE.Vector3(...position);
    const roomCenterVec = new THREE.Vector3(roomCenter[0], roomCenter[1], roomCenter[2]);
    
    // For corner, check if camera is "outside" the corner (negative X and negative Z from corner)
    const toCamera = new THREE.Vector3().subVectors(camera.position, cornerPos);
    const toCenter = new THREE.Vector3().subVectors(roomCenterVec, cornerPos);
    
    // Corner is blocking if camera is in the "outside" quadrant
    const isBlocking = (toCamera.x < 0 && toCenter.x > 0) || (toCamera.z < 0 && toCenter.z > 0);
    
    const targetOpacity = isBlocking ? 0 : 1;
    const currentOpacity = materialRef.current.opacity;
    const newOpacity = THREE.MathUtils.lerp(currentOpacity, targetOpacity, 0.15);
    
    materialRef.current.opacity = newOpacity;
    materialRef.current.depthWrite = newOpacity > 0.5;
    materialRef.current.visible = newOpacity > 0.01;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={[thickness, height, thickness]} />
      <meshStandardMaterial 
        ref={materialRef}
        color="#e5e7eb" 
        transparent 
        opacity={1}
      />
    </mesh>
  );
};

export default Wall;
