import * as THREE from 'three';
import { BENCHTOP_OPTIONS, FINISH_OPTIONS } from '@/constants';
import type { MaterialOption, PlacedItem } from '@/types';
import {
  cloneTextureForSurface,
  setPhysicalTextureSize,
} from '@/components/3d/materials/physicalTexture';

export interface ArSurfaceSelection {
  cabinet: MaterialOption;
  benchtop: MaterialOption;
}

export function resolveArSurfaceSelection(
  finishId?: string | null,
  benchtopId?: string | null,
): ArSurfaceSelection {
  return {
    cabinet: FINISH_OPTIONS.find((option) => option.id === finishId) ?? FINISH_OPTIONS[0],
    benchtop: BENCHTOP_OPTIONS.find((option) => option.id === benchtopId) ?? BENCHTOP_OPTIONS[0],
  };
}

/** Base cabinets and low appliance openings carry a benchtop in the planner. */
export function shouldAddArBenchtop(item: PlacedItem): boolean {
  if (item.itemType !== 'Cabinet' && item.itemType !== 'Appliance') return false;
  return item.y < 100 && item.height >= 500 && item.height <= 1200;
}

export async function loadArSurfaceTexture(
  option: MaterialOption,
): Promise<THREE.Texture | null> {
  if (!option.textureUrl) return null;
  try {
    const texture = await new THREE.TextureLoader().loadAsync(option.textureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    setPhysicalTextureSize(texture, option.textureRepeatMm);
    return texture;
  } catch {
    return null;
  }
}

export function createArSurfaceMaterial(
  option: MaterialOption,
  sourceTexture: THREE.Texture | null,
  widthM: number,
  heightM: number,
  rotateQuarterTurn = false,
): THREE.MeshStandardMaterial {
  const map = cloneTextureForSurface(sourceTexture, widthM, heightM, { rotateQuarterTurn });
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    color: option.hex,
    roughness: option.roughness ?? 0.55,
    metalness: option.metalness ?? 0,
    map,
  });
}

/**
 * Three's BoxGeometry face order is right, left, top, bottom, front, back.
 * Give every face a physical-size-aware texture instead of stretching one
 * supplier sample differently across every cabinet.
 */
export function createArBoxMaterials(
  option: MaterialOption,
  sourceTexture: THREE.Texture | null,
  widthM: number,
  heightM: number,
  depthM: number,
): THREE.MeshStandardMaterial[] {
  const sideA = createArSurfaceMaterial(option, sourceTexture, depthM, heightM);
  const sideB = createArSurfaceMaterial(option, sourceTexture, depthM, heightM);
  const top = createArSurfaceMaterial(option, sourceTexture, widthM, depthM, true);
  const bottom = createArSurfaceMaterial(option, sourceTexture, widthM, depthM, true);
  const front = createArSurfaceMaterial(option, sourceTexture, widthM, heightM);
  const back = createArSurfaceMaterial(option, sourceTexture, widthM, heightM);
  return [sideA, sideB, top, bottom, front, back];
}

export function disposeArMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    const mapped = entry as THREE.MeshStandardMaterial;
    mapped.map?.dispose();
    entry.dispose();
  }
}
