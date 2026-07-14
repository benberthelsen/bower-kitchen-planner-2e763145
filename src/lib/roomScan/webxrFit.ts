/**
 * WebXR corner-fit → UnconfirmedRoomScanV1 (master plan §10.1, discovery).
 * Pure module — no React, no XR — so the geometry is unit-testable.
 *
 * The first marked edge is the user's main wall and becomes canonical N.
 * Corners are axis-aligned by that yaw, bounded to a rectangle, and the
 * full source(metres)→canonical(mm) affine is recorded invertibly
 * (rotation+scale ⇒ determinant 1e6 > 0). Deviation from a true rectangle
 * is surfaced as a normalization warning and caps confidence at 0.5 —
 * never silently discarded (§3.7 policy).
 */

import { parseRoomScan, type RoomScanV1 } from './contract';

export interface XrCorner { x: number; z: number } // metres, XR local-floor plan

export const MIN_ROOM_WIDTH_MM = 1200;
export const MIN_ROOM_DEPTH_MM = 900;
export const RECT_WARN_MM = 50;

export function buildScanFromCorners(
  corners: XrCorner[],
  capturedAt = new Date().toISOString(),
):
  | { ok: true; scan: RoomScanV1; warnings: string[] }
  | { ok: false; reason: string } {
  if (corners.length < 3) return { ok: false, reason: 'mark at least 3 corners' };

  const yaw = Math.atan2(corners[1].z - corners[0].z, corners[1].x - corners[0].x);
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const rotated = corners.map((c) => ({ u: c.x * cos - c.z * sin, v: c.x * sin + c.z * cos }));

  const minU = Math.min(...rotated.map((p) => p.u));
  const maxU = Math.max(...rotated.map((p) => p.u));
  const minV = Math.min(...rotated.map((p) => p.v));
  const maxV = Math.max(...rotated.map((p) => p.v));
  const widthMm = Math.round((maxU - minU) * 1000);
  const depthMm = Math.round((maxV - minV) * 1000);
  if (widthMm < MIN_ROOM_WIDTH_MM || depthMm < MIN_ROOM_DEPTH_MM) {
    return {
      ok: false,
      reason: 'captured area is too small — walk the full room and mark each corner at floor level',
    };
  }

  // Worst corner deviation from the fitted rectangle's edges.
  const warnings: string[] = [];
  let worst = 0;
  for (const p of rotated) {
    const du = Math.min(Math.abs(p.u - minU), Math.abs(p.u - maxU));
    const dv = Math.min(Math.abs(p.v - minV), Math.abs(p.v - maxV));
    worst = Math.max(worst, Math.min(du, dv) * 1000);
  }
  if (worst > RECT_WARN_MM) {
    warnings.push(`room shape simplified — corners deviate up to ${Math.round(worst)}mm from a rectangle`);
  }

  // source(m) → canonical(mm): rotate by -yaw, ×1000, translate min→origin.
  const a = cos * 1000;
  const b = -sin * 1000;
  const d = sin * 1000;
  const e = cos * 1000;
  const c = -minU * 1000;
  const f = -minV * 1000;

  const candidate = {
    state: 'unconfirmed' as const,
    schemaVersion: 1 as const,
    source: 'webxr' as const,
    roomRevision: 1,
    coordinateFrame: {
      assignment: 'user-main-wall' as const,
      sourcePlanAxes: 'x-z' as const,
      sourceUnits: 'metres' as const,
      sourceToCanonicalMatrix: [a, b, c, d, e, f, 0, 0, 1] as [
        number, number, number, number, number, number, 0, 0, 1,
      ],
      snappedQuarterTurnDegrees: 0 as const,
      originDescription: 'north-west-corner-in-canonical-plan' as const,
    },
    room: {
      width: widthMm,
      depth: depthMm,
      height: 2700,
      shape: 'Rectangle' as const,
      cutoutWidth: 0,
      cutoutDepth: 0,
      openings: [],
      services: [],
    },
    confidence: {
      overall: warnings.length ? 0.5 : 0.7,
      fields: {
        height: 'default' as const,
        openings: 'none-captured' as const,
        services: 'none-captured' as const,
      },
    },
    ...(warnings.length ? { normalizationWarnings: warnings } : {}),
    capturedAt,
  };

  const parsed = parseRoomScan(candidate);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, scan: parsed.scan, warnings };
}
