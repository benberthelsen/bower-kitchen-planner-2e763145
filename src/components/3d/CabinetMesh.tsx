import React, { useState, useMemo } from 'react';
import * as THREE from 'three';
import { usePlanner } from '../../store/PlannerContext';
import { PlacedItem } from '../../types';
import { HANDLE_OPTIONS } from '../../constants';
import { useCatalogItem } from '../../hooks/useCatalog';
import { useCabinetMaterials } from '../../hooks/useCabinetMaterials';
import CabinetAssembler from './CabinetAssembler';
import { CabinetRenderConfig, parseProductToRenderConfig } from '../../types/cabinetConfig';

interface Props {
  item: PlacedItem;
}

/**
 * CabinetMesh - Renders a 3D cabinet using the modular CabinetAssembler
 * Uses Microvellum product metadata for accurate, spec-compliant rendering
 */
const CabinetMesh: React.FC<Props> = ({ item }) => {
  const { 
    selectItem, selectedItemId, draggedItemId, startDrag, 
    selectedFinish, selectedBenchtop, selectedKick, 
    globalDimensions, hardwareOptions 
  } = usePlanner();
  
  // Get catalog item with render config
  const catalogItem = useCatalogItem(item.definitionId);
  const isSelected = selectedItemId === item.instanceId;
  const isDragged = draggedItemId === item.instanceId;
  const [hovered, setHovered] = useState(false);

  const selectedHandle = HANDLE_OPTIONS.find(h => h.id === hardwareOptions.handleId) || HANDLE_OPTIONS[0];

  // Get materials with grain direction support - with defensive check
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
    // This handles legacy items or loading states
    return {
      productId: item.definitionId,
      productName: 'Cabinet',
      category: 'Base',
      cabinetType: 'Standard',
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
      defaultWidth: item.width || 600,
      defaultHeight: item.height || 720,
      defaultDepth: item.depth || 560,
    };
  }, [catalogItem, item.definitionId, item.width, item.height, item.depth]);

  // Validate dimensions - with better fallbacks
  const safeWidth = item.width && !isNaN(item.width) && item.width > 0 ? item.width : 600;
  const safeHeight = item.height && !isNaN(item.height) && item.height > 0 ? item.height : 720;
  const safeDepth = item.depth && !isNaN(item.depth) && item.depth > 0 ? item.depth : 560;
  
  // Skip render only if item is completely invalid
  if (!item || !item.instanceId) {
    console.warn('CabinetMesh: Invalid item provided');
    return null;
  }

  // Verify materials exist
  if (!materials || !materials.gable) {
    console.warn('CabinetMesh: Materials not available yet');
    return null;
  }

  const widthM = safeWidth / 1000;
  const heightM = safeHeight / 1000;
  const depthM = safeDepth / 1000;

  const position: [number, number, number] = [item.x / 1000, (item.y / 1000) + (heightM / 2), item.z / 1000];

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    selectItem(item.instanceId);
    startDrag(item.instanceId, item.x, item.z);
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
