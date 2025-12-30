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
      defaultWidth: item.width,
      defaultHeight: item.height,
      defaultDepth: item.depth,
    };
  }, [catalogItem, item.definitionId, item.width, item.height, item.depth]);

  // Validate dimensions
  if (!item.width || !item.height || !item.depth || isNaN(item.width) || isNaN(item.height) || isNaN(item.depth)) {
    return null;
  }

  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const depthM = item.depth / 1000;

  const position: [number, number, number] = [item.x / 1000, (item.y / 1000) + (heightM / 2), item.z / 1000];

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    selectItem(item.instanceId);
    startDrag(item.instanceId, item.x, item.z);
  };

  return (
    <group 
      position={position} 
      rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} 
      onPointerDown={handlePointerDown}
      onPointerOver={() => setHovered(true)} 
      onPointerOut={() => setHovered(false)}
    >
      <CabinetAssembler
        item={item}
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
