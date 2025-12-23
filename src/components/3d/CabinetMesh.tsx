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
  const { selectItem, selectedItemId, draggedItemId, setDraggedItem, selectedFinish, selectedBenchtop, selectedKick, globalDimensions, recordHistory, hardwareOptions } = usePlanner();
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
    recordHistory();
    setDraggedItem(item.instanceId);
    selectItem(item.instanceId);
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
  const isBaseOrTall = def.category === 'Base' || def.category === 'Tall';
  const hasKick = isBaseOrTall && !def.sku.includes('PNL') && !def.sku.includes('FILLER');
  const carcassHeight = Math.max(0.1, heightM - (hasKick ? kickHeight : 0));
  const carcassYOffset = hasKick ? kickHeight / 2 : 0;
  const isPanel = def.sku.includes('PNL') || def.sku.includes('FILLER');
  const btDepthM = depthM + overhangM;

  const Handle = ({ x, y, z }: { x: number; y: number; z: number }) => {
    if (selectedHandle.type === 'None') return null;
    const color = selectedHandle.hex;
    if (selectedHandle.type === 'Knob') {
      return <mesh position={[x, y, z]}><sphereGeometry args={[0.015, 16, 16]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.2} /></mesh>;
    }
    return (
      <group position={[x, y, z]}>
        <mesh position={[0, 0, 0.02]}><cylinderGeometry args={[0.006, 0.006, 0.14, 8]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.2} /></mesh>
      </group>
    );
  };

  const hinge = item.hinge || 'Left';
  const handleX = hinge === 'Right' ? -widthM / 2 + 0.05 : widthM / 2 - 0.05;
  const handleY = def.category === 'Wall' ? carcassYOffset - carcassHeight / 2 + 0.05 : carcassYOffset + carcassHeight / 2 - 0.05;

  return (
    <group position={position} rotation={[0, -THREE.MathUtils.degToRad(item.rotation), 0]} onClick={handlePointerDown} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      {(isSelected || hovered || isDragged) && (
        <mesh><boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} /><meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent /></mesh>
      )}
      
      <mesh position={[0, carcassYOffset, 0]}><boxGeometry args={[widthM, carcassHeight, depthM]} /><meshStandardMaterial {...finishProps} /></mesh>
      
      {!isPanel && (
        <mesh position={[0, carcassYOffset, depthM / 2 + 0.01]}><planeGeometry args={[widthM - 0.004, carcassHeight - 0.004]} /><meshStandardMaterial {...finishProps} /></mesh>
      )}
      
      {!isPanel && <Handle x={handleX} y={handleY} z={depthM / 2 + 0.02} />}
      
      {def.category === 'Base' && !isPanel && (
        <mesh position={[0, heightM / 2 + 0.015, overhangM / 2]}><boxGeometry args={[widthM, 0.03, btDepthM]} /><meshStandardMaterial {...benchProps} /></mesh>
      )}
      
      {hasKick && (
        <mesh position={[0, -heightM / 2 + kickHeight / 2, depthM / 2 - 0.03]}><boxGeometry args={[widthM, kickHeight, 0.01]} /><meshStandardMaterial {...kickProps} /></mesh>
      )}
      
      {isSelected && (
        <Html position={[0, heightM / 2 + 0.4, 0]} center zIndexRange={[100, 0]}>
          <div className="bg-gray-900/90 backdrop-blur text-white px-3 py-2 rounded-md shadow-xl border border-white/20 flex flex-col items-center pointer-events-none select-none min-w-[100px]">
            <span className="text-xs font-bold tracking-wide text-blue-200">{def.sku}</span>
            <div className="h-px w-full bg-white/20 my-1"></div>
            <span className="text-[10px] text-gray-300 font-mono">{Math.round(item.width)}w x {Math.round(item.height)}h x {Math.round(item.depth)}d</span>
          </div>
        </Html>
      )}
    </group>
  );
};

export default CabinetMesh;
