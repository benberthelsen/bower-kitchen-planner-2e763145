import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import EdgeOutline from './EdgeOutline';
import HandleMesh, { HandleType } from './HandleMesh';

interface CornerBiFoldProps {
  /** Lead leaf width — the leaf hinged at the carcase (m). */
  leadWidth: number;
  /** Second leaf width — hinged off the lead leaf's free edge (m). */
  secondWidth: number;
  height: number;
  thickness: number;
  color: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  /**
   * Carcase hinge position (the pivot of the whole pair) in the cabinet's
   * local space. The pair's local frame: lead leaf extends along local -X
   * (dir=-1) or +X (dir=+1) from this point; leaf faces local +Z when closed.
   */
  pivot: [number, number, number];
  /** -1: lead leaf extends toward local -X. +1: toward +X (mirrored pair). */
  dir?: -1 | 1;
  /** Yaw of the whole assembly about Y (radians) to place it on either notch face. */
  yaw?: number;
  handle?: { type: HandleType; color: string };
  forceOpen?: boolean;
  interactive?: boolean;
}

/**
 * Pie-cut corner bi-fold door pair.
 *
 * CLOSED: the two leaves sit at 90° to each other, one on each face of the
 * corner notch — lead leaf across the local X span, second leaf continuing
 * around the internal corner (toward local +Z for dir=-1).
 *
 * OPEN: the pair moves as ONE linked unit — the lead leaf swings out on the
 * carcase hinge while the fold angle between the leaves opens from 90°
 * toward flat, exactly like a real pie-cut corner door. The handle rides on
 * the second leaf's free edge, so it travels with the doors.
 */
const CornerBiFold: React.FC<CornerBiFoldProps> = ({
  leadWidth,
  secondWidth,
  height,
  thickness,
  color,
  roughness = 0.5,
  metalness = 0.0,
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

  // Lead leaf swings out ~93°; the fold angle opens 90° → ~180° in step.
  const T_MAX = Math.PI * 0.52;
  const target = isOpen ? T_MAX : 0;

  useFrame((_, delta) => {
    const diff = target - cur.current;
    if (Math.abs(diff) > 0.001) {
      cur.current += diff * Math.min(delta * 8, 1);
      const t = cur.current;
      // Lead leaf: swing out from the carcase hinge.
      if (aRef.current) aRef.current.rotation.y = -dir * t;
      // Second leaf: closed at 90° to the lead leaf (covering the other notch
      // face); folds flat against the lead leaf as the pair opens.
      if (bRef.current) bRef.current.rotation.y = -dir * (Math.PI / 2 + (Math.PI / 2) * (t / T_MAX));
    }
  });

  const texture = React.useMemo(() => {
    if (!map) return null;
    try {
      const c = map.clone();
      c.rotation = 0;
      c.center.set(0.5, 0.5);
      c.needsUpdate = true;
      return c;
    } catch {
      return null;
    }
  }, [map]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    if (forceOpen === undefined) setLocalOpen((o) => !o);
  };

  // Initial (closed) rotations so the first frame is correct before useFrame runs.
  const aInit = 0;
  const bInit = -dir * (Math.PI / 2);

  const leafMaterial = (
    <meshStandardMaterial
      key={texture ? texture.uuid : 'flat'}
      color={color}
      roughness={roughness}
      metalness={metalness}
      map={texture}
    />
  );

  return (
    <group position={pivot} rotation={[0, yaw, 0]}>
      {/* Lead leaf — pivots at the carcase hinge (local origin) */}
      <group ref={aRef} rotation={[0, aInit, 0]}>
        <mesh
          position={[dir * leadWidth / 2, 0, thickness / 2]}
          onClick={onClick}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = interactive ? 'pointer' : 'default'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        >
          <boxGeometry args={[leadWidth, height, thickness]} />
          {leafMaterial}
        </mesh>
        <group position={[dir * leadWidth / 2, 0, thickness / 2]}>
          <EdgeOutline width={leadWidth} height={height} depth={thickness} />
        </group>

        {/* Second leaf — hinged at the lead leaf's free edge; carries the handle */}
        <group position={[dir * leadWidth, 0, 0]} ref={bRef} rotation={[0, bInit, 0]}>
          <mesh
            position={[dir * secondWidth / 2, 0, thickness / 2]}
            onClick={onClick}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = interactive ? 'pointer' : 'default'; }}
            onPointerOut={() => { document.body.style.cursor = 'default'; }}
          >
            <boxGeometry args={[secondWidth, height, thickness]} />
            {leafMaterial}
          </mesh>
          <group position={[dir * secondWidth / 2, 0, thickness / 2]}>
            <EdgeOutline width={secondWidth} height={height} depth={thickness} />
          </group>
          {handle && handle.type !== 'None' && (
            <HandleMesh
              type={handle.type}
              color={handle.color}
              position={[dir * (secondWidth - 0.045), height / 2 - 0.096, thickness + 0.012]}
            />
          )}
        </group>
      </group>
    </group>
  );
};

export default CornerBiFold;
