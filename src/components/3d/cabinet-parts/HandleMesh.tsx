import React from 'react';
import { HandleType } from '@/types';

export type { HandleType };

interface HandleMeshProps {
  type: HandleType;
  color: string;
  position: [number, number, number];
  rotation?: number;  // Rotation around Z axis (radians) — π/2 = horizontal (drawers)
  length?: number;    // Bar/profile handle length in meters
}

/**
 * Parametric handle models for doors and drawers.
 * One model per visual style; the supplier catalog rows are classified into
 * these styles by src/lib/handleStyles.ts.
 *
 * Convention: origin sits ~15mm in front of the door face (+Z out of door).
 * Linear handles run along Y by default; callers rotate π/2 for drawers.
 * Inherently horizontal styles (Cup, Flush, Profile) ignore the rotation.
 */
const HandleMesh: React.FC<HandleMeshProps> = ({
  type,
  color,
  position,
  rotation = 0,
  length = 0.14,
}) => {
  if (type === 'None') return null;

  const metalProps = {
    color,
    metalness: 0.8,
    roughness: 0.2,
  };

  if (type === 'Knob') {
    return (
      <group position={position}>
        {/* Base plate against the door */}
        <mesh position={[0, 0, -0.013]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.011, 0.011, 0.004, 16]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        {/* Neck */}
        <mesh position={[0, 0, -0.006]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.005, 0.007, 0.012, 12]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        {/* Knob head */}
        <mesh>
          <sphereGeometry args={[0.015, 16, 16]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
      </group>
    );
  }

  if (type === 'Lip') {
    return (
      <group position={position} rotation={[0, 0, rotation]}>
        {/* Main lip profile - curved edge pull */}
        <mesh>
          <boxGeometry args={[0.1, 0.02, 0.015]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        {/* Curved back */}
        <mesh position={[0, -0.008, -0.008]} rotation={[Math.PI / 4, 0, 0]}>
          <boxGeometry args={[0.1, 0.012, 0.012]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
      </group>
    );
  }

  if (type === 'Cup') {
    // Shell/cup pull: downward-opening half cylinder + back plate.
    // Always horizontal regardless of door/drawer.
    return (
      <group position={position}>
        {/* Back plate against the door */}
        <mesh position={[0, 0.008, -0.013]}>
          <boxGeometry args={[0.1, 0.03, 0.004]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        {/* Half-cylinder shell, axis along X, opening facing down */}
        <mesh position={[0, 0.004, -0.006]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.024, 0.024, 0.085, 20, 1, false, 0, Math.PI]} />
          <meshStandardMaterial {...metalProps} side={2} />
        </mesh>
      </group>
    );
  }

  if (type === 'Flush') {
    // Recessed/inset pull: a plate sitting just proud of the front with a
    // dark finger recess. Always horizontal.
    return (
      <group position={position}>
        <mesh position={[0, 0, -0.0128]}>
          <boxGeometry args={[0.12, 0.045, 0.004]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        {/* Finger recess (reads as a cavity) */}
        <mesh position={[0, -0.004, -0.0105]}>
          <boxGeometry args={[0.095, 0.024, 0.002]} />
          <meshStandardMaterial color="#2b2b2b" metalness={0.4} roughness={0.7} />
        </mesh>
      </group>
    );
  }

  if (type === 'Profile') {
    // Continuous grip rail (handleless look). Runs the full width the caller
    // provides via `length`. Always horizontal.
    const railH = 0.032;
    const railD = 0.02;
    return (
      <group position={position}>
        <mesh position={[0, 0, -railD / 2 - 0.005]}>
          <boxGeometry args={[length, railH, railD]} />
          <meshStandardMaterial {...metalProps} roughness={0.35} />
        </mesh>
        {/* Grip groove shadow under the rail */}
        <mesh position={[0, -railH / 2 + 0.006, -railD / 2 - 0.004]}>
          <boxGeometry args={[length * 0.98, 0.011, railD * 0.9]} />
          <meshStandardMaterial color="#222222" metalness={0.3} roughness={0.8} />
        </mesh>
      </group>
    );
  }

  if (type === 'DPull') {
    // D / bow pull: bar with legs at the very ends and rounded corners.
    const halfLength = length / 2;
    const legDepth = 0.032;
    const barR = 0.0055;
    return (
      <group position={position} rotation={[0, 0, rotation]}>
        {/* Grip bar */}
        <mesh>
          <cylinderGeometry args={[barR, barR, length - barR * 2, 10]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        {/* Rounded corners */}
        <mesh position={[0, halfLength - barR, 0]}>
          <sphereGeometry args={[barR, 10, 10]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        <mesh position={[0, -halfLength + barR, 0]}>
          <sphereGeometry args={[barR, 10, 10]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        {/* Legs into the door at the ends */}
        <mesh position={[0, halfLength - barR, -legDepth / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[barR, barR * 1.15, legDepth, 10]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
        <mesh position={[0, -halfLength + barR, -legDepth / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[barR, barR * 1.15, legDepth, 10]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>
      </group>
    );
  }

  // Bar handle (default): straight rail on two inset standoffs.
  const halfLength = length / 2;
  const standoffDepth = 0.03;

  return (
    <group position={position} rotation={[0, 0, rotation]}>
      {/* Main bar */}
      <mesh>
        <cylinderGeometry args={[0.006, 0.006, length, 8]} />
        <meshStandardMaterial {...metalProps} />
      </mesh>

      {/* Top standoff - goes INTO the door (negative Z) */}
      <mesh position={[0, halfLength - 0.01, -standoffDepth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.004, standoffDepth, 8]} />
        <meshStandardMaterial {...metalProps} />
      </mesh>

      {/* Bottom standoff - goes INTO the door (negative Z) */}
      <mesh position={[0, -halfLength + 0.01, -standoffDepth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.004, standoffDepth, 8]} />
        <meshStandardMaterial {...metalProps} />
      </mesh>
    </group>
  );
};

export default HandleMesh;
