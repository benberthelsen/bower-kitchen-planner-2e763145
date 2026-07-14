"use strict";
/**
 * Wall/plan geometry helpers for the layout engine.
 *
 * Conventions (MUST match UnifiedScene's room rendering — corner origin):
 * - Room spans x ∈ [0, width], z ∈ [0, depth] (mm; scene divides by 1000).
 * - N wall (back) at z = 0, items face +z, rotation 0.
 * - E wall (right) at x = width, rotation 270.
 * - S wall (front) at z = depth, rotation 180.
 * - W wall (left) at x = 0, rotation 90.
 * - Wall offsets (t, mm) are measured from the wall's LEFT corner when facing
 *   the wall from inside the room.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WALL_ROTATION = void 0;
exports.wallLength = wallLength;
exports.wallToWorld = wallToWorld;
exports.itemRect = itemRect;
exports.rectsOverlap = rectsOverlap;
exports.baseBlockedIntervals = baseBlockedIntervals;
exports.wallCabBlockedIntervals = wallCabBlockedIntervals;
exports.usableIntervals = usableIntervals;
exports.wallPointWorld = wallPointWorld;
exports.dist = dist;
exports.sharedCornerAt = sharedCornerAt;
exports.WALL_ROTATION = { N: 0, E: 270, S: 180, W: 90 };
function wallLength(wall, room) {
    return wall === 'N' || wall === 'S' ? room.width : room.depth;
}
/** World-space center for an item of `widthMm` at wall offset `t`, sitting
 *  against the wall with carcase depth `depthMm`. */
function wallToWorld(wall, t, widthMm, depthMm, room) {
    const c = t + widthMm / 2; // center along the wall
    switch (wall) {
        case 'N': return { x: c, z: depthMm / 2, rotation: 0 };
        case 'E': return { x: room.width - depthMm / 2, z: c, rotation: 270 };
        case 'S': return { x: room.width - c, z: room.depth - depthMm / 2, rotation: 180 };
        case 'W': return { x: depthMm / 2, z: room.depth - c, rotation: 90 };
    }
}
function itemRect(item) {
    const rot = ((item.rotation % 360) + 360) % 360;
    const alongX = rot === 0 || rot === 180;
    const sx = alongX ? item.width : item.depth;
    const sz = alongX ? item.depth : item.width;
    return {
        minX: item.x - sx / 2, maxX: item.x + sx / 2,
        minZ: item.z - sz / 2, maxZ: item.z + sz / 2,
    };
}
function rectsOverlap(a, b, toleranceMm = 1) {
    return a.minX < b.maxX - toleranceMm && a.maxX > b.minX + toleranceMm
        && a.minZ < b.maxZ - toleranceMm && a.maxZ > b.minZ + toleranceMm;
}
/** Blocked intervals on a wall for BASE/TALL cabinets: doors + walkways (+margin). */
function baseBlockedIntervals(wall, openings, marginMm = 25) {
    return openings
        .filter(o => o.wall === wall && (o.type === 'door' || o.type === 'walkway'))
        .map(o => ({ start: o.offsetMm - marginMm, end: o.offsetMm + o.widthMm + marginMm }));
}
/** Blocked intervals for WALL cabinets: doors, walkways, and windows.
 *  (Base cabinets can sit under a window; wall cabinets cannot cross one.) */
function wallCabBlockedIntervals(wall, openings, marginMm = 25) {
    return openings
        .filter(o => o.wall === wall)
        .map(o => ({ start: o.offsetMm - marginMm, end: o.offsetMm + o.widthMm + marginMm }));
}
/** Subtract blocked intervals from [0, length] → sorted usable intervals. */
function usableIntervals(lengthMm, blocked) {
    const sorted = [...blocked].sort((a, b) => a.start - b.start);
    const out = [];
    let cursor = 0;
    for (const b of sorted) {
        if (b.start > cursor)
            out.push({ start: cursor, end: Math.min(b.start, lengthMm) });
        cursor = Math.max(cursor, b.end);
        if (cursor >= lengthMm)
            break;
    }
    if (cursor < lengthMm)
        out.push({ start: cursor, end: lengthMm });
    return out.filter(i => i.end - i.start >= 100);
}
/** Distance between a wall offset position and a plan point, both projected to world. */
function wallPointWorld(wall, t, room) {
    const p = wallToWorld(wall, t, 0, 0, room);
    return { x: p.x, z: p.z };
}
function dist(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}
/**
 * Where (in wall-offset terms) does `wall` meet `other`?
 * Returns 'start' (t=0), 'end' (t=length), or null if not adjacent.
 * Derived from the offset conventions at the top of this file:
 *   N t0=W corner, N tEnd=E corner; E t0=N corner, E tEnd=S corner;
 *   S t0=E corner, S tEnd=W corner; W t0=S corner, W tEnd=N corner.
 */
function sharedCornerAt(wall, other) {
    const map = {
        'N|W': 'start', 'N|E': 'end',
        'E|N': 'start', 'E|S': 'end',
        'S|E': 'start', 'S|W': 'end',
        'W|S': 'start', 'W|N': 'end',
    };
    return map[`${wall}|${other}`] ?? null;
}
