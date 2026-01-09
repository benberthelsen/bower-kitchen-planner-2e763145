import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, ContactShadows } from '@react-three/drei';
import { ConfiguredCabinet, useTradeRoom, TradeRoom } from '@/contexts/TradeRoomContext';
import * as THREE from 'three';
import { WALL_THICKNESS, FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS, HANDLE_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { calculateSnapPosition } from '@/utils/snapping';
import { cabinetToPlacedItem, cabinetsToPlacedItems } from '@/utils/snapping/adapter';
import { RoomConfig, PlacedItem } from '@/types';
import { useCatalogItem } from '@/hooks/useCatalog';
import { useCabinetMaterials } from '@/hooks/useCabinetMaterials';
import ProductRenderer from '@/components/3d/ProductRenderer';
import { CabinetRenderConfig } from '@/types/cabinetConfig';

interface PlannerSceneProps {
  room: TradeRoom;
  cabinets: ConfiguredCabinet[];
  is3D?: boolean;
  onCabinetSelect: (instanceId: string | null) => void;
  onCabinetPlace: (instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => void;
  className?: string;
}

// Get default material options for trade planner
const getDefaultFinish = () => FINISH_OPTIONS[0];
const getDefaultBenchtop = () => BENCHTOP_OPTIONS[0];
const getDefaultKick = () => KICK_OPTIONS[0];
const getDefaultHandle = () => HANDLE_OPTIONS[0];

// Full cabinet mesh for trade planner with proper rendering and snapping
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
  const [hovered, setHovered] = useState(false);
  const dragOffset = useRef({ x: 0, z: 0 });

  // Get catalog item for render config
  const catalogItem = useCatalogItem(cabinet.definitionId);

  // Get materials
  const finishOption = getDefaultFinish();
  const benchtopOption = getDefaultBenchtop();
  const kickOption = getDefaultKick();
  const handle = getDefaultHandle();
  
  const { materials } = useCabinetMaterials(finishOption, benchtopOption, kickOption);

  const width = cabinet.dimensions.width;
  const height = cabinet.dimensions.height;
  const depth = cabinet.dimensions.depth;
  const rotation = cabinet.position?.rotation ?? 0;

  // Convert to meters for Three.js
  const widthM = width / 1000;
  const heightM = height / 1000;
  const depthM = depth / 1000;

  // Create a PlacedItem-compatible object for CabinetAssembler
  const placedItem: PlacedItem = useMemo(() => ({
    instanceId: cabinet.instanceId,
    definitionId: cabinet.definitionId,
    x: cabinet.position?.x ?? 0,
    y: cabinet.position?.y ?? 0,
    z: cabinet.position?.z ?? 0,
    width,
    height,
    depth,
    rotation: rotation,
    hinge: 'Left' as const,
    itemType: 'Cabinet' as const,
  }), [cabinet, width, height, depth, rotation]);

  // Generate render config
  const renderConfig: CabinetRenderConfig = useMemo(() => {
    if (catalogItem?.renderConfig) {
      return catalogItem.renderConfig;
    }
    
    // Create a default config based on cabinet category
    // Map Appliance to Accessory for CabinetRenderConfig compatibility
    const categoryMap: Record<string, 'Base' | 'Wall' | 'Tall' | 'Accessory'> = {
      Base: 'Base',
      Wall: 'Wall',
      Tall: 'Tall',
      Appliance: 'Accessory',
    };
    const configCategory = categoryMap[cabinet.category] || 'Base';
    const doorCount = cabinet.category === 'Wall' ? 2 : 1;
    const drawerCount = 0;
    
    return {
      productId: cabinet.definitionId,
      productName: cabinet.productName,
      category: configCategory,
      cabinetType: 'Standard',
      productType: cabinet.category === 'Appliance' ? 'appliance' as const : 'cabinet' as const,
      specGroup: cabinet.category === 'Appliance' ? 'Appliances' : 'Base Cabinets',
      doorCount,
      drawerCount,
      isCorner: false,
      isSink: false,
      isBlind: false,
      isPantry: cabinet.category === 'Tall',
      isAppliance: cabinet.category === 'Appliance',
      isOven: false,
      isFridge: false,
      isRangehood: false,
      isDishwasher: false,
      hasFalseFront: false,
      hasAdjustableShelves: true,
      shelfCount: cabinet.category === 'Tall' ? 4 : 1,
      cornerType: null,
      leftArmDepth: 575,
      rightArmDepth: 575,
      blindDepth: 150,
      fillerWidth: 75,
      hasReturnFiller: false,
      defaultWidth: width,
      defaultHeight: height,
      defaultDepth: depth,
    };
  }, [catalogItem, cabinet, width, height, depth]);

  // Update position when cabinet.position changes (after snapping)
  useEffect(() => {
    if (groupRef.current && cabinet.position && !isDragging) {
      groupRef.current.position.x = cabinet.position.x / 1000;
      groupRef.current.position.z = cabinet.position.z / 1000;
      groupRef.current.rotation.y = -THREE.MathUtils.degToRad(cabinet.position.rotation || 0);
    }
  }, [cabinet.position?.x, cabinet.position?.z, cabinet.position?.rotation, isDragging]);

  const initialPosition: [number, number, number] = cabinet.position 
    ? [cabinet.position.x / 1000, heightM / 2, cabinet.position.z / 1000]
    : [1, heightM / 2, 1];

  const initialRotation: [number, number, number] = [0, -THREE.MathUtils.degToRad(rotation), 0];

  // Show loading placeholder while materials are loading
  if (!materials || !materials.gable) {
    return (
      <group position={initialPosition} rotation={initialRotation}>
        <mesh>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshBasicMaterial color="#9ca3af" wireframe opacity={0.5} transparent />
        </mesh>
      </group>
    );
  }

  return (
    <group 
      ref={groupRef}
      position={initialPosition}
      rotation={initialRotation}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button === 0 && groupRef.current) {
          setIsDragging(true);
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
          groupRef.current.position.x = e.point.x - dragOffset.current.x;
          groupRef.current.position.z = e.point.z - dragOffset.current.z;
        }
      }}
    >
      <ProductRenderer
        item={placedItem}
        config={renderConfig}
        finishMaterial={finishOption}
        benchtopMaterial={benchtopOption}
        kickMaterial={kickOption}
        handle={handle}
        globalDimensions={DEFAULT_GLOBAL_DIMENSIONS}
        materials={materials}
        isSelected={isSelected}
        isDragged={isDragging}
        hovered={hovered}
      />
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

  // Convert TradeRoom config to RoomConfig for snapping
  const roomConfig: RoomConfig = {
    width: room.config.width,
    depth: room.config.depth,
    height: room.config.height,
    shape: room.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
    cutoutWidth: 0,
    cutoutDepth: 0,
  };

  const handleCabinetDragEnd = useCallback((instanceId: string, rawPos: { x: number; z: number }) => {
    const cabinet = cabinets.find(c => c.instanceId === instanceId);
    if (!cabinet) return;

    // Convert to PlacedItem format for snapping
    const placedItem = cabinetToPlacedItem(cabinet, rawPos);
    const otherItems = cabinetsToPlacedItems(cabinets, instanceId);

    // Calculate snapped position with rotation
    const snapResult = calculateSnapPosition(
      rawPos.x,
      rawPos.z,
      placedItem,
      otherItems,
      roomConfig,
      50, // grid snap in mm
      room.dimensions
    );

    onCabinetPlace(instanceId, {
      x: snapResult.x,
      y: cabinet.position?.y || 0,
      z: snapResult.z,
      rotation: snapResult.rotation,
    });
  }, [cabinets, roomConfig, room.dimensions, onCabinetPlace]);

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
