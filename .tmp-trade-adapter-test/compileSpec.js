"use strict";
/**
 * compileSpec — KitchenSpec → PlacedItem[] (world-space, scene-ready).
 * Adds wall cabinets above runs (openings-aware), a rangehood over the cooktop,
 * and island cabinets. Output renders directly in UnifiedScene.
 *
 * Joinery intent (v1.2): fillers solved by solveRun are attached to their
 * neighbouring cabinet as fillerLeft/fillerRight; exposed run ends get
 * endPanelLeft/endPanelRight; blind corners resolve to the left/right variant
 * with blindSide set, so the corner opens away from the adjacent run. Under
 * the wall-offset convention (low-t = Left as seen from the room) these
 * left/right flags are wall-agnostic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileSpec = compileSpec;
const constants_1 = require("./constants");
const catalogRoles_1 = require("./catalogRoles");
const geometry_1 = require("./geometry");
const solveRun_1 = require("./solveRun");
const TALL_ROLES = ['pantry', 'oven-tower', 'fridge-gap'];
function compileSpec(spec, room, dims = constants_1.DEFAULT_GLOBAL_DIMENSIONS) {
    const items = [];
    const notes = [];
    const rolePositions = {};
    let n = 1;
    let cabNo = 1;
    const push = (item) => {
        const placed = {
            ...item,
            instanceId: `ai-${n++}`,
            cabinetNumber: item.itemType === 'Cabinet' ? `C${String(cabNo++).padStart(2, '0')}` : undefined,
            finishColor: spec.style.finishId,
            handleType: spec.style.handleId,
        };
        items.push(placed);
        return placed;
    };
    const wallsWithRuns = new Set(spec.runs.map(r => r.wall));
    for (let runIdx = 0; runIdx < spec.runs.length; runIdx++) {
        const run = spec.runs[runIdx];
        const len = (0, geometry_1.wallLength)(run.wall, room);
        // Reserve shared corners already claimed by earlier runs: block the
        // adjacent run's carcase depth (+clearance) so runs never collide.
        const cornerBlocked = [];
        const reserve = dims.baseDepth + 25;
        for (let k = 0; k < runIdx; k++) {
            const at = (0, geometry_1.sharedCornerAt)(run.wall, spec.runs[k].wall);
            if (at === 'start')
                cornerBlocked.push({ start: 0, end: reserve });
            if (at === 'end')
                cornerBlocked.push({ start: len - reserve, end: len });
        }
        const solved = (0, solveRun_1.solveRun)(run, len, room.openings, cornerBlocked);
        notes.push(...solved.notes);
        // base + tall row
        const tallSpans = [];
        let cooktopSeg = null;
        /** placed floor items of this run with their wall spans, in t order */
        const rowItems = [];
        let pendingFillerLeft = 0;
        // fromEnd solves map back in descending wall-offset order. Joinery sides
        // are defined in physical low-t → high-t order, so normalize before
        // attaching fillers/end panels (otherwise W-wall exposed ends are reversed).
        const resolvedInWallOrder = [...solved.resolved].sort((a, b) => a.startMm - b.startMm);
        for (const rs of resolvedInWallOrder) {
            if (rs.segment.kind === 'gap')
                continue;
            if (rs.segment.kind === 'filler') {
                // Attach to the next cabinet as fillerLeft; if the run ends here,
                // fall back to the previous cabinet's fillerRight.
                pendingFillerLeft += rs.widthMm;
                continue;
            }
            const role = rs.segment.kind === 'cabinet' ? rs.segment.role : null;
            const isTall = role !== null && TALL_ROLES.includes(role);
            const height = isTall ? dims.tallHeight : dims.baseHeight;
            const depth = isTall ? dims.tallDepth : dims.baseDepth;
            const pos = (0, geometry_1.wallToWorld)(run.wall, rs.startMm, rs.widthMm, depth, room);
            // Blind corner: blind panel faces the corner it serves (low-t half → Left).
            const isCorner = role === 'corner';
            const blindSide = isCorner
                ? (rs.startMm + rs.widthMm / 2 <= len / 2 ? 'Left' : 'Right')
                : undefined;
            const placed = push({
                definitionId: isCorner && blindSide ? (0, catalogRoles_1.resolveCornerVariant)(blindSide) : (rs.definitionId ?? 'base_1_door'),
                itemType: role === 'dishwasher' || role === 'fridge-gap' ? 'Appliance' : 'Cabinet',
                x: pos.x, y: 0, z: pos.z, rotation: pos.rotation,
                width: rs.widthMm, height, depth,
                ...(blindSide ? { blindSide } : {}),
                ...(pendingFillerLeft > 0 ? { fillerLeft: pendingFillerLeft } : {}),
            });
            const fillerL = pendingFillerLeft;
            pendingFillerLeft = 0;
            rowItems.push({ item: placed, start: rs.startMm - fillerL, end: rs.startMm + rs.widthMm });
            if (role && !rolePositions[role]) {
                rolePositions[role] = { wall: run.wall, startMm: rs.startMm, widthMm: rs.widthMm, item: placed };
            }
            if (isTall)
                tallSpans.push({ start: rs.startMm, end: rs.startMm + rs.widthMm });
            if (role === 'cooktop')
                cooktopSeg = rs;
        }
        if (pendingFillerLeft > 0 && rowItems.length > 0) {
            const last = rowItems[rowItems.length - 1];
            last.item.fillerRight = (last.item.fillerRight ?? 0) + pendingFillerLeft;
            last.end += pendingFillerLeft;
        }
        // End panels on exposed run ends. An end is exposed unless it lands at a
        // room corner or against a corner reserve backed by an adjacent run.
        const coveredByReserve = (t) => cornerBlocked.some(b => t >= b.start - 30 && t <= b.end + 30);
        for (let gi = 0; gi < rowItems.length; gi++) {
            const startsGroup = gi === 0 || rowItems[gi].start - rowItems[gi - 1].end > 20;
            const endsGroup = gi === rowItems.length - 1 || rowItems[gi + 1].start - rowItems[gi].end > 20;
            if (startsGroup && rowItems[gi].start > 25 && !coveredByReserve(rowItems[gi].start)) {
                rowItems[gi].item.endPanelLeft = true;
            }
            if (endsGroup && rowItems[gi].end < len - 25 && !coveredByReserve(rowItems[gi].end)) {
                rowItems[gi].item.endPanelRight = true;
            }
        }
        // wall cabinet row
        if (run.wallCabinets) {
            const blocked = [
                ...(0, geometry_1.wallCabBlockedIntervals)(run.wall, room.openings),
                ...tallSpans,
                ...cornerBlocked,
            ];
            // reserve the rangehood slot above the cooktop
            if (cooktopSeg)
                blocked.push({ start: cooktopSeg.startMm, end: cooktopSeg.startMm + cooktopSeg.widthMm });
            const abutsTall = (t) => tallSpans.some(s => Math.abs(s.start - t) <= 30 || Math.abs(s.end - t) <= 30);
            const abutsReserve = (t) => cornerBlocked.some(b => t >= b.start - 30 && t <= b.end + 30);
            for (const interval of (0, geometry_1.usableIntervals)(len, blocked)) {
                let cursor = interval.start;
                let leftover = interval.end - cursor;
                const rowCabs = [];
                while (leftover >= 300) {
                    const w = catalogRoles_1.WALL_CAB.widths.find(mm => mm <= leftover);
                    if (!w)
                        break;
                    const pos = (0, geometry_1.wallToWorld)(run.wall, cursor, w, dims.wallDepth, room);
                    rowCabs.push(push({
                        definitionId: w <= 450 ? catalogRoles_1.WALL_CAB.narrowId : catalogRoles_1.WALL_CAB.definitionId,
                        itemType: 'Cabinet',
                        x: pos.x, y: dims.wallMountHeight, z: pos.z, rotation: pos.rotation,
                        width: w, height: dims.wallHeight, depth: dims.wallDepth,
                    }));
                    cursor += w;
                    leftover -= w;
                }
                // finished ends on exposed wall-row extremes (not at room corners,
                // not where a tall cabinet or the adjacent run continues the row)
                if (rowCabs.length > 0) {
                    if (interval.start > 25 && !abutsTall(interval.start) && !abutsReserve(interval.start)) {
                        rowCabs[0].endPanelLeft = true;
                    }
                    if (cursor < len - 25 && !abutsTall(cursor) && !abutsReserve(cursor)) {
                        rowCabs[rowCabs.length - 1].endPanelRight = true;
                    }
                }
            }
            if (cooktopSeg) {
                const pos = (0, geometry_1.wallToWorld)(run.wall, cooktopSeg.startMm, cooktopSeg.widthMm, dims.wallDepth, room);
                push({
                    definitionId: catalogRoles_1.RANGEHOOD_ID,
                    itemType: 'Appliance',
                    x: pos.x, y: dims.wallMountHeight, z: pos.z, rotation: pos.rotation,
                    width: Math.min(cooktopSeg.widthMm, 900), height: dims.wallHeight, depth: dims.wallDepth,
                });
            }
        }
    }
    // island
    if (spec.island) {
        const { lengthMm, depthMm } = spec.island;
        const count = Math.max(1, Math.floor(lengthMm / 600));
        const rowWidth = count * 600;
        const startX = room.width / 2 - rowWidth / 2;
        // island sits centered on x, offset off the N run toward the front
        const islandZ = wallsWithRuns.has('N')
            ? dims.baseDepth + 1200 + depthMm / 2
            : room.depth / 2;
        for (let i = 0; i < count; i++) {
            // Island ends are always exposed → finished end panels on both extremes.
            // Row runs along +x and cabinets face -z (rotation 180), so the +x
            // extreme is the cabinets' local LEFT and the -x extreme their RIGHT.
            push({
                definitionId: 'base_2_door',
                itemType: 'Cabinet',
                x: startX + i * 600 + 300, y: 0, z: islandZ, rotation: 180,
                width: 600, height: dims.baseHeight, depth: Math.min(depthMm, 650),
                ...(i === count - 1 ? { endPanelLeft: true } : {}),
                ...(i === 0 ? { endPanelRight: true } : {}),
            });
        }
    }
    return { items, notes, runWalls: spec.runs.map(run => run.wall), rolePositions };
}
