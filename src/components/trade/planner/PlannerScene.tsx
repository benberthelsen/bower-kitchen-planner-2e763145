import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, ContactShadows } from '@react-three/drei';
import { ConfiguredCabinet, useTradeRoom, TradeRoom, RoomMaterialDefaults } from '@/contexts/TradeRoomContext';
import * as THREE from 'three';
import { WALL_THICKNESS, FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS, HANDLE_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { calculateSnapPosition } from '@/utils/snapping';
import { cabinetToPlacedItem, cabinetsToPlacedItems } from '@/utils/snapping/adapter';
import { RoomConfig, PlacedItem, Opening } from '@/types';
import { useCatalogItem } from '@/hooks/useCatalog';
import { useCabinetMaterials } from '@/hooks/useCabinetMaterials';
import ProductRenderer from '@/components/3d/ProductRenderer';
import { CabinetRenderConfig } from '@/types/cabinetConfig';
import { resolveHandleDefinition, handleFinishHex } from '@/lib/handleStyles';

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

// Full cabinet mesh for trade planner with proper rendering and snapping
function TradeCabinetMesh({
  cabinet,
  isSelected,
  onSelect,
  onDragEnd,
  handleId,
  materialDefaults,
  onInteractionChange
}: {
  cabinet: ConfiguredCabinet;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (position: { x: number; z: number }) => void;
  handleId?: string;
  materialDefaults?: RoomMaterialDefaults;
  onInteractionChange: (isInteracting: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dragOffset = useRef({ x: 0, z: 0 });
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragPoint = useRef(new THREE.Vector3());

  // Get catalog item for render config
  const catalogItem = useCatalogItem(cabinet.definitionId);

  // Resolve the cabinet's ACTUAL exterior finish (per-cabinet override → room
  // default → first catalog finish) so doors render in the chosen colour instead
  // of always defaulting to Designer White (which made doors read the same as the
  // white carcase — e.g. the pantry "door = carcase colour" bug).
  const exteriorFinishId = cabinet.materials?.exteriorFinish || materialDefaults?.exteriorFinish;
  const finishOption = FINISH_OPTIONS.find((f) => f.id === exteriorFinishId) ?? getDefaultFinish();
  const benchtopOption = getDefaultBenchtop();
  const kickOption = getDefaultKick();
  // Per-cabinet handle wins over the room default; catalog handles
  // (hardware_pricing ids) resolve via the style registry, with the built-in
  // options as fallback for legacy ids.
  const effectiveHandleId = cabinet.hardware?.handleType || handleId;
  const baseHandle = resolveHandleDefinition(effectiveHandleId)
    ?? (HANDLE_OPTIONS.find((option) => option.id === effectiveHandleId) || HANDLE_OPTIONS[0]);
  const finishHex = !baseHandle.finishLocked ? handleFinishHex(cabinet.hardware?.handleColor) : null;
  const handle = finishHex ? { ...baseHandle, hex: finishHex } : baseHandle;
  
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
    hinge: 'Left' as const, // Default hinge, can be overridden in cabinet config
    itemType: 'Cabinet' as const,
    topRail: cabinet.construction?.topRail,
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
    // Derive real door/drawer counts and corner type from the definition id
    // (e.g. "base_corner_pie_cut_2_door", "base_3_drawer") instead of guessing.
    const did = (cabinet.definitionId || '').toLowerCase();
    const doorMatch = did.match(/(\d+)\s*[-_ ]?door/);
    const drawerMatch = did.match(/(\d+)\s*[-_ ]?draw/);
    const isCorner = /corner|pie[-_ ]?cut|blind|diagonal/.test(did);
    const cornerType: 'l-shape' | 'diagonal' | 'blind' | null = !isCorner
      ? null
      : /diagonal/.test(did) ? 'diagonal'
      : /blind/.test(did) ? 'blind'
      : 'l-shape';
    const drawerCount = drawerMatch ? Number(drawerMatch[1]) : 0;
    const doorCount = doorMatch
      ? Number(doorMatch[1])
      : (drawerCount > 0 ? 0 : (cabinet.category === 'Wall' ? 2 : 1));
    
    return {
      productId: cabinet.definitionId,
      productName: cabinet.productName,
      category: configCategory,
      cabinetType: 'Standard',
      productType: cabinet.category === 'Appliance' ? 'appliance' as const : 'cabinet' as const,
      specGroup: cabinet.category === 'Appliance' ? 'Appliances' : 'Base Cabinets',
      doorCount,
      drawerCount,
      isCorner,
      isSink: false,
      isBlind: cornerType === 'blind',
      isPantry: cabinet.category === 'Tall',
      isAppliance: cabinet.category === 'Appliance',
      isOven: false,
      isFridge: false,
      isRangehood: false,
      isDishwasher: false,
      hasFalseFront: false,
      hasAdjustableShelves: true,
      shelfCount: cabinet.category === 'Tall' ? 4 : 1,
      cornerType,
      leftArmDepth: cabinet.construction?.cabinetDepthLeft ?? 575,
      rightArmDepth: 575,
      blindDepth: 150,
      fillerWidth: 75,
      hasReturnFiller: false,
      defaultWidth: width,
      defaultHeight: height,
      defaultDepth: depth,
    };
  }, [catalogItem, cabinet, width, height, depth]);

  const cabinetPosition = cabinet.position;

  // Wall/upper cabinets are mounted up off the floor (bottom edge at mountYmm).
  // Standard wall mount = bench (900) + splashback (600) = 1500mm. Editable via
  // the cabinet's stored mounting height (position.y); base/tall sit on the floor.
  const defaultMountY = cabinet.category === 'Wall' ? 1500 : 0;
  const mountYmm = cabinetPosition?.y && cabinetPosition.y > 0 ? cabinetPosition.y : defaultMountY;
  const centerY = mountYmm / 1000 + heightM / 2;

  // Update position when cabinet.position changes (after snapping)
  useEffect(() => {
    if (groupRef.current && cabinetPosition && !isDragging) {
      groupRef.current.position.x = cabinetPosition.x / 1000;
      groupRef.current.position.y = centerY;
      groupRef.current.position.z = cabinetPosition.z / 1000;
      groupRef.current.rotation.y = -THREE.MathUtils.degToRad(cabinetPosition.rotation || 0);
    }
  }, [cabinetPosition, isDragging, centerY]);

  const initialPosition: [number, number, number] = cabinet.position
    ? [cabinet.position.x / 1000, centerY, cabinet.position.z / 1000]
    : [1, centerY, 1];

  const initialRotation: [number, number, number] = [0, -THREE.MathUtils.degToRad(rotation), 0];

  useEffect(() => () => {
    document.body.style.cursor = 'default';
  }, []);

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
      onPointerOver={() => {
        setHovered(true);
        document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
      }}
      onPointerOut={() => {
        setHovered(false);
        if (!isDragging) document.body.style.cursor = 'default';
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();

        if (e.button === 0 && groupRef.current) {
          setIsDragging(true);
          onInteractionChange(true);
          document.body.style.cursor = 'grabbing';

          dragPlane.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groupRef.current.position.y);
          if (e.ray.intersectPlane(dragPlane.current, dragPoint.current)) {
            dragOffset.current = {
              x: dragPoint.current.x - groupRef.current.position.x,
              z: dragPoint.current.z - groupRef.current.position.z,
            };
          }

          (e.currentTarget as unknown as Element).setPointerCapture(e.pointerId);
        }
      }}
      onPointerUp={(e) => {
        if (isDragging && groupRef.current) {
          setIsDragging(false);
          onInteractionChange(false);
          document.body.style.cursor = hovered ? 'grab' : 'default';

          const pos = groupRef.current.position;
          onDragEnd({ x: pos.x * 1000, z: pos.z * 1000 });
          (e.currentTarget as unknown as Element).releasePointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        if (isDragging && groupRef.current) {
          e.stopPropagation();
          if (e.ray.intersectPlane(dragPlane.current, dragPoint.current)) {
            groupRef.current.position.x = dragPoint.current.x - dragOffset.current.x;
            groupRef.current.position.z = dragPoint.current.z - dragOffset.current.z;
          }
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

function CameraController({ room, controlsRef, orbitEnabled }: { room: TradeRoom; controlsRef: React.RefObject<any>; orbitEnabled: boolean }) {
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
        enabled={orbitEnabled}
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

// Door/window/walkway colours — mirror RoomFeaturesEditor so the 3D openings
// read the same as the top-down plan the user placed them on.
const OPENING_COLORS: Record<Opening['type'], string> = {
  door: '#b45309', window: '#0369a1', walkway: '#a1a1aa',
};

interface WallSeg { u0: number; u1: number; y0: number; y1: number; }

/** Split a wall (length × height, mm) into solid boxes around its openings.
 *  Doors gap floor→height with a solid header above; windows leave a glazed
 *  gap between sill and header with solid wall below/above; walkways are open
 *  to the ceiling. `u` runs along the wall from its left corner. */
function wallSolids(lengthMm: number, heightMm: number, openings: Opening[]) {
  const solids: WallSeg[] = [];
  const glass: WallSeg[] = [];
  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm);

  // Full-height piers in the horizontal gaps between/around openings.
  let cursor = 0;
  for (const o of sorted) {
    const u0 = Math.max(0, o.offsetMm);
    if (u0 > cursor) solids.push({ u0: cursor, u1: u0, y0: 0, y1: heightMm });
    cursor = Math.max(cursor, o.offsetMm + o.widthMm);
  }
  if (cursor < lengthMm) solids.push({ u0: cursor, u1: lengthMm, y0: 0, y1: heightMm });

  // Vertical fills (header / sill) + glass within each opening's span.
  for (const o of sorted) {
    const u0 = Math.max(0, o.offsetMm);
    const u1 = Math.min(lengthMm, o.offsetMm + o.widthMm);
    if (u1 <= u0 || o.type === 'walkway') continue;
    if (o.type === 'door') {
      const dh = o.heightMm ?? 2040;
      if (dh < heightMm) solids.push({ u0, u1, y0: dh, y1: heightMm });
    } else {
      const sill = o.sillHeightMm ?? 900;
      const top = Math.min(heightMm, sill + (o.heightMm ?? 1200));
      if (sill > 0) solids.push({ u0, u1, y0: 0, y1: sill });
      if (top < heightMm) solids.push({ u0, u1, y0: top, y1: heightMm });
      glass.push({ u0, u1, y0: sill, y1: top });
    }
  }
  return { solids, glass };
}

/** Render one wall surface (N = back or W = left) as boxes with real openings. */
function WallSurface({
  wall, lengthMm, heightMm, depthM, openings,
}: { wall: 'N' | 'W'; lengthMm: number; heightMm: number; depthM: number; openings: Opening[] }) {
  const wt = WALL_THICKNESS / 1000;
  const { solids, glass } = wallSolids(lengthMm, heightMm, openings.filter(o => o.wall === wall));

  const toBox = (s: WallSeg, thin: boolean): { pos: [number, number, number]; args: [number, number, number] } => {
    const w = (s.u1 - s.u0) / 1000;
    const h = (s.y1 - s.y0) / 1000;
    const uc = (s.u0 + s.u1) / 2 / 1000;
    const yc = (s.y0 + s.y1) / 2 / 1000;
    const depth = thin ? wt * 0.3 : wt;
    // N: u→x, plane at z = -wt/2. W: u measured from front corner → z = depthM - uc, plane at x = -wt/2.
    return wall === 'N'
      ? { pos: [uc, yc, -wt / 2], args: [w, h, depth] }
      : { pos: [-wt / 2, yc, depthM - uc], args: [depth, h, w] };
  };

  return (
    <>
      {solids.map((s, i) => {
        const b = toBox(s, false);
        return (
          <mesh key={`s${i}`} position={b.pos} castShadow receiveShadow>
            <boxGeometry args={b.args} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
          </mesh>
        );
      })}
      {glass.map((s, i) => {
        const b = toBox(s, true);
        return (
          <mesh key={`g${i}`} position={b.pos}>
            <boxGeometry args={b.args} />
            <meshStandardMaterial color="#bfdbfe" roughness={0.1} transparent opacity={0.35} />
          </mesh>
        );
      })}
    </>
  );
}

/** Floor footprints for every opening (all four walls) so openings on the
 *  undrawn front/right walls are still shown on the plan. */
function OpeningFootprints({ widthM, depthM, openings }: { widthM: number; depthM: number; openings: Opening[] }) {
  const wt = WALL_THICKNESS / 1000;
  return (
    <>
      {openings.map((o) => {
        const color = OPENING_COLORS[o.type] ?? '#888';
        const len = o.widthMm / 1000;
        const off = o.offsetMm / 1000;
        let pos: [number, number, number];
        let args: [number, number, number];
        switch (o.wall) {
          case 'N': pos = [off + len / 2, 0.02, 0]; args = [len, 0.04, wt * 1.5]; break;
          case 'S': pos = [widthM - off - len / 2, 0.02, depthM]; args = [len, 0.04, wt * 1.5]; break;
          case 'W': pos = [0, 0.02, depthM - off - len / 2]; args = [wt * 1.5, 0.04, len]; break;
          default:  pos = [widthM, 0.02, off + len / 2]; args = [wt * 1.5, 0.04, len]; break; // E
        }
        return (
          <mesh key={o.id} position={pos}>
            <boxGeometry args={args} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        );
      })}
    </>
  );
}

function RoomWalls({ room }: { room: TradeRoom }) {
  const widthM = room.config.width / 1000;
  const depthM = room.config.depth / 1000;
  const openings = room.config.openings ?? [];

  return (
    <>
      <WallSurface wall="N" lengthMm={room.config.width} heightMm={room.config.height} depthM={depthM} openings={openings} />
      <WallSurface wall="W" lengthMm={room.config.depth} heightMm={room.config.height} depthM={depthM} openings={openings} />
      <OpeningFootprints widthM={widthM} depthM={depthM} openings={openings} />
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
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  const widthM = room.config.width / 1000;
  const depthM = room.config.depth / 1000;

  // Convert TradeRoom config to RoomConfig for snapping
  const roomConfig: RoomConfig = useMemo(
    () => ({
      width: room.config.width,
      depth: room.config.depth,
      height: room.config.height,
      shape: room.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
      cutoutWidth: 0,
      cutoutDepth: 0,
    }),
    [room.config.width, room.config.depth, room.config.height, room.shape],
  );

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
        <CameraController room={room} controlsRef={controlsRef} orbitEnabled={orbitEnabled} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
        <hemisphereLight args={[0xffffff, 0xbfc4cc, 0.5]} />
        <directionalLight position={[-5, 4, -3]} intensity={0.35} />
        {/* No external HDR Environment — keeps the planner render self-contained
            (an external HDR fetch can 400 and crash the whole scene). */}
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
              handleId={room.hardwareDefaults.handleType}
              materialDefaults={room.materialDefaults}
              onInteractionChange={(isInteracting) => setOrbitEnabled(!isInteracting)}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
