/**
 * AI Kitchen Designer — deterministic layout engine.
 * The harness: the AI writes KitchenSpec; this engine compiles, validates,
 * and prices it. Pure TS — safe to bundle for the browser, node tests, and
 * the Supabase edge function.
 */

export * from './types';
export * from './schemas';
export * from './geometry';
export * from './catalogRoles';
export { solveRun } from './solveRun';
export { compileSpec, type CompiledDesign } from './compileSpec';
export { validate } from './validate';
export { defaultSpecFor, type LayoutShape } from './defaultSpec';
export { priceDesign } from './priceDesign';
export { toRoomSpec, briefFromWizard } from './wizardAdapter';
