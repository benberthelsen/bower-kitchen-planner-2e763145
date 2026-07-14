"use strict";
/**
 * designScore — deterministic soft scoring for validated design candidates.
 * Hard failures are handled by validate(); this ranks the survivors against
 * the brief (implementation plan §7.6). Pure function, no randomness: the
 * same brief + spec + violations always produce the same score.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreDesign = scoreDesign;
const catalogRoles_1 = require("./catalogRoles");
const BASE_ROLES = ['sink', 'cooktop', 'drawers', 'doors', 'dishwasher'];
function rolesOf(spec) {
    return spec.runs.flatMap(run => run.segments.flatMap(s => (s.kind === 'cabinet' ? [s.role] : [])));
}
function defaultWidth(role, widthMm) {
    return widthMm ?? catalogRoles_1.ROLE_PRODUCTS[role]?.widths[0] ?? 600;
}
/** Longest contiguous stretch of bench-height cabinetry (mm) in any run. */
function longestBenchStretch(spec) {
    let best = 0;
    for (const run of spec.runs) {
        let current = 0;
        for (const s of run.segments) {
            const isBench = s.kind === 'cabinet' && BASE_ROLES.includes(s.role);
            if (isBench) {
                current += defaultWidth(s.role, s.widthMm);
                best = Math.max(best, current);
            }
            else {
                current = 0;
            }
        }
    }
    return best;
}
function scoreDesign(brief, spec, violations) {
    const roles = rolesOf(spec);
    const has = (role) => roles.includes(role);
    const count = (role) => roles.filter(r => r === role).length;
    const warns = violations.filter(v => v.severity === 'warn');
    const warnCodes = new Set(warns.map(w => w.code));
    // Required appliances represented (0-25)
    let appliances = 0;
    if (has('sink'))
        appliances += 8;
    if (has('cooktop'))
        appliances += 7;
    if (has('fridge-gap'))
        appliances += 5;
    if (brief.appliances.dishwasher)
        appliances += has('dishwasher') ? 5 : 0;
    else
        appliances += 5; // nothing missing
    appliances = Math.min(25, appliances);
    // Brief priorities (0-20)
    let priorities = 0;
    const per = brief.priorities.length > 0 ? 20 / brief.priorities.length : 0;
    for (const p of brief.priorities) {
        switch (p) {
            case 'storage':
                priorities += Math.min(per, per * (count('pantry') * 0.6 + count('drawers') * 0.3 + count('doors') * 0.15));
                break;
            case 'bench-space':
                priorities += Math.min(per, per * (longestBenchStretch(spec) / 2400));
                break;
            case 'entertaining':
                priorities += spec.island ? (spec.island.features.includes('seating') ? per : per * 0.6) : 0;
                break;
            case 'baking':
                priorities += Math.min(per, per * (longestBenchStretch(spec) / 1800));
                break;
            case 'budget': {
                // fewer, simpler cabinets score better for a budget brief
                const cabinetCount = roles.length;
                priorities += cabinetCount <= 7 ? per : Math.max(0, per * (1 - (cabinetCount - 7) * 0.15));
                break;
            }
        }
    }
    priorities = Math.min(20, priorities);
    if (brief.priorities.length === 0)
        priorities = 12; // neutral default
    // Workflow relationships (0-25). Adjacency hard rules already passed
    // validation; this rewards good soft structure.
    let workflow = 0;
    if (has('sink') && has('cooktop'))
        workflow += 10;
    const sinkRun = spec.runs.findIndex(r => r.segments.some(s => s.kind === 'cabinet' && s.role === 'sink'));
    const cookRun = spec.runs.findIndex(r => r.segments.some(s => s.kind === 'cabinet' && s.role === 'cooktop'));
    if (sinkRun >= 0 && cookRun >= 0)
        workflow += Math.abs(sinkRun - cookRun) <= 1 ? 8 : 3;
    if (!warnCodes.has('triangle-size') && !warnCodes.has('triangle-leg'))
        workflow += 7;
    workflow = Math.min(25, workflow);
    // Service proximity (0-15): validate() already measured the distances.
    let serviceProximity = 15;
    if (warnCodes.has('replumb'))
        serviceProximity -= 8;
    if (warnCodes.has('gas-move'))
        serviceProximity -= 7;
    // Bench continuity (0-15)
    const benchContinuity = Math.min(15, Math.round((longestBenchStretch(spec) / 1800) * 15));
    // Residual warnings not already priced in above (0 to -15)
    const counted = new Set(['replumb', 'gas-move', 'triangle-size', 'triangle-leg']);
    const residual = warns.filter(w => !counted.has(w.code)).length;
    const warningsPenalty = -Math.min(15, residual * 4);
    const parts = {
        appliances, priorities, workflow, serviceProximity, benchContinuity, warningsPenalty,
    };
    const total = Math.max(0, Math.min(100, Math.round(appliances + priorities + workflow + serviceProximity + benchContinuity + warningsPenalty)));
    return { total, parts };
}
