"use strict";
/**
 * evaluateKitchenRules — maps the deterministic engine's findings onto the
 * versioned KitchenRuleResultV1 shape (plan §7.4) and holds regulated rules
 * at `pending` until an approved jurisdiction profile matches the project.
 *
 * The engine's validate() remains the geometric authority; this layer gives
 * every finding a stable rule ID, stage, severity and pack version so results
 * can be fingerprinted, persisted and gated. Deterministic: results are
 * sorted; no timestamps or randomness.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateKitchenRules = evaluateKitchenRules;
exports.hasConceptBlocker = hasConceptBlocker;
exports.quoteBlockers = quoteBlockers;
const regulatoryProfiles_1 = require("./regulatoryProfiles");
const rulePack_1 = require("./rulePack");
/** violation code → stable rule mapping (doc §7.4 tables) */
const VIOLATION_RULES = {
    'out-of-room': { ruleId: 'KRN-ROOM-001', stage: 'concept', severity: 'blocker' },
    'overlap': { ruleId: 'KRN-ROOM-001', stage: 'concept', severity: 'blocker' },
    'narrow-aisle': { ruleId: 'KRN-AISLE-001', stage: 'concept', severity: 'blocker' },
    'narrow-galley': { ruleId: 'KRN-AISLE-001', stage: 'concept', severity: 'blocker' },
    'door-swing': { ruleId: 'KRN-OPEN-001', stage: 'concept', severity: 'warning' },
    'no-sink': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'blocker' },
    'no-dishwasher': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'warning' },
    'no-fridge': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'blocker' },
    'no-cooktop': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'blocker' },
    'dishwasher-not-adjacent': { ruleId: 'KRN-DW-001', stage: 'concept', severity: 'blocker' },
    'cooktop-landing': { ruleId: 'KRN-BENCH-001', stage: 'concept', severity: 'warning' },
    'prep-space': { ruleId: 'KRN-BENCH-001', stage: 'concept', severity: 'warning' },
    'replumb': { ruleId: 'KRN-SINK-003', stage: 'quote', severity: 'warning' },
    'gas-move': { ruleId: 'ERG-GAS-MOVE-001', stage: 'quote', severity: 'advisory' },
    'triangle-size': { ruleId: 'KRN-FLOW-001', stage: 'concept', severity: 'advisory' },
    'triangle-leg': { ruleId: 'KRN-FLOW-001', stage: 'concept', severity: 'advisory' },
};
function ruleResult(partial) {
    return { entityIds: [], repairOptions: [], ...partial };
}
function evaluateKitchenRules(input) {
    const results = [];
    // 1. Engine findings → layout-pack rule results.
    for (const violation of input.violations) {
        const mapping = VIOLATION_RULES[violation.code];
        if (!mapping) {
            // Unknown engine finding: never drop it silently — surface as a
            // concept warning under the generic room rule so it stays visible.
            results.push(ruleResult({
                ruleId: 'KRN-ROOM-001',
                rulePackVersion: rulePack_1.BOWER_LAYOUT_PACK_VERSION,
                stage: 'concept',
                severity: violation.severity === 'error' ? 'blocker' : 'warning',
                status: 'fail',
                messageKey: `engine.${violation.code}`,
                entityIds: violation.itemIds ?? [],
            }));
            continue;
        }
        results.push(ruleResult({
            ruleId: mapping.ruleId,
            rulePackVersion: rulePack_1.BOWER_LAYOUT_PACK_VERSION,
            stage: mapping.stage,
            severity: mapping.severity,
            status: 'fail',
            messageKey: `engine.${violation.code}`,
            entityIds: violation.itemIds ?? [],
        }));
    }
    // 2. Structural passes the engine proved by NOT reporting a violation.
    const failedRuleIds = new Set(results.map(r => r.ruleId));
    for (const passRule of ['KRN-ROOM-001', 'KRN-AISLE-001', 'KRN-DW-001', 'KRN-APPL-001']) {
        if (!failedRuleIds.has(passRule)) {
            results.push(ruleResult({
                ruleId: passRule,
                rulePackVersion: rulePack_1.BOWER_LAYOUT_PACK_VERSION,
                stage: 'concept',
                severity: 'blocker',
                status: 'pass',
                messageKey: `engine.${passRule.toLowerCase()}.pass`,
            }));
        }
    }
    // 3. Regulated rules — pending until an approved profile matches.
    const selection = input.projectContext
        ? (0, regulatoryProfiles_1.selectRegulatoryProfile)(input.projectContext, input.approvedProfiles)
        : { status: 'pending', reason: 'Project jurisdiction and work scope are not recorded' };
    const regulatoryVersion = selection.status === 'matched'
        ? `${selection.profile.profileId}@${selection.profile.version}`
        : rulePack_1.REGULATORY_PROFILE_PENDING;
    const gasCooktop = input.brief.appliances.cooktop === 'gas';
    results.push(ruleResult({
        ruleId: 'KRN-RH-001',
        rulePackVersion: regulatoryVersion,
        stage: 'quote',
        severity: 'blocker',
        status: gasCooktop ? 'pending' : 'not-applicable',
        messageKey: gasCooktop
            ? (selection.status === 'matched' ? 'regulatory.rh.awaiting-appliance-data' : 'regulatory.profile-pending')
            : 'regulatory.rh.not-applicable',
    }));
    results.push(ruleResult({
        ruleId: 'KRN-COOK-002',
        rulePackVersion: regulatoryVersion,
        stage: 'quote',
        severity: 'blocker',
        status: 'pending',
        messageKey: selection.status === 'matched'
            ? 'regulatory.cook.awaiting-appliance-data'
            : 'regulatory.profile-pending',
    }));
    results.push(ruleResult({
        ruleId: 'KRN-ELEC-001',
        rulePackVersion: regulatoryVersion,
        stage: 'quote',
        severity: 'blocker',
        status: 'pending',
        messageKey: selection.status === 'matched'
            ? 'regulatory.elec.awaiting-device-facts'
            : 'regulatory.profile-pending',
    }));
    // Deterministic order: ruleId, then status, then messageKey.
    return results.sort((a, b) => a.ruleId.localeCompare(b.ruleId)
        || a.status.localeCompare(b.status)
        || a.messageKey.localeCompare(b.messageKey));
}
/** True when any concept-stage blocker failed — the display/select gate. */
function hasConceptBlocker(results) {
    return results.some(r => r.stage === 'concept' && r.severity === 'blocker' && r.status === 'fail');
}
/** Quote readiness: no failed or pending quote-stage blockers. */
function quoteBlockers(results) {
    return results.filter(r => r.stage === 'quote' && r.severity === 'blocker' && (r.status === 'fail' || r.status === 'pending'));
}
