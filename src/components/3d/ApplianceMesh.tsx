import React, { useMemo, useState } from 'react';
import * as THREE from 'three';
import { PlacedItem, GlobalDimensions, MaterialOption } from '../../types';
import { TAP_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS } from '../../constants';
import { useCatalog, useCatalogItem } from '../../hooks/useCatalog';
import { handleItemPointerDown } from './selectionGesture';
import { getApplianceMaterial, resolveFinishKey, type ApplianceFinishKey } from './materials/applianceMaterials';
import {
  isSinkAppliance,
  isCooktopAppliance,
  isRangehoodAppliance,
  isDishwasherAppliance,
} from './applianceClassification';
import { useApplianceFaceTexture, isProductElevationUrl, type ApplianceFaceTexture } from './materials/applianceImage';

/** THREE box face order is +x, -x, +y, -y, +z, -z. */
const FACE_FRONT = 4;
const FACE_TOP = 2;

/**
 * A box carrying the supplier's product elevation on one face and the photo's
 * own dominant colour on the other five, so the edges match the front instead
 * of banding against it.
 */
function PhotoBox({
  size,
  face,
  photo,
  fallbackColor,
  roughness = 0.38,
  metalness = 0.18,
}: {
  size: [number, number, number];
  face: number;
  photo: ApplianceFaceTexture;
  fallbackColor: string;
  roughness?: number;
  metalness?: number;
}) {
  return (
    <mesh>
      <boxGeometry args={size} />
      {[0, 1, 2, 3, 4, 5].map(i =>
        i === face ? (
          <meshStandardMaterial
            key={i}
            attach={`material-${i}`}
            map={photo.texture}
            roughness={roughness}
            metalness={metalness}
          />
        ) : (
          <meshStandardMaterial
            key={i}
            attach={`material-${i}`}
            color={photo.dominantHex || fallbackColor}
            roughness={roughness + 0.08}
            metalness={metalness}
          />
        ),
      )}
    </mesh>
  );
}

interface ApplianceMeshProps {
  item: PlacedItem;
  // Optional props - if provided, these override context values
  globalDimensions?: GlobalDimensions;
  isSelected?: boolean;
  isDragged?: boolean;
  /** The room's benchtop. Under-bench openings (dishwashers) have no top of
   *  their own, so without this the stone simply stopped at the opening and
   *  the run had a gap in it. */
  benchtop?: MaterialOption;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, x: number, z: number) => void;
}

/** Chrome hex → chrome, black hex → matteBlack, otherwise brushedGunmetal. */
function tapFinishKey(hex: string): ApplianceFinishKey {
  const h = hex.toLowerCase();
  if (h === '#1a1a1a' || h === '#111827' || h === '#000000') return 'matteBlack';
  if (h === '#e5e7eb' || h === '#f1f3f5' || h === '#ffffff') return 'chrome';
  return 'brushedGunmetal';
}

const ApplianceMesh: React.FC<ApplianceMeshProps> = ({
  item,
  benchtop,
  globalDimensions: dimensionsProp,
  isSelected: isSelectedProp,
  isDragged: isDraggedProp,
  onSelect,
  onDragStart,
}) => {
  const globalDimensions = dimensionsProp ?? DEFAULT_GLOBAL_DIMENSIONS;
  const isSelected = isSelectedProp ?? false;
  const isDragged = isDraggedProp ?? false;

  const handleSelect = onSelect;
  const handleDragStart = onDragStart;

  const def = useCatalogItem(item.definitionId);
  // Both loading flags come from the SAME useCatalog hook so we're reading
  // the exact query cache that populated `def`. Using a separate
  // useApplianceCatalog() call would be a different query key ('true' vs
  // 'catalog') — if that one settles first we'd flash empty.
  const { isLoading: microvellumLoading, applianceCatalogLoading } = useCatalog('admin');
  // `appliance:<uuid>` definitions live in appliance_products; static and
  // Microvellum definitions live in microvellum_products. Pick the signal
  // matching the source so the placeholder actually covers pop-in.
  const isApplianceDef = (item.definitionId ?? '').startsWith('appliance:');
  const catalogLoading = isApplianceDef ? applianceCatalogLoading : microvellumLoading;
  const [hovered, setHovered] = useState(false);

  const selectedTap = TAP_OPTIONS.find(t => t.id === item.tapId) || TAP_OPTIONS[0];

  // Supplier product elevation. Hooks cannot run after the catalog-loading
  // early return below, so the face is chosen from the item and its snapshot;
  // `isSinkAppliance(item, null)` falls through to the snapshot name, which is
  // the same rule the real render path uses once `def` resolves.
  const facesUp = isSinkAppliance(item, null) || isCooktopAppliance(item, null);
  const snapshotImage = item.applianceSnapshot?.imageUrl ?? null;
  const photoUrl = isProductElevationUrl(snapshotImage) ? snapshotImage : null;
  const faceAspect = facesUp
    ? (item.width || 600) / (item.depth || 500)
    : (item.width || 600) / (item.height || 700);
  const photo = useApplianceFaceTexture(photoUrl, faceAspect);

  // A gooseneck tap profile built with a lathe. Cached across renders per finish.
  const tapGooseneckGeom = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0.020, 0.00));
    pts.push(new THREE.Vector2(0.022, 0.02));
    pts.push(new THREE.Vector2(0.014, 0.06));
    pts.push(new THREE.Vector2(0.012, 0.22));
    pts.push(new THREE.Vector2(0.014, 0.26));
    pts.push(new THREE.Vector2(0.020, 0.28));
    return new THREE.LatheGeometry(pts, 20);
  }, []);
  const tapSpoutGeom = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.28, 0),
      new THREE.Vector3(0, 0.34, 0.02),
      new THREE.Vector3(0, 0.36, 0.08),
      new THREE.Vector3(0, 0.32, 0.14),
      new THREE.Vector3(0, 0.24, 0.16),
    ]);
    return new THREE.TubeGeometry(curve, 24, 0.012, 12, false);
  }, []);

  // While the catalog definition is still loading, render a neutral placeholder
  // box sized from the item's own dimensions so the appliance doesn't pop in
  // when the definition finally resolves. Only return null when loading is
  // truly complete AND the definition doesn't exist.
  if (!def) {
    if (!catalogLoading) return null;
    const wM = item.width / 1000, hM = item.height / 1000, dM = item.depth / 1000;
    // Match the real render path's classification so Y-origin doesn't flip
    // when `def` resolves. `def` is null here, so the shared helper falls
    // through to the snapshot-name check.
    const isSinkLike = isSinkAppliance(item, null) || isCooktopAppliance(item, null);
    const placeholderY = isSinkLike ? (item.y / 1000) : (item.y / 1000) + (hM / 2);
    return (
      <group position={[item.x / 1000, placeholderY, item.z / 1000]} rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} userData={{ itemId: item.instanceId }}>
        <mesh>
          <boxGeometry args={[wM, hM, dM]} />
          <meshStandardMaterial color="#c9cdd2" roughness={0.7} metalness={0.05} />
        </mesh>
      </group>
    );
  }

  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const depthM = item.depth / 1000;

  // Classify by category-first via the shared helper so a fridge with an
  // item_code containing "CT" (e.g. "PRODUCT-…") isn't mis-classified as a
  // cooktop, and free-form vendor SKUs with "SINK" as a substring don't
  // collide either.
  const applianceName = (def.name || '').toLowerCase();
  const isSink = isSinkAppliance(item, def);
  const isCooktop = isCooktopAppliance(item, def);
  const isDishwasher = isDishwasherAppliance(item, def);
  // compileSpec emits a rangehood above every cooktop at full wall-cabinet
  // height. Without its own branch it drew as a generic appliance — a tall
  // box with a recessed front and a handle, which reads as a fridge hanging
  // over the hotplates.
  const isRangehood = isRangehoodAppliance(item, def);
  const isOven = applianceName.includes('oven');
  const isFrontLoader = !isDishwasher && (applianceName.includes('wash') || applianceName.includes('dryer'));
  const isGenericAppliance = !isSink && !isCooktop && !isDishwasher && !isRangehood;

  // Resolve finish key from the placed snapshot; each sub-type has a sensible default.
  const snapFinish = item.applianceSnapshot?.finish ?? null;
  const finishKey: ApplianceFinishKey =
    resolveFinishKey(snapFinish) ??
    (isSink ? 'stainless'
      : isCooktop ? 'blackGlass'
      : isOven ? 'stainless'
      : isDishwasher ? 'stainless'
      : isRangehood ? 'stainless'
      : 'whiteEnamel');
  const bodyMat = getApplianceMaterial(finishKey);
  const glassMat = getApplianceMaterial('blackGlass');
  const handleMat = getApplianceMaterial('brushedGunmetal');
  const tapMat = getApplianceMaterial(tapFinishKey(selectedTap.hex));

  // Benchtop over an under-bench opening. Drawn here because the opening is an
  // Appliance, and CabinetAssembler only tops `category === 'Base'` cabinets.
  const btThickM = (globalDimensions.benchtopThickness ?? 33) / 1000;
  const benchtopSlab = benchtop ? (
    <mesh position={[0, heightM / 2 + btThickM / 2, 0]}>
      <boxGeometry args={[widthM, btThickM, depthM]} />
      <meshStandardMaterial
        color={benchtop.hex}
        roughness={benchtop.roughness ?? 0.3}
        metalness={benchtop.metalness ?? 0}
      />
    </mesh>
  ) : null;

  let posY = (item.y / 1000) + (heightM / 2);
  if (isSink || isCooktop) posY = item.y / 1000;

  const position: [number, number, number] = [item.x / 1000, posY, item.z / 1000];

  // Select-then-move + Alt-dive (shared gesture — see selectionGesture.ts).
  const handlePointerDown = (e: any) => {
    handleItemPointerDown({
      e,
      itemId: item.instanceId,
      isSelected,
      x: item.x,
      z: item.z,
      onSelect: handleSelect,
      onDragStart: handleDragStart,
    });
  };

  return (
    <group position={position} rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} userData={{ itemId: item.instanceId }} onPointerDown={handlePointerDown} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      {(isSelected || hovered || isDragged) && (
        <mesh><boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} /><meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent /></mesh>
      )}

      {isSink && (() => {
        // Sinks are benchtop-inset: `item.y` is the item's CENTRE, so the top
        // of the bowl sits at local +heightM/2 and everything hangs below it.
        // The previous version drew a solid box with its deck at the BOTTOM
        // and the tap rising from underneath the benchtop — it read as a
        // stainless brick. This is an open bowl you can actually see into.
        const topY = heightM / 2;
        const wallT = 0.012;
        const rimW = 0.022;
        const bowlDepth = Math.max(0.12, heightM - 0.01);
        // Bowl count comes from the supplier now — "1 bowl", "1.75 bowl",
        // "2.0 bowl" — instead of the old guess that anything wider than
        // 700 mm was a double. A 1.75 gets a full bowl and a smaller one,
        // which is what it actually is; drawing it as two equal bowls, or as
        // one long trough, is the sort of thing a cabinetmaker spots at once.
        const bowlCount = item.applianceSnapshot?.bowlCount ?? null;
        const usableW = widthM * 0.88;
        const bowlD = depthM * 0.74;
        let bowls: { cx: number; w: number }[];
        if (bowlCount !== null && bowlCount >= 1.5 && bowlCount < 2) {
          // 1 & 3/4: main bowl about 60% of the run, half-bowl the rest.
          const mainW = (usableW - rimW) * 0.6;
          const halfW = (usableW - rimW) - mainW;
          bowls = [
            { cx: -(usableW - mainW) / 2, w: mainW },
            { cx: (usableW - halfW) / 2, w: halfW },
          ];
        } else if ((bowlCount !== null && bowlCount >= 2) || (bowlCount === null && widthM > 0.7)) {
          const w = (usableW - rimW) / 2;
          bowls = [{ cx: -(w + rimW) / 2, w }, { cx: (w + rimW) / 2, w }];
        } else {
          bowls = [{ cx: 0, w: usableW }];
        }
        const doubleBowl = bowls.length > 1;

        return (
          <group>
            {bowls.map(({ cx, w: bowlW }, i) => (
              <group key={i} position={[cx, 0, 0]}>
                {/* Four walls and a floor, open at the top. */}
                <mesh position={[-(bowlW / 2 - wallT / 2), topY - bowlDepth / 2, 0]} material={bodyMat}>
                  <boxGeometry args={[wallT, bowlDepth, bowlD]} />
                </mesh>
                <mesh position={[bowlW / 2 - wallT / 2, topY - bowlDepth / 2, 0]} material={bodyMat}>
                  <boxGeometry args={[wallT, bowlDepth, bowlD]} />
                </mesh>
                <mesh position={[0, topY - bowlDepth / 2, -(bowlD / 2 - wallT / 2)]} material={bodyMat}>
                  <boxGeometry args={[bowlW, bowlDepth, wallT]} />
                </mesh>
                <mesh position={[0, topY - bowlDepth / 2, bowlD / 2 - wallT / 2]} material={bodyMat}>
                  <boxGeometry args={[bowlW, bowlDepth, wallT]} />
                </mesh>
                <mesh position={[0, topY - bowlDepth + wallT / 2, 0]} material={bodyMat}>
                  <boxGeometry args={[bowlW, wallT, bowlD]} />
                </mesh>
                {/* Waste outlet. */}
                <mesh position={[0, topY - bowlDepth + wallT, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.042, 0.042, 0.004, 20]} />
                  <meshStandardMaterial color="#2f3336" metalness={0.6} roughness={0.4} />
                </mesh>
              </group>
            ))}
            {/* Flange around the cutout, sitting flush on the stone. */}
            <mesh position={[0, topY - 0.005, -(bowlD / 2 + rimW / 2)]} material={bodyMat}>
              <boxGeometry args={[usableW + rimW * 2, 0.01, rimW]} />
            </mesh>
            <mesh position={[0, topY - 0.005, bowlD / 2 + rimW / 2]} material={bodyMat}>
              <boxGeometry args={[usableW + rimW * 2, 0.01, rimW]} />
            </mesh>
            <mesh position={[-(usableW / 2 + rimW / 2), topY - 0.005, 0]} material={bodyMat}>
              <boxGeometry args={[rimW, 0.01, bowlD]} />
            </mesh>
            <mesh position={[usableW / 2 + rimW / 2, topY - 0.005, 0]} material={bodyMat}>
              <boxGeometry args={[rimW, 0.01, bowlD]} />
            </mesh>
            {doubleBowl && (
              <mesh position={[0, topY - 0.005, 0]} material={bodyMat}>
                <boxGeometry args={[rimW, 0.01, bowlD]} />
              </mesh>
            )}
            {/* Gooseneck tap, rising from the benchtop behind the bowl.
                Local +z faces into the room, so -z is the wall side. */}
            <group position={[0, topY, -(bowlD / 2 + rimW + 0.03)]}>
              <mesh geometry={tapGooseneckGeom} material={tapMat} />
              <mesh geometry={tapSpoutGeom} material={tapMat} />
            </group>
          </group>
        );
      })()}

      {isCooktop && (
        <group>
          {/* Ceramic glass surface. With a supplier elevation the photo goes on
              the top face and the drawn burner rings are skipped — the photo
              already has them, in the right places at the right sizes. */}
          {photo ? (
            <group position={[0, 0.012, 0]}>
              <PhotoBox size={[widthM, 0.024, depthM]} face={FACE_TOP} photo={photo}
                fallbackColor="#1c1c1f" roughness={0.18} metalness={0.1} />
            </group>
          ) : (
            <mesh position={[0, 0.012, 0]} material={glassMat}>
              <boxGeometry args={[widthM, 0.024, depthM]} />
            </mesh>
          )}
          {/* Burner rings scaled to the actual cooktop. These used to be
              hard-coded at ±150/±100 mm with a fixed 160 mm ring, so a 900 mm
              cooktop drew four burners bunched in the middle with a bare strip
              either side. */}
          {!photo && (() => {
            const ringR = Math.min(0.085, widthM * 0.14);
            const xs = [-widthM * 0.25, widthM * 0.25];
            const zs = [-depthM * 0.21, depthM * 0.21];
            return xs.flatMap((x, xi) => zs.map((z, zi) => (
              <mesh key={`${xi}-${zi}`} position={[x, 0.026, z]}>
                <cylinderGeometry args={[ringR, ringR, 0.006, 32]} />
                <meshStandardMaterial color="#2a2a2e" metalness={0.4} roughness={0.5} />
              </mesh>
            )));
          })()}
        </group>
      )}

      {isDishwasher && (
        <group>
          {photo ? (
            <PhotoBox size={[widthM, heightM, depthM]} face={FACE_FRONT} photo={photo} fallbackColor="#9aa0a6" />
          ) : (
            <>
              <mesh material={bodyMat}><boxGeometry args={[widthM, heightM, depthM]} /></mesh>
              {/* Recessed inset door glass. */}
              <mesh position={[0, -0.02, depthM / 2 + 0.006]} material={glassMat}>
                <boxGeometry args={[widthM - 0.06, heightM - 0.15, 0.012]} />
              </mesh>
              {/* Recessed handle bar. */}
              <mesh position={[0, heightM / 2 - 0.06, depthM / 2 + 0.02]} material={handleMat}>
                <boxGeometry args={[widthM - 0.12, 0.02, 0.02]} />
              </mesh>
            </>
          )}
          {/* Top rails carrying the benchtop (dishwasher opening has no full top). */}
          {item.topRail !== false && (
            <>
              <mesh position={[0, heightM / 2 - 0.012, depthM / 2 - 0.05]} material={bodyMat}>
                <boxGeometry args={[widthM, 0.018, 0.1]} />
              </mesh>
              <mesh position={[0, heightM / 2 - 0.012, -depthM / 2 + 0.05]} material={bodyMat}>
                <boxGeometry args={[widthM, 0.018, 0.1]} />
              </mesh>
            </>
          )}
          {/* The stone itself. `CabinetAssembler` only draws a benchtop for
              `category === 'Base'` cabinets, and a dishwasher is an Appliance,
              so the run simply stopped either side of the opening and left a
              gap over the machine. The rails above were already commented as
              "carrying the benchtop" — nothing was ever laid on them. */}
          {benchtopSlab}
        </group>
      )}

      {isRangehood && (() => {
        // A canopy: wide hood at the bottom, narrower chimney rising behind it.
        // Previously this fell through to the generic branch and drew a
        // full-height box with a door panel and a handle — a fridge, hanging
        // over the hotplates.
        const hoodH = Math.min(0.16, heightM * 0.28);
        const canopyD = depthM * 1.55;         // canopies are deeper than a wall cabinet
        const chimneyW = Math.min(0.3, widthM * 0.36);
        const chimneyH = heightM - hoodH;
        return (
          <group>
            {/* Hood body, slightly tapered by stacking two slabs. */}
            <mesh position={[0, -heightM / 2 + hoodH / 2, canopyD / 2 - depthM / 2]} material={bodyMat}>
              <boxGeometry args={[widthM, hoodH * 0.55, canopyD]} />
            </mesh>
            <mesh position={[0, -heightM / 2 + hoodH * 0.82, canopyD * 0.4 - depthM / 2]} material={bodyMat}>
              <boxGeometry args={[widthM * 0.82, hoodH * 0.5, canopyD * 0.72]} />
            </mesh>
            {/* Grease filter panel on the underside. */}
            <mesh position={[0, -heightM / 2 + 0.012, canopyD / 2 - depthM / 2]}>
              <boxGeometry args={[widthM - 0.06, 0.01, canopyD - 0.06]} />
              <meshStandardMaterial color="#8d949b" metalness={0.75} roughness={0.35} />
            </mesh>
            {/* Chimney to the ceiling. */}
            <mesh position={[0, -heightM / 2 + hoodH + chimneyH / 2, 0]} material={bodyMat}>
              <boxGeometry args={[chimneyW, chimneyH, depthM * 0.62]} />
            </mesh>
          </group>
        );
      })()}

      {isGenericAppliance && photo && (
        /* The supplier elevation already shows the door, controls, handle and
           badge, so none of the procedural front furniture is drawn over it. */
        <PhotoBox size={[widthM, heightM, depthM]} face={FACE_FRONT} photo={photo} fallbackColor="#9aa0a6" />
      )}

      {isGenericAppliance && !photo && (
        <group>
          {/* Main body */}
          <mesh material={bodyMat}><boxGeometry args={[widthM, heightM, depthM]} /></mesh>
          {isOven ? (
            <>
              {/* Inset glass door panel with a black-glass surround. */}
              <mesh position={[0, -heightM * 0.08, depthM / 2 + 0.006]} material={glassMat}>
                <boxGeometry args={[widthM - 0.06, heightM * 0.6, 0.012]} />
              </mesh>
              {/* Recessed horizontal handle bar. */}
              <mesh position={[0, heightM * 0.28, depthM / 2 + 0.028]} material={handleMat}>
                <boxGeometry args={[widthM * 0.62, 0.022, 0.024]} />
              </mesh>
            </>
          ) : (
            <>
              {/* Recessed front panel + vertical handle. */}
              <mesh position={[0, 0, depthM / 2 + 0.006]}>
                <boxGeometry args={[widthM - 0.05, heightM - 0.05, 0.012]} />
                <meshStandardMaterial color={new THREE.Color(bodyMat.color).multiplyScalar(0.92)} metalness={bodyMat.metalness} roughness={bodyMat.roughness + 0.05} />
              </mesh>
              <mesh position={[widthM / 2 - 0.07, 0, depthM / 2 + 0.02]} material={handleMat}>
                <boxGeometry args={[0.025, heightM * 0.45, 0.02]} />
              </mesh>
            </>
          )}
          {/* Round door for front-loaders (washer / dryer). */}
          {isFrontLoader && (
            <mesh position={[-0.03, 0.02, depthM / 2 + 0.018]} rotation={[Math.PI / 2, 0, 0]} material={glassMat}>
              <cylinderGeometry args={[Math.min(widthM, heightM) * 0.3, Math.min(widthM, heightM) * 0.3, 0.012, 28]} />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
};

export default ApplianceMesh;
