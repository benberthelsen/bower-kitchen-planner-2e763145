import canonicalize from 'canonicalize';
import type { KitchenRuleResultV1 } from './contracts';

const encoder = new TextEncoder();

export async function sha256Canonical(payload: unknown): Promise<string> {
  const canonical = canonicalize(payload);
  if (typeof canonical !== 'string') throw new Error('Payload cannot be canonicalized');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalRuleResultProjection(results: KitchenRuleResultV1[]) {
  return [...results]
    .sort((a, b) => `${a.stage}:${a.ruleId}`.localeCompare(`${b.stage}:${b.ruleId}`))
    .map(result => ({
      ruleId: result.ruleId,
      rulePackVersion: result.rulePackVersion,
      stage: result.stage,
      severity: result.severity,
      status: result.status,
      entityIds: [...result.entityIds].sort(),
      measured: result.measured,
      required: result.required,
      repairOperationIds: result.repairOptions.map(option => option.operation.operationId).sort(),
      exceptionDecision: result.exception
        ? { accepted: true, policyCode: result.exception.policyCode }
        : { accepted: false },
    }));
}

export async function fingerprintRuleResults(results: KitchenRuleResultV1[]): Promise<string> {
  return sha256Canonical({ fingerprintVersion: 1, results: canonicalRuleResultProjection(results) });
}
