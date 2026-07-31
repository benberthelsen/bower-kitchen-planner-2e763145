import { ROLE_PRODUCTS } from '@/lib/layout/catalogRoles';
import type { KitchenSpec, Segment, SegmentRole } from '@/lib/layout';

export interface KitchenUnitRef {
  runIndex: number;
  segmentIndex: number;
}

export const EDITABLE_KITCHEN_ROLES: SegmentRole[] = [
  'doors',
  'drawers',
  'sink',
  'cooktop',
  'dishwasher',
  'pantry',
  'oven-tower',
  'fridge-gap',
  'corner',
];

export const KITCHEN_ROLE_LABELS: Record<SegmentRole, string> = {
  doors: 'Door cupboard',
  drawers: 'Drawer bank',
  sink: 'Sink cabinet',
  cooktop: 'Cooktop cabinet',
  dishwasher: 'Dishwasher space',
  pantry: 'Pantry',
  'oven-tower': 'Oven tower',
  'fridge-gap': 'Fridge space',
  corner: 'Corner cabinet',
  'corner-buffer': 'Corner clearance cupboard',
};

export function cloneKitchenSpec(spec: KitchenSpec): KitchenSpec {
  return {
    ...spec,
    style: { ...spec.style },
    runs: spec.runs.map(run => ({
      ...run,
      segments: run.segments.map(segment => ({ ...segment })),
    })),
    ...(spec.island
      ? { island: { ...spec.island, features: [...spec.island.features] } }
      : {}),
  };
}

export function segmentWidthMm(segment: Segment): number {
  if (segment.kind !== 'cabinet') return segment.widthMm;
  return segment.widthMm ?? ROLE_PRODUCTS[segment.role].widths[0];
}

function updateRun(
  spec: KitchenSpec,
  runIndex: number,
  updater: (segments: Segment[]) => Segment[],
): KitchenSpec {
  if (!spec.runs[runIndex]) return spec;
  const next = cloneKitchenSpec(spec);
  next.runs[runIndex].segments = updater(next.runs[runIndex].segments);
  return next;
}

export function replaceKitchenUnit(
  spec: KitchenSpec,
  ref: KitchenUnitRef,
  role: SegmentRole,
  widthMm: number,
): KitchenSpec {
  return updateRun(spec, ref.runIndex, segments => {
    if (!segments[ref.segmentIndex] || segments[ref.segmentIndex].kind !== 'cabinet') return segments;
    segments[ref.segmentIndex] = { kind: 'cabinet', role, widthMm };
    return segments;
  });
}

export function removeKitchenUnit(
  spec: KitchenSpec,
  ref: KitchenUnitRef,
  resolvedWidthMm?: number,
): KitchenSpec {
  return updateRun(spec, ref.runIndex, segments => {
    const segment = segments[ref.segmentIndex];
    if (!segment || segment.kind !== 'cabinet') return segments;
    segments[ref.segmentIndex] = {
      kind: 'gap',
      reason: 'Open space left by customer',
      widthMm: resolvedWidthMm ?? segmentWidthMm(segment),
    };
    return segments;
  });
}

function remainderSegment(widthMm: number): Segment | null {
  if (widthMm < 10) return null;
  if (widthMm <= 200) return { kind: 'filler', widthMm };
  return { kind: 'gap', reason: 'Available space', widthMm };
}

export function addKitchenUnit(
  spec: KitchenSpec,
  runIndex: number,
  role: SegmentRole,
  widthMm: number,
): KitchenSpec {
  return updateRun(spec, runIndex, segments => {
    if (segments.length >= 24) return segments;

    const gapIndex = segments.findIndex(segment =>
      segment.kind === 'gap'
      && segment.widthMm >= widthMm
      && (segment.widthMm === widthMm || segment.widthMm - widthMm >= 10));
    const cabinet: Segment = { kind: 'cabinet', role, widthMm };

    if (gapIndex === -1) {
      segments.push(cabinet);
      return segments;
    }

    const gap = segments[gapIndex];
    const remaining = segmentWidthMm(gap) - widthMm;
    const remainder = remainderSegment(remaining);
    segments.splice(gapIndex, 1, cabinet, ...(remainder ? [remainder] : []));
    return segments;
  });
}

export function moveKitchenUnit(
  spec: KitchenSpec,
  ref: KitchenUnitRef,
  direction: -1 | 1,
): KitchenSpec {
  return updateRun(spec, ref.runIndex, segments => {
    const targetIndex = ref.segmentIndex + direction;
    if (!segments[ref.segmentIndex] || !segments[targetIndex]) return segments;
    [segments[ref.segmentIndex], segments[targetIndex]] = [
      segments[targetIndex],
      segments[ref.segmentIndex],
    ];
    return segments;
  });
}

export function setRunWallCabinets(
  spec: KitchenSpec,
  runIndex: number,
  wallCabinets: boolean,
): KitchenSpec {
  if (!spec.runs[runIndex]) return spec;
  const next = cloneKitchenSpec(spec);
  next.runs[runIndex].wallCabinets = wallCabinets;
  return next;
}
