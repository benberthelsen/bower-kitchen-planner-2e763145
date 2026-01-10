import React from 'react';
import { PlacedItem, MaterialOption, GlobalDimensions, HandleDefinition } from '../../types';
import { CabinetRenderConfig } from '../../types/cabinetConfig';
import CabinetAssembler from './CabinetAssembler';
import CountertopMesh from './cabinet-parts/CountertopMesh';
import AppliancePlaceholder from './AppliancePlaceholder';

interface MaterialProps {
  color: string;
  roughness: number;
  metalness: number;
  map: THREE.Texture | null;
}

interface CabinetMaterials {
  gable: MaterialProps;
  gableInterior: MaterialProps;  // Interior face (white melamine)
  gableExterior: MaterialProps;  // Exterior face (door finish)
  door: MaterialProps;
  drawer: MaterialProps;
  shelf: MaterialProps;
  bottom: MaterialProps;
  back: MaterialProps;
  kickboard: MaterialProps;
  benchtop: MaterialProps;
  endPanel: MaterialProps;
  falseFront: MaterialProps;
}

interface ProductRendererProps {
  item: PlacedItem;
  config: CabinetRenderConfig;
  finishMaterial: MaterialOption;
  benchtopMaterial: MaterialOption;
  kickMaterial: MaterialOption;
  handle: HandleDefinition;
  globalDimensions: GlobalDimensions;
  materials: CabinetMaterials;
  isSelected: boolean;
  isDragged: boolean;
  hovered: boolean;
}

/**
 * Product Renderer - Routes products to appropriate 3D renderers based on productType
 * Handles: cabinets, countertops, appliances, panels, accessories, props
 */
const ProductRenderer: React.FC<ProductRendererProps> = (props) => {
  const { item, config, materials, isSelected, isDragged, hovered } = props;
  
  // Dimensions in meters
  const widthM = (item.width || 600) / 1000;
  const heightM = (item.height || 870) / 1000;
  const depthM = (item.depth || 575) / 1000;

  // Route to appropriate renderer based on product type
  switch (config.productType) {
    case 'countertop':
      return (
        <CountertopMesh
          width={widthM}
          depth={depthM}
          thickness={0.033} // 33mm standard
          position={[0, heightM / 2, 0]}
          color={materials.benchtop?.color || '#a0a0a0'}
          roughness={materials.benchtop?.roughness || 0.3}
          map={materials.benchtop?.map || null}
          isSelected={isSelected}
          hovered={hovered}
        />
      );

    case 'appliance':
      return (
        <AppliancePlaceholder
          item={item}
          config={config}
          isSelected={isSelected}
          isDragged={isDragged}
          hovered={hovered}
        />
      );

    case 'panel':
      // Render as a simple flat panel
      return (
        <>
          {(isSelected || hovered || isDragged) && (
            <mesh>
              <boxGeometry args={[widthM + 0.02, heightM + 0.02, 0.02]} />
              <meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent />
            </mesh>
          )}
          <mesh>
            <boxGeometry args={[widthM, heightM, 0.018]} />
            <meshStandardMaterial 
              color={materials.door?.color || '#d4d4d4'} 
              roughness={materials.door?.roughness || 0.5}
              map={materials.door?.map || null}
            />
          </mesh>
        </>
      );

    case 'prop':
      // Render props as wireframe placeholders
      return (
        <>
          {(isSelected || hovered) && (
            <mesh>
              <boxGeometry args={[widthM + 0.02, heightM + 0.02, depthM + 0.02]} />
              <meshBasicMaterial color="#3b82f6" wireframe opacity={0.5} transparent />
            </mesh>
          )}
          <mesh>
            <boxGeometry args={[widthM, heightM, depthM]} />
            <meshStandardMaterial color="#e5e7eb" transparent opacity={0.6} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(widthM, heightM, depthM)]} />
            <lineBasicMaterial color="#9ca3af" />
          </lineSegments>
        </>
      );

    case 'accessory':
      // Render accessories as simple colored boxes
      return (
        <>
          {(isSelected || hovered || isDragged) && (
            <mesh>
              <boxGeometry args={[widthM + 0.02, heightM + 0.02, depthM + 0.02]} />
              <meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent />
            </mesh>
          )}
          <mesh>
            <boxGeometry args={[widthM, heightM, depthM]} />
            <meshStandardMaterial 
              color={materials.gable?.color || '#f0f0f0'} 
              roughness={0.6}
            />
          </mesh>
        </>
      );

    case 'cabinet':
    default:
      // Use full cabinet assembler for cabinets
      return <CabinetAssembler {...props} />;
  }
};

// Need THREE for BoxGeometry in prop renderer
import * as THREE from 'three';

export default ProductRenderer;
