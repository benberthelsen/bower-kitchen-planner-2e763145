import React, { useState, useMemo } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { PlacedItem, MaterialOption } from '../../types';
import { CATALOG, HANDLE_OPTIONS, APPLIANCE_MODELS } from '../../constants';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { getProceduralTexture } from '../../utils/textureGenerator';

interface Props {
  item: PlacedItem;
}

const CabinetMesh: React.FC<Props> = ({ item }) => {
  const { 
    selectItem, selectedItemId, draggedItemId, startDrag, 
    selectedFinish, selectedBenchtop, selectedKick, 
    globalDimensions, hardwareOptions 
  } = usePlanner();
  
  const def = CATALOG.find(c => c.id === item.definitionId);
  const isSelected = selectedItemId === item.instanceId;
  const isDragged = draggedItemId === item.instanceId;
  const [hovered, setHovered] = useState(false);

  const selectedHandle = HANDLE_OPTIONS.find(h => h.id === hardwareOptions.handleId) || HANDLE_OPTIONS[0];

  if (!def) return null;
  if (!item.width || !item.height || !item.depth || isNaN(item.width) || isNaN(item.height) || isNaN(item.depth)) return null;

  const widthM = item.width / 1000;
  const heightM = item.height / 1000;
  const depthM = item.depth / 1000;

  const position: [number, number, number] = [item.x / 1000, (item.y / 1000) + (heightM / 2), item.z / 1000];

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    selectItem(item.instanceId);
    // Start drag tracking - actual drag only begins after movement threshold
    startDrag(item.instanceId, item.x, item.z);
  };

  const useMaterialProps = (option: MaterialOption) => {
    const texture = useMemo(() => getProceduralTexture(option.textureType || 'none'), [option.textureType]);
    return { color: option.hex, roughness: option.roughness ?? 0.5, metalness: option.metalness ?? 0.0, map: texture };
  };

  const finishProps = useMaterialProps(selectedFinish);
  const benchProps = useMaterialProps(selectedBenchtop);
  const kickProps = useMaterialProps(selectedKick);

  const kickHeight = (globalDimensions.toeKickHeight || 135) / 1000;
  const overhangM = (globalDimensions.benchtopOverhang || 0) / 1000;
  const btThickness = (globalDimensions.benchtopThickness || 33) / 1000;
  const splashHeight = (globalDimensions.splashbackHeight || 600) / 1000;
  const doorGap = (globalDimensions.doorGap || 2) / 1000;
  const drawerGap = (globalDimensions.drawerGap || 2) / 1000;

  const isBaseOrTall = def.category === 'Base' || def.category === 'Tall';
  const hasKick = isBaseOrTall && !def.sku.includes('PNL') && !def.sku.includes('FILLER');
  const carcassHeight = Math.max(0.1, heightM - (hasKick ? kickHeight : 0));
  const carcassYOffset = hasKick ? kickHeight / 2 : 0;
  const isPanel = def.sku.includes('PNL') || def.sku.includes('FILLER');
  const btDepthM = depthM + overhangM;

  // Determine cabinet configuration from SKU
  const is2Door = def.sku.includes('2D');
  const is1Door = def.sku.includes('1D') && !is2Door;
  const isDrawer = def.sku.includes('Dr') || def.sku.includes('dr');
  const drawerCount = parseInt(def.sku.match(/(\d)Dr/i)?.[1] || '0');
  const isPullout = def.sku.includes('PO');
  const isSink = def.sku.includes('SINK');
  const isOven = def.sku.includes('OV');
  const isCorner = def.sku.includes('BC') || def.sku.includes('LC');
  const isRangehood = def.sku.includes('RH');
  const isFridge = def.sku.includes('REF');

  const hinge = item.hinge || 'Left';
  const handleX = hinge === 'Right' ? -widthM / 2 + 0.05 : widthM / 2 - 0.05;
  const handleY = def.category === 'Wall' ? carcassYOffset - carcassHeight / 2 + 0.05 : carcassYOffset + carcassHeight / 2 - 0.05;

  // Handle component
  const Handle = ({ x, y, z, rotation = 0 }: { x: number; y: number; z: number; rotation?: number }) => {
    if (selectedHandle.type === 'None') return null;
    const color = selectedHandle.hex;
    
    if (selectedHandle.type === 'Knob') {
      return (
        <mesh position={[x, y, z]}>
          <sphereGeometry args={[0.015, 16, 16]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
        </mesh>
      );
    }
    
    if (selectedHandle.type === 'Lip') {
      return (
        <mesh position={[x, y, z]} rotation={[0, 0, rotation]}>
          <boxGeometry args={[0.1, 0.02, 0.015]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
        </mesh>
      );
    }
    
    // Bar handle
    return (
      <group position={[x, y, z]} rotation={[0, 0, rotation]}>
        <mesh><cylinderGeometry args={[0.006, 0.006, 0.14, 8]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.2} /></mesh>
        <mesh position={[0, 0.06, 0.015]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.004, 0.004, 0.03, 8]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.2} /></mesh>
        <mesh position={[0, -0.06, 0.015]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.004, 0.004, 0.03, 8]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.2} /></mesh>
      </group>
    );
  };

  // Door component
  const Door = ({ x, y, z, w, h, hingeLeft = true }: { x: number; y: number; z: number; w: number; h: number; hingeLeft?: boolean }) => {
    const handlePosX = hingeLeft ? w / 2 - 0.04 : -w / 2 + 0.04;
    const handlePosY = def.category === 'Wall' ? -h / 2 + 0.08 : h / 2 - 0.08;
    
    return (
      <group position={[x, y, z]}>
        <mesh>
          <boxGeometry args={[w - doorGap * 2, h - doorGap * 2, 0.018]} />
          <meshStandardMaterial {...finishProps} />
        </mesh>
        <Handle x={handlePosX} y={handlePosY} z={0.015} />
      </group>
    );
  };

  // Drawer component
  const Drawer = ({ x, y, z, w, h }: { x: number; y: number; z: number; w: number; h: number }) => (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[w - drawerGap * 2, h - drawerGap * 2, 0.018]} />
        <meshStandardMaterial {...finishProps} />
      </mesh>
      <Handle x={0} y={0} z={0.015} rotation={Math.PI / 2} />
    </group>
  );

  // Render doors/drawers based on configuration
  const renderFronts = () => {
    const frontZ = depthM / 2 + 0.01;
    const frontH = carcassHeight;

    // Drawers
    if (isDrawer && drawerCount > 0) {
      const drawerH = frontH / drawerCount;
      return Array.from({ length: drawerCount }).map((_, i) => (
        <Drawer 
          key={i} 
          x={0} 
          y={carcassYOffset + frontH / 2 - drawerH / 2 - i * drawerH} 
          z={frontZ} 
          w={widthM} 
          h={drawerH} 
        />
      ));
    }

    // Two doors
    if (is2Door) {
      const doorW = widthM / 2;
      return (
        <>
          <Door x={-doorW / 2} y={carcassYOffset} z={frontZ} w={doorW} h={frontH} hingeLeft={false} />
          <Door x={doorW / 2} y={carcassYOffset} z={frontZ} w={doorW} h={frontH} hingeLeft={true} />
        </>
      );
    }

    // Single door (default for most cabinets)
    if (!isPanel && !isSink && !isOven && !isFridge) {
      return <Door x={0} y={carcassYOffset} z={frontZ} w={widthM} h={frontH} hingeLeft={hinge === 'Left'} />;
    }

    return null;
  };

  // End panels
  const renderEndPanels = () => {
    const panels = [];
    const panelThickness = 0.018;
    
    if (item.endPanelLeft) {
      panels.push(
        <mesh key="left-panel" position={[-widthM / 2 - panelThickness / 2, carcassYOffset, 0]}>
          <boxGeometry args={[panelThickness, carcassHeight, depthM]} />
          <meshStandardMaterial {...finishProps} />
        </mesh>
      );
    }
    
    if (item.endPanelRight) {
      panels.push(
        <mesh key="right-panel" position={[widthM / 2 + panelThickness / 2, carcassYOffset, 0]}>
          <boxGeometry args={[panelThickness, carcassHeight, depthM]} />
          <meshStandardMaterial {...finishProps} />
        </mesh>
      );
    }
    
    return panels;
  };

  // Filler strips
  const renderFillers = () => {
    const fillers = [];
    
    if (item.fillerLeft && item.fillerLeft > 0) {
      const fillerW = item.fillerLeft / 1000;
      fillers.push(
        <mesh key="left-filler" position={[-widthM / 2 - fillerW / 2, carcassYOffset, depthM / 2 + 0.005]}>
          <boxGeometry args={[fillerW, carcassHeight, 0.01]} />
          <meshStandardMaterial {...finishProps} />
        </mesh>
      );
    }
    
    if (item.fillerRight && item.fillerRight > 0) {
      const fillerW = item.fillerRight / 1000;
      fillers.push(
        <mesh key="right-filler" position={[widthM / 2 + fillerW / 2, carcassYOffset, depthM / 2 + 0.005]}>
          <boxGeometry args={[fillerW, carcassHeight, 0.01]} />
          <meshStandardMaterial {...finishProps} />
        </mesh>
      );
    }
    
    return fillers;
  };

  return (
    <group 
      position={position} 
      rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} 
      onPointerDown={handlePointerDown}
      onPointerOver={() => setHovered(true)} 
      onPointerOut={() => setHovered(false)}
    >
      {/* Selection/hover highlight */}
      {(isSelected || hovered || isDragged) && (
        <mesh>
          <boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} />
          <meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent />
        </mesh>
      )}
      
      {/* Carcass (main cabinet box) */}
      <mesh position={[0, carcassYOffset, 0]}>
        <boxGeometry args={[widthM - 0.002, carcassHeight - 0.002, depthM - 0.002]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.7} />
      </mesh>
      
      {/* Cabinet sides */}
      <mesh position={[-widthM / 2 + 0.009, carcassYOffset, 0]}>
        <boxGeometry args={[0.018, carcassHeight, depthM]} />
        <meshStandardMaterial {...finishProps} />
      </mesh>
      <mesh position={[widthM / 2 - 0.009, carcassYOffset, 0]}>
        <boxGeometry args={[0.018, carcassHeight, depthM]} />
        <meshStandardMaterial {...finishProps} />
      </mesh>
      
      {/* Doors/Drawers */}
      {renderFronts()}
      
      {/* End panels */}
      {renderEndPanels()}
      
      {/* Fillers */}
      {renderFillers()}
      
      {/* Benchtop for base cabinets */}
      {def.category === 'Base' && !isPanel && (
        <mesh position={[0, heightM / 2 + btThickness / 2, overhangM / 2]}>
          <boxGeometry args={[widthM + (item.fillerLeft || 0) / 1000 + (item.fillerRight || 0) / 1000, btThickness, btDepthM]} />
          <meshStandardMaterial {...benchProps} />
        </mesh>
      )}
      
      {/* Splashback for wall cabinets */}
      {def.category === 'Wall' && splashHeight > 0 && (
        <mesh position={[0, -carcassHeight / 2 - splashHeight / 2, -depthM / 2 + 0.005]}>
          <boxGeometry args={[widthM, splashHeight, 0.01]} />
          <meshStandardMaterial {...benchProps} />
        </mesh>
      )}
      
      {/* Toe kick */}
      {hasKick && (
        <mesh position={[0, -heightM / 2 + kickHeight / 2, depthM / 2 - 0.04]}>
          <boxGeometry args={[widthM - 0.02, kickHeight - 0.01, 0.015]} />
          <meshStandardMaterial {...kickProps} />
        </mesh>
      )}
      
      {/* Oven cavity for oven cabinets */}
      {isOven && (
        <mesh position={[0, carcassYOffset + 0.1, 0.01]}>
          <boxGeometry args={[widthM - 0.04, carcassHeight * 0.6, depthM - 0.04]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.5} />
        </mesh>
      )}
      
      {/* Fridge space indicator */}
      {isFridge && (
        <mesh position={[0, carcassYOffset, 0]}>
          <boxGeometry args={[widthM - 0.1, carcassHeight - 0.1, depthM - 0.1]} />
          <meshStandardMaterial color="#e5e7eb" transparent opacity={0.3} />
        </mesh>
      )}
      
      {/* Cabinet label when selected */}
      {isSelected && (
        <Html position={[0, heightM / 2 + 0.4, 0]} center zIndexRange={[100, 0]}>
          <div className="bg-gray-900/90 backdrop-blur text-white px-3 py-2 rounded-md shadow-xl border border-white/20 flex flex-col items-center pointer-events-none select-none min-w-[100px]">
            <span className="text-xs font-bold tracking-wide text-blue-200">{item.cabinetNumber} - {def.sku}</span>
            <div className="h-px w-full bg-white/20 my-1"></div>
            <span className="text-[10px] text-gray-300 font-mono">{Math.round(item.width)}w × {Math.round(item.height)}h × {Math.round(item.depth)}d</span>
          </div>
        </Html>
      )}
    </group>
  );
};

export default CabinetMesh;
