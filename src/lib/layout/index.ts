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
export {
  polygonFromRoom,
  segmentToWorld,
  pointInPolygon,
  rectInsidePolygon,
  rotationFromNormal,
  interiorAngles,
  type Vec2,
  type WallSegment,
  type RoomPolygon,
  type CutoutCorner,
} from './polygon';
export {
  evaluateRules,
  ruleWhy,
  RULES,
  RULE_INDEX,
  RESERVED_RULE_IDS,
  type Rule,
  type RuleTier,
  type RuleScope,
  type RuleFinding,
  type RuleContext,
} from './rules';
export { defaultSpecFor, type LayoutShape } from './defaultSpec';
export { priceDesign } from './priceDesign';
export { toRoomSpec, briefFromWizard } from './wizardAdapter';
export { scoreDesign, type DesignScore, type DesignScoreParts } from './designScore';
export {
  generateCandidatePool,
  candidateSummaryFor,
  type CandidateEmphasis,
  type CandidatePool,
  type DesignCandidate,
  type GenerateCandidatesInput,
  type RejectedCandidate,
} from './candidateGenerator';
export {
  RequestProposalRegistry,
  type ProposalSelection,
  type ProposalSelectionResult,
  type RegisteredProposal,
} from './proposalState';
