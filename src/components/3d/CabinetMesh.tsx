import React, { useState, useMemo, useContext } from 'react';
import * as THREE from 'three';
import { PlacedItem, MaterialOption, GlobalDimensions, HardwareOptions } from '../../types';
import { HANDLE_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS, FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS } from '../../constants';
import { useCatalogItem, useCatalog } from '../../hooks/useCatalog';
import { useCabinetMaterials } from '../../hooks/useCabinetMaterials';
import CabinetAssembler from './CabinetAssembler';
import { CabinetRenderConfig } from '../../types/cabinetConfig';

// Optional context import - only used if props not provided
let usePlannerContext: (() => any) | null = null;
try {
  const plannerModule = require('../../store/PlannerContext');
  usePlannerContext = plannerModule.usePlanner;
} catch {
  // PlannerContext not available
}

interface CabinetMeshProps {
  item: PlacedItem;
  // Optional props - if provided, these override context values
  selectedFinish?: MaterialOption;
  selectedBenchtop?: MaterialOption;
  selectedKick?: MaterialOption;
  globalDimensions?: GlobalDimensions;
  hardwareOptions?: HardwareOptions;
  isSelected?: boolean;
  isDragged?: boolean;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, x: number, z: number) => void;
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
  onSelect,
  onDragStart,
}) => {
  // Try to get context values if available
  let contextValues: any = null;
  try {
    if (usePlannerContext) {
      contextValues = usePlannerContext();
    }
  } catch {
    // Context not available - will use props
  }
  
  // Use props if provided, otherwise fall back to context, then defaults
  const selectedFinish = finishProp ?? contextValues?.selectedFinish ?? FINISH_OPTIONS[0];
  const selectedBenchtop = benchtopProp ?? contextValues?.selectedBenchtop ?? BENCHTOP_OPTIONS[0];
  const selectedKick = kickProp ?? contextValues?.selectedKick ?? KICK_OPTIONS[0];
  const globalDimensions = dimensionsProp ?? contextValues?.globalDimensions ?? DEFAULT_GLOBAL_DIMENSIONS;
  const hardwareOptions = hardwareProp ?? contextValues?.hardwareOptions ?? { handleId: HANDLE_OPTIONS[0].id };
  
  const isSelected = isSelectedProp ?? (contextValues?.selectedItemId === item.instanceId);
  const isDragged = isDraggedProp ?? (contextValues?.draggedItemId === item.instanceId);
  
  const handleSelect = onSelect ?? contextValues?.selectItem;
  const handleDragStart = onDragStart ?? contextValues?.startDrag;
  
  // Get catalog with loading state
  const { isLoading: catalogLoading } = useCatalog('admin');
  
  // Get catalog item with render config
  const catalogItem = useCatalogItem(item.definitionId);
  const [hovered, setHovered] = useState(false);

  const selectedHandle = HANDLE_OPTIONS.find(h => h.id === hardwareOptions.handleId) || HANDLE_OPTIONS[0];

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

  // Show loading placeholder while catalog is loading
  const widthM = safeWidth / 1000;
  const heightM = safeHeight / 1000;
  const depthM = safeDepth / 1000;
  const position: [number, number, number] = [item.x / 1000, (item.y / 1000) + (heightM / 2), item.z / 1000];

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

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    handleSelect?.(item.instanceId);
    handleDragStart?.(item.instanceId, item.x, item.z);
  };

  // Create safe item with validated dimensions
  const safeItem = useMemo(() => ({
    ...item,
    width: safeWidth,
    height: safeHeight,
    depth: safeDepth,
  }), [item, safeWidth, safeHeight, safeDepth]);

  return (
    <group 
      position={position} 
      rotation={[0, -THREE.MathUtils.degToRad(item.rotation || 0), 0]} 
      onPointerDown={handlePointerDown}
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
      />
    </group>
  );
};

export default CabinetMesh;
