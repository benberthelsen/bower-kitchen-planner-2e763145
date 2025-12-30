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

// Fallback material for when texture generation fails
const createFallbackMaterial = (hex: string): MaterialProps => ({
  color: hex,
  roughness: 0.5,
  metalness: 0.0,
  map: null,
});

/**
 * Hook to get material properties with proper grain direction for cabinet parts
 * All texture generation is properly memoized to avoid React render issues
 */
export function useCabinetMaterials(
  finishOption: MaterialOption,
  benchtopOption: MaterialOption,
  kickOption: MaterialOption
) {
  // Pre-computed materials for all parts - everything inside useMemo for proper memoization
  const materials = useMemo(() => {
    // Texture cache within this memoization scope
    const textureCache = new Map<string, THREE.Texture | null>();

    // Get texture with specific grain direction (internal to useMemo)
    const getTextureWithGrain = (
      option: MaterialOption,
      grainDirection: TextureGrainDirection
    ): THREE.Texture | null => {
      try {
        const cacheKey = `${option.id}_${option.textureType}_${grainDirection}_${option.hex}`;

        if (textureCache.has(cacheKey)) {
          return textureCache.get(cacheKey) || null;
        }

        let texture: THREE.Texture | null = null;

        if (option.textureType === 'wood') {
          texture = getWoodTexture(grainDirection, option.hex);
        } else if (option.textureType && option.textureType !== 'none') {
          texture = getProceduralTexture(option.textureType);
        }

        textureCache.set(cacheKey, texture);
        return texture;
      } catch (error) {
        console.warn('Texture generation failed:', error);
        return null;
      }
    };

    // Get material props for a specific part (internal to useMemo)
    const getPartMaterial = (
      option: MaterialOption,
      partType: string
    ): MaterialProps => {
      try {
        const grainDirection = getPartGrainDirection(partType);
        const texture = getTextureWithGrain(option, grainDirection);

        return {
          color: option.hex,
          roughness: option.roughness ?? 0.5,
          metalness: option.metalness ?? 0.0,
          map: texture,
        };
      } catch (error) {
        console.warn(`Material generation failed for ${partType}:`, error);
        return createFallbackMaterial(option.hex);
      }
    };

    // Generate all materials with error handling
    try {
      return {
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
      };
    } catch (error) {
      console.error('Failed to generate cabinet materials:', error);
      // Return fallback materials for all parts
      const fallback = createFallbackMaterial(finishOption.hex);
      return {
        gable: fallback,
        door: fallback,
        drawer: fallback,
        shelf: fallback,
        bottom: fallback,
        back: fallback,
        kickboard: createFallbackMaterial(kickOption.hex),
        benchtop: createFallbackMaterial(benchtopOption.hex),
        endPanel: fallback,
        falseFront: fallback,
      };
    }
  }, [finishOption, benchtopOption, kickOption]);

  // Memoized helper for getting custom part materials (for advanced use cases)
  const getPartMaterial = useMemo(() => {
    return (option: MaterialOption, partType: string): MaterialProps => {
      try {
        const grainDirection = getPartGrainDirection(partType);
        let texture: THREE.Texture | null = null;

        if (option.textureType === 'wood') {
          texture = getWoodTexture(grainDirection, option.hex);
        } else if (option.textureType && option.textureType !== 'none') {
          texture = getProceduralTexture(option.textureType);
        }

        return {
          color: option.hex,
          roughness: option.roughness ?? 0.5,
          metalness: option.metalness ?? 0.0,
          map: texture,
        };
      } catch (error) {
        console.warn(`Material generation failed for ${partType}:`, error);
        return createFallbackMaterial(option.hex);
      }
    };
  }, []);

  return {
    materials,
    getPartMaterial,
  };
}

/**
 * Hook to create material props from a MaterialOption
 */
export function useMaterialProps(option: MaterialOption): MaterialProps {
  return useMemo(() => {
    try {
      const texture = getProceduralTexture(option.textureType || 'none');
      return {
        color: option.hex,
        roughness: option.roughness ?? 0.5,
        metalness: option.metalness ?? 0.0,
        map: texture,
      };
    } catch (error) {
      console.warn('Material props generation failed:', error);
      return createFallbackMaterial(option.hex);
    }
  }, [option]);
}
