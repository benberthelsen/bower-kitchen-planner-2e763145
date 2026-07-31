import { useEffect, useState } from 'react';
import * as THREE from 'three';
import {
  setPhysicalTextureSize,
  type PhysicalTextureSizeMm,
} from './physicalTexture';

/**
 * Shared, ref-counted supplier texture cache.
 *
 * Cabinet and appliance benchtops must acquire the same source texture so a
 * continuous run keeps one physical scale and colour treatment across an
 * appliance opening.
 */
interface OptionalTextureEntry {
  texture: THREE.Texture | null;
  loading: boolean;
  retired: boolean;
  refs: number;
  listeners: Set<(texture: THREE.Texture | null) => void>;
}

const optionalTextureCache = new Map<string, OptionalTextureEntry>();

export function useOptionalTexture(
  url?: string | null,
  physicalSizeMm?: PhysicalTextureSizeMm | null,
): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const physicalWidthMm = physicalSizeMm?.width;
  const physicalHeightMm = physicalSizeMm?.height;

  useEffect(() => {
    if (!url) {
      setTex(null);
      return;
    }

    let active = true;
    setTex(null);
    const cacheKey = `${url}|${physicalWidthMm ?? 0}x${physicalHeightMm ?? 0}`;
    const physicalSize = physicalWidthMm && physicalHeightMm
      ? { width: physicalWidthMm, height: physicalHeightMm }
      : null;
    let entry = optionalTextureCache.get(cacheKey);

    if (!entry) {
      entry = {
        texture: null,
        loading: true,
        retired: false,
        refs: 0,
        listeners: new Set(),
      };
      optionalTextureCache.set(cacheKey, entry);
      const loadingEntry = entry;
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        url,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace ?? texture.colorSpace;
          texture.anisotropy = 4;
          setPhysicalTextureSize(texture, physicalSize);
          loadingEntry.loading = false;
          if (loadingEntry.retired || loadingEntry.refs === 0) {
            texture.dispose();
            return;
          }
          loadingEntry.texture = texture;
          loadingEntry.listeners.forEach(listener => listener(texture));
        },
        undefined,
        () => {
          loadingEntry.loading = false;
          loadingEntry.listeners.forEach(listener => listener(null));
        },
      );
    }

    entry.refs += 1;
    const listener = (texture: THREE.Texture | null) => {
      if (active) setTex(texture);
    };
    entry.listeners.add(listener);
    if (entry.texture) setTex(entry.texture);

    return () => {
      active = false;
      entry!.listeners.delete(listener);
      entry!.refs -= 1;
      if (entry!.refs <= 0) {
        entry!.retired = true;
        entry!.texture?.dispose();
        optionalTextureCache.delete(cacheKey);
      }
    };
  }, [url, physicalWidthMm, physicalHeightMm]);

  return tex;
}
