import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { ConfiguredCabinet } from '@/contexts/TradeRoomContext';

interface Preview3DProps {
  cabinet: ConfiguredCabinet;
  className?: string;
}

function CabinetPreviewMesh({ cabinet }: { cabinet: ConfiguredCabinet }) {
  const { width, height, depth } = cabinet.dimensions;
  
  // Convert mm to scene units (1 unit = 100mm)
  const w = width / 100;
  const h = height / 100;
  const d = depth / 100;
  
  // Get material color from cabinet config
  const exteriorColor = useMemo(() => {
    // Simple color mapping - in real app would use finish options
    const colorMap: Record<string, string> = {
      'white-matt': '#f5f5f5',
      'white-gloss': '#ffffff',
      'natural-oak': '#c4a66b',
      'walnut': '#5c4033',
      'charcoal': '#36454f',
      'navy': '#1e3a5f',
    };
    return colorMap[cabinet.materials.exteriorFinish] || '#f5f5f5';
  }, [cabinet.materials.exteriorFinish]);

  const carcaseColor = '#e8e8e8';
  
  // Door/drawer configuration based on cabinet type
  const doorCount = cabinet.category === 'Base' ? 2 : cabinet.category === 'Tall' ? 2 : 1;
  const hasDrawers = cabinet.productName.toLowerCase().includes('drawer');
  const drawerCount = hasDrawers ? 3 : 0;
  
  const gapSize = 0.02;
  const doorThickness = 0.018;
  const handleOffset = 0.02;

  return (
    <group position={[0, h / 2, 0]}>
      {/* Carcase - back panel */}
      <mesh position={[0, 0, -d / 2 + 0.009]}>
        <boxGeometry args={[w - 0.036, h - 0.036, 0.018]} />
        <meshStandardMaterial color={carcaseColor} />
      </mesh>
      
      {/* Carcase - left gable */}
      <mesh position={[-w / 2 + 0.009, 0, 0]}>
        <boxGeometry args={[0.018, h - 0.036, d - 0.018]} />
        <meshStandardMaterial color={carcaseColor} />
      </mesh>
      
      {/* Carcase - right gable */}
      <mesh position={[w / 2 - 0.009, 0, 0]}>
        <boxGeometry args={[0.018, h - 0.036, d - 0.018]} />
        <meshStandardMaterial color={carcaseColor} />
      </mesh>
      
      {/* Carcase - top panel */}
      <mesh position={[0, h / 2 - 0.009, 0]}>
        <boxGeometry args={[w - 0.036, 0.018, d - 0.018]} />
        <meshStandardMaterial color={carcaseColor} />
      </mesh>
      
      {/* Carcase - bottom panel */}
      <mesh position={[0, -h / 2 + 0.009, 0]}>
        <boxGeometry args={[w - 0.036, 0.018, d - 0.018]} />
        <meshStandardMaterial color={carcaseColor} />
      </mesh>
      
      {/* Shelves */}
      {Array.from({ length: cabinet.accessories.shelfCount }).map((_, i) => {
        const shelfY = -h / 2 + (h / (cabinet.accessories.shelfCount + 1)) * (i + 1);
        return (
          <mesh key={`shelf-${i}`} position={[0, shelfY, -0.02]}>
            <boxGeometry args={[w - 0.054, 0.018, d - 0.05]} />
            <meshStandardMaterial color={carcaseColor} />
          </mesh>
        );
      })}
      
      {/* Doors or Drawers */}
      {hasDrawers ? (
        // Drawer fronts
        Array.from({ length: drawerCount }).map((_, i) => {
          const drawerHeight = (h - gapSize * (drawerCount + 1)) / drawerCount;
          const drawerY = h / 2 - gapSize - drawerHeight / 2 - i * (drawerHeight + gapSize);
          return (
            <group key={`drawer-${i}`}>
              <mesh position={[0, drawerY, d / 2 - doorThickness / 2]}>
                <boxGeometry args={[w - gapSize * 2, drawerHeight, doorThickness]} />
                <meshStandardMaterial color={exteriorColor} />
              </mesh>
              {/* Drawer handle */}
              <mesh position={[0, drawerY, d / 2 + handleOffset]}>
                <boxGeometry args={[0.15, 0.012, 0.012]} />
                <meshStandardMaterial color="#2a2a2a" metalness={0.8} roughness={0.3} />
              </mesh>
            </group>
          );
        })
      ) : (
        // Door fronts
        Array.from({ length: doorCount }).map((_, i) => {
          const doorWidth = (w - gapSize * (doorCount + 1)) / doorCount;
          const doorX = -w / 2 + gapSize + doorWidth / 2 + i * (doorWidth + gapSize);
          return (
            <group key={`door-${i}`}>
              <mesh position={[doorX, 0, d / 2 - doorThickness / 2]}>
                <boxGeometry args={[doorWidth, h - gapSize * 2, doorThickness]} />
                <meshStandardMaterial color={exteriorColor} />
              </mesh>
              {/* Door handle */}
              <mesh 
                position={[
                  doorX + (i === 0 ? doorWidth / 2 - 0.04 : -doorWidth / 2 + 0.04), 
                  0, 
                  d / 2 + handleOffset
                ]}
              >
                <boxGeometry args={[0.012, 0.15, 0.012]} />
                <meshStandardMaterial color="#2a2a2a" metalness={0.8} roughness={0.3} />
              </mesh>
            </group>
          );
        })
      )}
      
      {/* Kickboard for base cabinets */}
      {cabinet.category === 'Base' && (
        <mesh position={[0, -h / 2 - 0.075, d / 2 - 0.05]}>
          <boxGeometry args={[w, 0.15, 0.018]} />
          <meshStandardMaterial color={exteriorColor} />
        </mesh>
      )}
    </group>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#e0e0e0" wireframe />
    </mesh>
  );
}

export function Preview3D({ cabinet, className = '' }: Preview3DProps) {
  // Calculate camera distance based on cabinet size
  const maxDimension = Math.max(
    cabinet.dimensions.width,
    cabinet.dimensions.height,
    cabinet.dimensions.depth
  ) / 100;
  
  const cameraDistance = maxDimension * 2.5;

  return (
    <div className={`w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg overflow-hidden ${className}`}>
      <Canvas shadows>
        <PerspectiveCamera 
          makeDefault 
          position={[cameraDistance * 0.8, cameraDistance * 0.6, cameraDistance]} 
          fov={45}
        />
        <OrbitControls 
          enablePan={false}
          minDistance={maxDimension * 1.5}
          maxDistance={maxDimension * 5}
          target={[0, cabinet.dimensions.height / 200, 0]}
        />
        
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-3, 4, -3]} intensity={0.3} />
        
        <Suspense fallback={<LoadingFallback />}>
          <CabinetPreviewMesh cabinet={cabinet} />
          <ContactShadows
            position={[0, -0.01, 0]}
            opacity={0.4}
            scale={10}
            blur={2}
            far={4}
          />
          <Environment preset="apartment" />
        </Suspense>
        
        {/* Floor grid */}
        <gridHelper args={[10, 20, '#cccccc', '#e5e5e5']} position={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
