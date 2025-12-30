import { useMemo } from 'react';
import * as THREE from 'three';
import { MaterialOption } from '../types';
import { GrainDirection, getPartGrainDirection } from '../types/cabinetConfig';
import { getProceduralTexture } from '../utils/textureGenerator';

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
  // Generate base textures
  const finishTexture = useMemo(
    () => getProceduralTexture(finishOption.textureType || 'none'),
    [finishOption.textureType]
  );
  
  const benchtopTexture = useMemo(
    () => getProceduralTexture(benchtopOption.textureType || 'none'),
    [benchtopOption.textureType]
  );
  
  const kickTexture = useMemo(
    () => getProceduralTexture(kickOption.textureType || 'none'),
    [kickOption.textureType]
  );

  // Get material props for a specific part with proper grain direction
  const getPartMaterial = (
    option: MaterialOption,
    baseTexture: THREE.Texture | null,
    partType: string
  ): MaterialProps => {
    const grainDirection = getPartGrainDirection(partType);
    
    // Clone and rotate texture based on grain direction
    let texture: THREE.Texture | null = null;
    if (baseTexture) {
      texture = baseTexture.clone();
      if (grainDirection === 'horizontal') {
        texture.rotation = Math.PI / 2;
      } else if (grainDirection === 'vertical') {
        texture.rotation = 0;
      }
      texture.center.set(0.5, 0.5);
      texture.needsUpdate = true;
    }

    return {
      color: option.hex,
      roughness: option.roughness ?? 0.5,
      metalness: option.metalness ?? 0.0,
      map: texture,
    };
  };

  // Pre-computed materials for common parts
  const materials = useMemo(() => ({
    gable: getPartMaterial(finishOption, finishTexture, 'gable'),
    door: getPartMaterial(finishOption, finishTexture, 'door'),
    drawer: getPartMaterial(finishOption, finishTexture, 'drawerFront'),
    shelf: getPartMaterial(finishOption, finishTexture, 'shelf'),
    kickboard: getPartMaterial(kickOption, kickTexture, 'kickboard'),
    benchtop: getPartMaterial(benchtopOption, benchtopTexture, 'benchtop'),
    endPanel: getPartMaterial(finishOption, finishTexture, 'endPanel'),
  }), [finishOption, benchtopOption, kickOption, finishTexture, benchtopTexture, kickTexture]);

  return {
    finishTexture,
    benchtopTexture,
    kickTexture,
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
