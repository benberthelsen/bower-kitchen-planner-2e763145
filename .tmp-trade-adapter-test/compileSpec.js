"use strict";
/**
 * compileSpec — KitchenSpec → PlacedItem[] (world-space, scene-ready).
 * Adds wall cabinets above runs (openings-aware), a rangehood over the cooktop,
 * and island cabinets. Output renders directly in UnifiedScene.
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
        for (const rs of solved.resolved) {
            if (rs.segment.kind === 'gap')
                continue;
            if (rs.segment.kind === 'filler')
                continue; // fillers are visual no-ops in v1 preview
            const role = rs.segment.kind === 'cabinet' ? rs.segment.role : null;
            const isTall = role !== null && TALL_ROLES.includes(role);
            const height = isTall ? dims.tallHeight : dims.baseHeight;
            const depth = isTall ? dims.tallDepth : dims.baseDepth;
            const pos = (0, geometry_1.wallToWorld)(run.wall, rs.startMm, rs.widthMm, depth, room);
            const placed = push({
                definitionId: rs.definitionId ?? 'base_1_door',
                itemType: role === 'dishwasher' || role === 'fridge-gap' ? 'Appliance' : 'Cabinet',
                x: pos.x, y: 0, z: pos.z, rotation: pos.rotation,
                width: rs.widthMm, height, depth,
            });
            if (role && !rolePositions[role]) {
                rolePositions[role] = { wall: run.wall, startMm: rs.startMm, widthMm: rs.widthMm, item: placed };
            }
            if (isTall)
                tallSpans.push({ start: rs.startMm, end: rs.startMm + rs.widthMm });
            if (role === 'cooktop')
                cooktopSeg = rs;
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
            for (const interval of (0, geometry_1.usableIntervals)(len, blocked)) {
                let cursor = interval.start;
                let leftover = interval.end - cursor;
                while (leftover >= 300) {
                    const w = catalogRoles_1.WALL_CAB.widths.find(mm => mm <= leftover);
                    if (!w)
                        break;
                    const pos = (0, geometry_1.wallToWorld)(run.wall, cursor, w, dims.wallDepth, room);
                    push({
                        definitionId: w <= 450 ? catalogRoles_1.WALL_CAB.narrowId : catalogRoles_1.WALL_CAB.definitionId,
                        itemType: 'Cabinet',
                        x: pos.x, y: dims.wallMountHeight, z: pos.z, rotation: pos.rotation,
                        width: w, height: dims.wallHeight, depth: dims.wallDepth,
                    });
                    cursor += w;
                    leftover -= w;
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
            push({
                definitionId: 'base_2_door',
                itemType: 'Cabinet',
                x: startX + i * 600 + 300, y: 0, z: islandZ, rotation: 180,
                width: 600, height: dims.baseHeight, depth: Math.min(depthMm, 650),
            });
        }
    }
    return { items, notes, rolePositions };
}
