import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import { ConfiguredCabinet } from '@/contexts/TradeRoomContext';
import CabinetMesh from '@/components/3d/CabinetMesh';
import { FINISH_OPTIONS } from '@/constants';
import { PlacedItem } from '@/types';
import { useMaterialsCatalog } from '@/hooks/useMaterialsCatalog';

interface Preview3DProps {
  cabinet: ConfiguredCabinet;
  className?: string;
}

// Convert the editor's ConfiguredCabinet to the PlacedItem the real renderer uses,
// mirroring the planner's placedItems mapping (incl. square L-corner footprint).
function toPlacedItem(cabinet: ConfiguredCabinet): PlacedItem {
  const nm = cabinet.productName || '';
  const isLCorner = /corner/i.test(nm) && !/diagonal|blind|open|angle/i.test(nm);
  const storedDepth = cabinet.dimensions.depth;
  return {
    instanceId: cabinet.instanceId || 'preview',
    definitionId: cabinet.definitionId,
    itemType: cabinet.category === 'Appliance' ? 'Appliance' : 'Cabinet',
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    width: cabinet.dimensions.width,
    depth: isLCorner ? cabinet.dimensions.width : storedDepth,
    height: cabinet.dimensions.height,
    hinge: cabinet.construction?.hingeSide ?? 'Left',
    cabinetNumber: cabinet.cabinetNumber,
    finishColor: cabinet.materials?.exteriorFinish,
    carcaseMaterialId: cabinet.materials?.carcaseFinish,
    exteriorMaterialId: cabinet.materials?.exteriorFinish,
    handleType: cabinet.hardware?.handleType,
    leftCarcaseDepth: cabinet.construction?.cabinetDepthLeft ?? (isLCorner ? storedDepth : undefined),
    rightCarcaseDepth: cabinet.construction?.cabinetDepthRight ?? (isLCorner ? storedDepth : undefined),
    secondWidth: cabinet.construction?.secondWidth ?? (isLCorner ? cabinet.dimensions.width : undefined),
    shelfCount: cabinet.accessories?.shelfCount,
    fillerLeft: cabinet.construction?.leftFillerWidth,
    fillerRight: cabinet.construction?.rightFillerWidth,
    blindSide: cabinet.construction?.blindSide,
  } as PlacedItem;
}

export function Preview3D({ cabinet, className = '' }: Preview3DProps) {
  const { materials } = useMaterialsCatalog();
  const item = useMemo(() => {
    const it = toPlacedItem(cabinet);
    const findUrl = (id?: string) => {
      const m = id ? materials.find((x) => x.id === id) : undefined;
      return m ? (m.textureImageUrl || m.sampleImageUrl || null) : null;
    };
    it.doorTextureUrl = findUrl(cabinet.materials?.exteriorFinish);
    it.carcaseTextureUrl = findUrl(cabinet.materials?.carcaseFinish);
    return it;
  }, [cabinet, materials]);
  const finish = useMemo(
    () => (cabinet.materials?.exteriorFinish ? FINISH_OPTIONS.find(f => f.id === cabinet.materials.exteriorFinish) : undefined),
    [cabinet.materials?.exteriorFinish]
  );

  // Scene works in metres (matches the planner). Frame the cabinet by its largest side.
  const maxDim = Math.max(cabinet.dimensions.width, cabinet.dimensions.height, cabinet.dimensions.depth) / 1000;
  const camD = maxDim * 2.2;
  const targetY = cabinet.dimensions.height / 2000;

  return (
    <div className={`w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg overflow-hidden ${className}`}>
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[camD * 0.85, camD * 0.7, camD]} fov={45} />
        <OrbitControls
          enablePan={false}
          minDistance={maxDim * 1.2}
          maxDistance={maxDim * 6}
          target={[0, targetY, 0]}
        />

        <ambientLight intensity={0.45} />
        <hemisphereLight args={[0xffffff, 0xbfc4cc, 0.5]} />
        <directionalLight position={[3, 6, 4]} intensity={1.0} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 4, -3]} intensity={0.3} />

        <Suspense fallback={null}>
          {/* Same renderer as the planner — corners, 16mm carcass, reveals, rails all match */}
          <CabinetMesh
            item={item}
            selectedFinish={finish}
            hardwareOptions={item.handleType ? { handleId: item.handleType } : undefined}
          />
          <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={Math.max(maxDim * 2, 2)} blur={2} far={4} />
          {/* No external HDR Environment — the explicit lights above keep the
              render self-contained (an external HDR fetch can 400 and crash the scene). */}
        </Suspense>

        <gridHelper args={[10, 20, '#cccccc', '#e5e5e5']} position={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
