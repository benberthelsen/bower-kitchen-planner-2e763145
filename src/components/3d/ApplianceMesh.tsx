import React, { useMemo, useState } from 'react';
import * as THREE from 'three';
import { PlacedItem, GlobalDimensions } from '../../types';
import { TAP_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS } from '../../constants';
import { useCatalog, useCatalogItem } from '../../hooks/useCatalog';
import { useApplianceCatalog } from '../../hooks/useApplianceCatalog';
import { handleItemPointerDown } from './selectionGesture';
import { getApplianceMaterial, resolveFinishKey, type ApplianceFinishKey } from './materials/applianceMaterials';

interface ApplianceMeshProps {
  item: PlacedItem;
  // Optional props - if provided, these override context values
  globalDimensions?: GlobalDimensions;
  isSelected?: boolean;
  isDragged?: boolean;
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
  const { isLoading: microvellumLoading } = useCatalog('admin');
  const { isLoading: appliancesLoading } = useApplianceCatalog();
  // For `appliance:<uuid>` definitions we care about the appliance_products
  // query; the microvellum query never resolves them. Use the correct signal
  // per definition source so the placeholder actually covers pop-in.
  const isApplianceDef = (item.definitionId ?? '').startsWith('appliance:');
  const catalogLoading = isApplianceDef ? appliancesLoading : microvellumLoading;
  const [hovered, setHovered] = useState(false);

  const selectedTap = TAP_OPTIONS.find(t => t.id === item.tapId) || TAP_OPTIONS[0];

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
    let placeholderY = (item.y / 1000) + (hM / 2);
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

  // Classify by SKU AND name — a "Dishwasher Opening" has sku DISHWASHER_OPENING
  // (no 'DW') and a name containing 'wash', so it used to render as a front-loader
  // washing machine. Match the name so it's recognised as a dishwasher opening.
  const applianceName = (def.name || '').toLowerCase();
  const isSink = def.sku.includes('SINK') || applianceName.includes('sink');
  const isCooktop = def.sku.includes('CT') || applianceName.includes('cooktop');
  const isDishwasher = def.sku.includes('DW') || applianceName.includes('dishwasher');
  const isOven = applianceName.includes('oven');
  const isFrontLoader = !isDishwasher && (applianceName.includes('wash') || applianceName.includes('dryer'));
  const isGenericAppliance = !isSink && !isCooktop && !isDishwasher;

  // Resolve finish key from the placed snapshot; each sub-type has a sensible default.
  const snapFinish = item.applianceSnapshot?.finish ?? null;
  const finishKey: ApplianceFinishKey =
    resolveFinishKey(snapFinish) ??
    (isSink ? 'stainless'
      : isCooktop ? 'blackGlass'
      : isOven ? 'stainless'
      : isDishwasher ? 'stainless'
      : 'whiteEnamel');
  const bodyMat = getApplianceMaterial(finishKey);
  const glassMat = getApplianceMaterial('blackGlass');
  const handleMat = getApplianceMaterial('brushedGunmetal');
  const tapMat = getApplianceMaterial(tapFinishKey(selectedTap.hex));

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

      {isSink && (
        <group>
          {/* Deck + basin — brushed stainless. */}
          <mesh position={[0, -heightM / 2 + 0.01, 0]} material={bodyMat}>
            <boxGeometry args={[widthM * 0.94, 0.02, depthM * 0.82]} />
          </mesh>
          <mesh position={[0, -heightM / 2 + 0.05, 0]} material={bodyMat}>
            <boxGeometry args={[widthM * 0.82, heightM - 0.05, depthM * 0.72]} />
          </mesh>
          {/* Gooseneck tap: real profile + curved spout. */}
          <group position={[0, -heightM / 2 + 0.02, -depthM / 2 + 0.06]}>
            <mesh geometry={tapGooseneckGeom} material={tapMat} />
            <mesh geometry={tapSpoutGeom} material={tapMat} />
          </group>
        </group>
      )}

      {isCooktop && (
        <group>
          {/* Ceramic glass surface. */}
          <mesh position={[0, 0.012, 0]} material={glassMat}>
            <boxGeometry args={[widthM, 0.024, depthM]} />
          </mesh>
          {[[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.026, z]}>
              <cylinderGeometry args={[0.08, 0.08, 0.006, 32]} />
              <meshStandardMaterial color="#2a2a2e" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )}

      {isDishwasher && (
        <group>
          <mesh material={bodyMat}><boxGeometry args={[widthM, heightM, depthM]} /></mesh>
          {/* Recessed inset door glass. */}
          <mesh position={[0, -0.02, depthM / 2 + 0.006]} material={glassMat}>
            <boxGeometry args={[widthM - 0.06, heightM - 0.15, 0.012]} />
          </mesh>
          {/* Recessed handle bar. */}
          <mesh position={[0, heightM / 2 - 0.06, depthM / 2 + 0.02]} material={handleMat}>
            <boxGeometry args={[widthM - 0.12, 0.02, 0.02]} />
          </mesh>
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
        </group>
      )}

      {isGenericAppliance && (
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
