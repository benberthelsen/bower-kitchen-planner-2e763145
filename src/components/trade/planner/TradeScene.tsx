import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import { ConfiguredCabinet, useTradeRoom, TradeRoom } from '@/contexts/TradeRoomContext';
import * as THREE from 'three';
import { WALL_THICKNESS, FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS, HANDLE_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS, SNAP_INCREMENT } from '@/constants';
import { calculateSnapPosition, checkCollision, SnapResult } from '@/utils/snapping';
import { cabinetToPlacedItem, cabinetsToPlacedItems } from '@/utils/snapping/adapter';
import { RoomConfig, PlacedItem, GlobalDimensions } from '@/types';
import { useCatalogItem } from '@/hooks/useCatalog';
import { useCabinetMaterials } from '@/hooks/useCabinetMaterials';
import ProductRenderer from '@/components/3d/ProductRenderer';
import { CabinetRenderConfig } from '@/types/cabinetConfig';
import Wall, { WallCorner } from '@/components/3d/Wall';
import SnapIndicators from '@/components/3d/SnapIndicators';
import PlacementGhost from '@/components/3d/PlacementGhost';

interface TradeSceneProps {
  room: TradeRoom;
  cabinets: ConfiguredCabinet[];
  is3D?: boolean;
  onCabinetSelect: (instanceId: string | null) => void;
  onCabinetPlace: (instanceId: string, position: { x: number; y: number; z: number; rotation: number }) => void;
  className?: string;
}

// Drag threshold in mm
const DRAG_THRESHOLD = 20;

// Get default material options
const getDefaultFinish = () => FINISH_OPTIONS[0];
const getDefaultBenchtop = () => BENCHTOP_OPTIONS[0];
const getDefaultKick = () => KICK_OPTIONS[0];
const getDefaultHandle = () => HANDLE_OPTIONS[0];

interface SnapState {
  snappedToItemId: string | null;
  snapEdge: SnapResult['snapEdge'];
}

// Real-time drag manager with live snapping
function DragManager({ 
  cabinets,
  roomConfig,
  globalDimensions,
  onSnapChange,
  onPositionUpdate,
  draggedCabinetId,
  onDragEnd,
  dragStartPos,
  isDraggingRef,
}: { 
  cabinets: ConfiguredCabinet[];
  roomConfig: RoomConfig;
  globalDimensions: GlobalDimensions;
  onSnapChange: (state: SnapState) => void;
  onPositionUpdate: (id: string, x: number, z: number, rotation: number) => void;
  draggedCabinetId: string | null;
  onDragEnd: () => void;
  dragStartPos: React.MutableRefObject<{ x: number; z: number } | null>;
  isDraggingRef: React.MutableRefObject<boolean>;
}) {
  const { gl } = useThree();

  const handlePointerMove = (e: any) => {
    if (!draggedCabinetId) return;
    e.stopPropagation();
    
    const point = e.point;
    const rawX = point.x * 1000;
    const rawZ = point.z * 1000;

    // Check drag threshold - only start moving after exceeding threshold
    if (!isDraggingRef.current) {
      if (dragStartPos.current) {
        const dx = rawX - dragStartPos.current.x;
        const dz = rawZ - dragStartPos.current.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < DRAG_THRESHOLD) return;
      }
      isDraggingRef.current = true;
    }

    const cabinet = cabinets.find(c => c.instanceId === draggedCabinetId);
    if (!cabinet) return;

    // Convert to PlacedItem for snapping
    const placedItem = cabinetToPlacedItem(cabinet, { x: rawX, z: rawZ });
    const otherItems = cabinetsToPlacedItems(cabinets, draggedCabinetId);

    // Calculate snap with real-time feedback
    const snapResult = calculateSnapPosition(
      rawX,
      rawZ,
      placedItem,
      otherItems,
      roomConfig,
      SNAP_INCREMENT,
      globalDimensions
    );

    onSnapChange({
      snappedToItemId: snapResult.snappedItemId || null,
      snapEdge: snapResult.snapEdge,
    });

    onPositionUpdate(draggedCabinetId, snapResult.x, snapResult.z, snapResult.rotation);
  };

  const handlePointerUp = () => {
    if (draggedCabinetId) {
      onDragEnd();
    }
  };

  // Global pointer up handler
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (draggedCabinetId) {
        onDragEnd();
      }
    };

    gl.domElement.addEventListener('pointerup', handleGlobalPointerUp);
    gl.domElement.addEventListener('pointerleave', handleGlobalPointerUp);
    
    return () => {
      gl.domElement.removeEventListener('pointerup', handleGlobalPointerUp);
      gl.domElement.removeEventListener('pointerleave', handleGlobalPointerUp);
    };
  }, [draggedCabinetId, gl, onDragEnd]);

  return (
    <mesh 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[roomConfig.width / 2000, -0.01, roomConfig.depth / 2000]} 
      scale={[100, 100, 1]} 
      onPointerMove={handlePointerMove} 
      onPointerUp={handlePointerUp}
      visible={false}
    >
      <planeGeometry />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

// Cabinet mesh with proper rendering
function TradeCabinetMesh({ 
  cabinet, 
  isSelected, 
  isDragged,
  onSelect,
  onDragStart,
  globalDimensions,
}: { 
  cabinet: ConfiguredCabinet; 
  isSelected: boolean;
  isDragged: boolean;
  onSelect: () => void;
  onDragStart: (x: number, z: number) => void;
  globalDimensions: GlobalDimensions;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const catalogItem = useCatalogItem(cabinet.definitionId);
  const finishOption = getDefaultFinish();
  const benchtopOption = getDefaultBenchtop();
  const kickOption = getDefaultKick();
  const handle = getDefaultHandle();
  const { materials } = useCabinetMaterials(finishOption, benchtopOption, kickOption);

  const width = cabinet.dimensions.width;
  const height = cabinet.dimensions.height;
  const depth = cabinet.dimensions.depth;
  const rotation = cabinet.position?.rotation ?? 0;

  const widthM = width / 1000;
  const heightM = height / 1000;
  const depthM = depth / 1000;

  const placedItem: PlacedItem = useMemo(() => {
    // Calculate Y position based on category
    let posY = 0;
    if (cabinet.category === 'Wall') {
      posY = globalDimensions.toeKickHeight + globalDimensions.baseHeight + 
             globalDimensions.benchtopThickness + globalDimensions.splashbackHeight;
    }
    
    return {
      instanceId: cabinet.instanceId,
      definitionId: cabinet.definitionId,
      x: cabinet.position?.x ?? 0,
      y: cabinet.position?.y ?? posY,
      z: cabinet.position?.z ?? 0,
      width,
      height,
      depth,
      rotation: rotation,
      hinge: 'Left' as const,
      itemType: 'Cabinet' as const,
    };
  }, [cabinet, width, height, depth, rotation, globalDimensions]);

  const renderConfig: CabinetRenderConfig = useMemo(() => {
    if (catalogItem?.renderConfig) return catalogItem.renderConfig;
    
    const categoryMap: Record<string, 'Base' | 'Wall' | 'Tall' | 'Accessory'> = {
      Base: 'Base', Wall: 'Wall', Tall: 'Tall', Appliance: 'Accessory',
    };
    const configCategory = categoryMap[cabinet.category] || 'Base';
    
    return {
      productId: cabinet.definitionId,
      productName: cabinet.productName,
      category: configCategory,
      cabinetType: 'Standard',
      productType: cabinet.category === 'Appliance' ? 'appliance' as const : 'cabinet' as const,
      specGroup: cabinet.category === 'Appliance' ? 'Appliances' : 'Base Cabinets',
      doorCount: cabinet.category === 'Wall' ? 2 : 1,
      drawerCount: 0,
      isCorner: false,
      isSink: false,
      isBlind: false,
      isPantry: cabinet.category === 'Tall',
      isAppliance: cabinet.category === 'Appliance',
      isOven: false, isFridge: false, isRangehood: false, isDishwasher: false,
      hasFalseFront: false,
      hasAdjustableShelves: true,
      shelfCount: cabinet.category === 'Tall' ? 4 : 1,
      cornerType: null,
      leftArmDepth: 575, rightArmDepth: 575, blindDepth: 150, fillerWidth: 75,
      hasReturnFiller: false,
      defaultWidth: width, defaultHeight: height, defaultDepth: depth,
    };
  }, [catalogItem, cabinet, width, height, depth]);

  // Position in meters
  const posX = (cabinet.position?.x ?? 1000) / 1000;
  const posZ = (cabinet.position?.z ?? 1000) / 1000;
  
  // Y position based on cabinet type
  let posY = 0;
  if (cabinet.category === 'Wall') {
    posY = (globalDimensions.toeKickHeight + globalDimensions.baseHeight + 
            globalDimensions.benchtopThickness + globalDimensions.splashbackHeight) / 1000;
  }

  if (!materials || !materials.gable) {
    return (
      <group position={[posX, posY + heightM / 2, posZ]}>
        <mesh>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshBasicMaterial color="#9ca3af" wireframe opacity={0.5} transparent />
        </mesh>
      </group>
    );
  }

  // Add half height so cabinet sits ON the floor, not IN it
  const finalY = posY + heightM / 2;

  return (
    <group 
      ref={groupRef}
      position={[posX, finalY, posZ]}
      rotation={[0, -THREE.MathUtils.degToRad(rotation), 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button === 0) {
          onSelect(); // Select immediately on click
          onDragStart(cabinet.position?.x ?? 1000, cabinet.position?.z ?? 1000);
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
        globalDimensions={globalDimensions}
        materials={materials}
        isSelected={isSelected}
        isDragged={isDragged}
        hovered={hovered}
      />
    </group>
  );
}

function CameraController({ 
  room, 
  controlsRef, 
  isDragging, 
  onOrbitStart, 
  onOrbitEnd 
}: { 
  room: TradeRoom; 
  controlsRef: React.RefObject<any>; 
  isDragging: boolean;
  onOrbitStart: () => void;
  onOrbitEnd: () => void;
}) {
  const { gl } = useThree();
  const widthM = room.config.width / 1000;
  const depthM = room.config.depth / 1000;

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(widthM / 2, 0, depthM / 2);
      controlsRef.current.update();
    }
  }, [widthM, depthM, controlsRef]);

  // Track right-click hold for orbiting
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) onOrbitStart();
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) onOrbitEnd();
    };
    
    gl.domElement.addEventListener('mousedown', handleMouseDown);
    gl.domElement.addEventListener('mouseup', handleMouseUp);
    gl.domElement.addEventListener('mouseleave', onOrbitEnd);
    
    return () => {
      gl.domElement.removeEventListener('mousedown', handleMouseDown);
      gl.domElement.removeEventListener('mouseup', handleMouseUp);
      gl.domElement.removeEventListener('mouseleave', onOrbitEnd);
    };
  }, [gl, onOrbitStart, onOrbitEnd]);

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
        enabled={!isDragging}
        mouseButtons={{
          LEFT: undefined, // Disable left-click for OrbitControls (reserved for selection/drag)
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        }}
      />
    </>
  );
}

export function TradeScene({
  room,
  cabinets,
  is3D = true,
  onCabinetSelect,
  onCabinetPlace,
  className,
}: TradeSceneProps) {
  const { selectedCabinetId } = useTradeRoom();
  const controlsRef = useRef<any>(null);
  const [draggedCabinetId, setDraggedCabinetId] = useState<string | null>(null);
  const [snapState, setSnapState] = useState<SnapState>({ snappedToItemId: null, snapEdge: undefined });
  const [livePositions, setLivePositions] = useState<Map<string, { x: number; z: number; rotation: number }>>(new Map());
  const [isOrbiting, setIsOrbiting] = useState(false);
  
  // Refs for drag threshold (shared with DragManager)
  const dragStartPos = useRef<{ x: number; z: number } | null>(null);
  const isDraggingRef = useRef(false);
  
  // Callbacks for orbit tracking
  const handleOrbitStart = useCallback(() => setIsOrbiting(true), []);
  const handleOrbitEnd = useCallback(() => setIsOrbiting(false), []);

  const widthM = room.config.width / 1000;
  const depthM = room.config.depth / 1000;
  const heightM = room.config.height / 1000;
  const wt = WALL_THICKNESS / 1000;

  const roomConfig: RoomConfig = {
    width: room.config.width,
    depth: room.config.depth,
    height: room.config.height,
    shape: room.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
    cutoutWidth: 0,
    cutoutDepth: 0,
  };

  const globalDimensions = room.dimensions;

  // Handle real-time position updates during drag
  const handleLivePositionUpdate = useCallback((id: string, x: number, z: number, rotation: number) => {
    setLivePositions(prev => {
      const next = new Map(prev);
      next.set(id, { x, z, rotation });
      return next;
    });
  }, []);

  // Commit position when drag ends - saves the snapped position BEFORE clearing state
  const handleDragEnd = useCallback(() => {
    if (draggedCabinetId) {
      const livePos = livePositions.get(draggedCabinetId);
      if (livePos) {
        const cabinet = cabinets.find(c => c.instanceId === draggedCabinetId);
        onCabinetPlace(draggedCabinetId, {
          x: livePos.x,
          y: cabinet?.position?.y || 0,
          z: livePos.z,
          rotation: livePos.rotation,
        });
      }
    }
    // Clear state AFTER saving
    setLivePositions(new Map());
    setDraggedCabinetId(null);
    setSnapState({ snappedToItemId: null, snapEdge: undefined });
    dragStartPos.current = null;
    isDraggingRef.current = false;
  }, [draggedCabinetId, cabinets, livePositions, onCabinetPlace]);
  
  // Start drag handler - sets up threshold tracking
  const handleDragStart = useCallback((id: string, x: number, z: number) => {
    // Clear any previous drag state first
    setLivePositions(new Map());
    setDraggedCabinetId(id);
    dragStartPos.current = { x, z };
    isDraggingRef.current = false;
  }, []);

  // Get cabinets with live positions applied
  const cabinetsWithLivePos = useMemo(() => {
    return cabinets.map(c => {
      const livePos = livePositions.get(c.instanceId);
      if (livePos) {
        return {
          ...c,
          position: {
            ...c.position,
            x: livePos.x,
            y: c.position?.y ?? 0,
            z: livePos.z,
            rotation: livePos.rotation,
          },
        };
      }
      return c;
    });
  }, [cabinets, livePositions]);

  // Convert to PlacedItem for snap indicators
  const placedItems: PlacedItem[] = useMemo(() => {
    return cabinetsWithLivePos.filter(c => c.isPlaced).map(c => cabinetToPlacedItem(c));
  }, [cabinetsWithLivePos]);

  const draggedItem = draggedCabinetId 
    ? placedItems.find(i => i.instanceId === draggedCabinetId) ?? null 
    : null;

  const cursorStyle = draggedCabinetId ? 'grabbing' : 'auto';

  return (
    <div className={`w-full h-full ${className || ''}`}>
      <Canvas shadows dpr={[1, 2]} className="w-full h-full" style={{ cursor: cursorStyle, background: 'linear-gradient(to bottom, #f8fafc, #e2e8f0)' }}>
        <CameraController room={room} controlsRef={controlsRef} isDragging={!!draggedCabinetId} onOrbitStart={handleOrbitStart} onOrbitEnd={handleOrbitEnd} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0001} />
        <Environment preset="apartment" blur={0.8} background={false} />
        <ContactShadows resolution={1024} scale={Math.max(widthM, depthM) * 2} blur={2} opacity={0.4} far={10} color="#000000" />

        <DragManager
          cabinets={cabinetsWithLivePos}
          roomConfig={roomConfig}
          globalDimensions={globalDimensions}
          onSnapChange={setSnapState}
          onPositionUpdate={handleLivePositionUpdate}
          draggedCabinetId={draggedCabinetId}
          onDragEnd={handleDragEnd}
          dragStartPos={dragStartPos}
          isDraggingRef={isDraggingRef}
        />

        <group>
          {/* Floor - click to deselect */}
          <mesh 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={[widthM / 2, -0.01, depthM / 2]} 
            receiveShadow
            onClick={(e) => {
              if (e.button === 0) {
                onCabinetSelect(null);
              }
            }}
          >
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

          {/* Walls - fade when blocking view */}
          {/* Back wall (along X axis at Z=0) */}
          <Wall 
            position={[widthM / 2, heightM / 2, 0]} 
            rotation={[0, 0, 0]} 
            width={widthM} 
            height={heightM} 
            thickness={wt} 
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />
          {/* Left wall (along Z axis at X=0) */}
          <Wall 
            position={[0, heightM / 2, depthM / 2]} 
            rotation={[0, Math.PI / 2, 0]} 
            width={depthM} 
            height={heightM} 
            thickness={wt}
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />
          {/* Right wall (along Z axis at X=width) */}
          <Wall 
            position={[widthM, heightM / 2, depthM / 2]} 
            rotation={[0, -Math.PI / 2, 0]} 
            width={depthM} 
            height={heightM} 
            thickness={wt}
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />
          {/* Left-back corner piece */}
          <WallCorner
            position={[0, heightM / 2, 0]}
            height={heightM}
            thickness={wt}
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />
          {/* Right-back corner piece */}
          <WallCorner
            position={[widthM, heightM / 2, 0]}
            height={heightM}
            thickness={wt}
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />
          {/* Front wall (along X axis at Z=depth) */}
          <Wall 
            position={[widthM / 2, heightM / 2, depthM]} 
            rotation={[0, Math.PI, 0]} 
            width={widthM} 
            height={heightM} 
            thickness={wt}
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />
          {/* Left-front corner piece */}
          <WallCorner
            position={[0, heightM / 2, depthM]}
            height={heightM}
            thickness={wt}
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />
          {/* Right-front corner piece */}
          <WallCorner
            position={[widthM, heightM / 2, depthM]}
            height={heightM}
            thickness={wt}
            roomCenter={[widthM / 2, heightM / 2, depthM / 2]}
          />

          {/* Cabinets */}
          {cabinetsWithLivePos.filter(c => c.isPlaced).map((cabinet) => (
            <TradeCabinetMesh
              key={cabinet.instanceId}
              cabinet={cabinet}
              isSelected={selectedCabinetId === cabinet.instanceId}
              isDragged={draggedCabinetId === cabinet.instanceId}
              onSelect={() => onCabinetSelect(cabinet.instanceId)}
              onDragStart={(x, z) => handleDragStart(cabinet.instanceId, x, z)}
              globalDimensions={globalDimensions}
            />
          ))}

          {/* Snap indicators */}
          <SnapIndicators
            draggedItem={draggedItem}
            snappedToItemId={snapState.snappedToItemId}
            snapEdge={snapState.snapEdge}
            items={placedItems}
            room={roomConfig}
          />
        </group>
      </Canvas>
    </div>
  );
}
