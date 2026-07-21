/**
 * validate — legacy Violation adapter over the kitchen rules engine (rules.ts).
 *
 * All check logic now lives in the declarative rule registry. This function
 * keeps the original signature and output shape so every caller
 * (candidateGenerator, StepDesign, Wizard, the sweep) is unchanged:
 *   - a 'hard' rule finding  → Violation severity 'error' (blocks the candidate)
 *   - 'safety' / 'soft'      → 'warn' (informs; never blocks)
 * The Violation.code is the rule id, so existing code-based handling still works.
 */

import { evaluateRules } from './rules';
import type { CompiledDesign } from './compileSpec';
import type { DesignBrief, RoomSpec, Violation } from './types';

export function validate(design: CompiledDesign, room: RoomSpec, brief?: DesignBrief): Violation[] {
  return evaluateRules(design, room, brief).map(f => ({
    code: f.ruleId,
    severity: f.tier === 'hard' ? 'error' : 'warn',
    message: f.message,
    ...(f.itemIds ? { itemIds: f.itemIds } : {}),
  }));
}
