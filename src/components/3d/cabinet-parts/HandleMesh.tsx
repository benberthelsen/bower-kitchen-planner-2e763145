import React from 'react';

export type HandleType = 'Bar' | 'Knob' | 'Lip' | 'None';

interface HandleMeshProps {
  type: HandleType;
  color: string;
  position: [number, number, number];
  rotation?: number;  // Rotation around Z axis (radians)
  length?: number;    // Bar handle length in meters
}

/**
 * Handle component for doors and drawers
 * Renders appropriate handle geometry based on type
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
      <mesh position={position}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshStandardMaterial {...metalProps} />
      </mesh>
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

  // Bar handle (default)
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
