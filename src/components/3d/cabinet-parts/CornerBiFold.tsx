import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import EdgeOutline from './EdgeOutline';
import HandleMesh, { HandleType } from './HandleMesh';

interface CornerBiFoldProps {
  /** Lead leaf width (the arm whose door is hinged at the carcase), metres. */
  leadWidth: number;
  /** Second leaf width (hinged off the lead leaf), metres. */
  secondWidth: number;
  height: number;
  thickness: number;
  color: string;
  roughness?: number;
  map?: THREE.Texture | null;
  /** Lead leaf outer (carcase) hinge position — where leaf 1 pivots. */
  pivot: [number, number, number];
  /** -1 lead leaf extends toward -X from the pivot, +1 toward +X. */
  dir?: number;
  /** Rotation of the whole assembly about Y so it sits on the right arm. */
  yaw?: number;
  handle?: { type: HandleType; color: string };
  forceOpen?: boolean;
  interactive?: boolean;
}

/**
 * Corner bi-fold: two leaves that open as ONE linked pair.
 * Leaf 1 (the handed/lead door) hinges at the carcase and swings out; leaf 2 is
 * hinged off leaf 1's free edge and folds back against it, carrying the handle.
 */
const CornerBiFold: React.FC<CornerBiFoldProps> = ({
  leadWidth,
  secondWidth,
  height,
  thickness,
  color,
  roughness = 0.5,
  map,
  pivot,
  dir = -1,
  yaw = 0,
  handle,
  forceOpen,
  interactive = true,
}) => {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = forceOpen !== undefined ? forceOpen : localOpen;
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);
  const cur = useRef(0);

  // Lead leaf swings ~95°, the second leaf folds back ~2× relative to it.
  const target = isOpen ? Math.PI * 0.52 : 0;
  useFrame((_, delta) => {
    const diff = target - cur.current;
    if (Math.abs(diff) > 0.001) {
      cur.current += diff * Math.min(delta * 8, 1);
      const t = cur.current;
      if (aRef.current) aRef.current.rotation.y = dir * t;       // lead leaf swings out
      if (bRef.current) bRef.current.rotation.y = -dir * 2 * t;  // second leaf folds back
    }
  });

  const texture = React.useMemo(() => {
    if (!map) return null;
    try { const c = map.clone(); c.needsUpdate = true; return c; } catch { return null; }
  }, [map]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    if (forceOpen === undefined) setLocalOpen((o) => !o);
  };

  const mat = <meshStandardMaterial color={color} roughness={roughness} map={texture} />;

  return (
    <group position={pivot} rotation={[0, yaw, 0]}>
      {/* Lead leaf — pivots at the carcase edge (local origin) */}
      <group ref={aRef}>
        <mesh position={[dir * leadWidth / 2, 0, thickness / 2]} onClick={onClick}>
          <boxGeometry args={[leadWidth, height, thickness]} />
          {mat}
        </mesh>
        <group position={[dir * leadWidth / 2, 0, thickness / 2]}>
          <EdgeOutline width={leadWidth} height={height} depth={thickness} />
        </group>

        {/* Second leaf — hinged at the lead leaf's free edge, folds back, carries the handle */}
        <group position={[dir * leadWidth, 0, 0]} ref={bRef}>
          <mesh position={[dir * secondWidth / 2, 0, thickness / 2]} onClick={onClick}>
            <boxGeometry args={[secondWidth, height, thickness]} />
            {mat}
          </mesh>
          <group position={[dir * secondWidth / 2, 0, thickness / 2]}>
            <EdgeOutline width={secondWidth} height={height} depth={thickness} />
          </group>
          {handle && handle.type !== 'None' && (
            <HandleMesh
              type={handle.type}
              color={handle.color}
              position={[dir * (secondWidth - 0.04), height / 2 - 0.096, thickness + 0.015]}
            />
          )}
        </group>
      </group>
    </group>
  );
};

export default CornerBiFold;
