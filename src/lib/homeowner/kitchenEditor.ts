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
  'fridge-corner-pantry': 'Corner pantry',
};

export interface KitchenUnitWidthPolicy {
  custom: boolean;
  minMm: number;
  maxMm: number;
  lockedReason?: string;
}

export const MAX_CUSTOM_KITCHEN_UNIT_WIDTH_MM = 1200;

/**
 * A sink cabinet needs support material beside the bowl/cut-out. Use the
 * larger supplier dimension and allow 50 mm each side, rounded up to 10 mm.
 */
export function sinkCabinetMinimumWidthMm(
  sinkWidthMm?: number | null,
  cutoutWidthMm?: number | null,
): number {
  const productWidth = Math.max(sinkWidthMm ?? 0, cutoutWidthMm ?? 0);
  if (productWidth <= 0) return 600;
  return Math.max(600, Math.ceil((productWidth + 100) / 10) * 10);
}

/**
 * Custom widths are for prompt-sized manufactured cabinets, including the
 * prompt-sized manufactured products. Fixed appliance openings and the
 * square pie-cut corner remain locked to
 * their compatible sizes.
 */
export function kitchenUnitWidthPolicy(
  role: SegmentRole,
  sinkMinimumWidthMm = 600,
): KitchenUnitWidthPolicy {
  switch (role) {
    case 'doors':
      return { custom: true, minMm: 150, maxMm: MAX_CUSTOM_KITCHEN_UNIT_WIDTH_MM };
    case 'drawers':
      return { custom: true, minMm: 300, maxMm: MAX_CUSTOM_KITCHEN_UNIT_WIDTH_MM };
    case 'sink':
      {
        const minimumWidth = Math.max(600, sinkMinimumWidthMm);
        return {
          custom: true,
          minMm: minimumWidth,
          maxMm: Math.max(MAX_CUSTOM_KITCHEN_UNIT_WIDTH_MM, minimumWidth),
        };
      }
    case 'cooktop':
      return { custom: true, minMm: 600, maxMm: MAX_CUSTOM_KITCHEN_UNIT_WIDTH_MM };
    case 'pantry':
      return { custom: true, minMm: 300, maxMm: MAX_CUSTOM_KITCHEN_UNIT_WIDTH_MM };
    case 'oven-tower':
      return {
        custom: false,
        minMm: 600,
        maxMm: 600,
        lockedReason: 'Fixed to the selected oven size.',
      };
    case 'dishwasher':
      return {
        custom: false,
        minMm: 600,
        maxMm: 600,
        lockedReason: 'Fixed to the dishwasher opening.',
      };
    case 'fridge-gap':
      return {
        custom: false,
        minMm: ROLE_PRODUCTS['fridge-gap'].widths.at(-1) ?? 960,
        maxMm: ROLE_PRODUCTS['fridge-gap'].widths[0],
        lockedReason: 'Fixed to the fridge and its side clearances.',
      };
    case 'corner':
      return {
        custom: false,
        minMm: ROLE_PRODUCTS.corner.widths[0],
        maxMm: ROLE_PRODUCTS.corner.widths[0],
        lockedReason: 'Fixed to the 900mm square bi-fold corner cabinet.',
      };
    case 'corner-buffer':
    case 'fridge-corner-pantry':
      return {
        custom: false,
        minMm: ROLE_PRODUCTS[role].widths.at(-1) ?? 600,
        maxMm: ROLE_PRODUCTS[role].widths[0],
        lockedReason: 'Fixed to buildable corner geometry.',
      };
  }
}

export function kitchenUnitWidthError(
  role: SegmentRole,
  widthMm: number,
  sinkMinimumWidthMm = 600,
): string | null {
  const policy = kitchenUnitWidthPolicy(role, sinkMinimumWidthMm);
  if (!Number.isInteger(widthMm)) return 'Enter a whole millimetre width.';
  if (!policy.custom && !ROLE_PRODUCTS[role].widths.includes(widthMm)) {
    return policy.lockedReason ?? 'Choose one of the compatible sizes.';
  }
  if (widthMm < policy.minMm) {
    return role === 'sink'
      ? `The selected sink needs a cabinet at least ${policy.minMm}mm wide.`
      : `Minimum width is ${policy.minMm}mm.`;
  }
  if (widthMm > policy.maxMm) return `Maximum width is ${policy.maxMm}mm.`;
  return null;
}

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
