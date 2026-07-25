/**
 * roomplanImport — Apple RoomPlan CapturedRoom JSON → UnconfirmedRoomScanV1.
 *
 * The LiDAR lane of the two-lane scanner plan: a customer scans with a
 * RoomPlan-based iPhone app (a future Bower companion app, or any app that
 * exports the CapturedRoom JSON) and imports the file here. RoomPlan detects
 * walls, doors, windows and openings itself, so — unlike the WebXR lane —
 * openings arrive `detected`, height arrives `measured`, and confidence is
 * higher. Everything still flows through the same contract and the same
 * RoomFeaturesEditor confirmation; a scan is never manufacturing authority.
 *
 * Pure and deterministic; no React. Geometry notes:
 *  - RoomPlan is metres, Y-up; the floor plan lives in X–Z.
 *  - A surface's `transform` is a 4×4 column-major matrix; its local X axis
 *    (elements [0],[2] in plan) is the direction the wall runs; translation
 *    is elements [12],[13],[14]. `dimensions` = [width, height, ...].
 *  - We yaw-align the plan to the longest wall, bound the walls to a
 *    rectangle (same approach as webxrFit), then place each door/window by
 *    its centre against the nearest wall.
 */

import { parseRoomScan, type RoomScanV1 } from './contract';
import { nearestWall, clampSpan, MIN_CEILING_MM, MAX_CEILING_MM, MAX_OPENING_WALL_DISTANCE_MM } from './webxrFit';

// ─── Loose input shape (we validate what we use) ────────────────────────────

interface RpSurface {
  identifier?: string;
  dimensions?: number[];
  transform?: number[];
}

interface RpCapturedRoom {
  walls?: RpSurface[];
  doors?: RpSurface[];
  windows?: RpSurface[];
  openings?: RpSurface[];
  version?: number;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function surfaceUsable(s: RpSurface): s is Required<Pick<RpSurface, 'dimensions' | 'transform'>> & RpSurface {
  return Array.isArray(s.transform) && s.transform.length === 16 && s.transform.every(num)
    && Array.isArray(s.dimensions) && s.dimensions.length >= 2 && s.dimensions.slice(0, 2).every(num)
    && s.dimensions[0] > 0;
}

/** Accept the raw CapturedRoom object or common wrappers apps export. */
function unwrap(json: unknown): RpCapturedRoom | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  for (const key of ['capturedRoom', 'coreModel', 'room']) {
    const inner = o[key];
    if (inner && typeof inner === 'object' && Array.isArray((inner as RpCapturedRoom).walls)) {
      return inner as RpCapturedRoom;
    }
  }
  if (Array.isArray(o.walls)) return o as RpCapturedRoom;
  return null;
}

// ─── Conversion ─────────────────────────────────────────────────────────────

export function importRoomPlanJson(
  json: unknown,
  capturedAt = new Date().toISOString(),
):
  | { ok: true; scan: RoomScanV1; warnings: string[]; walls: number }
  | { ok: false; reason: string } {
  const model = unwrap(json);
  if (!model) {
    return { ok: false, reason: "this file doesn't look like a RoomPlan export — it should contain a list of walls" };
  }
  const walls = (model.walls ?? []).filter(surfaceUsable);
  if (walls.length < 2) {
    return { ok: false, reason: 'the scan has too few usable walls — re-scan the room and export again' };
  }

  const warnings: string[] = [];
  const skippedWalls = (model.walls ?? []).length - walls.length;
  if (skippedWalls > 0) warnings.push(`${skippedWalls} wall(s) in the file were malformed and skipped`);

  // Plan-space wall segments: centre ± direction × width/2 (metres).
  const segs = walls.map((w) => {
    const t = w.transform;
    const dir = { x: t[0], z: t[2] };
    const len = Math.hypot(dir.x, dir.z) || 1;
    const ux = dir.x / len;
    const uz = dir.z / len;
    const half = w.dimensions[0] / 2;
    const cx = t[12];
    const cz = t[14];
    return {
      a: { x: cx - ux * half, z: cz - uz * half },
      b: { x: cx + ux * half, z: cz + uz * half },
      widthM: w.dimensions[0],
      heightM: w.dimensions[1],
      yBottomM: t[13] - w.dimensions[1] / 2,
    };
  });

  // Yaw-align to the longest wall (the customer's dominant wall → canonical N).
  const longest = segs.reduce((best, s) => (s.widthM > best.widthM ? s : best), segs[0]);
  const yaw = Math.atan2(longest.b.z - longest.a.z, longest.b.x - longest.a.x);
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const rot = (p: { x: number; z: number }) => ({ u: p.x * cos - p.z * sin, v: p.x * sin + p.z * cos });

  const pts = segs.flatMap((s) => [rot(s.a), rot(s.b)]);
  const minU = Math.min(...pts.map((p) => p.u));
  const maxU = Math.max(...pts.map((p) => p.u));
  const minV = Math.min(...pts.map((p) => p.v));
  const maxV = Math.max(...pts.map((p) => p.v));
  const widthMm = Math.round((maxU - minU) * 1000);
  const depthMm = Math.round((maxV - minV) * 1000);
  if (widthMm < 1200 || depthMm < 1200) {
    return { ok: false, reason: 'the scanned area is too small for a kitchen plan — re-scan the whole room' };
  }
  if (widthMm > 50_000 || depthMm > 50_000) {
    return { ok: false, reason: 'the scanned area is implausibly large — the export may be a multi-room structure; scan one room' };
  }

  // source(m) → canonical(mm), same affine convention as webxrFit.
  const a = cos * 1000;
  const b = -sin * 1000;
  const d = sin * 1000;
  const e = cos * 1000;
  const c = -minU * 1000;
  const f = -minV * 1000;
  const toCanonical = (p: { x: number; z: number }) => ({ u: a * p.x + b * p.z + c, v: d * p.x + e * p.z + f });

  // Room height: median wall height (RoomPlan measures it).
  const heights = segs.map((s) => Math.round(s.heightM * 1000)).sort((x, y) => x - y);
  let heightMm = heights[Math.floor(heights.length / 2)];
  if (heightMm < MIN_CEILING_MM || heightMm > MAX_CEILING_MM) {
    warnings.push(`scanned ceiling height ${heightMm}mm looked wrong — using the standard 2700mm instead`);
    heightMm = 2700;
  }
  // Floor level for window sills: lowest wall bottom.
  const floorYM = Math.min(...segs.map((s) => s.yBottomM));

  // Doors / windows / openings → contract openings on their nearest wall.
  const openings: {
    id: string; wall: 'N' | 'E' | 'S' | 'W'; type: 'door' | 'window' | 'walkway';
    offsetMm: number; widthMm: number; heightMm?: number; sillHeightMm?: number;
  }[] = [];
  const groups: { list: RpSurface[]; type: 'door' | 'window' | 'walkway' }[] = [
    { list: model.doors ?? [], type: 'door' },
    { list: model.windows ?? [], type: 'window' },
    { list: model.openings ?? [], type: 'walkway' },
  ];
  let counter = 0;
  for (const group of groups) {
    for (const s of group.list) {
      if (!surfaceUsable(s)) {
        warnings.push(`a ${group.type} in the file was malformed and skipped`);
        continue;
      }
      counter += 1;
      const t = s.transform;
      const mid = toCanonical({ x: t[12], z: t[14] });
      const hit = nearestWall(mid.u, mid.v, widthMm, depthMm);
      if (hit.distMm > MAX_OPENING_WALL_DISTANCE_MM) {
        warnings.push(`a detected ${group.type} was not near an outer wall (interior partition?) and was skipped`);
        continue;
      }
      const spanW = s.dimensions[0] * 1000;
      const wallLen = hit.wall === 'N' || hit.wall === 'S' ? widthMm : depthMm;
      const span = clampSpan(hit.along - spanW / 2, spanW, wallLen);
      if (!span) {
        warnings.push(`a detected ${group.type} was too narrow to keep and was skipped`);
        continue;
      }
      const oHeightMm = Math.round(s.dimensions[1] * 1000);
      const sillMm = Math.max(0, Math.round((t[13] - s.dimensions[1] / 2 - floorYM) * 1000));
      const entry = {
        id: `roomplan-${group.type}-${counter}`,
        wall: hit.wall,
        type: group.type,
        ...span,
        ...(oHeightMm > 0 && sillMm + oHeightMm <= heightMm ? { heightMm: oHeightMm } : {}),
        ...(group.type === 'window' && sillMm + oHeightMm <= heightMm ? { sillHeightMm: sillMm } : {}),
      };
      // Overlap on the same wall: keep the first (RoomPlan rarely overlaps;
      // duplicates usually mean a re-scan artefact).
      const clash = openings.find(k =>
        k.wall === entry.wall && entry.offsetMm < k.offsetMm + k.widthMm && k.offsetMm < entry.offsetMm + entry.widthMm);
      if (clash) {
        warnings.push(`two detected openings overlap on wall ${entry.wall} — kept the first`);
        continue;
      }
      openings.push(entry);
    }
  }

  const candidate = {
    state: 'unconfirmed' as const,
    schemaVersion: 1 as const,
    source: 'roomplan' as const,
    roomRevision: 1,
    coordinateFrame: {
      assignment: 'longest-wall' as const,
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
      height: heightMm,
      shape: 'Rectangle' as const,
      cutoutWidth: 0,
      cutoutDepth: 0,
      openings,
      services: [],
    },
    confidence: {
      overall: warnings.length ? 0.6 : 0.85,
      fields: {
        height: 'measured' as const,
        openings: openings.length ? ('detected' as const) : ('none-captured' as const),
        services: 'none-captured' as const,
      },
    },
    ...(warnings.length ? { normalizationWarnings: warnings.slice(0, 20) } : {}),
    capturedAt,
  };

  const parsed = parseRoomScan(candidate);
  if ('reason' in parsed) return { ok: false, reason: parsed.reason };
  return { ok: true, scan: parsed.scan, warnings, walls: walls.length };
}

/** Convenience: parse a file's text content. */
export function importRoomPlanFileText(
  text: string,
  capturedAt?: string,
):
  | { ok: true; scan: RoomScanV1; warnings: string[]; walls: number }
  | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'this file is not valid JSON — export the scan as a RoomPlan JSON file and try again' };
  }
  return importRoomPlanJson(json, capturedAt);
}
