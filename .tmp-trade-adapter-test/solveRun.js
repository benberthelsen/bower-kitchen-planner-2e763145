"use strict";
/**
 * solveRun — fit a run's segments onto a wall, avoiding door/walkway openings,
 * auto-sizing flexible segments and inserting fillers.
 *
 * Fitting strategy (deterministic):
 * 1. Pre-pass: while the run can't fit, drop the LEAST important segments
 *    first (doors, pantry, oven tower, then drawers). Required appliances and
 *    essentials (sink, cooktop, dishwasher, fridge, corner) are never pre-dropped.
 * 2. Sequential placement left-to-right across usable intervals, shrinking
 *    flexible widths through each role's ladder.
 * 3. Leftover space in EVERY interval is filled with door-cabinet modules and
 *    closed with fillers ≤ 100mm.
 * Every compromise is recorded as a human-readable note for the UI.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.solveRun = solveRun;
const catalogRoles_1 = require("./catalogRoles");
const geometry_1 = require("./geometry");
const MAX_END_FILLER = 100;
const MIN_MODULE = 300;
/** droppable roles, least-important first */
const DROP_ORDER = ['doors', 'pantry', 'oven-tower', 'drawers'];
const WALL_NAMES = { N: 'back', E: 'right', S: 'front', W: 'left' };
const ROLE_NAMES = {
    sink: 'the sink', cooktop: 'the cooktop', dishwasher: 'the dishwasher',
    drawers: 'a drawer bank', doors: 'a cupboard', pantry: 'the pantry',
    'oven-tower': 'the oven tower', 'fridge-gap': 'the fridge space', corner: 'the corner unit',
};
function preferredWidth(seg) {
    if (seg.kind !== 'cabinet')
        return seg.widthMm;
    if (seg.widthMm)
        return seg.widthMm;
    return catalogRoles_1.ROLE_PRODUCTS[seg.role].widths[0];
}
function minWidth(seg) {
    if (seg.kind !== 'cabinet')
        return seg.widthMm;
    if (catalogRoles_1.FIXED_WIDTH_ROLES.includes(seg.role))
        return catalogRoles_1.ROLE_PRODUCTS[seg.role].widths[0];
    if (seg.widthMm)
        return seg.widthMm;
    const ws = catalogRoles_1.ROLE_PRODUCTS[seg.role].widths;
    return ws[ws.length - 1];
}
function solveRun(run, wallLengthMm, openings, extraBlocked = []) {
    // Mirrored solve: flip blocked zones, solve left-to-right, flip results back.
    if (run.fromEnd) {
        const mirror = (b) => ({ start: wallLengthMm - b.end, end: wallLengthMm - b.start });
        const mirroredOpenings = openings.map(o => (o.wall === run.wall
            ? { ...o, offsetMm: wallLengthMm - o.offsetMm - o.widthMm }
            : o));
        const inner = solveRun({ ...run, fromEnd: false }, wallLengthMm, mirroredOpenings, extraBlocked.map(mirror));
        return {
            notes: inner.notes,
            resolved: inner.resolved.map(rs => ({ ...rs, startMm: wallLengthMm - rs.startMm - rs.widthMm })),
        };
    }
    const notes = [];
    const wallName = `${WALL_NAMES[run.wall] ?? run.wall} wall`;
    const blocked = [...(0, geometry_1.baseBlockedIntervals)(run.wall, openings), ...extraBlocked];
    const intervals = (0, geometry_1.usableIntervals)(wallLengthMm, blocked);
    if (intervals.length === 0) {
        return { resolved: [], notes: [`No usable space on the ${wallName} — openings cover it`] };
    }
    // ── pre-pass: drop least-important segments until the run can fit ──
    const usableTotal = intervals.reduce((s, i) => s + (i.end - i.start), 0);
    const queue = [...run.segments];
    const minTotal = () => queue.reduce((s, seg) => s + minWidth(seg), 0);
    for (const dropRole of DROP_ORDER) {
        while (minTotal() > usableTotal) {
            // drop the LAST occurrence of the current drop-role
            const idx = queue.map(s => (s.kind === 'cabinet' ? s.role : null)).lastIndexOf(dropRole);
            if (idx === -1)
                break;
            queue.splice(idx, 1);
            notes.push(`Left out ${ROLE_NAMES[dropRole]} — not enough room on the ${wallName}`);
        }
        if (minTotal() <= usableTotal)
            break;
    }
    // ── sequential placement ──
    const resolved = [];
    let iv = 0;
    let cursor = intervals[0].start;
    const remainingIn = (interval) => interval.end - cursor;
    const remainingUsable = () => intervals
        .slice(iv)
        .reduce((sum, interval, index) => sum + (index === 0 ? remainingIn(interval) : interval.end - interval.start), 0);
    while (queue.length > 0 && iv < intervals.length) {
        const seg = queue[0];
        const interval = intervals[iv];
        let w = preferredWidth(seg);
        // Reserve minimum widths for later segments before selecting a wide
        // cabinet variant, so required appliances are not squeezed out.
        if (seg.kind === 'cabinet' && !seg.widthMm) {
            const ladder = catalogRoles_1.ROLE_PRODUCTS[seg.role].widths;
            const minimumAfter = queue.slice(1).reduce((sum, candidate) => sum + minWidth(candidate), 0);
            const availableForSegment = remainingUsable() - minimumAfter;
            const fit = ladder.find(cand => cand <= remainingIn(interval) && cand <= availableForSegment);
            w = fit ?? ladder[ladder.length - 1];
        }
        if (w > remainingIn(interval)) {
            if (minWidth(seg) > remainingIn(interval)) {
                // can't fit in this interval — try the next one (gap over the opening)
                if (iv + 1 < intervals.length) {
                    if (remainingIn(interval) > 10) {
                        resolved.push({
                            segment: { kind: 'gap', reason: 'opening', widthMm: remainingIn(interval) },
                            definitionId: null, startMm: cursor, widthMm: remainingIn(interval),
                        });
                    }
                    iv++;
                    cursor = intervals[iv].start;
                    continue;
                }
                if (seg.kind === 'cabinet') {
                    notes.push(`Couldn't fit ${ROLE_NAMES[seg.role]} on the ${wallName}`);
                }
                queue.shift();
                continue;
            }
            w = minWidth(seg);
        }
        resolved.push({
            segment: seg,
            definitionId: seg.kind === 'cabinet' ? (0, catalogRoles_1.resolveDefinition)(seg.role, w) : null,
            startMm: cursor,
            widthMm: w,
        });
        cursor += w;
        queue.shift();
    }
    for (const seg of queue) {
        if (seg.kind === 'cabinet')
            notes.push(`Couldn't fit ${ROLE_NAMES[seg.role]} on the ${wallName}`);
    }
    // ── essential rescue: if an essential (sink/cooktop/dishwasher/fridge/corner) was
    // squeezed out by wall fragmentation, retry the whole run with one fewer
    // nice-to-have segment instead of losing the essential. ──
    const ESSENTIALS = ['sink', 'cooktop', 'dishwasher', 'fridge-gap', 'corner'];
    const droppedEssential = run.segments.some(seg => seg.kind === 'cabinet' && ESSENTIALS.includes(seg.role)
        && !resolved.some(rs => rs.segment === seg));
    if (droppedEssential) {
        for (const dropRole of DROP_ORDER) {
            const idx = run.segments
                .map(x => (x.kind === 'cabinet' ? x.role : null))
                .lastIndexOf(dropRole);
            if (idx === -1)
                continue;
            const reducedSegments = run.segments.filter((_, i) => i !== idx);
            const retry = solveRun({ ...run, segments: reducedSegments }, wallLengthMm, openings, extraBlocked);
            return {
                resolved: retry.resolved,
                notes: [`Left out ${ROLE_NAMES[dropRole]} to make room on the ${wallName}`, ...retry.notes],
            };
        }
    }
    // ── expand: fill leftover space in EVERY remaining interval ──
    for (; iv < intervals.length; iv++) {
        cursor = Math.max(cursor, intervals[iv].start);
        let leftover = intervals[iv].end - cursor;
        const modules = [900, 600, 450, 300];
        while (leftover >= MIN_MODULE) {
            const w = modules.find(mm => mm <= leftover);
            if (!w)
                break;
            resolved.push({
                segment: { kind: 'cabinet', role: 'doors', widthMm: w },
                definitionId: (0, catalogRoles_1.resolveDefinition)('doors', w),
                startMm: cursor, widthMm: w,
            });
            cursor += w;
            leftover -= w;
        }
        if (leftover > 10 && leftover <= MAX_END_FILLER) {
            resolved.push({ segment: { kind: 'filler', widthMm: leftover }, definitionId: 'base_filler', startMm: cursor, widthMm: leftover });
        }
        if (iv + 1 < intervals.length)
            cursor = intervals[iv + 1].start;
    }
    return { resolved, notes };
}
