"use strict";
/**
 * defaultSpecFor — deterministic KitchenSpec from a DesignBrief.
 * Used as the no-AI fallback and as the wizard's instant preview.
 * Services-aware: puts the sink run on the wall with the drain when possible.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultSpecFor = defaultSpecFor;
const geometry_1 = require("./geometry");
function seg(role, widthMm) {
    return { kind: 'cabinet', role, ...(widthMm ? { widthMm } : {}) };
}
const DEFAULT_STYLE = {
    finishId: 'do-designer-white',
    benchtopId: 'egger-white-carrara',
    handleId: 'handle-bar-ss',
};
/** Which wall should hold the sink, preferring existing plumbing. */
function sinkWall(brief, candidates) {
    const drain = brief.room.services.find(s => s.type === 'drain')
        ?? brief.room.services.find(s => s.type === 'water-supply');
    if (drain && candidates.includes(drain.wall))
        return drain.wall;
    // prefer a wall with a window (sink under window)
    const windowWall = brief.room.openings.find(o => o.type === 'window' && candidates.includes(o.wall));
    return windowWall?.wall ?? candidates[0];
}
function defaultSpecFor(brief, shape, style = DEFAULT_STYLE) {
    const wantsStorage = brief.priorities.includes('storage');
    const wantsOvenTower = brief.appliances.oven !== undefined;
    const dw = brief.appliances.dishwasher;
    const fridgeW = brief.appliances.fridgeWidthMm ?? 940;
    const primaryLen = (0, geometry_1.wallLength)('N', brief.room);
    const roomyPrimary = primaryLen >= 3600;
    const fragmentedPrimary = brief.room.openings.some(opening => opening.wall === 'N' && (opening.type === 'door' || opening.type === 'walkway'));
    const mkPrimary = (withSink, withCooktop) => {
        const s = [];
        if (wantsStorage && roomyPrimary)
            s.push(seg('pantry'));
        s.push(seg('fridge-gap', fridgeW));
        if (wantsOvenTower && roomyPrimary && shape !== 'single-wall')
            s.push(seg('oven-tower'));
        if (withSink) {
            s.push(seg('doors'));
            s.push(seg('sink'));
            if (dw)
                s.push(seg('dishwasher'));
        }
        if (withCooktop) {
            s.push(seg('drawers'));
            s.push(seg('cooktop'));
        }
        return s;
    };
    let runs;
    switch (shape) {
        case 'single-wall': {
            const s = [];
            if (wantsStorage && primaryLen >= 4200)
                s.push(seg('pantry'));
            if (!dw)
                s.push(seg('fridge-gap', fridgeW));
            s.push(seg('sink', fragmentedPrimary ? 600 : undefined));
            if (dw)
                s.push(seg('dishwasher'));
            s.push(seg('drawers'));
            s.push(seg('cooktop'));
            if (dw)
                s.push(seg('fridge-gap', fridgeW));
            runs = [{ wall: 'N', segments: s, wallCabinets: true }];
            break;
        }
        case 'l-shape': {
            const sideChoices = ['W', 'E']
                .filter(w => !brief.allowedWalls?.length || brief.allowedWalls.includes(w));
            const side = sinkWall(brief, sideChoices.length ? sideChoices : ['W', 'E']);
            const sinkSide = [seg('corner'), seg('sink')];
            if (dw)
                sinkSide.push(seg('dishwasher'));
            sinkSide.push(seg('drawers'));
            runs = [
                { wall: 'N', segments: mkPrimary(false, true), wallCabinets: true },
                // side runs are corner-first: W meets N at its far end, E at its start
                { wall: side, segments: sinkSide, wallCabinets: true, fromEnd: side === 'W' },
            ];
            break;
        }
        case 'u-shape': {
            const side = sinkWall(brief, ['W', 'E']);
            const otherSide = side === 'W' ? 'E' : 'W';
            const sinkSide = [seg('corner'), seg('sink')];
            if (dw)
                sinkSide.push(seg('dishwasher'));
            const storageSide = [seg('corner'), seg('drawers'), seg('doors')];
            runs = [
                { wall: 'N', segments: mkPrimary(false, true), wallCabinets: true },
                { wall: side, segments: sinkSide, wallCabinets: true, fromEnd: side === 'W' },
                { wall: otherSide, segments: storageSide, wallCabinets: false, fromEnd: otherSide === 'W' },
            ];
            break;
        }
        case 'galley': {
            const back = [seg('fridge-gap', fridgeW), seg('sink')];
            if (dw)
                back.push(seg('dishwasher'));
            back.push(seg('drawers'));
            const front = [seg('cooktop'), seg('doors')];
            if (wantsStorage)
                front.push(seg('pantry'));
            runs = [
                { wall: 'N', segments: back, wallCabinets: true },
                { wall: 'S', segments: front, wallCabinets: false },
            ];
            break;
        }
    }
    // island when asked for and the room can hold one with legal aisles
    const canFitIsland = brief.room.depth >= 3800 && brief.room.width >= 3200;
    const island = (brief.island === 'want' || (brief.island === 'if-it-fits' && canFitIsland)) && canFitIsland
        ? { lengthMm: Math.min(2400, brief.room.width - 1800), depthMm: 650, features: ['storage'] }
        : undefined;
    return {
        runs,
        island,
        style,
        rationale: 'Standard layout: sink near existing plumbing, cooktop with bench space both sides, fridge at the end of the run.',
    };
}
