import React from 'react';
import type { HandleDefinition, MaterialOption } from '../../types';
import { DoorFront } from './cabinet-parts';
import { useOptionalTexture } from './materials/useOptionalTexture';

interface IntegratedDishwasherFrontProps {
  widthM: number;
  heightM: number;
  depthM: number;
  plinthHeightM: number;
  finish: MaterialOption;
  handle: HandleDefinition;
}

/**
 * A fully integrated dishwasher is joinery at the front, not a stainless
 * appliance with a generic horizontal pull. Match the rest of the base run's
 * door finish and handle so no isolated bar appears over the opening.
 */
const IntegratedDishwasherFront: React.FC<IntegratedDishwasherFrontProps> = ({
  widthM,
  heightM,
  depthM,
  plinthHeightM,
  finish,
  handle,
}) => {
  const sourceTexture = useOptionalTexture(
    finish.textureUrl || null,
    finish.textureRepeatMm,
  );
  const panelHeight = Math.max(0.2, heightM - plinthHeightM - 0.008);
  const panelWidth = Math.max(0.2, widthM - 0.008);
  const panelY = -heightM / 2 + plinthHeightM + panelHeight / 2;
  const handleX = panelWidth / 2 - 0.04;
  const handleY = panelHeight / 2 - 0.096;

  return (
    <DoorFront
      width={panelWidth}
      height={panelHeight}
      thickness={0.016}
      position={[0, panelY, depthM / 2 + 0.012]}
      color={finish.hex}
      roughness={finish.roughness ?? 0.5}
      metalness={finish.metalness ?? 0}
      map={sourceTexture}
      gap={0}
      hingeLeft
      showHinges={false}
      interactive={false}
      forceOpen={false}
      handle={handle.type === 'None'
        ? undefined
        : {
            type: handle.type,
            color: handle.hex,
            x: handleX,
            y: handleY,
          }}
    />
  );
};

export default IntegratedDishwasherFront;
