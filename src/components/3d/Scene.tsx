import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, ContactShadows } from '@react-three/drei';
import { usePlanner } from '../../store/PlannerContext';
import CabinetMesh from './CabinetMesh';
import StructureMesh from './StructureMesh';
import ApplianceMesh from './ApplianceMesh';
import Wall from './Wall';
import SnapIndicators from './SnapIndicators';
import * as THREE from 'three';
import { WALL_THICKNESS, SNAP_INCREMENT } from '../../constants';
import SmartDimensions from './SmartDimensions';
import InteractionHandles from './InteractionHandles';
import { calculateSnapPosition, SnapResult } from '../../utils/cabinetSnapping';

const DropZone: React.FC = () => {
  const { gl, camera } = useThree();
  const { addItem } = usePlanner();

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
        const snappedX = Math.round((target.x * 1000) / SNAP_INCREMENT) * SNAP_INCREMENT;
        const snappedZ = Math.round((target.z * 1000) / SNAP_INCREMENT) * SNAP_INCREMENT;
        addItem(definitionId, snappedX, snappedZ);
      }
    };
    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('drop', handleDrop);
    return () => { canvas.removeEventListener('dragover', handleDragOver); canvas.removeEventListener('drop', handleDrop); };
  }, [gl, camera, addItem]);

  return null;
};

interface SnapState {
  snappedToItemId: string | null;
  snapEdge: SnapResult['snapEdge'];
}

const DragManager: React.FC<{ onSnapChange: (state: SnapState) => void }> = ({ onSnapChange }) => {
  const { items, updateItem, draggedItemId, setDraggedItem, room } = usePlanner();

  const handlePointerMove = (e: any) => {
    if (!draggedItemId) return;
    e.stopPropagation();
    const point = e.point;
    const draggedItem = items.find(i => i.instanceId === draggedItemId);
    if (!draggedItem) return;

    const rawX = point.x * 1000;
    const rawZ = point.z * 1000;
    const cy = draggedItem.y;

    // Use the new snapping system
    const snapResult = calculateSnapPosition(
      rawX,
      rawZ,
      draggedItem,
      items,
      room,
      SNAP_INCREMENT
    );

    // Update snap state for visual indicators
    onSnapChange({
      snappedToItemId: snapResult.snappedItemId || null,
      snapEdge: snapResult.snapEdge,
    });

    updateItem(draggedItemId, {
      x: snapResult.x,
      y: cy,
      z: snapResult.z,
      rotation: snapResult.rotation,
    });
  };

  const handlePointerUp = () => {
    if (draggedItemId) {
      setDraggedItem(null);
      onSnapChange({ snappedToItemId: null, snapEdge: undefined });
    }
  };

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.width / 2000, -0.01, room.depth / 2000]} scale={[100, 100, 1]} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} visible={true}>
      <planeGeometry />
      <meshBasicMaterial color="red" wireframe transparent opacity={0} />
    </mesh>
  );
};

const CameraController = () => {
  const { viewMode, room, draggedItemId } = usePlanner();
  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(widthM / 2, 0, depthM / 2);
      controlsRef.current.update();
    }
  }, [widthM, depthM]);

  return (
    <>
      <PerspectiveCamera makeDefault={viewMode === '3d'} position={[widthM * 1.5, 5, depthM * 1.5]} fov={45} />
      <OrthographicCamera makeDefault={viewMode === '2d'} position={[widthM / 2, 10, depthM / 2]} zoom={50} near={0.1} far={100} rotation={[-Math.PI / 2, 0, 0]} />
      <OrbitControls ref={controlsRef} makeDefault enabled={!draggedItemId} enableDamping dampingFactor={0.05} rotateSpeed={0.5} panSpeed={0.6} zoomSpeed={0.8} enableRotate={viewMode === '3d'} minPolarAngle={0} maxPolarAngle={viewMode === '3d' ? Math.PI / 2.1 : 0} />
    </>
  );
};

interface SceneProps {
  is3D?: boolean;
}

const Scene: React.FC<SceneProps> = ({ is3D = true }) => {
  const { items, room, selectItem, setViewMode, draggedItemId } = usePlanner();
  const [snapState, setSnapState] = useState<SnapState>({ snappedToItemId: null, snapEdge: undefined });

  useEffect(() => { setViewMode(is3D ? '3d' : '2d'); }, [is3D, setViewMode]);

  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;
  const heightM = room.height / 1000;
  const wt = WALL_THICKNESS / 1000;

  const draggedItem = draggedItemId ? items.find(i => i.instanceId === draggedItemId) || null : null;

  return (
    <Canvas shadows dpr={[1, 2]} className="w-full h-full">
      <CameraController />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0001} />
      <Environment preset="apartment" blur={0.8} background={false} />
      <ContactShadows resolution={1024} scale={Math.max(widthM, depthM) * 2} blur={2} opacity={0.4} far={10} color="#000000" />
      <DropZone />
      <DragManager onSnapChange={setSnapState} />

      <group onPointerMissed={() => selectItem(null)}>
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

        {/* Snap indicators */}
        <SnapIndicators
          draggedItem={draggedItem}
          snappedToItemId={snapState.snappedToItemId}
          snapEdge={snapState.snapEdge}
          items={items}
        />

        <InteractionHandles />
        <SmartDimensions />
      </group>
    </Canvas>
  );
};

export default Scene;
