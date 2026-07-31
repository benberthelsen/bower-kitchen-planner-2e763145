import React, { useState, useMemo } from 'react';
import * as THREE from 'three';
import { PlacedItem, MaterialOption, GlobalDimensions, HardwareOptions } from '../../types';
import { HANDLE_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS, FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS } from '../../constants';
import { resolveHandleDefinition, handleFinishHex } from '../../lib/handleStyles';
import { useCatalogItem, useCatalog } from '../../hooks/useCatalog';
import { useCabinetMaterials } from '../../hooks/useCabinetMaterials';
import CabinetAssembler from './CabinetAssembler';
import { handleItemPointerDown } from './selectionGesture';
import { CabinetRenderConfig } from '../../types/cabinetConfig';
import { isConcealedRangehoodAppliance } from './applianceClassification';

interface CabinetMeshProps {
  item: PlacedItem;
  // Optional props - if provided, these override context values
  selectedFinish?: MaterialOption;
  selectedBenchtop?: MaterialOption;
  selectedKick?: MaterialOption;
  globalDimensions?: GlobalDimensions;
  // Only handleId is typically used, so we accept a partial
  hardwareOptions?: Partial<HardwareOptions>;
  isSelected?: boolean;
  isDragged?: boolean;
  doorsOpen?: boolean;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, x: number, z: number) => void;
  onEdit?: (id: string) => void;
  /** An appliance overlay replaces these cabinet fronts (under-bench oven). */
  suppressFronts?: boolean;
  /** Real opening required by the selected sink hosted by this cabinet. */
  sinkCutout?: { widthM: number; depthM: number };
}

/**
 * The only exposed part of a built-in rangehood: a shallow stainless insert
 * and its grease filters on the underside of the matching upper cabinet.
 */
function ConcealedRangehoodInsert({
  widthM,
  heightM,
  depthM,
}: {
  widthM: number;
  heightM: number;
  depthM: number;
}) {
  const insertW = Math.max(0.32, widthM - 0.05);
  const insertD = Math.min(0.29, depthM * 0.82);
  const undersideY = -heightM / 2 - 0.008;
  const insertZ = depthM / 2 - insertD / 2 - 0.015;
  const filterCount = insertW >= 0.75 ? 2 : 1;
  const filterGap = 0.012;
  const filterW = (insertW - 0.035 - filterGap * (filterCount - 1)) / filterCount;

  return (
    <group position={[0, undersideY, insertZ]}>
      <mesh>
        <boxGeometry args={[insertW, 0.018, insertD]} />
        <meshStandardMaterial color="#aeb4ba" metalness={0.72} roughness={0.34} />
      </mesh>
      {Array.from({ length: filterCount }, (_, index) => {
        const x = filterCount === 1
          ? 0
          : (index === 0 ? -1 : 1) * (filterW + filterGap) / 2;
        return (
          <group key={index} position={[x, -0.0105, 0]}>
            <mesh>
              <boxGeometry args={[filterW, 0.003, insertD - 0.035]} />
              <meshStandardMaterial color="#747b82" metalness={0.65} roughness={0.46} />
            </mesh>
            {[-0.3, -0.15, 0, 0.15, 0.3].map(slot => (
              <mesh key={slot} position={[filterW * slot, -0.002, 0]}>
                <boxGeometry args={[0.006, 0.002, insertD - 0.055]} />
                <meshStandardMaterial color="#3f454a" metalness={0.45} roughness={0.55} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/**
 * CabinetMesh - Renders a 3D cabinet using the modular CabinetAssembler
 * Uses Microvellum product metadata for accurate, spec-compliant rendering
 * 
 * Can be used in two modes:
 * 1. With PlannerContext (standard planner) - context provides all state
 * 2. With props (trade planner) - props override context values
 */
const CabinetMesh: React.FC<CabinetMeshProps> = ({
  item,
  selectedFinish: finishProp,
  selectedBenchtop: benchtopProp,
  selectedKick: kickProp,
  globalDimensions: dimensionsProp,
  hardwareOptions: hardwareProp,
  isSelected: isSelectedProp,
  isDragged: isDraggedProp,
  doorsOpen,
  onSelect,
  onDragStart,
  onEdit,
  suppressFronts,
  sinkCutout,
}) => {
  // Props-first: this component is used by both planners, so it must not rely on PlannerContext.
  const selectedFinish = finishProp ?? FINISH_OPTIONS[0];
  const selectedBenchtop = benchtopProp ?? BENCHTOP_OPTIONS[0];
  const selectedKick = kickProp ?? KICK_OPTIONS[0];
  const globalDimensions = dimensionsProp ?? DEFAULT_GLOBAL_DIMENSIONS;
  const hardwareOptions = { handleId: hardwareProp?.handleId ?? HANDLE_OPTIONS[0].id };

  const isSelected = isSelectedProp ?? false;
  const isDragged = isDraggedProp ?? false;

  const handleSelect = onSelect;
  const handleDragStart = onDragStart;
  
  // Get catalog with loading state
  const { isLoading: catalogLoading } = useCatalog('admin');
  
  // Get catalog item with render config
  const catalogItem = useCatalogItem(item.definitionId);
  const concealedRangehood = isConcealedRangehoodAppliance(item, catalogItem);
  const [hovered, setHovered] = useState(false);

  // Resolve the handle: real catalog handles (hardware_pricing row ids,
  // registered by useMaterialsCatalog) first, then the built-in options.
  const catalogHandle = resolveHandleDefinition(hardwareOptions.handleId);
  const builtinHandle = HANDLE_OPTIONS.find(h => h.id === hardwareOptions.handleId) || HANDLE_OPTIONS[0];
  const baseHandle = catalogHandle ?? builtinHandle;
  // User-chosen finish colour applies unless the product's material fixes it (brass, wood…).
  const finishHex = !baseHandle.finishLocked && handleFinishHex(hardwareProp?.handleColor);
  const selectedHandle = finishHex ? { ...baseHandle, hex: finishHex } : baseHandle;

  // Get materials with grain direction support
  const { materials } = useCabinetMaterials(
    selectedFinish,
    selectedBenchtop,
    selectedKick
  );

  // Generate render config from catalog item or create a default
  const renderConfig: CabinetRenderConfig = useMemo(() => {
    if (catalogItem?.renderConfig) {
      return catalogItem.renderConfig;
    }
    
    // Create a default render config if catalog item not found
    return {
      productId: item.definitionId,
      productName: 'Cabinet',
      category: 'Base',
      cabinetType: 'Standard',
      productType: 'cabinet' as const,
      specGroup: 'Base Cabinets',
      doorCount: 1,
      drawerCount: 0,
      isCorner: false,
      isSink: false,
      isBlind: false,
      isPantry: false,
      isAppliance: false,
      isOven: false,
      isFridge: false,
      isRangehood: false,
      isDishwasher: false,
      hasFalseFront: false,
      hasAdjustableShelves: true,
      shelfCount: 1,
      cornerType: null,
      leftArmDepth: 575,
      rightArmDepth: 575,
      blindDepth: 150,
      fillerWidth: 75,
      hasReturnFiller: false,
      defaultWidth: item.width || 600,
      defaultHeight: item.height || 720,
      defaultDepth: item.depth || 560,
    };
  }, [catalogItem, item.definitionId, item.width, item.height, item.depth]);

  // Validate dimensions
  const safeWidth = item.width && !isNaN(item.width) && item.width > 0 ? item.width : 600;
  const safeHeight = item.height && !isNaN(item.height) && item.height > 0 ? item.height : 720;
  const safeDepth = item.depth && !isNaN(item.depth) && item.depth > 0 ? item.depth : 560;
  
  // Skip render only if item is completely invalid
  if (!item || !item.instanceId) {
    console.warn('CabinetMesh: Invalid item provided');
    return null;
  }

  // Calculate cabinet position based on category
  // - Base cabinets: positioned on floor
  // - Wall cabinets: auto-elevated to hang above benchtop (standard: 870mm base + 33mm bench + 450mm splash = 1353mm)
  // - Tall cabinets: positioned on floor
  const widthM = safeWidth / 1000;
  const heightM = safeHeight / 1000;
  const depthM = safeDepth / 1000;
  
  // Wall cabinet elevation: uses the room's wallMountHeight from globalDimensions
  // (set in the room setup wizard). Falls back to 1350mm if not specified.
  const isWallCabinet = renderConfig.category === 'Wall';
  const wallMountHeight = globalDimensions?.wallMountHeight ?? 1350;

  // Calculate Y position
  // For wall cabinets without explicit Y, mount at the room's configured height.
  // item.y === 0 means no per-cabinet override — use the room default.
  const baseY = item.y || 0;
  const autoElevatedY = isWallCabinet && baseY === 0
    ? wallMountHeight
    : baseY;
  
  // Position is center of cabinet, so add half height
  const position: [number, number, number] = [
    item.x / 1000, 
    (autoElevatedY / 1000) + (heightM / 2), 
    item.z / 1000
  ];

  if (catalogLoading && !catalogItem) {
    return (
      <group position={position} rotation={[0, -THREE.MathUtils.degToRad(item.rotation || 0), 0]}>
        <mesh>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshBasicMaterial color="#9ca3af" wireframe opacity={0.5} transparent />
        </mesh>
      </group>
    );
  }

  // Verify materials exist
  if (!materials || !materials.gable) {
    console.warn('CabinetMesh: Materials not available yet');
    return null;
  }

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

  // Create safe item with validated dimensions (no hook to avoid hook-order issues)
  const safeItem = {
    ...item,
    width: safeWidth,
    height: safeHeight,
    depth: safeDepth,
  };

  return (
    <group
      position={position}
      rotation={[0, -THREE.MathUtils.degToRad(item.rotation || 0), 0]}
      userData={{ itemId: item.instanceId }}
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit?.(item.instanceId); }}
      onPointerOver={() => setHovered(true)} 
      onPointerOut={() => setHovered(false)}
    >
      <CabinetAssembler
        item={safeItem}
        config={renderConfig}
        finishMaterial={selectedFinish}
        benchtopMaterial={selectedBenchtop}
        kickMaterial={selectedKick}
        handle={selectedHandle}
        globalDimensions={globalDimensions}
        materials={materials}
        isSelected={isSelected}
        isDragged={isDragged}
        hovered={hovered}
        doorsOpen={doorsOpen}
        suppressFronts={suppressFronts}
        sinkCutout={sinkCutout}
      />
      {concealedRangehood && (
        <ConcealedRangehoodInsert
          widthM={widthM}
          heightM={heightM}
          depthM={depthM}
        />
      )}
    </group>
  );
};

export default CabinetMesh;
