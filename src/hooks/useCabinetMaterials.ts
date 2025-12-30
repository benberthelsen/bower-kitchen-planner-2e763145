import { useMemo } from 'react';
import * as THREE from 'three';
import { MaterialOption } from '../types';
import { GrainDirection, getPartGrainDirection } from '../types/cabinetConfig';
import { getProceduralTexture, getWoodTexture, GrainDirection as TextureGrainDirection } from '../utils/textureGenerator';

interface MaterialProps {
  color: string;
  roughness: number;
  metalness: number;
  map: THREE.Texture | null;
}

/**
 * Hook to get material properties with proper grain direction for cabinet parts
 */
export function useCabinetMaterials(
  finishOption: MaterialOption,
  benchtopOption: MaterialOption,
  kickOption: MaterialOption
) {
  // Create texture cache keyed by grain direction
  const textureCache = useMemo(() => new Map<string, THREE.Texture | null>(), []);
  
  // Get texture with specific grain direction
  const getTextureWithGrain = (
    option: MaterialOption,
    grainDirection: TextureGrainDirection
  ): THREE.Texture | null => {
    const cacheKey = `${option.id}_${option.textureType}_${grainDirection}_${option.hex}`;
    
    if (textureCache.has(cacheKey)) {
      return textureCache.get(cacheKey) || null;
    }
    
    let texture: THREE.Texture | null = null;
    
    if (option.textureType === 'wood') {
      // Use grain direction-aware wood texture with tint
      texture = getWoodTexture(grainDirection, option.hex);
    } else if (option.textureType && option.textureType !== 'none') {
      texture = getProceduralTexture(option.textureType);
    }
    
    textureCache.set(cacheKey, texture);
    return texture;
  };

  // Get material props for a specific part with proper grain direction
  const getPartMaterial = (
    option: MaterialOption,
    partType: string
  ): MaterialProps => {
    const grainDirection = getPartGrainDirection(partType);
    const texture = getTextureWithGrain(option, grainDirection);

    return {
      color: option.hex,
      roughness: option.roughness ?? 0.5,
      metalness: option.metalness ?? 0.0,
      map: texture,
    };
  };

  // Pre-computed materials for common parts
  const materials = useMemo(() => ({
    gable: getPartMaterial(finishOption, 'gable'),
    door: getPartMaterial(finishOption, 'door'),
    drawer: getPartMaterial(finishOption, 'drawerFront'),
    shelf: getPartMaterial(finishOption, 'shelf'),
    bottom: getPartMaterial(finishOption, 'bottom'),
    back: getPartMaterial(finishOption, 'back'),
    kickboard: getPartMaterial(kickOption, 'kickboard'),
    benchtop: getPartMaterial(benchtopOption, 'benchtop'),
    endPanel: getPartMaterial(finishOption, 'endPanel'),
    falseFront: getPartMaterial(finishOption, 'drawerFront'),
  }), [finishOption, benchtopOption, kickOption]);

  return {
    materials,
    getPartMaterial,
  };
}

/**
 * Hook to create material props from a MaterialOption
 */
export function useMaterialProps(option: MaterialOption): MaterialProps {
  const texture = useMemo(
    () => getProceduralTexture(option.textureType || 'none'),
    [option.textureType]
  );

  return useMemo(() => ({
    color: option.hex,
    roughness: option.roughness ?? 0.5,
    metalness: option.metalness ?? 0.0,
    map: texture,
  }), [option, texture]);
}
