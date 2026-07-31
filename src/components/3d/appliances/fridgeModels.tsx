/**
 * Fridge models.
 *
 * WHY THESE EXIST
 *
 * The catalogue carries exactly one fridge — an integrated 244 L unit — so
 * almost every customer's fridge is an *opening* with no chosen product behind
 * it. Before this, that opening drew as a plain box with a recessed panel and a
 * vertical bar, and a chosen product drew as the supplier photograph stretched
 * across the front of a box. Neither reads as a fridge in a room: a photo has
 * its own lighting and perspective baked in, so it fights the scene's shading
 * and sits flat, and a customer looking for their kitchen sees a picture pasted
 * on a cube.
 *
 * So the fridge is built as geometry instead, and there is a standard set of
 * shapes rather than one: what a fridge looks like is decided by its door
 * arrangement, and getting that wrong is immediately obvious. A 900 mm cabinet
 * with a single door on it looks like a pantry.
 *
 *   top-mount     freezer on top, fridge below — the narrow, cheap, common one
 *   bottom-mount  fridge on top, freezer drawer below
 *   french-door   two half-width doors over a freezer drawer — the wide one
 *   integrated    cabinet-matched panels, handle-less, hidden behind joinery
 *
 * The variant is inferred from the opening's own width and the product name
 * (see `fridgeStyleFor`), because that is all the layout engine gives us. It is
 * a placeholder in the honest sense — the door split and proportions are
 * conventional Australian sizes, not a specific model — so it should never be
 * presented as the customer's exact appliance.
 *
 * CONVENTIONS
 *
 * Everything here is in METRES and drawn in the parent group's local space,
 * where the item's centre is the origin: the floor is at `-height/2` and the
 * front of the appliance faces local **+z**. Sizes come in as the *opening*, and
 * the body is inset slightly inside it — a fridge that exactly fills its hole
 * cannot be slid in, and the shadow gap is most of what makes joinery read as
 * joinery.
 */
import React from 'react';
import * as THREE from 'three';
import type { PlacedItem } from '../../../types';
import type { ExtendedCatalogItem } from '../../../hooks/useCatalog';
import { fridgeBodyWidthMm } from '../../../lib/layout/catalogRoles';
import { getApplianceMaterial, type ApplianceFinishKey } from '../materials/applianceMaterials';

export type FridgeStyle = 'top-mount' | 'bottom-mount' | 'french-door' | 'integrated';

/** Shadow gap between doors (m). Real gaps are 3–5 mm. */
const DOOR_GAP = 0.004;
/** How far a door face stands off the carcase (m). */
const DOOR_PROUD = 0.018;
/** Plinth / compressor grille height at the base (m). */
const PLINTH_H = 0.07;

/**
 * Which shape to draw. Name wins when it says how the unit is installed,
 * otherwise width decides — 850 mm and over is a French door in practice,
 * because nobody makes a single-door fridge that wide.
 */
export function fridgeStyleFor(
  item: PlacedItem,
  def: ExtendedCatalogItem | null | undefined,
): FridgeStyle {
  const name = `${def?.name ?? ''} ${item.applianceSnapshot?.name ?? ''}`.toLowerCase();
  if (/integrat|built[- ]?in|panel[- ]?ready|cabinet/.test(name)) return 'integrated';
  if (/french/.test(name)) return 'french-door';
  if (/bottom[- ]?mount|bottom[- ]?freezer/.test(name)) return 'bottom-mount';
  if (/top[- ]?mount|top[- ]?freezer/.test(name)) return 'top-mount';

  const widthMm = fridgeBodyWidthMm(item.width || 600, item.applianceBodyWidth);
  if (widthMm >= 850) return 'french-door';
  if (widthMm >= 700) return 'bottom-mount';
  return 'top-mount';
}

/** A door or drawer face: proud panel, bevelled edge shading, optional handle. */
function DoorFace({
  w,
  h,
  z,
  y,
  material,
  edgeMaterial,
}: {
  w: number;
  h: number;
  z: number;
  y: number;
  material: THREE.Material;
  edgeMaterial: THREE.Material;
}) {
  return (
    <group position={[0, y, z]}>
      {/* The face itself. */}
      <mesh material={material}>
        <boxGeometry args={[w, h, DOOR_PROUD]} />
      </mesh>
      {/* A slightly larger, darker slab a hair behind it reads as the shadow in
          the gap without needing real shadows or ambient occlusion. */}
      <mesh position={[0, 0, -DOOR_PROUD / 2 - 0.001]} material={edgeMaterial}>
        <boxGeometry args={[w + DOOR_GAP * 2, h + DOOR_GAP * 2, 0.002]} />
      </mesh>
    </group>
  );
}

/** Vertical pull, mounted on the opening edge of a door. */
function VerticalHandle({
  x,
  y,
  z,
  h,
  material,
}: {
  x: number;
  y: number;
  z: number;
  h: number;
  material: THREE.Material;
}) {
  return (
    <group position={[x, y, z]}>
      {/* Bar, standing off the door on two short posts. */}
      <mesh material={material}>
        <boxGeometry args={[0.026, h, 0.022]} />
      </mesh>
      {[-1, 1].map(s => (
        <mesh key={s} position={[0, (s * h) / 2 - s * 0.03, -0.014]} material={material}>
          <boxGeometry args={[0.016, 0.016, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}

/** Horizontal pull for a freezer drawer. */
function DrawerHandle({
  y,
  z,
  w,
  material,
}: {
  y: number;
  z: number;
  w: number;
  material: THREE.Material;
}) {
  return (
    <mesh position={[0, y, z]} material={material}>
      <boxGeometry args={[w, 0.022, 0.022]} />
    </mesh>
  );
}

export interface FridgeModelProps {
  /** Opening size in metres. */
  widthM: number;
  heightM: number;
  depthM: number;
  style: FridgeStyle;
  /** Body finish. Integrated units take the joinery's door colour instead. */
  finishKey: ApplianceFinishKey;
  /** Door colour for integrated units — the cabinetry finish. */
  panelHex?: string;
  /** Set for a handle-less kitchen: integrated units then get no pull at all. */
  handleless?: boolean;
}

/**
 * A fridge built from boxes. Deliberately simple geometry — the aim is a shape
 * that reads correctly at a glance from across a room, not a product replica.
 */
export const FridgeModel: React.FC<FridgeModelProps> = ({
  widthM,
  heightM,
  depthM,
  style,
  finishKey,
  panelHex,
  handleless = false,
}) => {
  const bodyMat = getApplianceMaterial(finishKey);
  const handleMat = getApplianceMaterial('brushedGunmetal');
  const darkMat = React.useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.8, metalness: 0.05 }),
    [],
  );
  const panelMat = React.useMemo(
    () =>
      panelHex
        ? new THREE.MeshStandardMaterial({ color: panelHex, roughness: 0.45, metalness: 0.02 })
        : null,
    [panelHex],
  );
  const doorMat = style === 'integrated' && panelMat ? panelMat : bodyMat;

  // The parent opening already provides the 50 mm service gap on each side.
  const w = Math.max(0.2, widthM);
  const d = Math.max(0.2, depthM - 0.004);
  const base = -heightM / 2;
  const doorZ = d / 2 + DOOR_PROUD / 2;

  // Doors sit above the plinth and stop short of the very top, the way a real
  // carcase leaves a rail behind the top edge.
  const doorsBottom = base + PLINTH_H;
  const doorsTop = heightM / 2 - 0.004;
  const doorsH = doorsTop - doorsBottom;

  /** Split point between cold compartments, as a fraction of door height. */
  const split =
    style === 'top-mount' ? 0.68            // freezer on top takes about a third
      : style === 'bottom-mount' ? 0.70     // freezer drawer below
      : style === 'french-door' ? 0.64      // deeper freezer drawer
      : 1;                                  // integrated: single full-height panel

  const upperH = doorsH * split - DOOR_GAP / 2;
  const lowerH = doorsH - upperH - DOOR_GAP;
  const upperY = doorsBottom + lowerH + DOOR_GAP + upperH / 2;
  const lowerY = doorsBottom + lowerH / 2;

  return (
    <group>
      {/* Carcase. Everything else is applied to its front. */}
      <mesh material={bodyMat}>
        <boxGeometry args={[w, heightM, d]} />
      </mesh>

      {/* Plinth, set back, with a compressor grille. Without this the doors run
          to the floor and the unit reads as a slab. */}
      <mesh position={[0, base + PLINTH_H / 2, d / 2 - 0.012]} material={darkMat}>
        <boxGeometry args={[w - 0.01, PLINTH_H, 0.024]} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[
            (i - 3) * (w / 8),
            base + PLINTH_H / 2,
            d / 2 - 0.001,
          ]}
          material={handleMat}
        >
          <boxGeometry args={[w / 14, PLINTH_H * 0.55, 0.004]} />
        </mesh>
      ))}

      {style === 'top-mount' && (
        <>
          {/* Freezer above, fridge below. */}
          <DoorFace w={w} h={upperH} y={upperY} z={doorZ} material={doorMat} edgeMaterial={darkMat} />
          <DoorFace w={w} h={lowerH} y={lowerY} z={doorZ} material={doorMat} edgeMaterial={darkMat} />
          {/* Both doors hinge on the same side, so both pulls sit on the other. */}
          <VerticalHandle x={-w / 2 + 0.055} y={upperY} z={doorZ + DOOR_PROUD / 2 + 0.011} h={upperH * 0.5} material={handleMat} />
          <VerticalHandle x={-w / 2 + 0.055} y={lowerY} z={doorZ + DOOR_PROUD / 2 + 0.011} h={lowerH * 0.42} material={handleMat} />
        </>
      )}

      {style === 'bottom-mount' && (
        <>
          <DoorFace w={w} h={upperH} y={upperY} z={doorZ} material={doorMat} edgeMaterial={darkMat} />
          <DoorFace w={w} h={lowerH} y={lowerY} z={doorZ} material={doorMat} edgeMaterial={darkMat} />
          <VerticalHandle x={-w / 2 + 0.055} y={upperY} z={doorZ + DOOR_PROUD / 2 + 0.011} h={upperH * 0.5} material={handleMat} />
          <DrawerHandle y={lowerY + lowerH / 2 - 0.055} z={doorZ + DOOR_PROUD / 2 + 0.011} w={w * 0.5} material={handleMat} />
        </>
      )}

      {style === 'french-door' && (() => {
        const halfW = (w - DOOR_GAP) / 2;
        return (
          <>
            {/* Two doors over one drawer. */}
            {[-1, 1].map(s => (
              <group key={s} position={[(s * (halfW + DOOR_GAP)) / 2, 0, 0]}>
                <DoorFace w={halfW} h={upperH} y={upperY} z={doorZ} material={doorMat} edgeMaterial={darkMat} />
              </group>
            ))}
            <DoorFace w={w} h={lowerH} y={lowerY} z={doorZ} material={doorMat} edgeMaterial={darkMat} />
            {/* Pulls meet in the middle, which is what makes a French door
                unmistakable even as a silhouette. */}
            {[-1, 1].map(s => (
              <VerticalHandle
                key={s}
                x={s * (DOOR_GAP / 2 + 0.045)}
                y={upperY}
                z={doorZ + DOOR_PROUD / 2 + 0.011}
                h={upperH * 0.55}
                material={handleMat}
              />
            ))}
            <DrawerHandle y={lowerY + lowerH / 2 - 0.06} z={doorZ + DOOR_PROUD / 2 + 0.011} w={w * 0.45} material={handleMat} />
          </>
        );
      })()}

      {style === 'integrated' && (
        <>
          {/* One cabinet-matched panel. An integrated fridge is meant to
              disappear into the run, so there is no stainless and no badge —
              only the door, and a pull if the kitchen has handles. */}
          <DoorFace w={w} h={doorsH} y={doorsBottom + doorsH / 2} z={doorZ} material={doorMat} edgeMaterial={darkMat} />
          {!handleless && (
            <VerticalHandle
              x={-w / 2 + 0.055}
              y={doorsBottom + doorsH * 0.62}
              z={doorZ + DOOR_PROUD / 2 + 0.011}
              h={Math.min(0.6, doorsH * 0.35)}
              material={handleMat}
            />
          )}
        </>
      )}
    </group>
  );
};

export default FridgeModel;
