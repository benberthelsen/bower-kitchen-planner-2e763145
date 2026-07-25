/**
 * ApplianceModel — Stage 2 GLB renderer for placed appliance-catalog items.
 *
 * Loads the product's `model_url` (or fields snapshotted at placement time)
 * via drei's `useGLTF` with Draco + meshopt decoders. Anything unexpected
 * (missing URL, 404, decode failure, exception in the scene subtree) is
 * caught and silently falls back to the procedural `ApplianceMesh`. That is
 * the Stage 2 non-negotiable: real 3D is additive, never breaks the scene.
 *
 * URL resolution (Stage 2b bug fix): a placed item is allowed to predate
 * a later GLB upload. We prefer the placement snapshot when set, otherwise
 * look the product up in the live catalog by `applianceProductId`. Either
 * way a missing URL cleanly renders the procedural mesh.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import ApplianceMesh from './ApplianceMesh';
import type { PlacedItem, GlobalDimensions } from '../../types';
import { useCatalogItem } from '../../hooks/useCatalog';
import { useApplianceCatalog } from '../../hooks/useApplianceCatalog';
import { handleItemPointerDown } from './selectionGesture';
import { resolveApplianceModelUrl } from './applianceModelUrl';

// ─── Refcounted GLB disposal ───────────────────────────────────────────────
// Two instances of the same product share drei's GLTF cache entry. Clearing
// on the first unmount evicts GPU resources the second instance is still
// using (visible as a vanished/corrupted model). Only clear when the last
// mounted instance for a URL goes away.
const modelRefCounts = new Map<string, number>();
function retainModel(url: string) {
  modelRefCounts.set(url, (modelRefCounts.get(url) ?? 0) + 1);
}
function releaseModel(url: string) {
  const next = (modelRefCounts.get(url) ?? 1) - 1;
  if (next <= 0) {
    modelRefCounts.delete(url);
    try { (useGLTF as unknown as { clear: (u: string | string[]) => void }).clear(url); } catch { /* best-effort */ }
  } else {
    modelRefCounts.set(url, next);
  }
}

interface Props {
  item: PlacedItem;
  globalDimensions?: GlobalDimensions;
  isSelected?: boolean;
  isDragged?: boolean;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, x: number, z: number) => void;
}

// ─── Loader configuration (shared across all instances) ─────────────────────
let dracoLoader: DRACOLoader | null = null;
function getDracoLoader() {
  if (dracoLoader) return dracoLoader;
  try {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  } catch { dracoLoader = null; }
  return dracoLoader;
}

// Shared by the AR path too — see ViewInRoomAr.tsx.
export const configureApplianceGltfLoader = (loader: unknown) => {
  const l = loader as { setDRACOLoader?: (d: DRACOLoader) => void; setMeshoptDecoder?: (d: unknown) => void };
  const d = getDracoLoader();
  if (d && l.setDRACOLoader) l.setDRACOLoader(d);
  if (l.setMeshoptDecoder) l.setMeshoptDecoder(MeshoptDecoder);
};

/** Preload a GLB so it's cached by the time it's placed. Safe to call
 *  repeatedly and safe with bad URLs (drei swallows the preload error). */
export function preloadApplianceModel(url: string | null | undefined) {
  if (!url) return;
  try { useGLTF.preload(url); } catch { /* best-effort */ }
}

// ─── Error boundary: any exception inside falls back to procedural ─────────
class ModelBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hadError: boolean }
> {
  state = { hadError: false };
  static getDerivedStateFromError() { return { hadError: true }; }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[ApplianceModel] fell back to procedural mesh:', err);
  }
  render() { return this.state.hadError ? this.props.fallback : this.props.children; }
}

// ─── Loader inner: reads GLB, normalizes scale, positions on anchor ────────
function GlbInner({ url, item }: { url: string; item: PlacedItem }) {
  const gltf = useGLTF(url, undefined, undefined, configureApplianceGltfLoader);
  const scene = useMemo(() => (gltf.scene ? gltf.scene.clone(true) : null), [gltf.scene]);
  const groupRef = useRef<THREE.Group>(null);

  const targetW = item.width / 1000;
  const targetH = item.height / 1000;
  const targetD = item.depth / 1000;

  const { scale, offset } = useMemo(() => {
    if (!scene) return { scale: [1, 1, 1] as const, offset: [0, 0, 0] as const };
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const sx = size.x > 1e-4 && targetW > 0 ? targetW / size.x : 1;
    const sy = size.y > 1e-4 && targetH > 0 ? targetH / size.y : 1;
    const sz = size.z > 1e-4 && targetD > 0 ? targetD / size.z : 1;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const baseY = box.min.y;
    return {
      scale: [sx, sy, sz] as const,
      offset: [-cx * sx, -baseY * sy, -cz * sz] as const,
    };
  }, [scene, targetW, targetH, targetD]);

  // When this instance unmounts, drop the cached GLB for its URL so long
  // sessions don't accumulate GPU memory for models no longer in the scene.
  // `useGLTF.clear` also frees the underlying geometries/materials.
  useEffect(() => () => {
    try { (useGLTF as unknown as { clear: (u: string | string[]) => void }).clear(url); } catch { /* best-effort */ }
  }, [url]);

  if (!scene) throw new Error('GLB has no scene');

  return (
    <group ref={groupRef} position={offset as unknown as [number, number, number]} scale={scale as unknown as [number, number, number]}>
      <primitive object={scene} />
    </group>
  );
}

// ─── Public component ──────────────────────────────────────────────────────
const ApplianceModel: React.FC<Props> = (props) => {
  const { item, onSelect, onDragStart } = props;
  const def = useCatalogItem(item.definitionId);
  const [hovered, setHovered] = useState(false);
  // URL resolution: snapshot first (never silently swap the customer's model),
  // fall back to the current catalog row so items placed before an upload
  // still render the model uploaded later.
  const { products } = useApplianceCatalog();
  const catalogRow = item.applianceProductId
    ? products.find((p) => p.id === item.applianceProductId)
    : undefined;
  const url = item.applianceSnapshot?.modelUrl ?? catalogRow?.model_url ?? null;

  const fallback = <ApplianceMesh {...props} />;
  if (!url) return fallback;
  // While the catalog definition is loading, don't render nothing (visible
  // pop-in). Show the procedural mesh; the GLB layers in when both are ready.
  if (!def) return fallback;

  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const depthM = item.depth / 1000;
  const posY = (item.y / 1000);
  const position: [number, number, number] = [item.x / 1000, posY, item.z / 1000];

  const handlePointerDown = (e: any) => {
    handleItemPointerDown({
      e,
      itemId: item.instanceId,
      isSelected: props.isSelected ?? false,
      x: item.x,
      z: item.z,
      onSelect,
      onDragStart,
    });
  };

  return (
    <group
      position={position}
      rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]}
      userData={{ itemId: item.instanceId }}
      onPointerDown={handlePointerDown}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {(props.isSelected || hovered || props.isDragged) && (
        <mesh position={[0, heightM / 2, 0]}>
          <boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} />
          <meshBasicMaterial color={props.isDragged ? '#2563eb' : '#3b82f6'} wireframe opacity={0.5} transparent />
        </mesh>
      )}
      <ModelBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <GlbInner url={url} item={item} />
        </Suspense>
      </ModelBoundary>
    </group>
  );
};

export default ApplianceModel;
