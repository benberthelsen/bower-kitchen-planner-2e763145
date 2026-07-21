"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const rules_1 = require("./rules");
function validate(design, room, brief) {
    return (0, rules_1.evaluateRules)(design, room, brief).map(f => ({
        code: f.ruleId,
        severity: f.tier === 'hard' ? 'error' : 'warn',
        message: f.message,
        ...(f.itemIds ? { itemIds: f.itemIds } : {}),
    }));
}
