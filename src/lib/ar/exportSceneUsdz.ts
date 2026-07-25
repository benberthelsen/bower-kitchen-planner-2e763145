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
import { itemRect } from '@/lib/layout';

export interface ExportOptions {
  onProgress?: (msg: string) => void;
}

const FINISH_COLOR = {
  cabinet: 0xd8cfc0,
  benchtop: 0xb5b7ba,
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

  // Materials — reuse per finish to keep the USDZ small.
  const cabinetMat = new THREE.MeshStandardMaterial({ color: FINISH_COLOR.cabinet, roughness: 0.7, metalness: 0.05 });
  const applianceMat = new THREE.MeshStandardMaterial({ color: FINISH_COLOR.appliance, roughness: 0.35, metalness: 0.6 });

  const loader = new GLTFLoader();

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
        g.traverse((n: any) => {
          if (n.isMesh) {
            const orig = n.material;
            const color = (orig?.color && orig.color.isColor) ? orig.color.getHex() : FINISH_COLOR.appliance;
            n.material = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.5 });
          }
        });
        const box = new THREE.Box3().setFromObject(g);
        const size = new THREE.Vector3();
        box.getSize(size);
        const sx = size.x > 1e-4 ? w / size.x : 1;
        const sy = size.y > 1e-4 ? h / size.y : 1;
        const sz = size.z > 1e-4 ? d / size.z : 1;
        g.scale.set(sx, sy, sz);
        g.position.set(cx - ((box.min.x + box.max.x) / 2) * sx, item.y / 1000 - box.min.y * sy, cz - ((box.min.z + box.max.z) / 2) * sz);
        scene.add(g);
        continue;
      } catch {
        // fall through to box
      }
    }

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isAppliance ? applianceMat : cabinetMat);
    mesh.position.set(cx, item.y / 1000 + h / 2, cz);
    scene.add(mesh);
  }

  options.onProgress?.('Encoding USDZ…');
  const exporter = new USDZExporter();
  const arr = await (exporter as any).parse(scene);
  return new Blob([arr], { type: 'model/vnd.usdz+zip' });
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
