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

  // Reusable vectors to avoid per-frame allocations
  const wallPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const roomCenterVec = useMemo(
    () => new THREE.Vector3(roomCenter[0], roomCenter[1], roomCenter[2]),
    [roomCenter]
  );
  const tmpCamVec = useMemo(() => new THREE.Vector3(), []);
  const tmpCenterVec = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    if (!meshRef.current || !materialRef.current || !fadeWhenBlocking) return;

    // Signed distance to the wall plane: d(p) = (p - wallPos) · n
    // Wall blocks the view *into the room* if camera and room center lie on opposite
    // sides of the wall plane (i.e. the wall separates them).
    const camDist = tmpCamVec.subVectors(camera.position, wallPos).dot(wallNormal);
    const centerDist = tmpCenterVec.subVectors(roomCenterVec, wallPos).dot(wallNormal);

    const separatesCameraAndRoom = camDist * centerDist < 0;

    // When blocking, fade (but keep slightly visible). When not blocking, fully opaque.
    const targetOpacity = separatesCameraAndRoom ? 0.12 : 1;

    // Smoothly transition opacity
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

  const cornerPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const roomCenterVec = useMemo(
    () => new THREE.Vector3(roomCenter[0], roomCenter[1], roomCenter[2]),
    [roomCenter]
  );

  useFrame(({ camera }) => {
    if (!meshRef.current || !materialRef.current || !fadeWhenBlocking) return;

    // Treat the corner as a join between two wall planes (x = cornerPos.x) and (z = cornerPos.z).
    // Fade it only when it separates camera and room center on either axis.
    const separatesX =
      (camera.position.x - cornerPos.x) * (roomCenterVec.x - cornerPos.x) < 0;
    const separatesZ =
      (camera.position.z - cornerPos.z) * (roomCenterVec.z - cornerPos.z) < 0;

    const isBlocking = separatesX || separatesZ;

    const targetOpacity = isBlocking ? 0.12 : 1;
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
