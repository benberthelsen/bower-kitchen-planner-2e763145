import type { PlacedItem } from '@/types';
import {
  generateCandidatePool,
  type CandidateEmphasis,
  type DesignBrief,
  type KitchenSpec,
  type LayoutShape,
  type StyleSpec,
  type Violation,
} from '@/lib/layout';

export interface PlannerAlternative {
  proposalId: string;
  name: string;
  spec: KitchenSpec;
  items: PlacedItem[];
  priceBand: { lowAud: number; highAud: number };
  violations: Violation[];
  rationale: string;
  source: 'planner';
}

const EMPHASIS_NAMES: Record<CandidateEmphasis, string> = {
  workflow: 'Easy workflow',
  storage: 'More storage',
  social: 'Entertainer layout',
};

function optionName(candidateId: string, emphasis: CandidateEmphasis): string {
  if (candidateId.includes('workflow-mirrored')) return 'Alternative workflow';
  return EMPHASIS_NAMES[emphasis];
}

/**
 * Build safe alternatives without the online AI explanation/ranking service.
 *
 * The same deterministic compiler and hard-rule validation used by the server
 * powers this fallback. It therefore keeps the customer's selected walls and
 * partial wall ranges authoritative instead of silently widening the layout.
 */
export function createPlannerAlternatives(input: {
  brief: DesignBrief;
  shape: LayoutShape;
  style: StyleSpec;
  maxCandidates?: number;
}): PlannerAlternative[] {
  const pool = generateCandidatePool({
    brief: input.brief,
    allowedStrategies: [input.shape],
    style: input.style,
    maxCandidates: input.maxCandidates ?? 3,
  });

  return pool.candidates.map(candidate => ({
    proposalId: `planner:${candidate.candidateId}`,
    name: optionName(candidate.candidateId, candidate.emphasis),
    spec: candidate.spec,
    items: candidate.items,
    priceBand: candidate.priceBand,
    violations: candidate.violations,
    rationale: candidate.spec.rationale,
    source: 'planner',
  }));
}
