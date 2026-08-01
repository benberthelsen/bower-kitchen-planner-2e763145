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

interface SpecBearingAlternative {
  spec: KitchenSpec;
}

const EMPHASIS_NAMES: Record<CandidateEmphasis, string> = {
  workflow: 'Easy workflow',
  storage: 'More storage',
  social: 'Entertainer layout',
};

function optionName(candidateId: string, emphasis: CandidateEmphasis): string {
  if (candidateId.includes('workflow-mirrored')) return 'Alternative workflow';
  if (candidateId.includes('work-zones-swapped')) return 'Swapped work zones';
  return EMPHASIS_NAMES[emphasis];
}

/**
 * Compare the actual cabinet arrangement, not an AI-generated name or
 * rationale. This deliberately ignores finishes so two cosmetically different
 * copies of the same kitchen do not consume two comparison cards.
 */
export function plannerAlternativeSignature(option: SpecBearingAlternative): string {
  const runs = option.spec.runs.map(run => ({
    wall: run.wall,
    startMm: run.startMm ?? 0,
    endMm: run.endMm ?? null,
    fromEnd: !!run.fromEnd,
    wallCabinets: run.wallCabinets,
    segments: run.segments.map(segment => segment.kind === 'cabinet'
      ? ['cabinet', segment.role, segment.widthMm ?? null]
      : [segment.kind, segment.widthMm]),
  }));
  const island = option.spec.island
    ? {
        lengthMm: option.spec.island.lengthMm,
        depthMm: option.spec.island.depthMm,
        features: [...option.spec.island.features].sort(),
      }
    : null;
  return JSON.stringify({ runs, island });
}

/**
 * Keep server-ranked options first, remove structural duplicates, then fill
 * empty comparison slots with deterministic rule-checked alternatives. This
 * protects the homeowner experience when the upstream model returns the same
 * kitchen three times with slightly different wording.
 */
export function mergeDistinctPlannerAlternatives<T extends SpecBearingAlternative>(
  primary: readonly T[],
  fallback: readonly T[],
  maxCandidates = 3,
): T[] {
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const option of [...primary, ...fallback]) {
    const signature = plannerAlternativeSignature(option);
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(option);
    if (merged.length >= maxCandidates) break;
  }
  return merged;
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
