import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { WALL_THICKNESS, SNAP_INCREMENT } from '@/constants';
import { calculateSnapPosition, SnapResult, checkCollision } from '@/utils/snapping';
import { RoomConfig, PlacedItem, GlobalDimensions, CatalogItemDefinition, MaterialOption } from '@/types';
import { useCatalog } from '@/hooks/useCatalog';
import CabinetMesh from './CabinetMesh';
import ApplianceMesh from './ApplianceMesh';
import StructureMesh from './StructureMesh';
import Wall, { WallCorner } from './Wall';
import SnapIndicators from './SnapIndicators';
import SnapDebugOverlay from './SnapDebugOverlay';
import SmartDimensions from './SmartDimensions';
import InteractionHandles from './InteractionHandles';
import PlacementGhost from './PlacementGhost';

// Drag threshold in mm - must move at least this much before dragging starts
const DRAG_THRESHOLD = 20;

interface SnapState {
  snappedToItemId: string | null;
  snapEdge: SnapResult['snapEdge'];
}

interface PlacementState {
  position: [number, number, number];
  rotation: number;
  isValid: boolean;
}

export interface UnifiedSceneProps {
  // Data
  items: PlacedItem[];
  room: RoomConfig;
  globalDimensions: GlobalDimensions;
  
  // Materials (from context)
  selectedFinish?: MaterialOption;
  selectedBenchtop?: MaterialOption;
  selectedKick?: MaterialOption;
  
  // Selection & interaction
  selectedItemId: string | null;
  draggedItemId: string | null;
  placementItemId: string | null;
  
  // Callbacks
  onItemSelect: (id: string | null) => void;
  onItemMove: (id: string, updates: Partial<PlacedItem>) => void;
  onItemAdd?: (definitionId: string, x: number, z: number, rotation?: number) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onDragConfirm?: () => void;
  
  // Drag state for threshold
  dragState?: {
    startPosition: { x: number; z: number } | null;
    isDragging: boolean;
  };
  
  // View options
  is3D?: boolean;
  viewMode?: '2d' | '3d';
  showDebugOverlay?: boolean;
  
  // Camera controls callback
  onCameraControlsReady?: (controls: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    fitAll: () => void;
  }) => void;
  
  // Catalog for placement ghost
  catalog?: CatalogItemDefinition[];
}

// Placement mode handler - follows cursor and places on click
function PlacementHandler({
  placementItemId,
  items,
  room,
  globalDimensions,
  catalog,
  onPositionUpdate,
  onItemAdd,
  setPlacementItem,
}: {
  placementItemId: string | null;
  items: PlacedItem[];
  room: RoomConfig;
  globalDimensions: GlobalDimensions;
  catalog: CatalogItemDefinition[];
  onPositionUpdate: (state: PlacementState) => void;
  onItemAdd?: (definitionId: string, x: number, z: number, rotation?: number) => void;
  setPlacementItem?: (id: string | null) => void;
}) {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const latestSnapRef = useRef<SnapResult | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!placementItemId) return;

    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
    const target = new THREE.Vector3();
    const hit = raycaster.current.ray.intersectPlane(plane.current, target);

    if (hit) {
      const def = catalog.find(c => c.id === placementItemId);
      if (!def) return;

      // Get dimensions for the ghost item
      let width = def.defaultWidth;
      let depth = def.defaultDepth;
      if (def.itemType === 'Cabinet') {
        if (def.category === 'Base') depth = globalDimensions.baseDepth;
        else if (def.category === 'Wall') depth = globalDimensions.wallDepth;
        else if (def.category === 'Tall') depth = globalDimensions.tallDepth;
      }

      const tempItem = {
        instanceId: 'temp',
        definitionId: placementItemId,
        itemType: def.itemType,
        x: target.x * 1000,
        y: 0,
        z: target.z * 1000,
        rotation: 0,
        width,
        depth,
        height: def.defaultHeight,
      };

      const snapResult = calculateSnapPosition(
        target.x * 1000,
        target.z * 1000,
        tempItem as PlacedItem,
        items,
        room,
        SNAP_INCREMENT,
        globalDimensions
      );

      latestSnapRef.current = snapResult;

      const ghostItem = { ...tempItem, x: snapResult.x, z: snapResult.z, rotation: snapResult.rotation };
      const hasCollision = items.some(item => checkCollision(ghostItem as PlacedItem, item, 10));

      onPositionUpdate({
        position: [snapResult.x / 1000, 0, snapResult.z / 1000],
        rotation: snapResult.rotation,
        isValid: !hasCollision,
      });
    }
  }, [placementItemId, camera, gl, items, room, globalDimensions, catalog, onPositionUpdate]);

  const handleClick = useCallback((e: MouseEvent) => {
    if (!placementItemId || !onItemAdd) return;
    
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
    const target = new THREE.Vector3();
    const hit = raycaster.current.ray.intersectPlane(plane.current, target);

    if (hit) {
      const snap = latestSnapRef.current;
      if (snap) {
        onItemAdd(placementItemId, snap.x, snap.z, snap.rotation);
      } else {
        const snappedX = Math.round((target.x * 1000) / SNAP_INCREMENT) * SNAP_INCREMENT;
        const snappedZ = Math.round((target.z * 1000) / SNAP_INCREMENT) * SNAP_INCREMENT;
        onItemAdd(placementItemId, snappedX, snappedZ);
      }
      latestSnapRef.current = null;
      setPlacementItem?.(null);
    }
  }, [placementItemId, onItemAdd, camera, gl, setPlacementItem]);

  useEffect(() => {
    if (!placementItemId) return;
    
    const canvas = gl.domElement;
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('click', handleClick);
    
    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [placementItemId, gl, handlePointerMove, handleClick]);

  return null;
}

// Drop zone for drag and drop from catalog
function DropZone({
  items,
  room,
  globalDimensions,
  catalog,
  onItemAdd,
}: {
  items: PlacedItem[];
  room: RoomConfig;
  globalDimensions: GlobalDimensions;
  catalog: CatalogItemDefinition[];
  onItemAdd?: (definitionId: string, x: number, z: number, rotation?: number) => void;
}) {
  const { gl, camera } = useThree();

  useEffect(() => {
    if (!onItemAdd) return;
    
    const canvas = gl.domElement;
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const definitionId = e.dataTransfer!.getData('definitionId');
      if (!definitionId) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, target);
      
      if (hit) {
        const def = catalog.find(c => c.id === definitionId);
        if (!def) return;

        let width = def.defaultWidth;
        let depth = def.defaultDepth;
        if (def.itemType === 'Cabinet') {
          if (def.category === 'Base') depth = globalDimensions.baseDepth;
          else if (def.category === 'Wall') depth = globalDimensions.wallDepth;
          else if (def.category === 'Tall') depth = globalDimensions.tallDepth;
        }

        const tempItem = {
          instanceId: 'temp',
          definitionId,
          itemType: def.itemType,
          x: target.x * 1000,
          y: 0,
          z: target.z * 1000,
          rotation: 0,
          width,
          depth,
          height: def.defaultHeight,
        };

        const snapResult = calculateSnapPosition(
          target.x * 1000,
          target.z * 1000,
          tempItem as PlacedItem,
          items,
          room,
          SNAP_INCREMENT,
          globalDimensions
        );

        onItemAdd(definitionId, snapResult.x, snapResult.z, snapResult.rotation);
      }
    };
    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('drop', handleDrop);
    return () => { canvas.removeEventListener('dragover', handleDragOver); canvas.removeEventListener('drop', handleDrop); };
  }, [gl, camera, onItemAdd, items, room, globalDimensions, catalog]);

  return null;
}

// Drag manager for moving existing items
function DragManager({
  items,
  draggedItemId,
  room,
  globalDimensions,
  dragState,
  onItemMove,
  onDragConfirm,
  onDragEnd,
  onSnapChange,
  onSnapResultChange,
}: {
  items: PlacedItem[];
  draggedItemId: string | null;
  room: RoomConfig;
  globalDimensions: GlobalDimensions;
  dragState?: { startPosition: { x: number; z: number } | null; isDragging: boolean };
  onItemMove: (id: string, updates: Partial<PlacedItem>) => void;
  onDragConfirm?: () => void;
  onDragEnd?: () => void;
  onSnapChange: (state: SnapState) => void;
  onSnapResultChange?: (result: SnapResult | null) => void;
}) {
  const { gl } = useThree();

  const handlePointerMove = (e: any) => {
    if (!draggedItemId) return;
    e.stopPropagation();
    const point = e.point;
    const draggedItem = items.find(i => i.instanceId === draggedItemId);
    if (!draggedItem) return;

    const rawX = point.x * 1000;
    const rawZ = point.z * 1000;

    // Check if we've exceeded drag threshold
    if (dragState?.startPosition && !dragState.isDragging) {
      const dx = rawX - dragState.startPosition.x;
      const dz = rawZ - dragState.startPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < DRAG_THRESHOLD) {
        return;
      }
      onDragConfirm?.();
    }

    const snapResult = calculateSnapPosition(
      rawX,
      rawZ,
      draggedItem,
      items,
      room,
      SNAP_INCREMENT,
      globalDimensions
    );

    onSnapChange({
      snappedToItemId: snapResult.snappedItemId || null,
      snapEdge: snapResult.snapEdge,
    });

    onSnapResultChange?.(snapResult);

    onItemMove(draggedItemId, {
      x: snapResult.x,
      z: snapResult.z,
      rotation: snapResult.rotation,
    });
  };

  const handlePointerUp = () => {
    if (draggedItemId) {
      onDragEnd?.();
      onSnapChange({ snappedToItemId: null, snapEdge: undefined });
      onSnapResultChange?.(null);
    }
  };

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (draggedItemId) {
        onDragEnd?.();
        onSnapChange({ snappedToItemId: null, snapEdge: undefined });
        onSnapResultChange?.(null);
      }
    };

    gl.domElement.addEventListener('pointerup', handleGlobalPointerUp);
    gl.domElement.addEventListener('pointerleave', handleGlobalPointerUp);
    
    return () => {
      gl.domElement.removeEventListener('pointerup', handleGlobalPointerUp);
      gl.domElement.removeEventListener('pointerleave', handleGlobalPointerUp);
    };
  }, [draggedItemId, onDragEnd, onSnapChange, onSnapResultChange, gl]);

  return (
    <mesh 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[room.width / 2000, -0.01, room.depth / 2000]} 
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

// No ItemMesh component needed - we use CabinetMesh, ApplianceMesh, StructureMesh directly

// Camera controller
function CameraController({
  room,
  controlsRef,
  viewMode,
  isInteracting,
}: {
  room: RoomConfig;
  controlsRef: React.RefObject<any>;
  viewMode: '2d' | '3d';
  isInteracting: boolean;
}) {
  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(widthM / 2, 0, depthM / 2);
      controlsRef.current.update();
    }
  }, [widthM, depthM, controlsRef]);

  return (
    <>
      <PerspectiveCamera makeDefault={viewMode === '3d'} position={[widthM * 1.5, 5, depthM * 1.5]} fov={45} />
      <OrthographicCamera makeDefault={viewMode === '2d'} position={[widthM / 2, 10, depthM / 2]} zoom={50} near={0.1} far={100} rotation={[-Math.PI / 2, 0, 0]} />
      <OrbitControls 
        ref={controlsRef} 
        makeDefault 
        enabled={!isInteracting} 
        enableDamping 
        dampingFactor={0.05} 
        rotateSpeed={0.5} 
        panSpeed={0.6} 
        zoomSpeed={0.8} 
        enableRotate={viewMode === '3d'} 
        minPolarAngle={0} 
        maxPolarAngle={viewMode === '3d' ? Math.PI / 2.1 : 0}
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        }}
      />
    </>
  );
}

// Main unified scene component
export function UnifiedScene({
  items,
  room,
  globalDimensions,
  selectedItemId,
  draggedItemId,
  placementItemId,
  onItemSelect,
  onItemMove,
  onItemAdd,
  onDragStart,
  onDragEnd,
  onDragConfirm,
  dragState,
  is3D = true,
  viewMode: viewModeProp,
  showDebugOverlay = false,
  onCameraControlsReady,
  catalog: catalogProp,
}: UnifiedSceneProps) {
  const { catalog: fetchedCatalog } = useCatalog('admin');
  const catalog = catalogProp || fetchedCatalog;
  
  const [snapState, setSnapState] = useState<SnapState>({ snappedToItemId: null, snapEdge: undefined });
  const [currentSnapResult, setCurrentSnapResult] = useState<SnapResult | null>(null);
  const [placementState, setPlacementState] = useState<PlacementState>({
    position: [0, 0, 0],
    rotation: 0,
    isValid: true,
  });
  const [debugOverlay, setDebugOverlay] = useState(showDebugOverlay);
  const controlsRef = useRef<any>(null);

  const viewMode = viewModeProp || (is3D ? '3d' : '2d');

  // Toggle debug overlay with 'D' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setDebugOverlay(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Expose camera controls to parent
  useEffect(() => {
    if (onCameraControlsReady && controlsRef.current) {
      const controls = controlsRef.current;
      const camera = controls.object;
      const widthM = room.width / 1000;
      const depthM = room.depth / 1000;

      onCameraControlsReady({
        zoomIn: () => {
          if (camera.isOrthographicCamera) {
            camera.zoom = Math.min(camera.zoom * 1.2, 200);
            camera.updateProjectionMatrix();
          } else {
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            camera.position.addScaledVector(direction, 1);
          }
        },
        zoomOut: () => {
          if (camera.isOrthographicCamera) {
            camera.zoom = Math.max(camera.zoom / 1.2, 10);
            camera.updateProjectionMatrix();
          } else {
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            camera.position.addScaledVector(direction, -1);
          }
        },
        resetView: () => {
          if (camera.isPerspectiveCamera) {
            camera.position.set(widthM * 1.5, 5, depthM * 1.5);
          } else {
            camera.position.set(widthM / 2, 10, depthM / 2);
            camera.zoom = 50;
            camera.updateProjectionMatrix();
          }
          controls.target.set(widthM / 2, 0, depthM / 2);
          controls.update();
        },
        fitAll: () => {
          const bbox = new THREE.Box3();
          items.forEach(item => {
            const pos = new THREE.Vector3(item.x / 1000, item.y / 1000, item.z / 1000);
            bbox.expandByPoint(pos);
          });
          
          if (bbox.isEmpty()) {
            bbox.expandByPoint(new THREE.Vector3(0, 0, 0));
            bbox.expandByPoint(new THREE.Vector3(widthM, 2, depthM));
          }
          
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          controls.target.copy(center);
          
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          
          if (camera.isPerspectiveCamera) {
            const distance = maxDim / Math.tan((camera.fov * Math.PI) / 360);
            const direction = new THREE.Vector3(-1, 0.8, 1).normalize();
            camera.position.copy(center).addScaledVector(direction, distance * 1.5);
          } else {
            camera.zoom = Math.min(50 / (maxDim / 4), 200);
            camera.updateProjectionMatrix();
          }
          controls.update();
        },
      });
    }
  }, [onCameraControlsReady, room, items]);

  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;
  const heightM = room.height / 1000;
  const wt = WALL_THICKNESS / 1000;

  const draggedItem = draggedItemId ? items.find(i => i.instanceId === draggedItemId) || null : null;
  const isInteracting = !!draggedItemId || !!placementItemId;
  const cursorStyle = placementItemId ? 'crosshair' : draggedItemId ? 'grabbing' : 'auto';

  const handleDragStart = useCallback((id: string, x: number, z: number) => {
    onDragStart?.(id);
  }, [onDragStart]);

  return (
    <Canvas shadows dpr={[1, 2]} className="w-full h-full" style={{ cursor: cursorStyle, background: 'linear-gradient(to bottom, #f8fafc, #e2e8f0)' }}>
      <CameraController controlsRef={controlsRef} room={room} viewMode={viewMode} isInteracting={isInteracting} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0001} />
      <Environment preset="apartment" blur={0.8} background={false} />
      <ContactShadows resolution={1024} scale={Math.max(widthM, depthM) * 2} blur={2} opacity={0.4} far={10} color="#000000" />
      
      <DropZone items={items} room={room} globalDimensions={globalDimensions} catalog={catalog} onItemAdd={onItemAdd} />
      <DragManager 
        items={items}
        draggedItemId={draggedItemId}
        room={room}
        globalDimensions={globalDimensions}
        dragState={dragState}
        onItemMove={onItemMove}
        onDragConfirm={onDragConfirm}
        onDragEnd={onDragEnd}
        onSnapChange={setSnapState}
        onSnapResultChange={setCurrentSnapResult}
      />
      <PlacementHandler
        placementItemId={placementItemId}
        items={items}
        room={room}
        globalDimensions={globalDimensions}
        catalog={catalog}
        onPositionUpdate={setPlacementState}
        onItemAdd={onItemAdd}
      />

      <group onPointerMissed={() => { if (!placementItemId) onItemSelect(null); }}>
        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[widthM / 2, -0.01, depthM / 2]} receiveShadow>
          <planeGeometry args={[widthM + 2, depthM + 2]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
        </mesh>

        <Grid
          position={[widthM / 2, 0.001, depthM / 2]}
          args={[widthM + 2, depthM + 2]}
          cellSize={0.1}
          cellThickness={0.5}
          cellColor="#d1d5db"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={30}
          fadeStrength={1}
        />

        {/* Walls */}
        <Wall position={[-wt / 2, heightM / 2, depthM / 2]} rotation={[0, 0, 0]} width={wt} height={heightM} />
        <Wall position={[widthM / 2, heightM / 2, -wt / 2]} rotation={[0, Math.PI / 2, 0]} width={depthM + wt} height={heightM} />

        {room.shape === 'LShape' && (
          <>
            <Wall position={[room.cutoutWidth / 1000 + wt / 2, heightM / 2, (depthM + (room.depth - room.cutoutDepth) / 1000) / 2]} rotation={[0, 0, 0]} width={wt} height={heightM} />
            <Wall position={[(room.cutoutWidth / 1000 + widthM + wt) / 2, heightM / 2, (room.depth - room.cutoutDepth) / 1000 - wt / 2]} rotation={[0, Math.PI / 2, 0]} width={widthM - room.cutoutWidth / 1000 + wt} height={heightM} />
            <WallCorner position={[room.cutoutWidth / 1000, heightM / 2, (room.depth - room.cutoutDepth) / 1000]} height={heightM} thickness={wt} />
          </>
        )}

        {/* Render items using proper component dispatch */}
        {items.map(item => {
          const key = item.instanceId;
          if (item.itemType === 'Appliance') {
            return <ApplianceMesh key={key} item={item} />;
          }
          if (item.itemType === 'Structure') {
            return <StructureMesh key={key} item={item} />;
          }
          // Default: Cabinet
          return <CabinetMesh key={key} item={item} />;
        })}

        {/* Placement ghost */}
        {placementItemId && (
          <PlacementGhost
            position={placementState.position}
            rotation={placementState.rotation}
            isValid={placementState.isValid}
          />
        )}

        {/* Snap indicators */}
        {draggedItem && (
          <SnapIndicators
            draggedItem={draggedItem}
            items={items}
            snappedToItemId={snapState.snappedToItemId}
            snapEdge={snapState.snapEdge}
            room={room}
          />
        )}

        {/* Smart dimensions */}
        <SmartDimensions />

        {/* Interaction handles */}
        <InteractionHandles />

        {/* Snap debug overlay */}
        <SnapDebugOverlay
          items={items}
          room={room}
          globalDimensions={globalDimensions}
          draggedItem={draggedItem}
          snapResult={currentSnapResult}
          visible={debugOverlay}
        />
      </group>
    </Canvas>
  );
}

export default UnifiedScene;
