/**
 * defaultSpecFor — deterministic KitchenSpec from a DesignBrief.
 * Used as the no-AI fallback and as the wizard's instant preview.
 * Services-aware and faithful to exact customer wall/range selections.
 */

import { rangeForWall } from './briefConstraints';
import { sharedCornerAt, wallLength } from './geometry';
import type { DesignBrief, KitchenSpec, Run, Segment, SegmentRole, StyleSpec, Wall } from './types';

export type LayoutShape = 'single-wall' | 'l-shape' | 'u-shape' | 'galley';

function seg(role: SegmentRole, widthMm?: number): Segment {
  return { kind: 'cabinet', role, ...(widthMm ? { widthMm } : {}) };
}

const DEFAULT_STYLE: StyleSpec = {
  finishId: 'do-designer-white',
  benchtopId: 'egger-white-carrara',
  handleId: 'handle-bar-ss',
};

function opposite(a: Wall, b: Wall): boolean {
  return (a === 'N' && b === 'S') || (a === 'S' && b === 'N')
    || (a === 'E' && b === 'W') || (a === 'W' && b === 'E');
}

function adjacent(a: Wall, b: Wall): boolean {
  return sharedCornerAt(a, b) !== null;
}

/** Derive the cabinet arrangement from exact wall choices. */
export function inferLayoutShapeFromWalls(walls: Wall[]): LayoutShape | null {
  const unique = [...new Set(walls)];
  if (unique.length === 0) return null;
  if (unique.length === 1) return 'single-wall';
  if (unique.length === 2) return opposite(unique[0], unique[1]) ? 'galley' : 'l-shape';
  if (unique.length === 3) return 'u-shape';
  return null;
}

function selectedWallsFor(brief: DesignBrief, shape: LayoutShape): Wall[] | null {
  const selected = [...new Set(brief.allowedWalls ?? [])];
  return inferLayoutShapeFromWalls(selected) === shape ? selected : null;
}

/** Which wall should hold the sink, preferring existing plumbing. */
function sinkWall(brief: DesignBrief, candidates: Wall[]): Wall {
  const drain = brief.room.services.find(s => s.type === 'drain')
    ?? brief.room.services.find(s => s.type === 'water-supply');
  if (drain && candidates.includes(drain.wall)) return drain.wall;
  const windowWall = brief.room.openings.find(o => o.type === 'window' && candidates.includes(o.wall));
  return windowWall?.wall ?? candidates[0];
}

function withSelectedRange(run: Run, brief: DesignBrief): Run {
  const selectedRange = brief.wallRanges?.[run.wall];
  return selectedRange ? { ...run, ...rangeForWall(brief, run.wall) } : run;
}

function availableLength(brief: DesignBrief, wall: Wall): number {
  const range = rangeForWall(brief, wall);
  return range.endMm - range.startMm;
}

function reachesSharedCorner(brief: DesignBrief, a: Wall, b: Wall): boolean {
  const atA = sharedCornerAt(a, b);
  const atB = sharedCornerAt(b, a);
  if (!atA || !atB) return false;
  const rangeA = rangeForWall(brief, a);
  const rangeB = rangeForWall(brief, b);
  const lenA = wallLength(a, brief.room);
  const lenB = wallLength(b, brief.room);
  const aReaches = atA === 'start' ? rangeA.startMm <= 25 : rangeA.endMm >= lenA - 25;
  const bReaches = atB === 'start' ? rangeB.startMm <= 25 : rangeB.endMm >= lenB - 25;
  return aReaches && bReaches;
}

function bridgeWall(walls: Wall[]): Wall {
  return walls.find(wall => walls.filter(other => other !== wall).every(other => adjacent(wall, other)))
    ?? walls[0];
}

function withProtectedCookingEnd(
  segments: Segment[],
  brief: DesignBrief,
  primary: Wall,
  adjoiningWalls: Wall[],
): Segment[] {
  const protectsEnd = adjoiningWalls.some(wall =>
    reachesSharedCorner(brief, primary, wall)
    && sharedCornerAt(primary, wall) === 'end');
  return protectsEnd ? [...segments, seg('corner-buffer', 600)] : segments;
}

export function defaultSpecFor(
  brief: DesignBrief,
  shape: LayoutShape,
  style: StyleSpec = DEFAULT_STYLE,
): KitchenSpec {
  const wantsStorage = brief.priorities.includes('storage');
  const wantsOvenTower = brief.appliances.oven !== undefined;
  const dw = brief.appliances.dishwasher;
  const fridgeW = brief.appliances.fridgeWidthMm ?? 940;
  const selected = selectedWallsFor(brief, shape);

  const mkPrimary = (wall: Wall, withSink: boolean, withCooktop: boolean): Segment[] => {
    const runLength = availableLength(brief, wall);
    const roomy = runLength >= 3600;
    const segments: Segment[] = [];
    if (wantsStorage && roomy) segments.push(seg('pantry'));
    segments.push(seg('fridge-gap', fridgeW));
    if (wantsOvenTower && roomy && shape !== 'single-wall') segments.push(seg('oven-tower'));
    if (withSink) {
      segments.push(seg('doors'));
      segments.push(seg('sink'));
      if (dw) segments.push(seg('dishwasher'));
    }
    if (withCooktop) {
      segments.push(seg('cooktop'));
      // Keep a real base cabinet between the cooking appliance and the
      // shared inside corner. If an oven tower is squeezed out, the selected
      // oven falls back under this cooktop; putting the cooktop last could
      // therefore leave the oven door trapped against the adjoining run.
      segments.push(seg('drawers'));
    }
    return segments;
  };

  let runs: Run[];
  switch (shape) {
    case 'single-wall': {
      const wall = selected?.[0] ?? 'N';
      const runLength = availableLength(brief, wall);
      const fragmented = brief.room.openings.some(opening =>
        opening.wall === wall && (opening.type === 'door' || opening.type === 'walkway'));
      const segments: Segment[] = [];
      if (wantsStorage && runLength >= 4200) segments.push(seg('pantry'));
      if (!dw) segments.push(seg('fridge-gap', fridgeW));
      segments.push(seg('sink', fragmented ? 600 : undefined));
      if (dw) segments.push(seg('dishwasher'));
      segments.push(seg('drawers'));
      segments.push(seg('cooktop'));
      if (dw) segments.push(seg('fridge-gap', fridgeW));
      runs = [withSelectedRange({ wall, segments, wallCabinets: true }, brief)];
      break;
    }
    case 'l-shape': {
      let primary: Wall;
      let sinkSide: Wall;
      if (selected) {
        sinkSide = sinkWall(brief, selected);
        primary = selected.find(wall => wall !== sinkSide) ?? selected[0];
      } else {
        primary = 'N';
        sinkSide = sinkWall(brief, ['W', 'E']);
      }
      const hasCorner = reachesSharedCorner(brief, primary, sinkSide);
      const sinkSegments: Segment[] = [
        ...(hasCorner ? [seg('corner')] : []),
        seg('sink'),
      ];
      if (dw) sinkSegments.push(seg('dishwasher'));
      sinkSegments.push(seg('drawers'));
      const primarySegments = withProtectedCookingEnd(
        mkPrimary(primary, false, true),
        brief,
        primary,
        hasCorner ? [sinkSide] : [],
      );
      runs = [
        withSelectedRange({ wall: primary, segments: primarySegments, wallCabinets: true }, brief),
        withSelectedRange({
          wall: sinkSide,
          segments: sinkSegments,
          wallCabinets: true,
          fromEnd: sharedCornerAt(sinkSide, primary) === 'end',
        }, brief),
      ];
      break;
    }
    case 'u-shape': {
      const walls = selected ?? (['N', 'W', 'E'] as Wall[]);
      const primary = selected ? bridgeWall(walls) : 'N';
      const sides = walls.filter(wall => wall !== primary);
      const sinkSide = sinkWall(brief, sides);
      const otherSide = sides.find(wall => wall !== sinkSide) ?? sides[0];
      const sinkSegments: Segment[] = [
        ...(reachesSharedCorner(brief, primary, sinkSide) ? [seg('corner')] : []),
        seg('sink'),
      ];
      if (dw) sinkSegments.push(seg('dishwasher'));
      const storageSegments: Segment[] = [
        ...(reachesSharedCorner(brief, primary, otherSide) ? [seg('corner')] : []),
        seg('drawers'),
        seg('doors'),
      ];
      const primarySegments = withProtectedCookingEnd(
        mkPrimary(primary, false, true),
        brief,
        primary,
        sides,
      );
      runs = [
        withSelectedRange({ wall: primary, segments: primarySegments, wallCabinets: true }, brief),
        withSelectedRange({
          wall: sinkSide,
          segments: sinkSegments,
          wallCabinets: true,
          fromEnd: sharedCornerAt(sinkSide, primary) === 'end',
        }, brief),
        withSelectedRange({
          wall: otherSide,
          segments: storageSegments,
          wallCabinets: false,
          fromEnd: sharedCornerAt(otherSide, primary) === 'end',
        }, brief),
      ];
      break;
    }
    case 'galley': {
      const walls = selected ?? (['N', 'S'] as Wall[]);
      const sinkRunWall = sinkWall(brief, walls);
      const cooktopRunWall = walls.find(wall => wall !== sinkRunWall) ?? walls[1];
      const sinkSegments: Segment[] = [seg('fridge-gap', fridgeW), seg('sink')];
      if (dw) sinkSegments.push(seg('dishwasher'));
      sinkSegments.push(seg('drawers'));
      const cooktopSegments: Segment[] = [seg('cooktop'), seg('doors')];
      if (wantsStorage) cooktopSegments.push(seg('pantry'));
      runs = [
        withSelectedRange({ wall: sinkRunWall, segments: sinkSegments, wallCabinets: true }, brief),
        withSelectedRange({ wall: cooktopRunWall, segments: cooktopSegments, wallCabinets: false }, brief),
      ];
      break;
    }
  }

  const canFitIsland = brief.room.depth >= 3800 && brief.room.width >= 3200;
  const island = (brief.island === 'want' || (brief.island === 'if-it-fits' && canFitIsland)) && canFitIsland
    ? { lengthMm: Math.min(2400, brief.room.width - 1800), depthMm: 650, features: ['storage' as const] }
    : undefined;

  return {
    runs,
    island,
    style,
    rationale: selected
      ? 'Layout follows your selected cabinet walls and run limits, with the sink kept near services where possible.'
      : 'Standard layout: sink near existing plumbing, cooktop with bench space both sides, fridge at the end of the run.',
  };
}
