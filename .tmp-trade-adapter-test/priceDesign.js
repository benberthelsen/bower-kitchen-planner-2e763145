"use strict";
/**
 * priceDesign — homeowner-safe price band from compiled items.
 *
 * v1 is a deterministic per-item estimator (much better than the old
 * linear-metre formula: it prices what was actually placed). The function
 * boundary is stable so the real BOM engine (src/lib/pricing) can slot in
 * behind it later without touching callers.
 *
 * HARD RULE: output is a rounded RANGE only — never expose trade cost lines.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceDesign = priceDesign;
const constants_1 = require("./constants");
const catalogRoles_1 = require("./catalogRoles");
/** commercial layer over estimated cost */
const COMMERCIAL_MULT = 1.35;
const BAND = 0.12;
const ROUND_TO = 500;
/** install + benchtop template/labor allowance */
const INSTALL_RATE = 0.18;
const BENCHTOP_PER_LM = 380; // AUD/lm base
const DEFN_WEIGHTS = Object.fromEntries(Object.values(catalogRoles_1.ROLE_PRODUCTS).map(p => [p.definitionId, p.priceWeight]));
// extra ids the compiler emits
Object.assign(DEFN_WEIGHTS, {
    base_1_door: 430,
    sink_base_1_door: 520,
    wall_1_door: 320,
    wall_2_door: 420,
    wall_rangehood: 380,
    fridge_top_cabinet: 300,
    base_filler: 40,
    base_corner_blind_right: 950,
});
function roundTo(x, step) {
    return Math.round(x / step) * step;
}
function priceDesign(items, style) {
    try {
        const finishMult = constants_1.FINISH_OPTIONS.find(f => f.id === style.finishId)?.priceMultiplier ?? 1.0;
        const benchMult = constants_1.BENCHTOP_OPTIONS.find(b => b.id === style.benchtopId)?.priceMultiplier ?? 1.0;
        const handlePrice = constants_1.HANDLE_OPTIONS.find(h => h.id === style.handleId)?.price ?? 15;
        let cabinets = 0;
        let benchLm = 0;
        let fronts = 0;
        const END_PANEL_AUD = 110;
        const FILLER_AUD_PER_100 = 18;
        for (const item of items) {
            const base = DEFN_WEIGHTS[item.definitionId] ?? 480;
            // scale by width relative to 600mm module
            cabinets += base * Math.max(0.5, item.width / 600);
            if (item.y === 0 && item.height <= 800)
                benchLm += item.width / 1000;
            // crude front count for handle pricing
            if (item.itemType === 'Cabinet')
                fronts += item.width > 600 ? 2 : 1;
            // joinery intent set by the compiler: finished ends + fillers
            if (item.endPanelLeft)
                cabinets += END_PANEL_AUD;
            if (item.endPanelRight)
                cabinets += END_PANEL_AUD;
            const fillerMm = (item.fillerLeft ?? 0) + (item.fillerRight ?? 0);
            if (fillerMm > 0) {
                cabinets += Math.ceil(fillerMm / 100) * FILLER_AUD_PER_100;
                benchLm += item.y === 0 && item.height <= 800 ? fillerMm / 1000 : 0;
            }
        }
        const cost = cabinets * finishMult +
            benchLm * BENCHTOP_PER_LM * benchMult +
            fronts * handlePrice;
        const withInstall = cost * (1 + INSTALL_RATE);
        const sell = withInstall * COMMERCIAL_MULT * 1.1; // inc GST
        const low = roundTo(sell * (1 - BAND), ROUND_TO);
        const high = roundTo(sell * (1 + BAND), ROUND_TO);
        if (!Number.isFinite(low) || low <= 0)
            throw new Error('bad estimate');
        return { lowAud: low, highAud: Math.max(high, low + ROUND_TO), estimateSource: 'engine' };
    }
    catch {
        // last-resort fallback: rough linear-metre estimate from item extents
        const lm = items.filter(i => i.y === 0).reduce((s, i) => s + i.width, 0) / 1000;
        const base = Math.max(lm, 2) * 2400;
        return {
            lowAud: roundTo(base * 0.85, ROUND_TO),
            highAud: roundTo(base * 1.15, ROUND_TO),
            estimateSource: 'fallback',
        };
    }
}
