export type SyntheticTestContext = {
  testRunId: string;
  personaId: string;
};

const TEST_RUN_RE = /^[A-Z0-9][A-Z0-9_-]{5,63}$/;
const PERSONA_RE = /^SYN-P(?:00[1-9]|0[1-9][0-9]|100)$/;

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function hasValidSyntheticSecret(req: Request): boolean {
  const supplied = req.headers.get('x-bower-synthetic-secret') ?? '';
  const expected = Deno.env.get('SYNTHETIC_TEST_SECRET') ?? '';
  return supplied.length >= 32 && expected.length >= 32 && constantTimeEqual(supplied, expected);
}

export function validateSyntheticTestContext(value: unknown): SyntheticTestContext | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { testRunId, personaId } = value as Record<string, unknown>;
  if (
    typeof testRunId !== 'string'
    || !TEST_RUN_RE.test(testRunId)
    || typeof personaId !== 'string'
    || !PERSONA_RE.test(personaId)
  ) {
    return null;
  }
  return { testRunId, personaId };
}

export function parseSyntheticTestContext(
  req: Request,
  body: unknown,
): SyntheticTestContext | null {
  const candidate = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).syntheticTest
    : undefined;
  const suppliedHeader = req.headers.get('x-bower-synthetic-secret');

  if (candidate === undefined && !suppliedHeader) return null;
  if (!hasValidSyntheticSecret(req)) throw new Error('invalid_synthetic_test');
  const validated = validateSyntheticTestContext(candidate);
  if (!validated) throw new Error('invalid_synthetic_test');
  return validated;
}
