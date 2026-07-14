import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import ErrorBoundary from '@/components/ErrorBoundary';
import { WALL_THICKNESS, SNAP_INCREMENT } from '@/constants';
import { calculateSnapPosition, SnapResult, checkCollision } from '@/utils/snapping';
import { RoomConfig, PlacedItem, GlobalDimensions, CatalogItemDefinition, MaterialOption, Opening, ServicePoint } from '@/types';
import { FINISH_OPTIONS } from '@/constants';
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

const OPENING_COLORS: Record<Opening['type'], string> = {
  door: '#b45309', window: '#0369a1', walkway: '#a1a1aa',
};

/**
 * Doors, windows and walkways drawn on the interior face of each wall, at their
 * real position/size from room.openings. Doors read as a recessed panel (floor
 * → head height), windows as a glazed opening at sill height, walkways as an
 * open floor threshold. Offsets follow RoomFeaturesEditor's plan convention.
 */
/** Anchor a composite on a wall: local +x runs along the wall (left→right as
 *  viewed from inside), local +z points INTO the room. `u` is the centre of
 *  the feature measured along the wall in the editor's offset convention. */
function wallAnchor(
  wall: Opening['wall'],
  u: number,
  widthM: number,
  depthM: number,
): { pos: [number, number, number]; rotY: number } {
  switch (wall) {
    case 'N': return { pos: [u, 0, 0], rotY: 0 };
    case 'S': return { pos: [widthM - u, 0, depthM], rotY: Math.PI };
    case 'W': return { pos: [0, 0, depthM - u], rotY: Math.PI / 2 };
    default:  return { pos: [widthM, 0, u], rotY: -Math.PI / 2 }; // E
  }
}

const TIMBER = '#a97142';
const ARCHITRAVE = '#e7e0d5';
const FRAME_WHITE = '#f8fafc';

/** F-10: modelled door — architrave, timber leaf, handle, floor swing arc. */
function DoorComposite({ o, heightM }: { o: Opening; heightM: number }) {
  const w = o.widthMm / 1000;
  const h = Math.min(heightM, (o.heightMm ?? 2040) / 1000);
  const hingeLeft = o.swing === 'in-left';
  const showArc = o.swing === 'in-left' || o.swing === 'in-right';
  const hingeX = hingeLeft ? -w / 2 : w / 2;
  return (
    <group>
      {/* architrave: lintel + jambs */}
      <mesh position={[0, h + 0.04, 0.012]}><boxGeometry args={[w + 0.14, 0.08, 0.025]} /><meshStandardMaterial color={ARCHITRAVE} roughness={0.7} /></mesh>
      <mesh position={[-(w / 2 + 0.035), h / 2, 0.012]}><boxGeometry args={[0.07, h, 0.025]} /><meshStandardMaterial color={ARCHITRAVE} roughness={0.7} /></mesh>
      <mesh position={[w / 2 + 0.035, h / 2, 0.012]}><boxGeometry args={[0.07, h, 0.025]} /><meshStandardMaterial color={ARCHITRAVE} roughness={0.7} /></mesh>
      {/* leaf */}
      <mesh position={[0, h / 2, 0.028]} castShadow><boxGeometry args={[w - 0.02, h - 0.02, 0.04]} /><meshStandardMaterial color={TIMBER} roughness={0.55} /></mesh>
      {/* recessed panels for depth */}
      <mesh position={[0, h * 0.72, 0.05]}><boxGeometry args={[w * 0.6, h * 0.32, 0.005]} /><meshStandardMaterial color="#8f5e37" roughness={0.6} /></mesh>
      <mesh position={[0, h * 0.28, 0.05]}><boxGeometry args={[w * 0.6, h * 0.32, 0.005]} /><meshStandardMaterial color="#8f5e37" roughness={0.6} /></mesh>
      {/* handle on the latch side */}
      {o.swing !== 'slider' && (
        <mesh position={[hingeLeft ? w / 2 - 0.07 : -(w / 2 - 0.07), 1.0, 0.06]}>
          <sphereGeometry args={[0.022, 12, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.25} />
        </mesh>
      )}
      {/* floor swing arc */}
      {showArc && (
        <mesh position={[hingeX, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(0.05, w - 0.03), w, 32, 1, hingeLeft ? 0 : Math.PI / 2, Math.PI / 2]} />
          <meshBasicMaterial color="#94a3b8" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** F-10: modelled window — frame, glazing, mullions, protruding sill. */
function WindowComposite({ o, heightM }: { o: Opening; heightM: number }) {
  const w = o.widthMm / 1000;
  const sill = (o.sillHeightMm ?? 900) / 1000;
  const h = Math.min(heightM - sill, (o.heightMm ?? 1200) / 1000);
  const yC = sill + h / 2;
  const f = 0.05; // frame member size
  return (
    <group>
      {/* frame */}
      <mesh position={[0, sill + h + f / 2, 0.015]}><boxGeometry args={[w + 2 * f, f, 0.05]} /><meshStandardMaterial color={FRAME_WHITE} roughness={0.5} /></mesh>
      <mesh position={[0, sill - f / 2, 0.015]}><boxGeometry args={[w + 2 * f, f, 0.05]} /><meshStandardMaterial color={FRAME_WHITE} roughness={0.5} /></mesh>
      <mesh position={[-(w / 2 + f / 2), yC, 0.015]}><boxGeometry args={[f, h, 0.05]} /><meshStandardMaterial color={FRAME_WHITE} roughness={0.5} /></mesh>
      <mesh position={[w / 2 + f / 2, yC, 0.015]}><boxGeometry args={[f, h, 0.05]} /><meshStandardMaterial color={FRAME_WHITE} roughness={0.5} /></mesh>
      {/* glazing */}
      <mesh position={[0, yC, 0.01]}><boxGeometry args={[w, h, 0.012]} /><meshStandardMaterial color="#bfdbfe" roughness={0.05} metalness={0.15} transparent opacity={0.35} /></mesh>
      {/* mullions */}
      <mesh position={[0, yC, 0.018]}><boxGeometry args={[0.035, h, 0.02]} /><meshStandardMaterial color={FRAME_WHITE} roughness={0.5} /></mesh>
      <mesh position={[0, yC, 0.018]}><boxGeometry args={[w, 0.035, 0.02]} /><meshStandardMaterial color={FRAME_WHITE} roughness={0.5} /></mesh>
      {/* sill board into the room */}
      <mesh position={[0, sill - 0.015, 0.055]} castShadow><boxGeometry args={[w + 0.12, 0.03, 0.11]} /><meshStandardMaterial color={FRAME_WHITE} roughness={0.45} /></mesh>
    </group>
  );
}

/** F-10: walkway — open jambs + header reveal, floor threshold. */
function WalkwayComposite({ o, heightM }: { o: Opening; heightM: number }) {
  const w = o.widthMm / 1000;
  const h = Math.min(heightM, (o.heightMm ?? 2040) / 1000);
  return (
    <group>
      <mesh position={[-(w / 2 + 0.03), h / 2, 0.012]}><boxGeometry args={[0.06, h, 0.03]} /><meshStandardMaterial color={ARCHITRAVE} roughness={0.7} /></mesh>
      <mesh position={[w / 2 + 0.03, h / 2, 0.012]}><boxGeometry args={[0.06, h, 0.03]} /><meshStandardMaterial color={ARCHITRAVE} roughness={0.7} /></mesh>
      <mesh position={[0, h + 0.03, 0.012]}><boxGeometry args={[w + 0.12, 0.06, 0.03]} /><meshStandardMaterial color={ARCHITRAVE} roughness={0.7} /></mesh>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[w, 0.12]} /><meshBasicMaterial color="#cbd5e1" transparent opacity={0.6} /></mesh>
    </group>
  );
}

function RoomOpenings({ room }: { room: RoomConfig }) {
  const openings = room.openings ?? [];
  if (!openings.length) return null;
  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;
  const heightM = (room.height || 2700) / 1000;

  return (
    <group>
      {openings.map((o) => {
        const u = (o.offsetMm + o.widthMm / 2) / 1000;
        const { pos, rotY } = wallAnchor(o.wall, u, widthM, depthM);
        return (
          <group key={o.id} position={pos} rotation={[0, rotY, 0]}>
            {o.type === 'door' && <DoorComposite o={o} heightM={heightM} />}
            {o.type === 'window' && <WindowComposite o={o} heightM={heightM} />}
            {o.type === 'walkway' && <WalkwayComposite o={o} heightM={heightM} />}
          </group>
        );
      })}
    </group>
  );
}

// Service-point colours — mirror RoomFeaturesEditor's chips.
const SERVICE_COLORS: Record<string, string> = {
  drain: '#2563eb',
  'water-supply': '#0891b2',
  gpo: '#dc2626',
  gas: '#ca8a04',
  'hood-duct': '#7c3aed',
};

/** F-10: modelled service fixtures — GPO faceplates, capped pipe stubs for
 *  water/drain/gas, and a rangehood duct collar. Same wall convention as
 *  openings; local +z faces into the room. */
function ServiceComposite({ s }: { s: ServicePoint }) {
  const y = Math.max(0.06, (s.heightMm ?? 300) / 1000);
  switch (s.type) {
    case 'gpo':
      return (
        <group position={[0, y, 0.012]}>
          <mesh><boxGeometry args={[0.115, 0.075, 0.014]} /><meshStandardMaterial color="#fafafa" roughness={0.35} /></mesh>
          <mesh position={[-0.026, 0, 0.008]}><boxGeometry args={[0.028, 0.028, 0.006]} /><meshStandardMaterial color="#334155" roughness={0.5} /></mesh>
          <mesh position={[0.026, 0, 0.008]}><boxGeometry args={[0.028, 0.028, 0.006]} /><meshStandardMaterial color="#334155" roughness={0.5} /></mesh>
        </group>
      );
    case 'hood-duct':
      return (
        <group position={[0, y, 0.03]}>
          <mesh><boxGeometry args={[0.24, 0.18, 0.06]} /><meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.4} /></mesh>
          <mesh position={[0, 0, 0.032]}><boxGeometry args={[0.18, 0.12, 0.006]} /><meshStandardMaterial color="#475569" roughness={0.6} /></mesh>
        </group>
      );
    default: {
      // capped pipe stub — colour-coded cap: drain blue, water cyan, gas brass.
      const cap = SERVICE_COLORS[s.type] ?? '#64748b';
      return (
        <group position={[0, y, 0.03]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.022, 0.022, 0.06, 16]} /><meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} /></mesh>
          <mesh position={[0, 0, 0.034]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.026, 0.026, 0.012, 16]} /><meshStandardMaterial color={cap} metalness={0.5} roughness={0.35} /></mesh>
        </group>
      );
    }
  }
}

function RoomServices({ room }: { room: RoomConfig }) {
  const services = room.services ?? [];
  if (!services.length) return null;
  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;

  return (
    <group>
      {services.map((s) => {
        const { pos, rotY } = wallAnchor(s.wall, s.offsetMm / 1000, widthM, depthM);
        return (
          <group key={s.id} position={pos} rotation={[0, rotY, 0]}>
            <ServiceComposite s={s} />
          </group>
        );
      })}
    </group>
  );
}

interface SnapState {
  snappedToItemId: string | null;
  snapEdge: SnapResult['snapEdge'];
}


// NOTE: positions are CENTRE coordinates throughout the planner.
// calculateSnapPosition already clamps results to the room (rotation-aware,
// including wallGap), so no additional clamping is applied here. A previous
// corner-based clamp here fought the snapping engine and stopped cabinets
// from ever reaching the right/front walls.

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
  onItemEdit?: (id: string) => void;
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
  doorsOpen?: boolean;
  
  // Camera controls callback
  onCameraControlsReady?: (controls: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    fitAll: () => void;
    /** WS8: one-click camera presets — Front elevation, Top plan, Corner iso */
    setView: (preset: 'front' | 'top' | 'corner') => void;
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
      const width = def.defaultWidth;
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
        // Snap result is already clamped to the room (rotation-aware, with
        // the correct category depth) — use it directly.
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

        const width = def.defaultWidth;
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
  draggedIdRef,
  room,
  globalDimensions,
  onItemMove,
  onDragEnd,
  onSnapChange,
  onSnapResultChange,
}: {
  items: PlacedItem[];
  draggedIdRef: React.MutableRefObject<string | null>;
  room: RoomConfig;
  globalDimensions: GlobalDimensions;
  onItemMove: (id: string, updates: Partial<PlacedItem>) => void;
  onDragEnd?: () => void;
  onSnapChange: (state: SnapState) => void;
  onSnapResultChange?: (result: SnapResult | null) => void;
}) {
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragRef = useRef<{ startX: number | null; startY: number | null; dragging: boolean }>({ startX: null, startY: null, dragging: false });
  const stateRef = useRef({ items, room, globalDimensions, camera, onItemMove, onDragEnd, onSnapChange, onSnapResultChange });
  stateRef.current = { items, room, globalDimensions, camera, onItemMove, onDragEnd, onSnapChange, onSnapResultChange };

  // Listeners attach ONCE and read the live drag id from a ref, so a move is
  // tracked from the first pointermove regardless of React render timing.
  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (e: PointerEvent) => {
      const id = draggedIdRef.current;
      if (!id) return;
      const s = stateRef.current;
      const draggedItem = s.items.find((i) => i.instanceId === id);
      if (!draggedItem) return;
      const dr = dragRef.current;
      if (dr.startX === null) { dr.startX = e.clientX; dr.startY = e.clientY; }
      if (!dr.dragging) {
        if (Math.hypot(e.clientX - dr.startX, e.clientY - (dr.startY ?? e.clientY)) < 5) return;
        dr.dragging = true;
      }
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), s.camera);
      const target = new THREE.Vector3();
      if (!raycaster.current.ray.intersectPlane(plane.current, target)) return;
      const snapResult = calculateSnapPosition(
        target.x * 1000,
        target.z * 1000,
        draggedItem,
        s.items,
        s.room,
        SNAP_INCREMENT,
        s.globalDimensions,
      );
      s.onSnapChange({ snappedToItemId: snapResult.snappedItemId || null, snapEdge: snapResult.snapEdge });
      s.onSnapResultChange?.(snapResult);
      s.onItemMove(id, { x: snapResult.x, z: snapResult.z, rotation: snapResult.rotation });
    };

    const onUp = () => {
      dragRef.current = { startX: null, startY: null, dragging: false };
      if (draggedIdRef.current) {
        draggedIdRef.current = null;
        const s = stateRef.current;
        s.onDragEnd?.();
        s.onSnapChange({ snappedToItemId: null, snapEdge: undefined });
        s.onSnapResultChange?.(null);
      }
    };

    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onUp);
    };
  }, [gl, draggedIdRef]);

  return null;
}

// No ItemMesh component needed - we use CabinetMesh, ApplianceMesh, StructureMesh directly

// Camera controller
function CameraController({
  room,
  controlsRef,
  viewMode,
  isInteracting,
  onControlsReady,
}: {
  room: RoomConfig;
  controlsRef: React.MutableRefObject<any>;
  viewMode: '2d' | '3d';
  isInteracting: boolean;
  /** Fires when OrbitControls (re)mounts — lets the parent (re)register the
      toolbar camera API. Without this the registration effect can run before
      the controls exist and the zoom/view buttons are silently dead. */
  onControlsReady?: (ready: boolean) => void;
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
      {viewMode === '3d' ? (
        <PerspectiveCamera makeDefault position={[widthM * 1.5, 5, depthM * 1.5]} fov={45} />
      ) : (
        <OrthographicCamera makeDefault position={[widthM / 2, 10, depthM / 2]} zoom={50} near={0.1} far={100} rotation={[-Math.PI / 2, 0, 0]} />
      )}
      <OrbitControls
        ref={(c: unknown) => { controlsRef.current = c; onControlsReady?.(Boolean(c)); }}
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
        enablePan
        screenSpacePanning
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: viewMode === '3d' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
        }}
      />
    </>
  );
}

// Frames the room/cabinets once the camera + OrbitControls are actually ready,
// and again whenever the 2D/3D view changes. Runs INSIDE the Canvas so it can
// rely on useThree() — this is what stops the planner opening to a blank view.
function SceneAutoFit({ itemsRef, room, viewMode }: { itemsRef: React.MutableRefObject<PlacedItem[]>; room: RoomConfig; viewMode: '2d' | '3d' }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls as any);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!controls || !camera) return;
    const id = requestAnimationFrame(() => {
      const widthM = room.width / 1000;
      const depthM = room.depth / 1000;
      const bbox = new THREE.Box3();
      (itemsRef.current || []).forEach((item) => {
        const halfW = (item.width || 0) / 2000;
        const halfD = (item.depth || 0) / 2000;
        const h = (item.height || 0) / 1000;
        bbox.expandByPoint(new THREE.Vector3(item.x / 1000 - halfW, item.y / 1000, item.z / 1000 - halfD));
        bbox.expandByPoint(new THREE.Vector3(item.x / 1000 + halfW, item.y / 1000 + h, item.z / 1000 + halfD));
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
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const cam = camera as any;
      if (cam.isPerspectiveCamera) {
        const distance = maxDim / Math.tan((cam.fov * Math.PI) / 360);
        const direction = new THREE.Vector3(-1, 0.8, 1).normalize();
        cam.position.copy(center).addScaledVector(direction, distance * 1.5);
      } else {
        // 2D plan: camera straight above the centre, azimuth zeroed so the
        // floor plan is always axis-aligned (never rotated on screen).
        cam.position.set(center.x, 10, center.z + 0.0001);
        cam.zoom = Math.min(50 / (maxDim / 4), 200);
        cam.updateProjectionMatrix();
      }
      controls.update?.();
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [viewMode, controls, camera, room, itemsRef, invalidate]);
  return null;
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
  onItemEdit,
  onItemAdd,
  onDragStart,
  onDragEnd,
  onDragConfirm,
  dragState,
  is3D = true,
  viewMode: viewModeProp,
  showDebugOverlay = false,
  doorsOpen,
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
  // Flips when OrbitControls (re)mounts so the camera-API registration effect
  // re-runs — without it the toolbar camera buttons stay dead after load.
  const [controlsReady, setControlsReady] = useState(false);
  const controlsRef = useRef<any>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Set synchronously on cabinet press so the (always-on) drag listener can
  // move on the very first pointermove — no waiting for a React re-render.
  const draggedIdSyncRef = useRef<string | null>(null);

  const viewMode = viewModeProp || (is3D ? '3d' : '2d');

  // Frame the whole room/cabinets in view. Shared by the toolbar "fit" button
  // and the automatic fit on load / view-toggle — this is what stops the
  // planner from opening to a blank wall.
  const fitView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const widthM = room.width / 1000;
    const depthM = room.depth / 1000;
    const bbox = new THREE.Box3();
    itemsRef.current.forEach(item => {
      const halfW = (item.width || 0) / 2000;
      const halfD = (item.depth || 0) / 2000;
      const h = (item.height || 0) / 1000;
      bbox.expandByPoint(new THREE.Vector3(item.x / 1000 - halfW, item.y / 1000, item.z / 1000 - halfD));
      bbox.expandByPoint(new THREE.Vector3(item.x / 1000 + halfW, item.y / 1000 + h, item.z / 1000 + halfD));
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
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    if (camera.isPerspectiveCamera) {
      const distance = maxDim / Math.tan((camera.fov * Math.PI) / 360);
      const direction = new THREE.Vector3(-1, 0.8, 1).normalize();
      camera.position.copy(center).addScaledVector(direction, distance * 1.5);
    } else {
      camera.zoom = Math.min(50 / (maxDim / 4), 200);
      camera.updateProjectionMatrix();
    }
    controls.update();
  }, [room]);

  // Auto-fit is handled by <SceneAutoFit/> inside the Canvas, which fires once
  // the camera + OrbitControls are actually ready (and on every view change).

  // Escape: drop any armed drag and clear the selection — a predictable
  // bail-out when the pointer is over the wrong cabinet.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      draggedIdSyncRef.current = null;
      onDragEnd?.();
      onItemSelect(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onDragEnd, onItemSelect]);

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

  // Expose camera controls to parent — re-runs when OrbitControls (re)mounts
  // (controlsReady flips on 2D/3D switches too, keeping the API fresh).
  useEffect(() => {
    if (onCameraControlsReady && controlsReady && controlsRef.current) {
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
        fitAll: fitView,
        // WS8: camera view presets. Front = kitchen elevation (door/drawer
        // faces visible without learning right-drag orbit), Top = plan,
        // Corner = the standard iso used by fitAll. Resolve the controls at
        // CALL time — the effect's captured camera goes stale after a 2D/3D
        // switch (same pattern as fitView).
        setView: (preset: 'front' | 'top' | 'corner') => {
          const liveControls = controlsRef.current;
          if (!liveControls) return;
          const cam = liveControls.object;
          const heightM = (room.height || 2400) / 1000;
          const maxDim = Math.max(widthM, depthM, heightM) || 1;
          if (cam.isPerspectiveCamera) {
            const distance = (maxDim / Math.tan((cam.fov * Math.PI) / 360)) * 1.1;
            if (preset === 'front') {
              // Elevation view perpendicular to the wall holding the most
              // cabinets (rotation 0 = back wall, 90 = left, 180 = front,
              // 270 = right), from bench height.
              const counts: Record<number, number> = { 0: 0, 90: 0, 180: 0, 270: 0 };
              for (const it of itemsRef.current ?? []) {
                if (it.itemType !== 'Cabinet') continue;
                const r = ((Math.round(it.rotation ?? 0) % 360) + 360) % 360;
                if (r in counts) counts[r] += 1;
              }
              const dominant = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
              const DIR: Record<number, [number, number, number]> = {
                0: [0, 0, 1], 90: [1, 0, 0], 180: [0, 0, -1], 270: [-1, 0, 0],
              };
              const d = DIR[dominant] ?? DIR[0];
              const target = new THREE.Vector3(widthM / 2, heightM * 0.45, depthM / 2);
              cam.position.set(
                widthM / 2 + d[0] * distance,
                heightM * 0.5,
                depthM / 2 + d[2] * distance,
              );
              liveControls.target.copy(target);
            } else if (preset === 'top') {
              // Nearly straight down (tiny z offset keeps OrbitControls stable).
              cam.position.set(widthM / 2, distance * 1.1, depthM / 2 + 0.01);
              liveControls.target.set(widthM / 2, 0, depthM / 2);
            } else {
              const center = new THREE.Vector3(widthM / 2, heightM * 0.35, depthM / 2);
              cam.position.copy(center).addScaledVector(new THREE.Vector3(-1, 0.8, 1).normalize(), distance);
              liveControls.target.copy(center);
            }
          } else {
            // Orthographic (2D plan) camera: presets just re-centre overhead.
            cam.position.set(widthM / 2, 10, depthM / 2);
            cam.zoom = 50;
            cam.updateProjectionMatrix();
            liveControls.target.set(widthM / 2, 0, depthM / 2);
          }
          liveControls.update();
        },
      });
    }
  }, [onCameraControlsReady, room, items, fitView, controlsReady]);

  const widthM = room.width / 1000;
  const depthM = room.depth / 1000;
  const heightM = room.height / 1000;
  const wt = WALL_THICKNESS / 1000;

  const draggedItem = draggedItemId ? items.find(i => i.instanceId === draggedItemId) || null : null;
  const isInteracting = !!draggedItemId || !!placementItemId;
  const cursorStyle = placementItemId ? 'crosshair' : draggedItemId ? 'grabbing' : 'auto';

  const handleDragStart = useCallback((id: string, x: number, z: number) => {
    // Left-drag moves a cabinet in BOTH 2D and 3D. Orbit lives on the right
    // mouse button so it never competes with moving.
    draggedIdSyncRef.current = id;
    onDragStart?.(id);
  }, [onDragStart]);

  return (
    <Canvas shadows dpr={[1, 2]} className="w-full h-full" style={{ cursor: cursorStyle, background: 'linear-gradient(to bottom, #f8fafc, #e2e8f0)' }}
      onPointerMissed={() => { if (!placementItemId && !draggedItemId) onItemSelect(null); }}>
      <CameraController controlsRef={controlsRef} room={room} viewMode={viewMode} isInteracting={isInteracting} onControlsReady={setControlsReady} />
      <SceneAutoFit itemsRef={itemsRef} room={room} viewMode={viewMode} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={[0xffffff, 0xbfc4cc, 0.55]} />
      <directionalLight position={[6, 10, 6]} intensity={1.0} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
      <directionalLight position={[-6, 6, -4]} intensity={0.35} />

      {/* Optional scene enhancements (can fail on some GPUs / networks) */}
      <ErrorBoundary fallback={null}>
        <Environment preset="apartment" blur={0.8} background={false} />
        <ContactShadows resolution={1024} scale={Math.max(widthM, depthM) * 2} blur={2} opacity={0.4} far={10} color="#000000" />
      </ErrorBoundary>
      
      <DropZone items={items} room={room} globalDimensions={globalDimensions} catalog={catalog} onItemAdd={onItemAdd} />
      <DragManager 
        items={items}
        draggedIdRef={draggedIdSyncRef}
        room={room}
        globalDimensions={globalDimensions}
        onItemMove={onItemMove}
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

      <group>
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

        {/* Walls - four walls forming room perimeter */}
        {/* Back wall (along X axis at z = -wt/2) */}
        <Wall 
          position={[widthM / 2, heightM / 2, -wt / 2]} 
          rotation={[0, 0, 0]} 
          width={widthM + wt * 2} 
          height={heightM} 
          thickness={wt}
          roomCenter={[widthM / 2, 0, depthM / 2]}
        />
        {/* Left wall (along Z axis at x = -wt/2) */}
        <Wall 
          position={[-wt / 2, heightM / 2, depthM / 2]} 
          rotation={[0, Math.PI / 2, 0]} 
          width={depthM + wt * 2} 
          height={heightM} 
          thickness={wt}
          roomCenter={[widthM / 2, 0, depthM / 2]}
        />
        {/* Right wall (along Z axis at x = widthM + wt/2) - optional, can be disabled */}
        <Wall 
          position={[widthM + wt / 2, heightM / 2, depthM / 2]} 
          rotation={[0, Math.PI / 2, 0]} 
          width={depthM + wt * 2} 
          height={heightM} 
          thickness={wt}
          roomCenter={[widthM / 2, 0, depthM / 2]}
          fadeWhenBlocking
        />
        {/* Front wall (along X axis at z = depthM + wt/2) - typically open but shown faded */}
        <Wall 
          position={[widthM / 2, heightM / 2, depthM + wt / 2]} 
          rotation={[0, 0, 0]} 
          width={widthM + wt * 2} 
          height={heightM} 
          thickness={wt}
          roomCenter={[widthM / 2, 0, depthM / 2]}
          fadeWhenBlocking
        />
        {/* Corners */}
        <WallCorner position={[-wt / 2, heightM / 2, -wt / 2]} height={heightM} thickness={wt} roomCenter={[widthM / 2, 0, depthM / 2]} />
        <WallCorner position={[widthM + wt / 2, heightM / 2, -wt / 2]} height={heightM} thickness={wt} roomCenter={[widthM / 2, 0, depthM / 2]} />

        {room.shape === 'LShape' && (
          <>
            <Wall 
              position={[room.cutoutWidth / 1000 + wt / 2, heightM / 2, (depthM + (room.depth - room.cutoutDepth) / 1000) / 2]} 
              rotation={[0, Math.PI / 2, 0]} 
              width={(depthM - (room.depth - room.cutoutDepth) / 1000)} 
              height={heightM} 
              thickness={wt}
              roomCenter={[widthM / 2, 0, depthM / 2]}
            />
            <Wall 
              position={[(room.cutoutWidth / 1000 + widthM + wt) / 2, heightM / 2, (room.depth - room.cutoutDepth) / 1000 - wt / 2]} 
              rotation={[0, 0, 0]} 
              width={widthM - room.cutoutWidth / 1000 + wt} 
              height={heightM} 
              thickness={wt}
              roomCenter={[widthM / 2, 0, depthM / 2]}
            />
            <WallCorner
              position={[room.cutoutWidth / 1000, heightM / 2, (room.depth - room.cutoutDepth) / 1000]}
              height={heightM}
              thickness={wt}
              roomCenter={[widthM / 2, 0, depthM / 2]}
            />
          </>
        )}

        {/* Doors, windows and walkways on the interior wall faces */}
        <RoomOpenings room={room} />

        {/* Plumbing / power / gas / ducting markers on the walls */}
        <RoomServices room={room} />

        {/* Render items using proper component dispatch */}
        {items.map(item => {
          const key = item.instanceId;
          const commonProps = {
            isSelected: selectedItemId === item.instanceId,
            isDragged: draggedItemId === item.instanceId,
            onSelect: onItemSelect,
            onDragStart: handleDragStart,
          };
          
          if (item.itemType === 'Appliance') {
            return (
              <ApplianceMesh 
                key={key} 
                item={item} 
                globalDimensions={globalDimensions}
                {...commonProps}
              />
            );
          }
          if (item.itemType === 'Structure') {
            return (
              <StructureMesh 
                key={key} 
                item={item} 
                {...commonProps}
              />
            );
          }
          // Default: Cabinet
          // Resolve finish/handle from item properties if available
          const itemFinish = item.finishColor 
            ? FINISH_OPTIONS.find(f => f.id === item.finishColor) 
            : undefined;
          const itemHandle = item.handleType
            ? { handleId: item.handleType, handleColor: item.handleColor }
            : undefined;
          
          return (
            <CabinetMesh
              key={key}
              item={item}
              globalDimensions={globalDimensions}
              selectedFinish={itemFinish}
              hardwareOptions={itemHandle}
              doorsOpen={doorsOpen}
              onEdit={onItemEdit}
              {...commonProps}
            />
          );
        })}

        {/* Placement ghost */}
        {placementItemId && (
          <PlacementGhost
            position={placementState.position}
            rotation={placementState.rotation}
            isValid={placementState.isValid}
            placementItemId={placementItemId}
            globalDimensions={globalDimensions}
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
        <SmartDimensions
          items={items}
          selectedItemId={selectedItemId}
          draggedItemId={draggedItemId}
          room={room}
        />

        {/* Interaction handles */}
        <InteractionHandles
          items={items}
          selectedItemId={selectedItemId}
          onItemMove={onItemMove}
          viewMode={viewMode}
        />

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
