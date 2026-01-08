import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, ContactShadows } from '@react-three/drei';
import { ConfiguredCabinet, useTradeRoom, TradeRoom } from '@/contexts/TradeRoomContext';
import * as THREE from 'three';
import { WALL_THICKNESS } from '@/constants';

interface PlannerSceneProps {
  room: TradeRoom;
  cabinets: ConfiguredCabinet[];
  is3D?: boolean;
  onCabinetSelect: (instanceId: string | null) => void;
  onCabinetPlace: (instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => void;
  className?: string;
}

// Simple cabinet mesh for trade planner
function TradeCabinetMesh({ 
  cabinet, 
  isSelected, 
  onSelect,
  onDragEnd
}: { 
  cabinet: ConfiguredCabinet; 
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (position: { x: number; z: number }) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, z: 0 });

  const width = cabinet.dimensions.width / 1000;
  const height = cabinet.dimensions.height / 1000;
  const depth = cabinet.dimensions.depth / 1000;

  const initialPosition = cabinet.position 
    ? [cabinet.position.x / 1000, height / 2, cabinet.position.z / 1000] as [number, number, number]
    : [1, height / 2, 1] as [number, number, number];

  // Get category-based color
  const categoryColors: Record<string, string> = {
    Base: '#3b82f6',
    Wall: '#22c55e', 
    Tall: '#a855f7',
    Appliance: '#f97316',
  };

  const color = categoryColors[cabinet.category] || '#64748b';

  return (
    <group 
      ref={groupRef}
      position={initialPosition}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button === 0 && groupRef.current) {
          setIsDragging(true);
          // Store offset from click point to cabinet center
          dragOffset.current = {
            x: e.point.x - groupRef.current.position.x,
            z: e.point.z - groupRef.current.position.z
          };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }
      }}
      onPointerUp={(e) => {
        if (isDragging && groupRef.current) {
          setIsDragging(false);
          const pos = groupRef.current.position;
          onDragEnd({ x: pos.x * 1000, z: pos.z * 1000 });
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        if (isDragging && groupRef.current) {
          // Apply offset so cabinet doesn't jump to cursor
          groupRef.current.position.x = e.point.x - dragOffset.current.x;
          groupRef.current.position.z = e.point.z - dragOffset.current.z;
        }
      }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial 
          color={isSelected ? '#fbbf24' : color} 
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>
      
      {/* Selection outline */}
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(width + 0.01, height + 0.01, depth + 0.01)]} />
          <lineBasicMaterial color="#fbbf24" linewidth={2} />
        </lineSegments>
      )}

      {/* Cabinet number label */}
      <sprite position={[0, height / 2 + 0.15, 0]} scale={[0.3, 0.15, 1]}>
        <spriteMaterial color="#fbbf24" />
      </sprite>
    </group>
  );
}

function CameraController({ room, controlsRef }: { room: TradeRoom; controlsRef: React.RefObject<any> }) {
  const widthM = room.config.width / 1000;
  const depthM = room.config.depth / 1000;

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(widthM / 2, 0, depthM / 2);
      controlsRef.current.update();
    }
  }, [widthM, depthM, controlsRef]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[widthM * 1.5, 5, depthM * 1.5]} fov={45} />
      <OrbitControls 
        ref={controlsRef} 
        makeDefault 
        enableDamping 
        dampingFactor={0.05} 
        rotateSpeed={0.5} 
        panSpeed={0.6} 
        zoomSpeed={0.8}
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
}

function RoomWalls({ room }: { room: TradeRoom }) {
  const widthM = room.config.width / 1000;
  const depthM = room.config.depth / 1000;
  const heightM = room.config.height / 1000;
  const wt = WALL_THICKNESS / 1000;

  return (
    <>
      {/* Back wall */}
      <mesh position={[widthM / 2, heightM / 2, -wt / 2]} castShadow receiveShadow>
        <boxGeometry args={[widthM, heightM, wt]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-wt / 2, heightM / 2, depthM / 2]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[depthM, heightM, wt]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
      </mesh>
    </>
  );
}

export function PlannerScene({
  room,
  cabinets,
  is3D = true,
  onCabinetSelect,
  onCabinetPlace,
  className,
}: PlannerSceneProps) {
  const { selectedCabinetId } = useTradeRoom();
  const controlsRef = useRef<any>(null);

  const widthM = room.config.width / 1000;
  const depthM = room.config.depth / 1000;

  const handleCabinetDragEnd = (instanceId: string, pos: { x: number; z: number }) => {
    const cabinet = cabinets.find(c => c.instanceId === instanceId);
    if (cabinet) {
      onCabinetPlace(instanceId, {
        x: pos.x,
        y: cabinet.position?.y || 0,
        z: pos.z,
        rotation: cabinet.position?.rotation || 0,
      });
    }
  };

  return (
    <div className={`w-full h-full ${className || ''}`}>
      <Canvas shadows dpr={[1, 2]} className="w-full h-full" style={{ background: 'linear-gradient(to bottom, #f8fafc, #e2e8f0)' }}>
        <CameraController room={room} controlsRef={controlsRef} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
        <Environment preset="apartment" blur={0.8} background={false} />
        <ContactShadows resolution={1024} scale={Math.max(widthM, depthM) * 2} blur={2} opacity={0.4} far={10} color="#000000" />

        <group onPointerMissed={() => onCabinetSelect(null)}>
          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[widthM / 2, -0.01, depthM / 2]} receiveShadow>
            <planeGeometry args={[widthM + 2, depthM + 2]} />
            <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
          </mesh>

          <Grid 
            position={[0, 0, 0]} 
            args={[30, 30]} 
            cellSize={0.5} 
            cellThickness={0.5} 
            cellColor="#e5e7eb" 
            sectionSize={1} 
            sectionThickness={1} 
            sectionColor="#d1d5db" 
            fadeDistance={30} 
          />

          <RoomWalls room={room} />

          {/* Render placed cabinets */}
          {cabinets.filter(c => c.isPlaced).map((cabinet) => (
            <TradeCabinetMesh
              key={cabinet.instanceId}
              cabinet={cabinet}
              isSelected={selectedCabinetId === cabinet.instanceId}
              onSelect={() => onCabinetSelect(cabinet.instanceId)}
              onDragEnd={(pos) => handleCabinetDragEnd(cabinet.instanceId, pos)}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
