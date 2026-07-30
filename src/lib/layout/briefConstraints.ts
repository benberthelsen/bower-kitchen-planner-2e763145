/**
 * Customer brief constraints that must survive both deterministic generation
 * and AI-authored KitchenSpecs.
 */

import { wallLength } from './geometry';
import type { DesignBrief, KitchenSpec, Run, Wall, WallRunRange } from './types';

export const MIN_WALL_RUN_MM = 1200;

export function normaliseWallRunRange(
  range: WallRunRange | undefined,
  wall: Wall,
  brief: Pick<DesignBrief, 'room'>,
): WallRunRange {
  const length = wallLength(wall, brief.room);
  if (!range) return { startMm: 0, endMm: length };

  const rawStart = Number.isFinite(range.startMm) ? range.startMm : 0;
  const rawEnd = Number.isFinite(range.endMm) ? range.endMm : length;
  const startMm = Math.max(0, Math.min(length, Math.round(rawStart)));
  const endMm = Math.max(startMm, Math.min(length, Math.round(rawEnd)));
  return { startMm, endMm };
}

export function rangeForWall(
  brief: Pick<DesignBrief, 'room' | 'wallRanges'>,
  wall: Wall,
): WallRunRange {
  return normaliseWallRunRange(brief.wallRanges?.[wall], wall, brief);
}

/** Stamp authoritative customer coverage onto an authored spec. */
export function applyBriefConstraints(spec: KitchenSpec, brief: DesignBrief): KitchenSpec {
  if (!brief.wallRanges) return spec;
  return {
    ...spec,
    runs: spec.runs.map(run => {
      const range = brief.wallRanges?.[run.wall];
      if (!range) {
        const { startMm: _startMm, endMm: _endMm, ...unchanged } = run;
        return unchanged;
      }
      const normalised = normaliseWallRunRange(range, run.wall, brief);
      return { ...run, ...normalised };
    }),
  };
}

export function runRange(
  run: Pick<Run, 'startMm' | 'endMm'>,
  lengthMm: number,
): WallRunRange {
  const startMm = Math.max(0, Math.min(lengthMm, Math.round(run.startMm ?? 0)));
  const endMm = Math.max(startMm, Math.min(lengthMm, Math.round(run.endMm ?? lengthMm)));
  return { startMm, endMm };
}

export function runTouchesWallEnd(
  run: Pick<Run, 'startMm' | 'endMm'>,
  lengthMm: number,
  end: 'start' | 'end',
  toleranceMm = 25,
): boolean {
  const range = runRange(run, lengthMm);
  return end === 'start'
    ? range.startMm <= toleranceMm
    : range.endMm >= lengthMm - toleranceMm;
}
