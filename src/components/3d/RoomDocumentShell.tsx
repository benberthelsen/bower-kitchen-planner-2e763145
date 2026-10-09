import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import type { GlobalDimensions, PlacedItem } from '@/types';
import type { RoomDocumentV1 } from '@/lib/roomDocument';
import { placementPose } from '@/lib/roomDocument/geometry';
import { wallEvidenceAppearance, wallGeometrySource } from '@/lib/roomDocument/wallEvidenceAppearance';
import { existingObjectVisual, type ExistingObjectVisual } from './roomDocumentVisuals';
import { FridgeModel, fridgeStyleFor } from './appliances/fridgeModels';
import Kickboard from './cabinet-parts/Kickboard';
import Gable from './cabinet-parts/Gable';
import TopPanel from './cabinet-parts/TopPanel';
import BottomPanel from './cabinet-parts/BottomPanel';
import BackPanel from './cabinet-parts/BackPanel';
import CabinetMesh from './CabinetMesh';
import { resolveFinishKey } from './materials/applianceMaterials';
import { useCatalogItem } from '@/hooks/useCatalog';
import Wall from './Wall';

const WALL_THICKNESS_M = 0.1;

interface SolidWallPiece { offsetMm: number; widthMm: number; bottomMm: number; heightMm: number }

function SurveyOutline({ widthM, heightM, depthM }: { widthM: number; heightM: number; depthM: number }) {
  return <mesh>
    <boxGeometry args={[widthM, heightM, depthM]} />
    <meshBasicMaterial visible={false} />
    <Edges color="#b45309" threshold={15} />
  </mesh>;
}

/** Existing overheads without a known product retain their scanned envelope.
 * Planner panel parts make the survey volume legible without claiming a door
 * count, material or catalogue design that the photos did not establish. */
function SurveyedOverheadShell({ widthM, heightM, depthM }: { widthM: number; heightM: number; depthM: number }) {
  const board = Math.min(0.016, widthM / 8, heightM / 8, depthM / 8);
  const color = '#bdb39f';
  return <group>
    <Gable width={board} height={heightM} depth={depthM} position={[-(widthM - board) / 2, 0, 0]} color={color} showEdges={false} />
    <Gable width={board} height={heightM} depth={depthM} position={[(widthM - board) / 2, 0, 0]} color={color} showEdges={false} />
    <TopPanel width={widthM - 2 * board} depth={depthM} thickness={board}
      position={[0, (heightM - board) / 2, 0]} color={color} />
    <BottomPanel width={widthM - 2 * board} depth={depthM} thickness={board}
      position={[0, -(heightM - board) / 2, 0]} color={color} />
    <BackPanel width={widthM - 2 * board} height={heightM - 2 * board} thickness={board}
      position={[0, 0, -(depthM - board) / 2]} color={color} insetFromEdge={0} setback={0} showEdges={false} />
    <mesh position={[0, 0, (depthM - board) / 2]}>
      <boxGeometry args={[widthM - 2 * board, heightM - 2 * board, board]} />
      <meshStandardMaterial color={color} transparent opacity={0.45} />
    </mesh>
  </group>;
}

function CataloguedOverhead({ objectId, visual, globalDimensions }: {
  objectId: string; visual: ExistingObjectVisual; globalDimensions?: GlobalDimensions;
}) {
  const product = useCatalogItem(visual.catalogueId ?? null);
  const { pose } = visual;
  const isWallCabinet = product?.renderConfig.category === 'Wall';
  const item: PlacedItem = { instanceId: objectId, definitionId: visual.catalogueId!,
    itemType: 'Cabinet', layoutRole: 'wall-cabinet', x: pose.xMm, z: pose.zMm,
    y: visual.elevationMm, rotation: pose.rotationDeg,
    width: visual.widthMm, depth: visual.depthMm, height: visual.heightMm! };
  return <group userData={{ roomObjectId: objectId, layer: 'existing' }}>
    {isWallCabinet ? <CabinetMesh item={item} globalDimensions={globalDimensions} />
      : <group position={[pose.xMm / 1000, (visual.elevationMm + visual.heightMm! / 2) / 1000, pose.zMm / 1000]}
        rotation={[0, -pose.rotationDeg * Math.PI / 180, 0]}>
        <SurveyedOverheadShell widthM={visual.widthMm / 1000} heightM={visual.heightMm! / 1000}
          depthM={visual.depthMm / 1000} />
      </group>}
    <group position={[pose.xMm / 1000, (visual.elevationMm + visual.heightMm! / 2) / 1000, pose.zMm / 1000]}
      rotation={[0, -pose.rotationDeg * Math.PI / 180, 0]}>
      <SurveyOutline widthM={visual.widthMm / 1000} heightM={visual.heightMm! / 1000}
        depthM={visual.depthMm / 1000} />
    </group>
  </group>;
}

function ProposedCatalogueCabinet({ objectId, visual, globalDimensions }: {
  objectId: string; visual: ExistingObjectVisual; globalDimensions?: GlobalDimensions;
}) {
  const product = useCatalogItem(visual.catalogueId ?? null);
  const category = product?.renderConfig.category;
  const knownCabinet = category === 'Base' || category === 'Wall' || category === 'Tall';
  const { pose } = visual;
  const item: PlacedItem = {
    instanceId: objectId, definitionId: visual.catalogueId!, itemType: 'Cabinet',
    x: pose.xMm, z: pose.zMm, y: visual.elevationMm, rotation: pose.rotationDeg,
    width: visual.widthMm, depth: visual.depthMm, height: visual.heightMm!,
  };
  return <group key={objectId} userData={{ roomObjectId: objectId, layer: 'proposed' }}>
    {knownCabinet ? <CabinetMesh item={item} globalDimensions={globalDimensions} />
      : <group position={[pose.xMm / 1000, (visual.elevationMm + visual.heightMm! / 2) / 1000, pose.zMm / 1000]}
        rotation={[0, -pose.rotationDeg * Math.PI / 180, 0]}>
        <mesh castShadow>
          <boxGeometry args={[visual.widthMm / 1000, visual.heightMm! / 1000, visual.depthMm / 1000]} />
          <meshStandardMaterial color="#94a3b8" transparent opacity={0.65} />
        </mesh>
      </group>}
  </group>;
}

/** Subtract actual door and window apertures from a straight wall segment.
 * Splitting at each opening edge also handles overlapping openings without
 * relying on a bounding-box wall or translucent panels hiding solid masonry. */
function solidWallPieces(lengthMm: number, heightMm: number,
  openings: RoomDocumentV1['openings']): SolidWallPiece[] {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const edges = [0, lengthMm];
  for (const opening of openings) {
    edges.push(clamp(opening.offsetMm, lengthMm), clamp(opening.offsetMm + opening.widthMm, lengthMm));
  }
  const sorted = [...new Set(edges)].sort((a, b) => a - b);
  const pieces: SolidWallPiece[] = [];
  for (let index = 1; index < sorted.length; index++) {
    const left = sorted[index - 1], right = sorted[index];
    if (right - left < 1) continue;
    const midpoint = (left + right) / 2;
    const voids = openings.filter(opening => opening.offsetMm < midpoint
      && opening.offsetMm + opening.widthMm > midpoint).map(opening => {
        const bottom = clamp(opening.kind === 'window' ? opening.sillHeightMm ?? 900 : 0, heightMm);
        return { bottom, top: clamp(bottom + (opening.heightMm ?? (opening.kind === 'window' ? 1200 : 2040)), heightMm) };
      }).filter(interval => interval.top > interval.bottom)
      .sort((a, b) => a.bottom - b.bottom);
    let cursor = 0;
    for (const interval of voids) {
      if (interval.bottom > cursor + 1) pieces.push({ offsetMm: left, widthMm: right - left,
        bottomMm: cursor, heightMm: interval.bottom - cursor });
      cursor = Math.max(cursor, interval.top);
    }
    if (heightMm > cursor + 1) pieces.push({ offsetMm: left, widthMm: right - left,
      bottomMm: cursor, heightMm: heightMm - cursor });
  }
  return pieces;
}

/** The same wall geometry and evidence states as the plan editor, in planner world coordinates. */
export default function RoomDocumentShell({ document, defaultHeightMm, renderedCabinetIds, globalDimensions }: {
  document: RoomDocumentV1;
  defaultHeightMm: number;
  renderedCabinetIds?: ReadonlySet<string>;
  globalDimensions?: GlobalDimensions;
}) {
  const corners = useMemo(() => new Map(document.corners.map(corner => [corner.id, corner])), [document.corners]);
  const floor = useMemo(() => {
    if (!document.floorBoundary?.confirmed) return null;
    const points = document.floorBoundary.cornerIds.map(id => corners.get(id));
    if (points.length < 3 || points.some(point => !point)) return null;
    const shape = new THREE.Shape();
    points.forEach((point, index) => {
      const x = point!.xMm / 1000;
      const y = -point!.zMm / 1000;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [corners, document.floorBoundary]);

  return (
    <group>
      {floor && (
        <mesh geometry={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      {document.walls.map(wall => {
        const start = corners.get(wall.startCornerId);
        const end = corners.get(wall.endCornerId);
        if (!start || !end) return null;
        const dx = (end.xMm - start.xMm) / 1000;
        const dz = (end.zMm - start.zMm) / 1000;
        const length = Math.hypot(dx, dz);
        if (length < 0.01) return null;
        const tangent = { x: dx / length, z: dz / length };
        const inward = wall.interiorSide === 'right'
          ? { x: tangent.z, z: -tangent.x }
          : { x: -tangent.z, z: tangent.x };
        const heightM = (wall.height?.valueMm ?? defaultHeightMm) / 1000;
        const centreX = (start.xMm + end.xMm) / 2000 - inward.x * WALL_THICKNESS_M / 2;
        const centreZ = (start.zMm + end.zMm) / 2000 - inward.z * WALL_THICKNESS_M / 2;
        const rotationY = -Math.atan2(dz, dx);
        const appearance = wallEvidenceAppearance(wallGeometrySource(wall, Boolean(document.capture)));
        const openings = document.openings.filter(opening => opening.wallId === wall.id);
        const solids = solidWallPieces(length * 1000, heightM * 1000, openings);
        return (
          <group key={wall.id}>
            {solids.map((piece, index) => {
              const alongM = (piece.offsetMm + piece.widthMm / 2) / 1000;
              const x = start.xMm / 1000 + tangent.x * alongM - inward.x * WALL_THICKNESS_M / 2;
              const z = start.zMm / 1000 + tangent.z * alongM - inward.z * WALL_THICKNESS_M / 2;
              return <Wall key={index} position={[x, (piece.bottomMm + piece.heightMm / 2) / 1000, z]}
                rotation={[0, rotationY, 0]} width={piece.widthMm / 1000}
                height={piece.heightMm / 1000} thickness={WALL_THICKNESS_M}
                color={appearance.sceneColor} opacity={appearance.sceneOpacity}
                roomCenter={[centreX + inward.x, 0, centreZ + inward.z]} />;
            })}
            {openings.map(opening => {
              const centreOffset = Math.max(0, Math.min(length * 1000, opening.offsetMm + opening.widthMm / 2)) / 1000;
              const x = start.xMm / 1000 + tangent.x * centreOffset + inward.x * 0.01;
              const z = start.zMm / 1000 + tangent.z * centreOffset + inward.z * 0.01;
              const sill = opening.kind === 'window' ? (opening.sillHeightMm ?? 900) / 1000 : 0;
              const h = Math.min(heightM - sill, (opening.heightMm ?? (opening.kind === 'window' ? 1200 : 2040)) / 1000);
              if (h <= 0) return null;
              return (
                <mesh key={opening.id} position={[x, sill + h / 2, z]} rotation={[0, rotationY, 0]}>
                  <boxGeometry args={[opening.widthMm / 1000, h, 0.015]} />
                  <meshStandardMaterial color={opening.kind === 'window' ? '#7dd3fc' : '#d6a259'} transparent opacity={0.6} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      {document.objects.filter(object => object.existingAction !== 'remove'
        && !renderedCabinetIds?.has(object.id)).map(object => {
        const visual = existingObjectVisual(document, object);
        if (!visual) return null;
        const { pose } = visual;
        const widthM = visual.widthMm / 1000, depthM = visual.depthMm / 1000;
        const heightM = (visual.heightMm ?? 0) / 1000;
        const elevationM = visual.elevationMm / 1000;
        if (visual.kind === 'catalogued-overhead' && visual.catalogueId) {
          return <CataloguedOverhead key={object.id} objectId={object.id} visual={visual}
            globalDimensions={globalDimensions} />;
        }
        if (visual.kind === 'proposed-catalogue' && visual.catalogueId) {
          return <ProposedCatalogueCabinet key={object.id} objectId={object.id} visual={visual}
            globalDimensions={globalDimensions} />;
        }
        const fridgeItem: PlacedItem | null = visual.kind === 'fridge' ? {
          instanceId: object.id, definitionId: object.catalogueId ?? object.kind,
          itemType: 'Appliance', x: pose.xMm, z: pose.zMm, y: visual.elevationMm,
          rotation: pose.rotationDeg, width: visual.widthMm, applianceBodyWidth: visual.widthMm,
          depth: visual.depthMm, height: visual.heightMm!,
        } : null;
        const fridgeStyle = fridgeItem
          ? /integrat|built[- ]?in|panel[- ]?ready/i.test(object.kind) ? 'integrated' as const
            : fridgeStyleFor(fridgeItem, null)
          : null;
        return (
          <group key={object.id} position={[pose.xMm / 1000, elevationM + heightM / 2, pose.zMm / 1000]}
            rotation={[0, -pose.rotationDeg * Math.PI / 180, 0]} userData={{ roomObjectId: object.id, layer: object.layer }}>
            {visual.kind === 'fridge' && fridgeStyle && <FridgeModel widthM={widthM} heightM={heightM}
              depthM={depthM} style={fridgeStyle} finishKey={resolveFinishKey(object.kind) ?? 'stainless'} />}
            {visual.kind === 'overhead-shell' && <SurveyedOverheadShell widthM={widthM} heightM={heightM} depthM={depthM} />}
            {visual.kind === 'toe-kick' && <Kickboard width={widthM} height={heightM} thickness={depthM}
              position={[0, 0, 0]} color="#64716e" showEdges={false} seamOverlap={false} />}
            {visual.kind === 'surveyed-volume' && <mesh castShadow>
              <boxGeometry args={[widthM, heightM, depthM]} />
              <meshStandardMaterial color="#bdb39f" transparent opacity={object.layer === 'existing' ? 0.55 : 0.85} />
            </mesh>}
            {visual.kind === 'footprint-only' && <mesh position={[0, -heightM / 2 + 0.005, 0]}>
              <boxGeometry args={[widthM, 0.01, depthM]} />
              <meshBasicMaterial color="#0f766e" transparent opacity={0.45} />
            </mesh>}
            {object.layer === 'existing' && visual.kind !== 'footprint-only'
              && <SurveyOutline widthM={widthM} heightM={heightM} depthM={depthM} />}
          </group>
        );
      })}
      {document.services.map(service => {
        const pose = placementPose(document, service.placement, 0, 0);
        if (!pose) return null;
        return (
          <mesh key={service.id} position={[pose.xMm / 1000, (service.heightMm ?? 300) / 1000, pose.zMm / 1000]}>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshStandardMaterial color={service.kind === 'gpo' ? '#dc2626' : '#0284c7'} />
          </mesh>
        );
      })}
    </group>
  );
}
