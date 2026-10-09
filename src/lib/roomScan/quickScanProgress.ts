/**
 * Quick-scan progress kept in this browser tab while the customer scans
 * (sessionStorage only — nothing here is uploaded). The AR session ends when
 * the page is backgrounded or the customer leaves AR, and used to take every
 * marked corner with it. Saved on every change, the progress lets the page
 * offer "Use these N corners" afterwards.
 *
 * Corners from one AR session cannot be continued in another: each session
 * measures from its own floor origin and heading. Saved progress is therefore
 * either used as it is or discarded — never mixed with a new session.
 */

import type { XrCorner, XrOpeningMark } from './webxrFit';

export const QUICK_SCAN_PROGRESS_KEY = 'bower.quickScan.progress';
/** Progress older than this is ignored (the wizard keeps its own state 24 h). */
export const QUICK_SCAN_PROGRESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 32;
const MAX_COORD_M = 100;

export interface QuickScanProgress {
  version: 1;
  corners: XrCorner[];
  heightMm: number | null;
  openings: XrOpeningMark[];
  savedAt: string;
}

const point = (value: unknown): XrCorner | null => {
  const p = value as { x?: unknown; z?: unknown } | null;
  if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  if (Math.abs(p.x) > MAX_COORD_M || Math.abs(p.z) > MAX_COORD_M) return null;
  return { x: p.x, z: p.z };
};

const OPENING_TYPES: readonly XrOpeningMark['type'][] = ['door', 'window', 'walkway'];

/** Parse stored progress; null for anything missing, stale or malformed. */
export function parseQuickScanProgress(raw: string | null, now = Date.now()): QuickScanProgress | null {
  if (!raw) return null;
  let value: Partial<QuickScanProgress> | null;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || value.version !== 1 || typeof value.savedAt !== 'string') return null;
  const savedAt = Date.parse(value.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > QUICK_SCAN_PROGRESS_MAX_AGE_MS) return null;
  if (!Array.isArray(value.corners) || value.corners.length > MAX_ITEMS) return null;
  if (!Array.isArray(value.openings) || value.openings.length > MAX_ITEMS) return null;
  const corners = value.corners.map(point);
  if (corners.some((c) => !c)) return null;
  const openings: XrOpeningMark[] = [];
  for (const o of value.openings) {
    const a = point(o?.a);
    const b = point(o?.b);
    if (!a || !b || !OPENING_TYPES.includes(o.type)) return null;
    openings.push({ a, b, type: o.type });
  }
  const h = value.heightMm;
  const heightMm = typeof h === 'number' && Number.isFinite(h) && h > 0 && h < 10_000 ? Math.round(h) : null;
  return { version: 1, corners: corners as XrCorner[], heightMm, openings, savedAt: value.savedAt };
}

export function serializeQuickScanProgress(
  progress: Pick<QuickScanProgress, 'corners' | 'heightMm' | 'openings'>,
  now = new Date(),
): string {
  const record: QuickScanProgress = {
    version: 1,
    corners: progress.corners.map(({ x, z }) => ({ x, z })),
    heightMm: progress.heightMm,
    openings: progress.openings.map(({ a, b, type }) => ({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, type })),
    savedAt: now.toISOString(),
  };
  return JSON.stringify(record);
}
