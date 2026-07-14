/**
 * Request-scoped proposal registry used by the AI harness.
 * Only specifications registered after deterministic validation can be
 * selected for finalization.
 */

export interface ProposalSelection {
  name: string;
  proposalId: string;
}

export interface RegisteredProposal<TSpec> {
  proposalId: string;
  spec: TSpec;
}

export type ProposalSelectionResult<TSpec> =
  | { ok: true; options: Array<ProposalSelection & { spec: TSpec }> }
  | { ok: false; error: string };

export class RequestProposalRegistry<TSpec> {
  private readonly proposals = new Map<string, TSpec>();

  constructor(private readonly idFactory: () => string = () => crypto.randomUUID()) {}

  register(spec: TSpec): RegisteredProposal<TSpec> {
    const proposalId = `proposal-${this.idFactory()}`;
    this.proposals.set(proposalId, spec);
    return { proposalId, spec };
  }

  select(options: ProposalSelection[], expectedCount: number): ProposalSelectionResult<TSpec> {
    if (options.length !== expectedCount) {
      return {
        ok: false,
        error: `Expected ${expectedCount} finalized proposal${expectedCount === 1 ? '' : 's'}, received ${options.length}`,
      };
    }

    const ids = options.map(option => option.proposalId);
    if (new Set(ids).size !== ids.length) {
      return { ok: false, error: 'Finalized proposal IDs must be distinct' };
    }

    const resolved: Array<ProposalSelection & { spec: TSpec }> = [];
    for (const option of options) {
      const spec = this.proposals.get(option.proposalId);
      if (!spec) {
        return {
          ok: false,
          error: `Unknown or unvalidated proposal ID: ${option.proposalId}`,
        };
      }
      resolved.push({ ...option, spec });
    }

    return { ok: true, options: resolved };
  }
}
