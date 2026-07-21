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

import type { DesignBrief, KitchenSpec, Violation } from '@/lib/layout';
import type { DesignBriefV2, KitchenRuleResultV1, RegulatoryProfileV1 } from './contracts';
import { selectRegulatoryProfile } from './regulatoryProfiles';
import { BOWER_LAYOUT_PACK_VERSION, REGULATORY_PROFILE_PENDING } from './rulePack';

export interface EvaluateKitchenRulesInput {
  brief: DesignBrief;
  spec: KitchenSpec;
  /** output of the engine's validate() for this compiled design */
  violations: Violation[];
  /** V2 project context when known; null keeps regulated rules pending */
  projectContext: DesignBriefV2['projectContext'] | null;
  /** approved regulatory profiles (empty until Bower approves one) */
  approvedProfiles: RegulatoryProfileV1[];
}

/** violation code → stable rule mapping (doc §7.4 tables) */
const VIOLATION_RULES: Record<string, { ruleId: string; stage: 'concept' | 'quote'; severity: 'blocker' | 'warning' | 'advisory' }> = {
  'out-of-room': { ruleId: 'KRN-ROOM-001', stage: 'concept', severity: 'blocker' },
  'overlap': { ruleId: 'KRN-ROOM-001', stage: 'concept', severity: 'blocker' },
  'faces-wall': { ruleId: 'KRN-FACE-001', stage: 'concept', severity: 'blocker' },
  'narrow-aisle': { ruleId: 'KRN-AISLE-001', stage: 'concept', severity: 'blocker' },
  'narrow-galley': { ruleId: 'KRN-AISLE-001', stage: 'concept', severity: 'blocker' },
  'door-swing': { ruleId: 'KRN-OPEN-001', stage: 'concept', severity: 'warning' },
  'doorway-tight': { ruleId: 'KRN-OPEN-002', stage: 'concept', severity: 'warning' },
  'no-sink': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'blocker' },
  'no-dishwasher': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'warning' },
  'no-fridge': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'blocker' },
  'no-cooktop': { ruleId: 'KRN-APPL-001', stage: 'concept', severity: 'blocker' },
  'appliance-gap-fit': { ruleId: 'KRN-APPL-002', stage: 'quote', severity: 'warning' },
  'dishwasher-not-adjacent': { ruleId: 'KRN-DW-001', stage: 'concept', severity: 'blocker' },
  'corner-integrity': { ruleId: 'KRN-CORNER-001', stage: 'concept', severity: 'warning' },
  'island-exposed': { ruleId: 'KRN-JOIN-001', stage: 'concept', severity: 'warning' },
  'cooktop-landing': { ruleId: 'KRN-BENCH-001', stage: 'concept', severity: 'warning' },
  'prep-space': { ruleId: 'KRN-BENCH-001', stage: 'concept', severity: 'warning' },
  'replumb': { ruleId: 'KRN-SINK-003', stage: 'quote', severity: 'warning' },
  'gas-move': { ruleId: 'ERG-GAS-MOVE-001', stage: 'quote', severity: 'advisory' },
  'triangle-size': { ruleId: 'KRN-FLOW-001', stage: 'concept', severity: 'advisory' },
  'triangle-leg': { ruleId: 'KRN-FLOW-001', stage: 'concept', severity: 'advisory' },
};

/** Every engine rule code this policy layer maps. `evaluateDesign` asserts the
 *  live rule registry (RULE_INDEX) is a subset of these, so a new geometric
 *  rule can never silently fall through to the generic bucket. */
export const MAPPED_VIOLATION_CODES: ReadonlySet<string> = new Set(Object.keys(VIOLATION_RULES));

function ruleResult(partial: Omit<KitchenRuleResultV1, 'repairOptions' | 'entityIds'> & { entityIds?: string[] }): KitchenRuleResultV1 {
  return { entityIds: [], repairOptions: [], ...partial };
}

export function evaluateKitchenRules(input: EvaluateKitchenRulesInput): KitchenRuleResultV1[] {
  const results: KitchenRuleResultV1[] = [];

  // 1. Engine findings → layout-pack rule results.
  for (const violation of input.violations) {
    const mapping = VIOLATION_RULES[violation.code];
    if (!mapping) {
      // Unknown engine finding: never drop it silently — surface as a
      // concept warning under the generic room rule so it stays visible.
      results.push(ruleResult({
        ruleId: 'KRN-ROOM-001',
        rulePackVersion: BOWER_LAYOUT_PACK_VERSION,
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
      rulePackVersion: BOWER_LAYOUT_PACK_VERSION,
      stage: mapping.stage,
      severity: mapping.severity,
      status: 'fail',
      messageKey: `engine.${violation.code}`,
      entityIds: violation.itemIds ?? [],
    }));
  }

  // 2. Structural passes the engine proved by NOT reporting a violation.
  const failedRuleIds = new Set(results.map(r => r.ruleId));
  for (const passRule of ['KRN-ROOM-001', 'KRN-AISLE-001', 'KRN-DW-001', 'KRN-APPL-001'] as const) {
    if (!failedRuleIds.has(passRule)) {
      results.push(ruleResult({
        ruleId: passRule,
        rulePackVersion: BOWER_LAYOUT_PACK_VERSION,
        stage: 'concept',
        severity: 'blocker',
        status: 'pass',
        messageKey: `engine.${passRule.toLowerCase()}.pass`,
      }));
    }
  }

  // 3. Regulated rules — pending until an approved profile matches.
  const selection = input.projectContext
    ? selectRegulatoryProfile(input.projectContext, input.approvedProfiles)
    : { status: 'pending' as const, reason: 'Project jurisdiction and work scope are not recorded' };
  const regulatoryVersion = selection.status === 'matched'
    ? `${selection.profile.profileId}@${selection.profile.version}`
    : REGULATORY_PROFILE_PENDING;

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
  return results.sort((a, b) =>
    a.ruleId.localeCompare(b.ruleId)
    || a.status.localeCompare(b.status)
    || a.messageKey.localeCompare(b.messageKey));
}

/** True when any concept-stage blocker failed — the display/select gate. */
export function hasConceptBlocker(results: KitchenRuleResultV1[]): boolean {
  return results.some(r => r.stage === 'concept' && r.severity === 'blocker' && r.status === 'fail');
}

/** Quote readiness: no failed or pending quote-stage blockers. */
export function quoteBlockers(results: KitchenRuleResultV1[]): KitchenRuleResultV1[] {
  return results.filter(r =>
    r.stage === 'quote' && r.severity === 'blocker' && (r.status === 'fail' || r.status === 'pending'));
}
