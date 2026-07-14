/**
 * validate — hard/soft rule checks over a compiled design.
 * Errors block; warnings inform ("re-plumbing required" etc.).
 */

import type { PlacedItem } from '@/types';
import { dist, itemRect, rectsOverlap, wallPointWorld } from './geometry';
import type { CompiledDesign } from './compileSpec';
import type { DesignBrief, RoomSpec, Violation } from './types';

const MIN_AISLE = 1000;
const MIN_FACING_AISLE = 1200;
const TRIANGLE_MIN = 3600;
const TRIANGLE_MAX = 8000;
const LEG_MIN = 1200;
const LEG_MAX = 2700;
const SINK_DRAIN_MAX = 1500;
const GAS_MAX = 600;

export function validate(design: CompiledDesign, room: RoomSpec, brief?: DesignBrief): Violation[] {
  const v: Violation[] = [];
  const { items, rolePositions } = design;
  const floorItems = items.filter(i => i.y === 0);

  // ── fit: inside room (corner-origin: x ∈ [0,width], z ∈ [0,depth]) ──
  for (const item of items) {
    const r = itemRect(item);
    if (r.minX < -1 || r.maxX > room.width + 1 || r.minZ < -1 || r.maxZ > room.depth + 1) {
      v.push({ code: 'out-of-room', severity: 'error', message: `${item.definitionId} extends outside the room`, itemIds: [item.instanceId] });
    }
  }

  // ── overlaps (floor-level items only; wall cabs share plan space with base) ──
  for (let i = 0; i < floorItems.length; i++) {
    for (let j = i + 1; j < floorItems.length; j++) {
      if (rectsOverlap(itemRect(floorItems[i]), itemRect(floorItems[j]))) {
        v.push({
          code: 'overlap', severity: 'error',
          message: `${floorItems[i].definitionId} overlaps ${floorItems[j].definitionId}`,
          itemIds: [floorItems[i].instanceId, floorItems[j].instanceId],
        });
      }
    }
  }

  // ── door swing clearance (approximate arc = square of door width into the room) ──
  for (const o of room.openings) {
    if (o.type !== 'door' || o.swing === 'out' || o.swing === 'slider') continue;
    const c = wallPointWorld(o.wall, o.offsetMm + o.widthMm / 2, room);
    const half = o.widthMm / 2;
    const arc = { minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half };
    for (const item of floorItems) {
      if (rectsOverlap(itemRect(item), arc)) {
        v.push({ code: 'door-swing', severity: 'warn', message: `${item.definitionId} may block the door swing on wall ${o.wall}`, itemIds: [item.instanceId] });
      }
    }
  }

  // ── aisles: island/facing-run clearance ──
  const islandItems = floorItems.filter(i => i.instanceId.startsWith('ai-') && i.rotation === 180 && i.z > 700 && i.z < room.depth - 700);
  if (islandItems.length > 0) {
    for (const isl of islandItems) {
      for (const other of floorItems) {
        if (islandItems.includes(other)) continue;
        const a = itemRect(isl), b = itemRect(other);
        // measure z-gap when x-ranges overlap
        if (a.minX < b.maxX && a.maxX > b.minX) {
          const gap = Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ);
          if (gap > 0 && gap < MIN_AISLE) {
            v.push({ code: 'narrow-aisle', severity: 'error', message: `Aisle ${Math.round(gap)}mm between island and run (min ${MIN_AISLE}mm)`, itemIds: [isl.instanceId, other.instanceId] });
          }
        }
      }
    }
  }
  // galley: facing N and S runs
  const nRun = floorItems.filter(i => i.rotation === 0);
  const sRun = floorItems.filter(i => i.rotation === 180 && !islandItems.includes(i));
  if (nRun.length && sRun.length) {
    const gap = Math.min(...sRun.map(i => itemRect(i).minZ)) - Math.max(...nRun.map(i => itemRect(i).maxZ));
    if (gap < MIN_FACING_AISLE) {
      v.push({ code: 'narrow-galley', severity: 'error', message: `Galley aisle ${Math.round(gap)}mm (min ${MIN_FACING_AISLE}mm)` });
    }
  }

  // ── services ──
  const sink = rolePositions.sink;
  const drain = room.services.find(s => s.type === 'drain') ?? room.services.find(s => s.type === 'water-supply');
  if (sink && drain) {
    const sinkPt = { x: sink.item.x, z: sink.item.z };
    const drainPt = wallPointWorld(drain.wall, drain.offsetMm, room);
    const d = dist(sinkPt, drainPt);
    if (d > SINK_DRAIN_MAX) {
      v.push({ code: 'replumb', severity: 'warn', message: `Sink is ${(d / 1000).toFixed(1)}m from existing plumbing — re-plumbing will be required` });
    }
  }
  const cooktop = rolePositions.cooktop;
  const gas = room.services.find(s => s.type === 'gas');
  if (cooktop && brief?.appliances.cooktop === 'gas' && gas) {
    const d = dist({ x: cooktop.item.x, z: cooktop.item.z }, wallPointWorld(gas.wall, gas.offsetMm, room));
    if (d > GAS_MAX) {
      v.push({ code: 'gas-move', severity: 'warn', message: `Gas cooktop is ${(d / 1000).toFixed(1)}m from the gas point — gas work required` });
    }
  }

  // ── essentials present ──
  if (!sink) v.push({ code: 'no-sink', severity: 'error', message: 'Design has no sink cabinet' });
  if (brief?.appliances.dishwasher && !rolePositions.dishwasher) {
    v.push({ code: 'no-dishwasher', severity: 'warn', message: 'Dishwasher requested but not placed' });
  }

  // ── work triangle ──
  const fridge = rolePositions['fridge-gap'];
  if (sink && cooktop && fridge) {
    const pts = [sink.item, cooktop.item, fridge.item].map(i => ({ x: i.x, z: i.z }));
    const legs = [dist(pts[0], pts[1]), dist(pts[1], pts[2]), dist(pts[2], pts[0])];
    const perimeter = legs[0] + legs[1] + legs[2];
    if (perimeter < TRIANGLE_MIN || perimeter > TRIANGLE_MAX) {
      v.push({ code: 'triangle-size', severity: 'warn', message: `Work triangle ${(perimeter / 1000).toFixed(1)}m (ideal 3.6–8m)` });
    }
    for (const leg of legs) {
      if (leg < LEG_MIN) { v.push({ code: 'triangle-leg', severity: 'warn', message: 'Two work zones are very close together' }); break; }
      if (leg > LEG_MAX) { v.push({ code: 'triangle-leg', severity: 'warn', message: 'Two work zones are far apart — expect extra walking' }); break; }
    }
  }

  // ── cooktop landing zones (≥300mm cabinet run either side) ──
  if (cooktop && cooktop.wall !== 'island') {
    const sameWall = floorItems.filter(i =>
      i !== cooktop.item && i.itemType === 'Cabinet' && i.rotation === cooktop.item.rotation);
    const cr = itemRect(cooktop.item);
    const hasSide = (side: 'left' | 'right') => sameWall.some(i => {
      const r = itemRect(i);
      const horizontal = cooktop.item.rotation === 0 || cooktop.item.rotation === 180;
      if (horizontal) {
        return side === 'left' ? Math.abs(r.maxX - cr.minX) < 50 : Math.abs(r.minX - cr.maxX) < 50;
      }
      return side === 'left' ? Math.abs(r.maxZ - cr.minZ) < 50 : Math.abs(r.minZ - cr.maxZ) < 50;
    });
    if (!hasSide('left') || !hasSide('right')) {
      v.push({ code: 'cooktop-landing', severity: 'warn', message: 'Cooktop should have bench space on both sides', itemIds: [cooktop.item.instanceId] });
    }
  }

  // ── continuous prep bench ≥ 900mm ──
  const prepRun = floorItems.filter(i => i.height <= 800 && i.itemType === 'Cabinet'
    && !(sink && i === sink.item) && !(cooktop && i === cooktop.item));
  const hasPrep = prepRun.some(i => i.width >= 900)
    || prepRun.some(a => prepRun.some(b => a !== b && a.rotation === b.rotation
      && Math.abs(a.z - b.z) < 10 && Math.abs(Math.abs(a.x - b.x) - (a.width + b.width) / 2) < 20
      && a.width + b.width >= 900));
  if (prepRun.length > 0 && !hasPrep) {
    v.push({ code: 'prep-space', severity: 'warn', message: 'Less than 900mm of continuous prep bench' });
  }

  return v;
}
