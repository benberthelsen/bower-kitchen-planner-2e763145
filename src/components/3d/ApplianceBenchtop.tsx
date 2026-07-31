import React from 'react';
import type { GlobalDimensions, MaterialOption } from '../../types';
import { BenchtopMesh } from './cabinet-parts';
import { useOptionalTexture } from './materials/useOptionalTexture';

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
  const texture = useOptionalTexture(
    material?.textureUrl || null,
    material?.textureRepeatMm,
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
      color={material.hex}
      roughness={material.roughness ?? 0.3}
      metalness={material.metalness ?? 0}
      map={texture}
      overhang={overhang}
    />
  );
};

export default ApplianceBenchtop;
