import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, ContactShadows } from '@react-three/drei';
import { usePlanner } from '../../store/PlannerContext';
import CabinetMesh from './CabinetMesh';
import StructureMesh from './StructureMesh';
import ApplianceMesh from './ApplianceMesh';
import Wall from './Wall';
import SnapIndicators from './SnapIndicators';
import SnapDebugOverlay from './SnapDebugOverlay';
import PlacementGhost from './PlacementGhost';
import * as THREE from 'three';
import { WALL_THICKNESS, SNAP_INCREMENT } from '../../constants';
import SmartDimensions from './SmartDimensions';
import InteractionHandles from './InteractionHandles';
import { calculateSnapPosition, SnapResult, checkCollision } from '../../utils/snapping';
import { useCatalog } from '../../hooks/useCatalog';

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

// Placement mode handler - follows cursor and places on click
const PlacementHandler: React.FC<{
  onPositionUpdate: (state: PlacementState) => void;
}> = ({ onPositionUpdate }) => {
  const { camera, gl } = useThree();
  const { placementItemId, addItem, setPlacementItem, items, room, globalDimensions } = usePlanner();
  const { catalog } = useCatalog('admin');
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

      // Create a temporary item for snapping calculation
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
        tempItem as any,
        items,
        room,
        SNAP_INCREMENT,
        globalDimensions
      );

      latestSnapRef.current = snapResult;

      // Check for collisions
      const ghostItem = { ...tempItem, x: snapResult.x, z: snapResult.z, rotation: snapResult.rotation };
      const hasCollision = items.some(item => checkCollision(ghostItem as any, item, 10));

      onPositionUpdate({
        position: [snapResult.x / 1000, 0, snapResult.z / 1000],
        rotation: snapResult.rotation,
        isValid: !hasCollision,
      });
    }
  }, [placementItemId, camera, gl, items, room, globalDimensions, onPositionUpdate]);

  const handleClick = useCallback((e: MouseEvent) => {
    if (!placementItemId) return;
    
    // Get current position from the state
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
    const target = new THREE.Vector3();
    const hit = raycaster.current.ray.intersectPlane(plane.current, target);

    if (hit) {
      const snap = latestSnapRef.current;
      if (snap) {
        addItem(placementItemId, snap.x, snap.z, snap.rotation);
      } else {
        const snappedX = Math.round((target.x * 1000) / SNAP_INCREMENT) * SNAP_INCREMENT;
        const snappedZ = Math.round((target.z * 1000) / SNAP_INCREMENT) * SNAP_INCREMENT;
        addItem(placementItemId, snappedX, snappedZ);
      }
      latestSnapRef.current = null;
      setPlacementItem(null);
    }
  }, [placementItemId, addItem, setPlacementItem, camera, gl]);

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
};

const DropZone: React.FC = () => {
  const { gl, camera } = useThree();
  const { addItem, items, room, globalDimensions } = usePlanner();
  const { catalog } = useCatalog('admin');

  useEffect(() => {
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

        // Match placement sizing logic so snapping uses correct cabinet depth
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
          tempItem as any,
          items,
          room,
          SNAP_INCREMENT,
          globalDimensions
        );

        addItem(definitionId, snapResult.x, snapResult.z, snapResult.rotation);
      }
    };
    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('drop', handleDrop);
    return () => { canvas.removeEventListener('dragover', handleDragOver); canvas.removeEventListener('drop', handleDrop); };
  }, [gl, camera, addItem, items, room, globalDimensions]);

  return null;
};

const DragManager: React.FC<{ 
  onSnapChange: (state: SnapState) => void;
  onSnapResultChange?: (result: SnapResult | null) => void;
}> = ({ onSnapChange, onSnapResultChange }) => {
  const { items, updateItem, draggedItemId, dragState, confirmDrag, endDrag, room, globalDimensions } = usePlanner();
  const { gl } = useThree();

  const handlePointerMove = (e: any) => {
    if (!draggedItemId) return;
    e.stopPropagation();
    const point = e.point;
    const draggedItem = items.find(i => i.instanceId === draggedItemId);
    if (!draggedItem) return;

    const rawX = point.x * 1000;
    const rawZ = point.z * 1000;
    const cy = draggedItem.y;

    // Check if we've exceeded drag threshold
    if (dragState.startPosition && !dragState.isDragging) {
      const dx = rawX - dragState.startPosition.x;
      const dz = rawZ - dragState.startPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < DRAG_THRESHOLD) {
        // Haven't moved enough yet, don't update position
        return;
      }
      // Exceeded threshold, confirm the drag
      confirmDrag();
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

    // Pass full snap result for debug overlay
    onSnapResultChange?.(snapResult);

    updateItem(draggedItemId, {
      x: snapResult.x,
      y: cy,
      z: snapResult.z,
      rotation: snapResult.rotation,
    });
  };

  const handlePointerUp = () => {
    if (draggedItemId) {
      endDrag();
      onSnapChange({ snappedToItemId: null, snapEdge: undefined });
      onSnapResultChange?.(null);
    }
  };

  // Global pointer up handler to catch releases outside the drag plane
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (draggedItemId) {
        endDrag();
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
  }, [draggedItemId, endDrag, onSnapChange, onSnapResultChange, gl]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.width / 2000, -0.01, room.depth / 2000]} scale={[100, 100, 1]} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} visible={true}>
      <planeGeometry />
      <meshBasicMaterial color="red" wireframe transparent opacity={0} />
    </mesh>
  );
};

interface CameraControllerProps {
  controlsRef: React.RefObject<any>;
}

const CameraController: React.FC<CameraControllerProps> = ({ controlsRef }) => {
  const { viewMode, room, draggedItemId, placementItemId } = usePlanner();
  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(widthM / 2, 0, depthM / 2);
      controlsRef.current.update();
    }
  }, [widthM, depthM, controlsRef]);

  const isInteracting = !!draggedItemId || !!placementItemId;

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
      />
    </>
  );
};

interface SceneProps {
  is3D?: boolean;
  onCameraControlsReady?: (controls: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    fitAll: () => void;
  }) => void;
}

const Scene: React.FC<SceneProps> = ({ is3D = true, onCameraControlsReady }) => {
  const { items, room, selectItem, setViewMode, draggedItemId, placementItemId, globalDimensions } = usePlanner();
  const [snapState, setSnapState] = useState<SnapState>({ snappedToItemId: null, snapEdge: undefined });
  const [currentSnapResult, setCurrentSnapResult] = useState<SnapResult | null>(null);
  const [placementState, setPlacementState] = useState<PlacementState>({
    position: [0, 0, 0],
    rotation: 0,
    isValid: true,
  });
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const controlsRef = useRef<any>(null);

  useEffect(() => { setViewMode(is3D ? '3d' : '2d'); }, [is3D, setViewMode]);

  // Toggle debug overlay with 'D' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        // Don't toggle if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setShowDebugOverlay(prev => !prev);
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

  // Cursor style based on mode
  const cursorStyle = placementItemId ? 'crosshair' : draggedItemId ? 'grabbing' : 'auto';

  return (
    <Canvas shadows dpr={[1, 2]} className="w-full h-full" style={{ cursor: cursorStyle }}>
      <CameraController controlsRef={controlsRef} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0001} />
      <Environment preset="apartment" blur={0.8} background={false} />
      <ContactShadows resolution={1024} scale={Math.max(widthM, depthM) * 2} blur={2} opacity={0.4} far={10} color="#000000" />
      <DropZone />
      <DragManager onSnapChange={setSnapState} onSnapResultChange={setCurrentSnapResult} />
      <PlacementHandler onPositionUpdate={setPlacementState} />

      <group onPointerMissed={() => { if (!placementItemId) selectItem(null); }}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[widthM / 2, -0.01, depthM / 2]} receiveShadow>
          <planeGeometry args={[widthM + 2, depthM + 2]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
        </mesh>

        <Grid position={[0, 0, 0]} args={[30, 30]} cellSize={0.5} cellThickness={0.5} cellColor="#e5e7eb" sectionSize={1} sectionThickness={1} sectionColor="#d1d5db" fadeDistance={30} />

        {/* Back wall */}
        <Wall position={[widthM / 2, heightM / 2, -wt / 2]} rotation={[0, 0, 0]} width={widthM} height={heightM} thickness={wt} />
        {/* Left wall */}
        <Wall position={[-wt / 2, heightM / 2, depthM / 2]} rotation={[0, Math.PI / 2, 0]} width={depthM} height={heightM} thickness={wt} />
        {/* Front wall */}
        <Wall position={[widthM / 2, heightM / 2, depthM + wt / 2]} rotation={[0, Math.PI, 0]} width={widthM} height={heightM} thickness={wt} />
        {/* Right wall */}
        <Wall position={[widthM + wt / 2, heightM / 2, depthM / 2]} rotation={[0, -Math.PI / 2, 0]} width={depthM} height={heightM} thickness={wt} />

        {items.map(item => {
          if (item.itemType === 'Cabinet') return <CabinetMesh key={item.instanceId} item={item} />;
          if (item.itemType === 'Appliance') return <ApplianceMesh key={item.instanceId} item={item} />;
          return <StructureMesh key={item.instanceId} item={item} />;
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
        <SnapIndicators
          draggedItem={draggedItem}
          snappedToItemId={snapState.snappedToItemId}
          snapEdge={snapState.snapEdge}
          items={items}
          room={room}
        />

        {/* Debug overlay (toggle with D key) */}
        <SnapDebugOverlay
          items={items}
          room={room}
          globalDimensions={globalDimensions}
          draggedItem={draggedItem}
          snapResult={currentSnapResult}
          visible={showDebugOverlay}
        />

        <InteractionHandles />
        <SmartDimensions />
      </group>
    </Canvas>
  );
};

export default Scene;
