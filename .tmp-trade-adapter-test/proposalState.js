"use strict";
/**
 * Request-scoped proposal registry used by the AI harness.
 * Only specifications registered after deterministic validation can be
 * selected for finalization.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestProposalRegistry = void 0;
class RequestProposalRegistry {
    idFactory;
    proposals = new Map();
    constructor(idFactory = () => crypto.randomUUID()) {
        this.idFactory = idFactory;
    }
    register(spec) {
        const proposalId = `proposal-${this.idFactory()}`;
        this.proposals.set(proposalId, spec);
        return { proposalId, spec };
    }
    select(options, expectedCount) {
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
        const resolved = [];
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
exports.RequestProposalRegistry = RequestProposalRegistry;
