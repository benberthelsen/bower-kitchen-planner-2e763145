/**
 * Hook to get construction recipe for a cabinet
 * Integrates with the catalog system and recipe lookup
 */

import { useMemo } from 'react';
import { 
  ConstructionRecipe, 
  getConstructionRecipe, 
  mergeRecipeWithOverrides,
  MV_CONSTRUCTION_RECIPES 
} from '@/lib/microvellum/constructionRecipes';
import { CabinetRenderConfig } from '@/types/cabinetConfig';

/**
 * Get the construction recipe for a cabinet based on its render config
 */
export function useConstructionRecipe(
  config: CabinetRenderConfig | null
): ConstructionRecipe | null {
  return useMemo(() => {
    if (!config) return null;
    
    // Try to get recipe by product name
    const baseRecipe = getConstructionRecipe(config.productName, MV_CONSTRUCTION_RECIPES);
    
    if (!baseRecipe) {
      // Return null to trigger fallback rendering
      return null;
    }
    
    // Merge with any database overrides from the config
    return mergeRecipeWithOverrides(baseRecipe, {
      doorCount: config.doorCount,
      drawerCount: config.drawerCount,
      shelfCount: config.shelfCount,
      hasFalseFront: config.hasFalseFront,
      cornerType: config.cornerType || undefined,
      leftArmDepth: config.leftArmDepth,
      rightArmDepth: config.rightArmDepth,
      blindDepth: config.blindDepth,
      fillerWidth: config.fillerWidth,
    });
  }, [config]);
}

/**
 * Get a fallback recipe based on category
 */
export function getFallbackRecipe(category: 'Base' | 'Wall' | 'Tall' | 'Accessory'): ConstructionRecipe {
  const fallbacks: Record<string, ConstructionRecipe> = {
    Base: MV_CONSTRUCTION_RECIPES['Base 1 Door'],
    Wall: MV_CONSTRUCTION_RECIPES['Upper 1 Door'],
    Tall: MV_CONSTRUCTION_RECIPES['Tall Pantry 2 Door'],
    Accessory: MV_CONSTRUCTION_RECIPES['Base Open Shelf'],
  };
  
  return fallbacks[category] || fallbacks.Base;
}
