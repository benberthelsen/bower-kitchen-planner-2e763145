/**
 * evaluateDesign — THE single rules pipeline for the whole platform.
 *
 * One system, two layers:
 *   1. geometric evaluator  — `validate()` (src/lib/layout/rules.ts registry)
 *      turns a compiled design into Violations (hard/safety/soft).
 *   2. policy layer         — `evaluateKitchenRules()` gives every finding a
 *      stable versioned rule id (KRN-*), a stage (concept/quote) and severity,
 *      adds regulated rules held at `pending` until an approved jurisdiction
 *      profile matches, and derives the concept/quote gates.
 *
 * Every caller that needs "is this design any good / quote-ready" should call
 * THIS, not validate() or evaluateKitchenRules() directly. That is what makes
 * the two layers one system rather than two disconnected ones.
 */

import { validate, RULE_INDEX } from '@/lib/layout';
import type { CompiledDesign, DesignBrief, RoomSpec, KitchenSpec, Violation } from '@/lib/layout';
import { evaluateKitchenRules, hasConceptBlocker, quoteBlockers, MAPPED_VIOLATION_CODES } from './evaluateKitchenRules';
import type { KitchenRuleResultV1, DesignBriefV2, RegulatoryProfileV1 } from './contracts';

export interface EvaluateDesignResult {
  /** raw geometric findings (back-compat for existing consumers) */
  violations: Violation[];
  /** versioned, stage-aware, stable-id results (the policy view) */
  ruleResults: KitchenRuleResultV1[];
  /** a concept-stage blocker failed — do not offer/select this design */
  conceptBlocker: boolean;
  /** quote-stage blockers still failed or pending — not quote-ready */
  quoteBlockers: KitchenRuleResultV1[];
}

export interface EvaluateDesignOptions {
  /** V2 project context (jurisdiction/scope). null keeps regulated rules pending. */
  projectContext?: DesignBriefV2['projectContext'] | null;
  /** approved regulatory profiles (empty until Bower signs one off). */
  approvedProfiles?: RegulatoryProfileV1[];
}

export function evaluateDesign(
  compiled: CompiledDesign,
  room: RoomSpec,
  brief: DesignBrief,
  spec: KitchenSpec,
  opts: EvaluateDesignOptions = {},
): EvaluateDesignResult {
  const violations = validate(compiled, room, brief);
  const ruleResults = evaluateKitchenRules({
    brief,
    spec,
    violations,
    projectContext: opts.projectContext ?? null,
    approvedProfiles: opts.approvedProfiles ?? [],
  });
  return {
    violations,
    ruleResults,
    conceptBlocker: hasConceptBlocker(ruleResults),
    quoteBlockers: quoteBlockers(ruleResults),
  };
}

/**
 * Drift guard: every rule in the live geometric registry (RULE_INDEX) must have
 * an explicit policy mapping. Returns the ids that don't — a test asserts this
 * is empty, so adding a rule in rules.ts without mapping it here fails CI
 * rather than silently bucketing into the generic room rule.
 */
export function unmappedRuleIds(): string[] {
  return RULE_INDEX.map(r => r.id).filter(id => !MAPPED_VIOLATION_CODES.has(id));
}
