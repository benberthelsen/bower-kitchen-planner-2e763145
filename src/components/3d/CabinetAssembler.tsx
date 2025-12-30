import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { PlacedItem, MaterialOption, GlobalDimensions, HandleDefinition } from '../../types';
import { CabinetRenderConfig, CONSTRUCTION_STANDARDS } from '../../types/cabinetConfig';
import {
  Gable,
  Shelf,
  DoorFront,
  DrawerFront,
  HandleMesh,
  BackPanel,
  BottomPanel,
  Kickboard,
  BenchtopMesh,
  FalseFront,
} from './cabinet-parts';

interface CabinetAssemblerProps {
  item: PlacedItem;
  config: CabinetRenderConfig;
  finishMaterial: MaterialOption;
  benchtopMaterial: MaterialOption;
  kickMaterial: MaterialOption;
  handle: HandleDefinition;
  globalDimensions: GlobalDimensions;
  finishTexture: THREE.Texture | null;
  benchtopTexture: THREE.Texture | null;
  kickTexture: THREE.Texture | null;
  isSelected: boolean;
  isDragged: boolean;
  hovered: boolean;
}

/**
 * Cabinet Assembler - Factory component that builds complete cabinet assemblies
 * from modular parts based on Microvellum product configuration
 */
const CabinetAssembler: React.FC<CabinetAssemblerProps> = ({
  item,
  config,
  finishMaterial,
  benchtopMaterial,
  kickMaterial,
  handle,
  globalDimensions,
  finishTexture,
  benchtopTexture,
  kickTexture,
  isSelected,
  isDragged,
  hovered,
}) => {
  // Convert dimensions from mm to meters
  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const depthM = item.depth / 1000;
  
  // Construction constants in meters
  const gableThickness = CONSTRUCTION_STANDARDS.gableThickness / 1000;
  const shelfThickness = CONSTRUCTION_STANDARDS.shelfThickness / 1000;
  const doorThickness = CONSTRUCTION_STANDARDS.doorThickness / 1000;
  const backPanelThickness = CONSTRUCTION_STANDARDS.backPanelThickness / 1000;
  const bottomThickness = CONSTRUCTION_STANDARDS.bottomPanelThickness / 1000;
  
  // Global dimensions in meters
  const kickHeight = (globalDimensions.toeKickHeight || 135) / 1000;
  const btThickness = (globalDimensions.benchtopThickness || 33) / 1000;
  const btOverhang = (globalDimensions.benchtopOverhang || 0) / 1000;
  const doorGap = (globalDimensions.doorGap || 2) / 1000;
  const drawerGap = (globalDimensions.drawerGap || 2) / 1000;
  
  // Determine if cabinet has kick (base/tall, not panels)
  const isBaseOrTall = config.category === 'Base' || config.category === 'Tall';
  const hasKick = isBaseOrTall && !config.productName.toLowerCase().includes('panel');
  
  // Calculate carcass dimensions (excluding kick)
  const carcassHeight = hasKick ? heightM - kickHeight : heightM;
  const carcassYOffset = hasKick ? kickHeight / 2 : 0;
  
  // Interior width (between gables)
  const interiorWidth = widthM - gableThickness * 2;
  
  // Material properties
  const finishProps = {
    color: finishMaterial.hex,
    roughness: finishMaterial.roughness ?? 0.5,
    metalness: finishMaterial.metalness ?? 0.0,
  };
  
  const kickProps = {
    color: kickMaterial.hex,
    roughness: kickMaterial.roughness ?? 0.6,
    metalness: kickMaterial.metalness ?? 0.0,
  };
  
  const benchProps = {
    color: benchtopMaterial.hex,
    roughness: benchtopMaterial.roughness ?? 0.3,
    metalness: benchtopMaterial.metalness ?? 0.0,
  };

  // Determine hinge side from item or default
  const hingeLeft = item.hinge !== 'Right';

  // Calculate handle position based on cabinet type
  const getHandlePosition = (doorWidth: number, doorHeight: number, isDrawer: boolean): [number, number, number] => {
    if (isDrawer) {
      return [0, 0, doorThickness / 2 + 0.015];
    }
    const handleX = hingeLeft ? doorWidth / 2 - 0.04 : -doorWidth / 2 + 0.04;
    const handleY = config.category === 'Wall' 
      ? -doorHeight / 2 + 0.08 
      : doorHeight / 2 - 0.08;
    return [handleX, handleY, doorThickness / 2 + 0.015];
  };

  // Render gables (side panels)
  const renderGables = () => (
    <>
      {/* Left gable */}
      <Gable
        width={gableThickness}
        height={carcassHeight}
        depth={depthM}
        position={[-widthM / 2 + gableThickness / 2, carcassYOffset, 0]}
        color={finishProps.color}
        roughness={finishProps.roughness}
        metalness={finishProps.metalness}
        map={finishTexture}
        grainRotation={0} // Vertical grain
      />
      {/* Right gable */}
      <Gable
        width={gableThickness}
        height={carcassHeight}
        depth={depthM}
        position={[widthM / 2 - gableThickness / 2, carcassYOffset, 0]}
        color={finishProps.color}
        roughness={finishProps.roughness}
        metalness={finishProps.metalness}
        map={finishTexture}
        grainRotation={0} // Vertical grain
      />
    </>
  );

  // Render bottom panel
  const renderBottom = () => (
    <BottomPanel
      width={interiorWidth}
      depth={depthM - backPanelThickness}
      thickness={bottomThickness}
      position={[0, carcassYOffset - carcassHeight / 2 + bottomThickness / 2, backPanelThickness / 2]}
      color={finishProps.color}
      roughness={finishProps.roughness}
      map={finishTexture}
      hasSinkCutout={config.isSink}
    />
  );

  // Render back panel
  const renderBack = () => (
    <BackPanel
      width={interiorWidth}
      height={carcassHeight - bottomThickness * 2}
      position={[0, carcassYOffset, -depthM / 2 + backPanelThickness / 2]}
    />
  );

  // Render adjustable shelves
  const renderShelves = () => {
    if (!config.hasAdjustableShelves || config.shelfCount === 0) return null;
    
    const shelves = [];
    const usableHeight = carcassHeight - bottomThickness * 2;
    const shelfSpacing = usableHeight / (config.shelfCount + 1);
    
    for (let i = 1; i <= config.shelfCount; i++) {
      const shelfY = carcassYOffset - carcassHeight / 2 + bottomThickness + shelfSpacing * i;
      shelves.push(
        <Shelf
          key={`shelf-${i}`}
          width={interiorWidth - 0.004} // Slight gap for adjustment
          depth={depthM - backPanelThickness - 0.01}
          thickness={shelfThickness}
          position={[0, shelfY, backPanelThickness / 2]}
          color="#f5f5f5"
          map={null}
          setback={globalDimensions.shelfSetback / 1000}
          adjustable={true}
        />
      );
    }
    return shelves;
  };

  // Render doors
  const renderDoors = () => {
    if (config.doorCount === 0 || config.drawerCount > 0) return null;
    
    const frontZ = depthM / 2 + 0.01;
    const doorHeight = carcassHeight - (config.isSink && config.hasFalseFront ? 0.1 : 0);
    const doorY = carcassYOffset - (config.isSink && config.hasFalseFront ? 0.05 : 0);
    
    if (config.doorCount === 2) {
      const doorWidth = widthM / 2;
      return (
        <>
          <DoorFront
            width={doorWidth}
            height={doorHeight}
            thickness={doorThickness}
            position={[-doorWidth / 2, doorY, frontZ]}
            color={finishProps.color}
            roughness={finishProps.roughness}
            map={finishTexture}
            gap={doorGap}
            hingeLeft={false}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[-doorWidth / 2 + doorWidth / 2 - 0.04, doorY + (config.category === 'Wall' ? -doorHeight / 2 + 0.08 : doorHeight / 2 - 0.08), frontZ + doorThickness / 2 + 0.015]}
          />
          <DoorFront
            width={doorWidth}
            height={doorHeight}
            thickness={doorThickness}
            position={[doorWidth / 2, doorY, frontZ]}
            color={finishProps.color}
            roughness={finishProps.roughness}
            map={finishTexture}
            gap={doorGap}
            hingeLeft={true}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[doorWidth / 2 - doorWidth / 2 + 0.04, doorY + (config.category === 'Wall' ? -doorHeight / 2 + 0.08 : doorHeight / 2 - 0.08), frontZ + doorThickness / 2 + 0.015]}
          />
        </>
      );
    }
    
    // Single door
    return (
      <>
        <DoorFront
          width={widthM}
          height={doorHeight}
          thickness={doorThickness}
          position={[0, doorY, frontZ]}
          color={finishProps.color}
          roughness={finishProps.roughness}
          map={finishTexture}
          gap={doorGap}
          hingeLeft={hingeLeft}
        />
        <HandleMesh
          type={handle.type}
          color={handle.hex}
          position={getHandlePosition(widthM, doorHeight, false)}
          rotation={0}
        />
      </>
    );
  };

  // Render drawers
  const renderDrawers = () => {
    if (config.drawerCount === 0) return null;
    
    const frontZ = depthM / 2 + 0.01;
    const drawerHeight = carcassHeight / config.drawerCount;
    
    return Array.from({ length: config.drawerCount }).map((_, i) => {
      const drawerY = carcassYOffset + carcassHeight / 2 - drawerHeight / 2 - i * drawerHeight;
      return (
        <React.Fragment key={`drawer-${i}`}>
          <DrawerFront
            width={widthM}
            height={drawerHeight}
            thickness={doorThickness}
            position={[0, drawerY, frontZ]}
            color={finishProps.color}
            roughness={finishProps.roughness}
            map={finishTexture}
            gap={drawerGap}
            showBox={true}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[0, drawerY, frontZ + doorThickness / 2 + 0.015]}
            rotation={Math.PI / 2}
          />
        </React.Fragment>
      );
    });
  };

  // Render false front for sink cabinets (ONLY if hasFalseFront is true)
  const renderFalseFront = () => {
    if (!config.isSink || !config.hasFalseFront) return null;
    
    const falseFrontHeight = 0.08; // 80mm false front
    const frontZ = depthM / 2 + 0.01;
    const falseFrontY = carcassYOffset + carcassHeight / 2 - falseFrontHeight / 2;
    
    return (
      <>
        <FalseFront
          width={widthM}
          height={falseFrontHeight}
          thickness={doorThickness}
          position={[0, falseFrontY, frontZ]}
          color={finishProps.color}
          roughness={finishProps.roughness}
          map={finishTexture}
        />
        <HandleMesh
          type={handle.type}
          color={handle.hex}
          position={[0, falseFrontY, frontZ + doorThickness / 2 + 0.015]}
          rotation={Math.PI / 2}
        />
      </>
    );
  };

  // Render kickboard
  const renderKickboard = () => {
    if (!hasKick) return null;
    
    return (
      <Kickboard
        width={widthM}
        height={kickHeight}
        position={[0, -heightM / 2 + kickHeight / 2, depthM / 2 - 0.04]}
        color={kickProps.color}
        roughness={kickProps.roughness}
        map={kickTexture}
      />
    );
  };

  // Render benchtop (base cabinets only)
  const renderBenchtop = () => {
    if (config.category !== 'Base') return null;
    
    const fillerLeftM = (item.fillerLeft || 0) / 1000;
    const fillerRightM = (item.fillerRight || 0) / 1000;
    
    return (
      <BenchtopMesh
        width={widthM}
        depth={depthM}
        thickness={btThickness}
        position={[0, heightM / 2 + btThickness / 2, 0]}
        color={benchProps.color}
        roughness={benchProps.roughness}
        map={benchtopTexture}
        overhang={btOverhang}
        leftOverhang={fillerLeftM}
        rightOverhang={fillerRightM}
        hasSinkCutout={config.isSink}
      />
    );
  };

  // Render end panels (if specified on item)
  const renderEndPanels = () => {
    const panels = [];
    
    if (item.endPanelLeft) {
      panels.push(
        <Gable
          key="end-panel-left"
          width={gableThickness}
          height={carcassHeight}
          depth={depthM}
          position={[-widthM / 2 - gableThickness / 2, carcassYOffset, 0]}
          color={finishProps.color}
          roughness={finishProps.roughness}
          map={finishTexture}
        />
      );
    }
    
    if (item.endPanelRight) {
      panels.push(
        <Gable
          key="end-panel-right"
          width={gableThickness}
          height={carcassHeight}
          depth={depthM}
          position={[widthM / 2 + gableThickness / 2, carcassYOffset, 0]}
          color={finishProps.color}
          roughness={finishProps.roughness}
          map={finishTexture}
        />
      );
    }
    
    return panels;
  };

  // Render filler strips
  const renderFillers = () => {
    const fillers = [];
    
    if (item.fillerLeft && item.fillerLeft > 0) {
      const fillerW = item.fillerLeft / 1000;
      fillers.push(
        <mesh key="filler-left" position={[-widthM / 2 - fillerW / 2, carcassYOffset, depthM / 2 + 0.005]}>
          <boxGeometry args={[fillerW, carcassHeight, 0.01]} />
          <meshStandardMaterial color={finishProps.color} roughness={finishProps.roughness} />
        </mesh>
      );
    }
    
    if (item.fillerRight && item.fillerRight > 0) {
      const fillerW = item.fillerRight / 1000;
      fillers.push(
        <mesh key="filler-right" position={[widthM / 2 + fillerW / 2, carcassYOffset, depthM / 2 + 0.005]}>
          <boxGeometry args={[fillerW, carcassHeight, 0.01]} />
          <meshStandardMaterial color={finishProps.color} roughness={finishProps.roughness} />
        </mesh>
      );
    }
    
    return fillers;
  };

  // Render oven cavity for appliance cabinets
  const renderOvenCavity = () => {
    if (!config.isOven) return null;
    
    return (
      <mesh position={[0, carcassYOffset + 0.1, 0.01]}>
        <boxGeometry args={[widthM - 0.04, carcassHeight * 0.6, depthM - 0.04]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.5} />
      </mesh>
    );
  };

  // Render fridge space indicator
  const renderFridgeSpace = () => {
    if (!config.isFridge) return null;
    
    return (
      <mesh position={[0, carcassYOffset, 0]}>
        <boxGeometry args={[widthM - 0.1, carcassHeight - 0.1, depthM - 0.1]} />
        <meshStandardMaterial color="#e5e7eb" transparent opacity={0.3} />
      </mesh>
    );
  };

  return (
    <>
      {/* Selection/hover highlight */}
      {(isSelected || hovered || isDragged) && (
        <mesh>
          <boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} />
          <meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent />
        </mesh>
      )}
      
      {/* Carcass interior (visible through gaps) */}
      <mesh position={[0, carcassYOffset, 0]}>
        <boxGeometry args={[interiorWidth - 0.002, carcassHeight - 0.002, depthM - backPanelThickness - 0.002]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.7} />
      </mesh>
      
      {/* Cabinet structure */}
      {renderGables()}
      {renderBottom()}
      {renderBack()}
      {renderShelves()}
      
      {/* Fronts - doors or drawers */}
      {renderDoors()}
      {renderDrawers()}
      {renderFalseFront()}
      
      {/* Accessories */}
      {renderEndPanels()}
      {renderFillers()}
      {renderKickboard()}
      {renderBenchtop()}
      
      {/* Special cabinet features */}
      {renderOvenCavity()}
      {renderFridgeSpace()}
      
      {/* Cabinet info label */}
      {isSelected && (
        <Html position={[0, heightM / 2 + 0.4, 0]} center zIndexRange={[100, 0]}>
          <div className="bg-gray-900/90 backdrop-blur text-white px-3 py-2 rounded-md shadow-xl border border-white/20 flex flex-col items-center pointer-events-none select-none min-w-[100px]">
            <span className="text-xs font-bold tracking-wide text-blue-200">{item.cabinetNumber}</span>
            <div className="h-px w-full bg-white/20 my-1"></div>
            <span className="text-[10px] text-gray-300 truncate max-w-[150px]">{config.productName}</span>
            <span className="text-[10px] text-gray-400 font-mono">{Math.round(item.width)}w × {Math.round(item.height)}h × {Math.round(item.depth)}d</span>
          </div>
        </Html>
      )}
    </>
  );
};

export default CabinetAssembler;
