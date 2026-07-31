import React from 'react';
import type { GlobalDimensions, MaterialOption } from '../../types';
import { BENCHTOP_OPTIONS } from '../../constants';
import { useCabinetMaterials } from '../../hooks/useCabinetMaterials';
import { BenchtopMesh } from './cabinet-parts';
import { useOptionalTexture } from './materials/useOptionalTexture';
import { withOptionalSurfaceTexture } from './materials/physicalTexture';

interface ApplianceBenchtopProps {
  material?: MaterialOption;
  globalDimensions: GlobalDimensions;
  widthM: number;
  depthM: number;
  /** Local height of the appliance top in the component's parent group. */
  topY: number;
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

  const thickness = (globalDimensions.benchtopThickness ?? 33) / 1000;
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
    />
  );
};

export default ApplianceBenchtop;
