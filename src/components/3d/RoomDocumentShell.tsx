import { useMemo } from 'react';
import * as THREE from 'three';
import type { RoomDocumentV1 } from '@/lib/roomDocument';
import { objectPose, placementPose } from '@/lib/roomDocument/geometry';
import Wall from './Wall';

const WALL_THICKNESS_M = 0.1;

interface SolidWallPiece { offsetMm: number; widthMm: number; bottomMm: number; heightMm: number }

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

/** The same measured wall chain used by the plan editor, in planner world coordinates. */
export default function RoomDocumentShell({ document, defaultHeightMm, renderedCabinetIds }: {
  document: RoomDocumentV1;
  defaultHeightMm: number;
  renderedCabinetIds?: ReadonlySet<string>;
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
        const pose = objectPose(document, object);
        if (!pose) return null;
        const heightM = (object.heightMm ?? (object.kind.includes('overhead') ? 720 : 900)) / 1000;
        const elevationM = (object.elevationMm ?? 0) / 1000;
        return (
          <mesh key={object.id} position={[pose.xMm / 1000, elevationM + heightM / 2, pose.zMm / 1000]}
            rotation={[0, -pose.rotationDeg * Math.PI / 180, 0]} castShadow>
            <boxGeometry args={[object.widthMm / 1000, heightM, object.depthMm / 1000]} />
            <meshStandardMaterial color={object.kind.includes('fridge') ? '#b7c6ce' : '#bdb39f'}
              transparent opacity={object.layer === 'existing' ? 0.55 : 0.85} />
          </mesh>
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
