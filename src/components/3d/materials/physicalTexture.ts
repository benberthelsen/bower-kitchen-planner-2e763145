import * as THREE from 'three';

export interface PhysicalTextureSizeMm {
  width: number;
  height: number;
}

const PHYSICAL_SIZE_KEY = 'physicalTextureSizeMm';

export function setPhysicalTextureSize(
  texture: THREE.Texture,
  size?: PhysicalTextureSizeMm | null,
): THREE.Texture {
  if (size?.width && size?.height) {
    texture.userData[PHYSICAL_SIZE_KEY] = { width: size.width, height: size.height };
  }
  return texture;
}

export function getPhysicalTextureSize(texture: THREE.Texture): PhysicalTextureSizeMm | null {
  const value = texture.userData?.[PHYSICAL_SIZE_KEY] as PhysicalTextureSizeMm | undefined;
  return value?.width && value?.height ? value : null;
}

/**
 * Clone a shared source texture for one physical surface without stretching it
 * to fit. Dimensions are metres; supplier texture sizes are millimetres.
 */
export function cloneTextureForSurface(
  source: THREE.Texture | null | undefined,
  widthM: number,
  heightM: number,
  options: { rotateQuarterTurn?: boolean } = {},
): THREE.Texture | null {
  if (!source) return null;
  try {
    const texture = source.clone();
    const physicalSize = getPhysicalTextureSize(source);
    const rotate = options.rotateQuarterTurn ?? false;

    texture.center.set(0.5, 0.5);
    texture.rotation = rotate ? Math.PI / 2 : 0;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    if (physicalSize) {
      const sourceWidthM = physicalSize.width / 1000;
      const sourceHeightM = physicalSize.height / 1000;
      const repeatX = rotate ? heightM / sourceWidthM : widthM / sourceWidthM;
      const repeatY = rotate ? widthM / sourceHeightM : heightM / sourceHeightM;
      texture.repeat.set(Math.max(0.01, repeatX), Math.max(0.01, repeatY));
      texture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);
    } else if (rotate) {
      texture.repeat.set(1, Math.max(1, widthM / Math.max(heightM, 0.01)));
    } else {
      texture.repeat.set(1, Math.max(1, heightM / Math.max(widthM, 0.01)));
    }

    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}

/**
 * Keep a procedural material visible while its supplier texture is loading,
 * then replace only the map. Appliance openings and cabinets use this same
 * rule so a continuous benchtop never falls back to two different colours.
 */
export function withOptionalSurfaceTexture<
  T extends { map: THREE.Texture | null },
>(material: T, supplierTexture: THREE.Texture | null): T {
  return supplierTexture ? { ...material, map: supplierTexture } : material;
}
