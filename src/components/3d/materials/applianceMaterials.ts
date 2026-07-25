/**
 * applianceMaterials — shared PBR material presets for appliances.
 *
 * All materials are cached (one instance per preset) so they can be reused
 * across every ApplianceMesh / AppliancePlaceholder / ApplianceModel / Android
 * AR renderer without churn. Never create these per-frame or per-item.
 *
 * Roughness maps are generated procedurally on a canvas in the same style as
 * `src/utils/textureGenerator.ts` — no image assets. A brushed-metal preset
 * gets a horizontally-striped low-contrast map to fake anisotropy.
 */
import * as THREE from 'three';

export type ApplianceFinishKey =
  | 'stainless'          // brushed stainless steel — sinks, oven / DW / fridge bodies
  | 'blackGlass'         // ceramic cooktops, oven door glass
  | 'matteBlack'         // black taps, matte black bodies
  | 'chrome'             // chrome mixer taps
  | 'brushedGunmetal'    // brushed gunmetal taps, dark stainless
  | 'whiteEnamel'        // white enamel appliance bodies
  | 'darkStainless';     // dark grey stainless (fallback body)

const cache = new Map<ApplianceFinishKey, THREE.MeshStandardMaterial>();
const textureCache = new Map<string, THREE.CanvasTexture>();

function canUseCanvas(): boolean {
  return typeof document !== 'undefined' && !!document.createElement('canvas').getContext;
}

/** Horizontally-striped low-contrast noise → "brushed metal" roughness map. */
function brushedRoughnessTexture(direction: 'horizontal' | 'vertical' = 'horizontal'): THREE.CanvasTexture | null {
  const key = `brushed_${direction}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!canUseCanvas()) return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const along = direction === 'horizontal' ? x : y;
      // Fine brush lines running along `along`, with mild cross-noise.
      const line = Math.sin(along * 1.3 + Math.random() * 0.4) * 8;
      const noise = (Math.random() - 0.5) * 12;
      const v = Math.max(0, Math.min(255, 150 + line + noise));
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  textureCache.set(key, tex);
  return tex;
}

function subtleNoiseRoughness(): THREE.CanvasTexture | null {
  const key = 'noise';
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!canUseCanvas()) return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 120 + Math.random() * 40;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, tex);
  return tex;
}

function build(key: ApplianceFinishKey): THREE.MeshStandardMaterial {
  switch (key) {
    case 'stainless': {
      const m = new THREE.MeshStandardMaterial({ color: 0xd9dde0, metalness: 0.9, roughness: 0.32 });
      const r = brushedRoughnessTexture('horizontal'); if (r) m.roughnessMap = r;
      return m;
    }
    case 'darkStainless': {
      const m = new THREE.MeshStandardMaterial({ color: 0x8a97a6, metalness: 0.85, roughness: 0.38 });
      const r = brushedRoughnessTexture('horizontal'); if (r) m.roughnessMap = r;
      return m;
    }
    case 'brushedGunmetal': {
      const m = new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.85, roughness: 0.42 });
      const r = brushedRoughnessTexture('vertical'); if (r) m.roughnessMap = r;
      return m;
    }
    case 'chrome': {
      return new THREE.MeshStandardMaterial({ color: 0xf1f3f5, metalness: 1.0, roughness: 0.05 });
    }
    case 'blackGlass': {
      const m = new THREE.MeshStandardMaterial({ color: 0x0f0f11, metalness: 0.2, roughness: 0.12 });
      const r = subtleNoiseRoughness(); if (r) m.roughnessMap = r;
      return m;
    }
    case 'matteBlack': {
      return new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.15, roughness: 0.85 });
    }
    case 'whiteEnamel': {
      return new THREE.MeshStandardMaterial({ color: 0xf7f7f5, metalness: 0.05, roughness: 0.35 });
    }
  }
}

export function getApplianceMaterial(key: ApplianceFinishKey): THREE.MeshStandardMaterial {
  const hit = cache.get(key);
  if (hit) return hit;
  const m = build(key);
  cache.set(key, m);
  return m;
}

/** Map a product's `finish` free-text string onto a preset; null when unknown so callers can fall back. */
export function resolveFinishKey(finish: string | null | undefined): ApplianceFinishKey | null {
  if (!finish) return null;
  const f = finish.toLowerCase();
  if (/(chrome|polished)/.test(f)) return 'chrome';
  if (/(gun\s*metal|gunmetal|graphite)/.test(f)) return 'brushedGunmetal';
  if (/(matte\s*black|matt\s*black|black\s*matte)/.test(f)) return 'matteBlack';
  if (/(black\s*glass|ceramic|induction|black)/.test(f)) return f.includes('black glass') || f.includes('ceramic') ? 'blackGlass' : 'matteBlack';
  if (/(white|enamel|ivory)/.test(f)) return 'whiteEnamel';
  if (/(dark\s*stainless|dark\s*steel)/.test(f)) return 'darkStainless';
  if (/(stainless|steel|inox|brushed)/.test(f)) return 'stainless';
  return null;
}
