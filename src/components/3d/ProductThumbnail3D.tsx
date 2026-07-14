import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CatalogItemDefinition, PlacedItem } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { defaultCornerArmDepth } from '@/lib/cornerDefaults';
import CabinetMesh from './CabinetMesh';
import ApplianceMesh from './ApplianceMesh';
import StructureMesh from './StructureMesh';

/**
 * Product3DThumbnail — renders the REAL 3D cabinet model for a catalog
 * product to a cached PNG, so catalogue tiles show the actual cabinet
 * (doors, drawers, corner notches, benchtop) instead of a generic icon.
 *
 * Implementation: a single hidden Canvas (the "factory") processes a queue
 * of products one at a time, snapshots each after a few frames, and caches
 * the data-URL for the session. Components show a fallback until ready.
 */

// ---------- module-level cache & queue ----------
const cache = new Map<string, string>();
const listeners = new Map<string, Set<(url: string) => void>>();
const queue: CatalogItemDefinition[] = [];
let factoryMounted = false;
let kickFactory: (() => void) | null = null;

function requestThumbnail(product: CatalogItemDefinition, cb: (url: string) => void): () => void {
  const key = product.id;
  const hit = cache.get(key);
  if (hit) {
    cb(hit);
    return () => {};
  }
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  if (!queue.some(p => p.id === key)) {
    queue.push(product);
    kickFactory?.();
  }
  return () => listeners.get(key)?.delete(cb);
}

function resolveThumbnail(key: string, url: string) {
  if (url) cache.set(key, url);
  listeners.get(key)?.forEach(cb => cb(url));
  listeners.delete(key);
}

// ---------- helpers ----------
function makeThumbItem(p: CatalogItemDefinition): PlacedItem {
  const dims = DEFAULT_GLOBAL_DIMENSIONS;
  let depth = p.defaultDepth || 575;
  if (p.itemType === 'Cabinet') {
    if (p.category === 'Base') depth = dims.baseDepth;
    else if (p.category === 'Wall') depth = dims.wallDepth;
    else if (p.category === 'Tall') depth = dims.tallDepth;
  }
  const idLower = (p.id || '').toLowerCase();
  const width = p.defaultWidth || 600;
  // L / pie-cut corners need the same construction fields the planner sends the
  // assembler, or they render as a plain box in the tile (while the SVG fallback
  // shows an L). Square footprint + standard arm depths → correct pie-cut render.
  const isLCorner = /corner/.test(idLower) && !/diagonal|blind|open|angle/.test(idLower);
  if (isLCorner) depth = width;
  return {
    instanceId: `thumb-${p.id}`,
    definitionId: p.id,
    itemType: p.itemType,
    x: 0,
    // y must be non-zero so wall cabinets don't auto-elevate to mounting
    // height (we frame the cabinet at the origin)
    y: 0.001,
    z: 0,
    rotation: 0,
    width,
    depth,
    height: p.defaultHeight || 720,
    blindSide: idLower.includes('blind') ? (idLower.includes('right') ? 'Right' : 'Left') : undefined,
    ...(isLCorner ? {
      leftCarcaseDepth: defaultCornerArmDepth(width, depth),
      rightCarcaseDepth: defaultCornerArmDepth(width, depth),
      secondWidth: width,
    } : {}),
  };
}

/**
 * Renders the current product inside ONE persistent Canvas and snapshots it
 * after a few frames. The product is swapped INSIDE the canvas — never
 * remount the Canvas per product, as creating/destroying WebGL contexts in
 * a loop causes "Context Lost" on the main planner viewport.
 */
function FactoryScene({
  product,
  onDone,
}: {
  product: CatalogItemDefinition;
  onDone: (id: string, url: string) => void;
}) {
  const { camera, gl } = useThree();
  const item = React.useMemo(() => makeThumbItem(product), [product]);
  const frames = React.useRef(0);
  const doneFor = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const w = item.width / 1000;
    const h = item.height / 1000;
    const d = item.depth / 1000;
    const maxDim = Math.max(w, h, d);
    const targetY = h / 2;
    camera.position.set(maxDim * 1.5, maxDim * 1.15 + targetY, maxDim * 1.9);
    camera.lookAt(0, targetY, 0);
    frames.current = 0;
  }, [item, camera]);

  useFrame(() => {
    frames.current += 1;
    // Wait enough frames for catalog metadata + procedural textures + shadows to
    // settle before snapshotting, so every tile captures a fully-rendered cabinet
    // (an early grab can produce a blank/partial tile — an inconsistent grid).
    if (frames.current >= 8 && doneFor.current !== product.id) {
      doneFor.current = product.id;
      let url = '';
      try {
        url = gl.domElement.toDataURL('image/png');
      } catch {
        url = '';
      }
      const id = product.id;
      setTimeout(() => onDone(id, url), 0);
    }
  });

  return (
    <group key={product.id}>
      {item.itemType === 'Appliance' ? (
        <ApplianceMesh item={item} globalDimensions={DEFAULT_GLOBAL_DIMENSIONS} />
      ) : item.itemType === 'Structure' ? (
        <StructureMesh item={item} />
      ) : (
        <CabinetMesh item={item} globalDimensions={DEFAULT_GLOBAL_DIMENSIONS} />
      )}
    </group>
  );
}

function ThumbnailFactory() {
  const [current, setCurrent] = useState<CatalogItemDefinition | null>(null);

  useEffect(() => {
    kickFactory = () => setCurrent(prev => prev ?? queue.shift() ?? null);
    kickFactory();
    return () => {
      kickFactory = null;
    };
  }, []);

  const handleDone = React.useCallback((id: string, url: string) => {
    resolveThumbnail(id, url);
    setCurrent(queue.shift() ?? null);
  }, []);

  // Keep the (single) Canvas mounted while there is work; unmount when idle
  if (!current) return null;

  return (
    <div
      style={{ position: 'fixed', left: -9999, top: 0, width: 256, height: 256, pointerEvents: 'none', opacity: 0 }}
      aria-hidden
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        camera={{ fov: 35 }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 6, 4]} intensity={1.1} />
        <directionalLight position={[-4, 3, -2]} intensity={0.35} />
        <FactoryScene product={current} onDone={handleDone} />
      </Canvas>
    </div>
  );
}

// ---------- public component ----------
interface Product3DThumbnailProps {
  product: CatalogItemDefinition;
  className?: string;
  /** Shown while the 3D render is being generated */
  fallback?: React.ReactNode;
}

export function Product3DThumbnail({ product, className, fallback }: Product3DThumbnailProps) {
  const [url, setUrl] = useState<string | null>(() => cache.get(product.id) ?? null);
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    return requestThumbnail(product, u => setUrl(u || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // The first mounted thumbnail hosts the (single) factory
  useEffect(() => {
    if (!factoryMounted) {
      factoryMounted = true;
      setIsLeader(true);
      return () => {
        factoryMounted = false;
      };
    }
  }, []);

  return (
    <>
      {url ? (
        <img src={url} className={className} alt={product.name} draggable={false} loading="lazy" />
      ) : (
        <>{fallback ?? <div className={className} />}</>
      )}
      {isLeader && createPortal(<ThumbnailFactory />, document.body)}
    </>
  );
}

export default Product3DThumbnail;
