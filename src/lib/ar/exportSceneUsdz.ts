/**
 * exportSceneUsdz — build a USDZ file of the current kitchen for Apple Quick Look.
 *
 * Lazily imports three's USDZExporter so it never lands in the main chunk.
 * Given a list of PlacedItems and the appliance catalog map (id → product),
 * we build a bakeable three.js scene:
 *   - Every cabinet / structure item is a simple Box mesh with MeshStandardMaterial
 *     (USDZExporter can't handle custom shaders or transparency tricks).
 *   - Appliance items with a GLB URL load and merge via GLTFLoader; anything
 *     else uses a labelled box in the appliance finish colour.
 * Units are metres, Y-up, real-world scale so it opens life-size in Quick Look.
 */

import type { PlacedItem } from '@/types';
import type { Mesh as ThreeMesh, MeshStandardMaterial as ThreeMeshStandardMaterial, Object3D } from 'three';
import { itemRect } from '@/lib/layout';
import { configureApplianceGltfLoader } from '@/components/3d/ApplianceModel';
import { isBenchtopInsetAppliance } from '@/components/3d/applianceClassification';
import {
  createArSurfaceMaterial,
  disposeArMaterial,
  loadArSurfaceTexture,
  resolveArSurfaceSelection,
  shouldAddArBenchtop,
} from './surfaceMaterials';

export interface ExportOptions {
  onProgress?: (msg: string) => void;
  finishId?: string;
  benchtopId?: string;
  benchtopThicknessMm?: number;
  benchtopOverhangMm?: number;
}

const FINISH_COLOR = {
  appliance: 0x8a97a6,
} as const;

export async function exportSceneUsdz(
  items: PlacedItem[],
  options: ExportOptions = {},
): Promise<Blob> {
  options.onProgress?.('Loading exporter…');
  const [THREE, { USDZExporter }, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/exporters/USDZExporter.js'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ]);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  const surfaces = resolveArSurfaceSelection(options.finishId, options.benchtopId);
  options.onProgress?.('Loading selected surfaces…');
  const [cabinetTexture, benchtopTexture] = await Promise.all([
    loadArSurfaceTexture(surfaces.cabinet),
    loadArSurfaceTexture(surfaces.benchtop),
  ]);
  const applianceMat = new THREE.MeshStandardMaterial({ color: FINISH_COLOR.appliance, roughness: 0.35, metalness: 0.6 });

  const loader = new GLTFLoader();
  configureApplianceGltfLoader(loader);

  options.onProgress?.('Building scene…');
  for (const item of items) {
    const r = itemRect(item);
    const w = Math.max(0.02, (r.maxX - r.minX) / 1000);
    const d = Math.max(0.02, (r.maxZ - r.minZ) / 1000);
    const h = Math.max(0.02, item.height / 1000);
    const cx = (r.minX + r.maxX) / 2000;
    const cz = (r.minZ + r.maxZ) / 2000;
    const isAppliance = item.itemType === 'Appliance';
    const modelUrl = isAppliance ? item.applianceSnapshot?.modelUrl ?? null : null;

    if (modelUrl) {
      try {
        options.onProgress?.(`Loading ${item.applianceSnapshot?.name ?? 'appliance'}…`);
        const gltf = await loader.loadAsync(modelUrl);
        const g = gltf.scene;
        // Bake to MeshStandardMaterial; strip anything USDZ can't handle.
        g.traverse((n: Object3D) => {
          const mesh = n as ThreeMesh;
          if (!mesh.isMesh) return;
          const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const material = original as ThreeMeshStandardMaterial | undefined;
          const color = material?.color?.isColor ? material.color.getHex() : FINISH_COLOR.appliance;
          mesh.material = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.5 });
          if (original) disposeArMaterial(original);
        });
        const box = new THREE.Box3().setFromObject(g);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetW = Math.max(0.02, item.width / 1000);
        const targetH = Math.max(0.02, item.height / 1000);
        const targetD = Math.max(0.02, item.depth / 1000);
        const sx = size.x > 1e-4 ? targetW / size.x : 1;
        const sy = size.y > 1e-4 ? targetH / size.y : 1;
        const sz = size.z > 1e-4 ? targetD / size.z : 1;
        const centerX = (box.min.x + box.max.x) / 2;
        const centerZ = (box.min.z + box.max.z) / 2;
        const inset = isBenchtopInsetAppliance(item, null);
        const anchorY = inset ? (box.min.y + box.max.y) / 2 : box.min.y;
        g.position.set(-centerX * sx, -anchorY * sy, -centerZ * sz);
        g.scale.set(sx, sy, sz);
        const wrapper = new THREE.Group();
        wrapper.position.set(item.x / 1000, item.y / 1000, item.z / 1000);
        wrapper.rotation.set(0, -THREE.MathUtils.degToRad(item.rotation), 0);
        wrapper.add(g);
        scene.add(wrapper);
        continue;
      } catch {
        // fall through to box
      }
    }

    const surface = item.itemType === 'Structure' ? surfaces.benchtop : surfaces.cabinet;
    const surfaceTexture = item.itemType === 'Structure' ? benchtopTexture : cabinetTexture;
    const material = isAppliance
      ? applianceMat
      : createArSurfaceMaterial(surface, surfaceTexture, w, h);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(cx, item.y / 1000 + h / 2, cz);
    scene.add(mesh);

    if (shouldAddArBenchtop(item)) {
      const thickness = Math.max(0.02, (options.benchtopThicknessMm ?? 33) / 1000);
      const overhang = Math.max(0, (options.benchtopOverhangMm ?? 25) / 1000);
      const benchW = w + overhang * 2;
      const benchD = d + overhang * 2;
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(benchW, thickness, benchD),
        createArSurfaceMaterial(surfaces.benchtop, benchtopTexture, benchW, benchD, true),
      );
      bench.position.set(cx, item.y / 1000 + h + thickness / 2, cz);
      scene.add(bench);
    }
  }

  options.onProgress?.('Encoding USDZ…');
  const exporter = new USDZExporter();
  try {
    const arr = await exporter.parse(scene, { quickLookCompatible: true, maxTextureSize: 1024 });
    return new Blob([arr as unknown as BlobPart], { type: 'model/vnd.usdz+zip' });
  } finally {
    scene.traverse((object) => {
      const mesh = object as ThreeMesh;
      mesh.geometry?.dispose();
      if (mesh.material && mesh.material !== applianceMat) disposeArMaterial(mesh.material);
    });
    applianceMat.dispose();
    cabinetTexture?.dispose();
    benchtopTexture?.dispose();
  }
}

/** iOS + iPadOS test — the only platforms Quick Look works on. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac; sniff maxTouchPoints as the standard tell.
  return /Mac/.test(ua) && (navigator as any).maxTouchPoints > 1;
}

/** Trigger Apple Quick Look by clicking a synthetic <a rel="ar"> wrapping an <img>. */
export function openQuickLook(blobUrl: string) {
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = blobUrl;
  const img = document.createElement('img');
  img.alt = 'kitchen';
  a.appendChild(img);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}
