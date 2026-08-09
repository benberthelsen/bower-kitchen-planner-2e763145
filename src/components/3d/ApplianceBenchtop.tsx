import React from 'react';
import type { GlobalDimensions, MaterialOption } from '../../types';
import { BENCHTOP_OPTIONS } from '../../constants';
import { useCabinetMaterials } from '../../hooks/useCabinetMaterials';
import { BenchtopMesh } from './cabinet-parts';
import { useOptionalTexture } from './materials/useOptionalTexture';
import { withOptionalSurfaceTexture } from './materials/physicalTexture';
import { getConstructionRecipe } from '@/lib/microvellum/constructionRecipes';
import { resolvedBenchtopThicknessM } from './cabinetConstruction';

interface ApplianceBenchtopProps {
  material?: MaterialOption;
  globalDimensions: GlobalDimensions;
  widthM: number;
  depthM: number;
  /** Local height of the appliance top in the component's parent group. */
  topY: number;
  /** Side extensions covering exposed appliance support panels. */
  leftOverhangM?: number;
  rightOverhangM?: number;
  /** Physical start of the appliance opening on the joined cabinet run. */
  textureRunOffsetM?: number;
}

/**
 * Continues the room benchtop across an under-bench appliance opening using
 * exactly the same supplier texture, physical texture scale and front
 * overhang as CabinetAssembler.
 */
const ApplianceBenchtop: React.FC<ApplianceBenchtopProps> = ({
  material,
  globalDimensions,
  widthM,
  depthM,
  topY,
  leftOverhangM = 0,
  rightOverhangM = 0,
  textureRunOffsetM = 0,
}) => {
  const selectedMaterial = material ?? BENCHTOP_OPTIONS[0];
  // CabinetAssembler uses this hook for its immediate procedural fallback.
  // Using the same material here prevents a flat placeholder slab appearing
  // over dishwashers while the shared supplier texture is still loading.
  const { materials } = useCabinetMaterials(
    selectedMaterial,
    selectedMaterial,
    selectedMaterial,
  );
  const supplierTexture = useOptionalTexture(
    selectedMaterial.textureUrl || null,
    selectedMaterial.textureRepeatMm,
  );
  const resolvedMaterial = withOptionalSurfaceTexture(
    materials.benchtop,
    supplierTexture,
  );

  if (!material) return null;

  // The dishwasher opening belongs to the same Microvellum base-cabinet run
  // as its neighbours. Use that recipe's slab thickness so its top cannot sit
  // proud when the global preview default differs from the mapped product.
  const thickness = resolvedBenchtopThicknessM(
    globalDimensions,
    getConstructionRecipe('Base Dishwasher')?.benchtop.thickness,
  );
  const overhang = (globalDimensions.benchtopOverhang ?? 0) / 1000;

  return (
    <BenchtopMesh
      width={widthM}
      depth={depthM}
      thickness={thickness}
      position={[0, topY + thickness / 2, 0]}
      color={resolvedMaterial.color}
      roughness={resolvedMaterial.roughness}
      metalness={resolvedMaterial.metalness}
      map={resolvedMaterial.map}
      overhang={overhang}
      leftOverhang={leftOverhangM}
      rightOverhang={rightOverhangM}
      textureRunOffsetM={textureRunOffsetM}
    />
  );
};

export default ApplianceBenchtop;
