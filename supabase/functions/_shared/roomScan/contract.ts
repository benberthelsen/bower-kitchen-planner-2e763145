// GENERATED FILE — DO NOT EDIT.
// Source: src/lib/roomScan/contract.ts · regenerate with `npm run roomscan:sync`.
// zod import rewritten to npm:zod@3.25.76 for the Deno runtime.
/**
 * Room-capture contract V1 — canonical source of truth.
 *
 * Governed by docs/AI-ROOM-SCANNER-MASTER-PLAN.md §5. This file is
 * SELF-CONTAINED: it imports only `zod` and declares its own local shapes
 * (`RoomSpecV1`, `OpeningV1`, `ServicePointV1`). Compile-time assignability to
 * the planner's app-facing types is proven in `compat-test.ts`, never by
 * importing planner modules here. The website receives a generated
 * byte-identical copy; the Deno mirror is generated with a rewritten zod
 * import. Edit ONLY this file, then run `npm run roomscan:sync`.
 *
 * ── Convention spec (binding for every adapter) ──────────────────────────
 * 1. Units: all lengths are INTEGER MILLIMETRES.
 * 2. Walls: 'N' is the top wall in the canonical top-down view; E/S/W
 *    proceed clockwise. Scanners without compass meaning assign the user's
 *    main wall (or the longest wall) to N and record it in coordinateFrame.
 * 3. Offsets: offsetMm runs from the LEFT end of the wall as viewed from
 *    inside the room, to the LEFT edge of the opening/service.
 * 4. Heights: heightMm is above finished floor. Defaults: door 2040,
 *    window 1200, window sill 900.
 * 5. Plan axes: origin at the north-west corner; x increases east (along
 *    the N wall); z increases south.
 * 6. Timestamps: ISO 8601 UTC. IDs: adapter-generated UUIDs, stable within
 *    a capture.
 * 7. Scanner V1 emits normalized RECTANGLES only (cutouts must be zero).
 * 8. The coordinate-frame matrix is the audit/reprocessing authority. It
 *    must be invertible with a POSITIVE determinant (mirrors are a
 *    normalization error).
 * 9. Storage: private object paths only. Never persist public or signed
 *    URLs anywhere in this contract's data.
 */

import { z } from 'npm:zod@3.25.76';

// ─── Constants ─────────────────────────────────────────────────────────────

export const ROOM_SCAN_SCHEMA_VERSION = 1 as const;
export const HANDOFF_SCHEMA_VERSION = 1 as const;

export const DEFAULT_DOOR_HEIGHT_MM = 2040;
export const DEFAULT_WINDOW_HEIGHT_MM = 1200;
export const DEFAULT_WINDOW_SILL_MM = 900;

export const LIMITS = {
  maxPhotos: 15,
  maxPhotoBytes: 10 * 1024 * 1024,
  maxArtifacts: 10,
  maxArtifactBytes: 100 * 1024 * 1024,
  maxNotesChars: 5000,
  maxWarnings: 20,
  maxWarningChars: 500,
  maxAdapterStateBytes: 16 * 1024,
  maxStyleTags: 30,
  maxStyleTagChars: 100,
  maxCorners: 32,
  maxRoomMm: 50_000,
} as const;

// ─── Small helpers ─────────────────────────────────────────────────────────

const utf8Bytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

const mmInt = (min = 0) => z.number().int().min(min);
const positiveMm = () => z.number().int().positive().max(LIMITS.maxRoomMm);

/** Private storage object path. Rejects anything URL-shaped or signed. */
const storagePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(p), 'must be a storage path, not a URL')
  .refine((p) => !p.includes('?') && !p.includes('#'), 'must not carry query/signature parts');

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, 'must be a hex SHA-256');

const isoDatetime = z.string().datetime({ offset: true }).or(z.string().datetime());

// ─── Wall / feature primitives ─────────────────────────────────────────────

export const wallIdV1Schema = z.enum(['N', 'E', 'S', 'W']);
export type WallIdV1 = z.infer<typeof wallIdV1Schema>;

export const openingV1Schema = z
  .object({
    id: z.string().min(1).max(64),
    wall: wallIdV1Schema,
    type: z.enum(['door', 'window', 'walkway']),
    offsetMm: mmInt(0),
    widthMm: positiveMm(),
    heightMm: positiveMm().optional(),
    sillHeightMm: mmInt(0).max(LIMITS.maxRoomMm).optional(),
    swing: z.enum(['in-left', 'in-right', 'out', 'slider']).optional(),
  })
  .strict();
export type OpeningV1 = z.infer<typeof openingV1Schema>;

export const servicePointV1Schema = z
  .object({
    id: z.string().min(1).max(64),
    wall: wallIdV1Schema,
    type: z.enum(['water-supply', 'drain', 'gpo', 'gas', 'hood-duct']),
    offsetMm: mmInt(0),
    heightMm: mmInt(0).max(LIMITS.maxRoomMm).optional(),
  })
  .strict();
export type ServicePointV1 = z.infer<typeof servicePointV1Schema>;

// ─── Room geometry ─────────────────────────────────────────────────────────

const wallLengthMm = (wall: WallIdV1, width: number, depth: number): number =>
  wall === 'N' || wall === 'S' ? width : depth;

export const roomSpecV1Schema = z
  .object({
    width: positiveMm(),
    depth: positiveMm(),
    height: positiveMm(),
    shape: z.enum(['Rectangle', 'LShape']),
    cutoutWidth: mmInt(0).max(LIMITS.maxRoomMm),
    cutoutDepth: mmInt(0).max(LIMITS.maxRoomMm),
    openings: z.array(openingV1Schema).max(32),
    services: z.array(servicePointV1Schema).max(32),
  })
  .strict()
  .superRefine((room, ctx) => {
    const ids = new Set<string>();
    for (const f of [...room.openings, ...room.services]) {
      if (ids.has(f.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate feature id "${f.id}"` });
      }
      ids.add(f.id);
    }

    if (room.shape === 'Rectangle' && (room.cutoutWidth !== 0 || room.cutoutDepth !== 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rectangle rooms must have zero cutouts' });
    }
    if (room.shape === 'LShape' && (room.cutoutWidth >= room.width || room.cutoutDepth >= room.depth)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cutout must be smaller than the room' });
    }

    for (const o of room.openings) {
      const wall = wallLengthMm(o.wall, room.width, room.depth);
      if (o.offsetMm + o.widthMm > wall) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `opening "${o.id}" (offset ${o.offsetMm} + width ${o.widthMm}) exceeds wall ${o.wall} length ${wall}`,
        });
      }
      const effHeight =
        o.heightMm ?? (o.type === 'window' ? DEFAULT_WINDOW_HEIGHT_MM : DEFAULT_DOOR_HEIGHT_MM);
      const sill = o.type === 'window' ? o.sillHeightMm ?? DEFAULT_WINDOW_SILL_MM : 0;
      if (sill + effHeight > room.height) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `opening "${o.id}" vertical extent ${sill + effHeight} exceeds room height ${room.height} (defaults included)`,
        });
      }
    }

    for (const s of room.services) {
      const wall = wallLengthMm(s.wall, room.width, room.depth);
      if (s.offsetMm > wall) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `service "${s.id}" offset ${s.offsetMm} exceeds wall ${s.wall} length ${wall}`,
        });
      }
      if (s.heightMm !== undefined && s.heightMm > room.height) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `service "${s.id}" height exceeds room height`,
        });
      }
    }
  });
export type RoomSpecV1 = z.infer<typeof roomSpecV1Schema>;

/** Scanner V1 rooms are rectangles. Runtime-enforced, not just a TS intersection. */
export const scannerRectangleRoomV1Schema = roomSpecV1Schema.refine(
  (room) => room.shape === 'Rectangle',
  { message: 'scanner V1 rooms must be Rectangle' },
);

// ─── Coordinate frame ──────────────────────────────────────────────────────

export const coordinateFrameV1Schema = z
  .object({
    assignment: z.enum(['user-main-wall', 'longest-wall', 'source-orientation']),
    sourcePlanAxes: z.enum(['x-z', 'x-y']),
    sourceUnits: z.enum(['metres', 'millimetres']),
    /**
     * Row-major homogeneous 3x3 affine. Maps [s1, s2, 1] → [xMm, zMm, 1].
     * Includes scale, arbitrary yaw, quarter-turn snap and translation.
     */
    sourceToCanonicalMatrix: z.tuple([
      z.number(), z.number(), z.number(),
      z.number(), z.number(), z.number(),
      z.literal(0), z.literal(0), z.literal(1),
    ]),
    snappedQuarterTurnDegrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    sourceWallToCanonical: z.record(z.string(), wallIdV1Schema).optional(),
    mainWallSourceId: z.string().max(128).optional(),
    originDescription: z.literal('north-west-corner-in-canonical-plan'),
  })
  .strict()
  .superRefine((frame, ctx) => {
    const m = frame.sourceToCanonicalMatrix;
    if (!m.every((v) => Number.isFinite(v))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'matrix values must be finite' });
      return;
    }
    const det = m[0] * m[4] - m[1] * m[3];
    if (!(det > 1e-9)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `matrix determinant must be positive (got ${det}); reflections are a normalization error`,
      });
    }
  });
export type CoordinateFrameV1 = z.infer<typeof coordinateFrameV1Schema>;

/** Apply the frame to a source plan point. */
export function applyFrameToPoint(
  frame: CoordinateFrameV1,
  p: { s1: number; s2: number },
): { x: number; z: number } {
  const m = frame.sourceToCanonicalMatrix;
  return { x: m[0] * p.s1 + m[1] * p.s2 + m[2], z: m[3] * p.s1 + m[4] * p.s2 + m[5] };
}

/** Invert the frame (valid because the determinant is positive). */
export function invertFramePoint(
  frame: CoordinateFrameV1,
  p: { x: number; z: number },
): { s1: number; s2: number } {
  const m = frame.sourceToCanonicalMatrix;
  const det = m[0] * m[4] - m[1] * m[3];
  const x = p.x - m[2];
  const z = p.z - m[5];
  return { s1: (m[4] * x - m[1] * z) / det, s2: (m[0] * z - m[3] * x) / det };
}

// ─── Confidence ────────────────────────────────────────────────────────────

export const confidenceV1Schema = z
  .object({
    overall: z.number().min(0).max(1),
    perWall: z
      .object({ N: z.number().min(0).max(1), E: z.number().min(0).max(1), S: z.number().min(0).max(1), W: z.number().min(0).max(1) })
      .partial()
      .strict()
      .optional(),
    fields: z
      .object({
        height: z.enum(['measured', 'estimated', 'default']).optional(),
        openings: z.enum(['detected', 'user-marked', 'none-captured']).optional(),
        services: z.enum(['detected', 'user-marked', 'none-captured']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ConfidenceV1 = z.infer<typeof confidenceV1Schema>;

// ─── Stored objects ────────────────────────────────────────────────────────

export const storedCapturePhotoV1Schema = z
  .object({
    storagePath: storagePathSchema,
    /** JPEG/PNG only — capture clients transcode HEIC before upload. */
    mediaType: z.enum(['image/jpeg', 'image/png']),
    byteSize: z.number().int().positive().max(LIMITS.maxPhotoBytes),
    sha256: sha256Schema,
    tag: z.enum(['plumbing', 'power', 'window', 'general']).optional(),
  })
  .strict();
export type StoredCapturePhotoV1 = z.infer<typeof storedCapturePhotoV1Schema>;

export const storedCaptureArtifactV1Schema = z
  .object({
    storagePath: storagePathSchema,
    kind: z.enum(['source-structured', 'partial-geometry', 'visualization', 'vendor-delivery']),
    mediaType: z.string().min(3).max(128),
    byteSize: z.number().int().positive().max(LIMITS.maxArtifactBytes),
    sha256: sha256Schema,
  })
  .strict();
export type StoredCaptureArtifactV1 = z.infer<typeof storedCaptureArtifactV1Schema>;

// ─── JsonValue (recursive, for adapterState) ───────────────────────────────

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

// ─── Room scan (discriminated states) ──────────────────────────────────────

export const roomScanSourceV1Schema = z.enum(['manual', 'webxr', 'arcore', 'cubicasa', 'roomplan', 'magicplan']);
export type RoomScanSourceV1 = z.infer<typeof roomScanSourceV1Schema>;

const roomScanCommon = {
  schemaVersion: z.literal(ROOM_SCAN_SCHEMA_VERSION),
  source: roomScanSourceV1Schema,
  /** Increments on ANY change to dimensions/openings/services, by any actor. */
  roomRevision: z.number().int().positive(),
  coordinateFrame: coordinateFrameV1Schema,
  room: scannerRectangleRoomV1Schema,
  confidence: confidenceV1Schema,
  photos: z.array(storedCapturePhotoV1Schema).max(LIMITS.maxPhotos).optional(),
  rawArtifacts: z.array(storedCaptureArtifactV1Schema).max(LIMITS.maxArtifacts).optional(),
  normalizationWarnings: z.array(z.string().max(LIMITS.maxWarningChars)).max(LIMITS.maxWarnings).optional(),
  capturedAt: isoDatetime,
};

export const unconfirmedRoomScanV1Schema = z
  .object({
    state: z.literal('unconfirmed'),
    ...roomScanCommon,
  })
  .strict();
export type UnconfirmedRoomScanV1 = z.infer<typeof unconfirmedRoomScanV1Schema>;

export const confirmedRoomScanV1Schema = z
  .object({
    state: z.literal('confirmed'),
    ...roomScanCommon,
    /** Set only when a person accepted the geometry in RoomFeaturesEditor. */
    confirmedAt: isoDatetime,
    /** Must equal roomRevision — any later geometry change invalidates it. */
    confirmedRevision: z.number().int().positive(),
  })
  .strict()
  .superRefine((scan, ctx) => {
    if (scan.confirmedRevision !== scan.roomRevision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `confirmedRevision ${scan.confirmedRevision} !== roomRevision ${scan.roomRevision}; reconfirmation required`,
      });
    }
    if (Date.parse(scan.confirmedAt) < Date.parse(scan.capturedAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'confirmedAt must be >= capturedAt' });
    }
  });
export type ConfirmedRoomScanV1 = z.infer<typeof confirmedRoomScanV1Schema>;

// z.union rather than discriminatedUnion: the confirmed member carries a
// superRefine (ZodEffects), which discriminatedUnion rejects. The `state`
// literal still discriminates; error reporting picks the matching branch.
export const roomScanV1Schema: z.ZodType<UnconfirmedRoomScanV1 | ConfirmedRoomScanV1> = z.union([
  unconfirmedRoomScanV1Schema,
  confirmedRoomScanV1Schema,
]);
export type RoomScanV1 = UnconfirmedRoomScanV1 | ConfirmedRoomScanV1;

// ─── Capture draft ─────────────────────────────────────────────────────────

export const roomCaptureDraftV1Schema = z
  .object({
    schemaVersion: z.literal(ROOM_SCAN_SCHEMA_VERSION),
    state: z.literal('draft'),
    source: roomScanSourceV1Schema,
    coordinateFrame: coordinateFrameV1Schema.optional(),
    dimensions: z
      .object({ widthMm: positiveMm().optional(), depthMm: positiveMm().optional(), heightMm: positiveMm().optional() })
      .strict()
      .optional(),
    photos: z.array(storedCapturePhotoV1Schema).max(LIMITS.maxPhotos).default([]),
    rawArtifacts: z.array(storedCaptureArtifactV1Schema).max(LIMITS.maxArtifacts).optional(),
    partialGeometry: z
      .object({
        /** Canonical plan coordinates (NW origin, x east, z south, mm). */
        cornersMm: z
          .array(z.object({ x: z.number().int(), z: z.number().int() }).strict())
          .max(LIMITS.maxCorners)
          .optional(),
        openings: z.array(openingV1Schema.partial()).max(32).optional(),
        services: z.array(servicePointV1Schema.partial()).max(32).optional(),
        closureComplete: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /** Recovery-only. Never consumed by the layout engine. */
    adapterState: jsonValueSchema.optional(),
    notes: z.string().max(LIMITS.maxNotesChars).optional(),
    capturedAt: isoDatetime,
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (draft.partialGeometry?.cornersMm?.length && !draft.coordinateFrame) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'canonical cornersMm require a coordinateFrame; keep source points in adapterState/raw artifact instead',
      });
    }
    const useful =
      draft.photos.length > 0 ||
      (draft.rawArtifacts?.length ?? 0) > 0 ||
      draft.dimensions !== undefined ||
      draft.partialGeometry !== undefined ||
      (draft.notes !== undefined && draft.notes.trim().length > 0);
    if (!useful) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'draft must contain at least one useful photo, artifact, dimension, partial geometry, or note',
      });
    }
    if (draft.adapterState !== undefined && utf8Bytes(draft.adapterState) > LIMITS.maxAdapterStateBytes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `adapterState exceeds ${LIMITS.maxAdapterStateBytes} bytes` });
    }
  });
export type RoomCaptureDraftV1 = z.infer<typeof roomCaptureDraftV1Schema>;

export type RoomCaptureV1 = RoomCaptureDraftV1 | RoomScanV1;

// ─── Handoff envelope ──────────────────────────────────────────────────────

export const handoffSourceV1Schema = z.enum([
  'website',
  'design_scope_builder',
  'flat-lay',
  'quote',
  'scanner',
  'showroom',
]);

export const handoffRoomTypeV1Schema = z.enum(['kitchen', 'laundry', 'wardrobe', 'bathroom', 'other']);

export const handoffMaterialsV1Schema = z
  .object({
    mainCabinet: z.string().max(200).optional(),
    secondaryFinish: z.string().max(200).optional(),
    benchtop: z.string().max(200).optional(),
    splashback: z.string().max(200).optional(),
    hardware: z.string().max(200).optional(),
  })
  .strict();

/**
 * Strict schema for NEW writes. A payload carries at most ONE capture
 * representation: top-level rough dimensions, OR a roomScan, OR a
 * roomCaptureDraft. Scan dimensions live only in roomScan.room.
 */
export const websitePlannerHandoffV1Schema = z
  .object({
    handoffSchemaVersion: z.literal(HANDOFF_SCHEMA_VERSION),
    source: handoffSourceV1Schema,
    leadId: z.string().max(64).optional(),
    roomType: handoffRoomTypeV1Schema,
    dimensions: z
      .object({ widthMm: positiveMm().optional(), depthMm: positiveMm().optional(), heightMm: positiveMm().optional() })
      .strict()
      .optional(),
    styleTags: z.array(z.string().max(LIMITS.maxStyleTagChars)).max(LIMITS.maxStyleTags),
    materials: handoffMaterialsV1Schema,
    notes: z.string().max(LIMITS.maxNotesChars).optional(),
    roomScan: roomScanV1Schema.optional(),
    roomCaptureDraft: roomCaptureDraftV1Schema.optional(),
  })
  .strict()
  .superRefine((h, ctx) => {
    const captures = [h.roomScan !== undefined, h.roomCaptureDraft !== undefined].filter(Boolean).length;
    if (captures > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a handoff may carry a roomScan OR a roomCaptureDraft, never both' });
    }
    if (captures > 0 && h.dimensions !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'top-level dimensions conflict with an attached capture; scan/draft dimensions are authoritative',
      });
    }
  });
export type WebsitePlannerHandoffV1 = z.infer<typeof websitePlannerHandoffV1Schema>;

// ─── Parse results (never throw) ───────────────────────────────────────────

export type HandoffIssue = { path: string; code: string; message: string };

const issuesOf = (error: z.ZodError): HandoffIssue[] =>
  error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message }));

const firstReason = (error: z.ZodError): string => {
  const i = error.issues[0];
  return i ? `${i.path.join('.') || '(root)'}: ${i.message}` : 'invalid';
};

export function parseRoomScan(input: unknown): { ok: true; scan: RoomScanV1 } | { ok: false; reason: string } {
  const r = roomScanV1Schema.safeParse(input);
  return r.success ? { ok: true, scan: r.data } : { ok: false, reason: firstReason(r.error) };
}

export function parseRoomCaptureDraft(
  input: unknown,
): { ok: true; draft: RoomCaptureDraftV1 } | { ok: false; reason: string } {
  const r = roomCaptureDraftV1Schema.safeParse(input);
  return r.success ? { ok: true, draft: r.data } : { ok: false, reason: firstReason(r.error) };
}

/** STRICT parser for new writes (create/finalize/submit). Rejects, never strips. */
export function parseWebsitePlannerHandoff(
  input: unknown,
): { ok: true; handoff: WebsitePlannerHandoffV1 } | { ok: false; reason: string; issues: HandoffIssue[] } {
  const r = websitePlannerHandoffV1Schema.safeParse(input);
  return r.success
    ? { ok: true, handoff: r.data }
    : { ok: false, reason: firstReason(r.error), issues: issuesOf(r.error) };
}

export type ParseHandoffResult =
  | { ok: true; handoff: WebsitePlannerHandoffV1; issues: HandoffIssue[] }
  | { ok: false; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * TOLERANT parser for LEGACY reads only. Recovers useful lead/style fields
 * from pre-contract payloads, strips invalid nested capture data, and
 * reports structured issues. Never use this on a new write path.
 */
export function parseLegacyWebsitePlannerHandoff(input: unknown): ParseHandoffResult {
  if (!isRecord(input)) return { ok: false, reason: 'payload is not an object' };
  const issues: HandoffIssue[] = [];

  // Fast path: already a valid V1 payload.
  const strict = websitePlannerHandoffV1Schema.safeParse(input);
  if (strict.success) return { ok: true, handoff: strict.data, issues };

  if (input.handoffSchemaVersion === undefined) {
    issues.push({ path: 'handoffSchemaVersion', code: 'legacy_version', message: 'legacy v0 payload normalized to V1' });
  } else {
    issues.push({ path: 'handoffSchemaVersion', code: 'invalid_v1', message: 'declared V1 payload failed strict parse; recovered tolerantly' });
  }

  const src = handoffSourceV1Schema.safeParse(input.source);
  if (!src.success && input.source !== undefined) {
    issues.push({ path: 'source', code: 'unknown_source', message: `unknown source "${String(input.source)}"` });
  }

  const roomType = handoffRoomTypeV1Schema.safeParse(input.roomType);
  if (!roomType.success) {
    issues.push({ path: 'roomType', code: 'unknown_room_type', message: 'roomType missing/unknown; defaulted to "other"' });
  }

  const styleTags = Array.isArray(input.styleTags)
    ? input.styleTags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.slice(0, LIMITS.maxStyleTagChars))
        .slice(0, LIMITS.maxStyleTags)
    : [];

  const materials: Record<string, string> = {};
  if (isRecord(input.materials)) {
    for (const key of ['mainCabinet', 'secondaryFinish', 'benchtop', 'splashback', 'hardware'] as const) {
      const v = input.materials[key];
      if (typeof v === 'string') materials[key] = v.slice(0, 200);
    }
  }

  let dimensions: WebsitePlannerHandoffV1['dimensions'];
  if (isRecord(input.dimensions)) {
    const dims: Record<string, number> = {};
    for (const key of ['widthMm', 'depthMm', 'heightMm'] as const) {
      const v = input.dimensions[key];
      if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= LIMITS.maxRoomMm) dims[key] = v;
      else if (v !== undefined) issues.push({ path: `dimensions.${key}`, code: 'invalid_dimension', message: 'dropped non-integer/out-of-range dimension' });
    }
    if (Object.keys(dims).length) dimensions = dims;
  }

  let roomScan: RoomScanV1 | undefined;
  if (input.roomScan !== undefined) {
    const s = parseRoomScan(input.roomScan);
    if (s.ok) roomScan = s.scan;
    else issues.push({ path: 'roomScan', code: 'invalid_scan_stripped', message: s.reason });
  }

  let roomCaptureDraft: RoomCaptureDraftV1 | undefined;
  if (input.roomCaptureDraft !== undefined) {
    const d = parseRoomCaptureDraft(input.roomCaptureDraft);
    if (d.ok) roomCaptureDraft = d.draft;
    else issues.push({ path: 'roomCaptureDraft', code: 'invalid_draft_stripped', message: d.reason });
  }

  if (roomScan && roomCaptureDraft) {
    roomCaptureDraft = undefined;
    issues.push({ path: 'roomCaptureDraft', code: 'dual_capture_stripped', message: 'kept roomScan; a payload carries one capture representation' });
  }
  if ((roomScan || roomCaptureDraft) && dimensions) {
    dimensions = undefined;
    issues.push({ path: 'dimensions', code: 'conflicting_dimensions_stripped', message: 'capture dimensions are authoritative' });
  }

  const handoff: WebsitePlannerHandoffV1 = {
    handoffSchemaVersion: HANDOFF_SCHEMA_VERSION,
    source: src.success ? src.data : 'website',
    roomType: roomType.success ? roomType.data : 'other',
    styleTags,
    materials,
    ...(typeof input.leadId === 'string' ? { leadId: input.leadId.slice(0, 64) } : {}),
    ...(typeof input.notes === 'string' ? { notes: input.notes.slice(0, LIMITS.maxNotesChars) } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(roomScan ? { roomScan } : {}),
    ...(roomCaptureDraft ? { roomCaptureDraft } : {}),
  };

  // The normalized result must itself satisfy the strict schema.
  const check = websitePlannerHandoffV1Schema.safeParse(handoff);
  if (!check.success) return { ok: false, reason: `legacy recovery failed: ${firstReason(check.error)}` };
  return { ok: true, handoff: check.data, issues };
}
