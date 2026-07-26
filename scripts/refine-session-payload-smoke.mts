/**
 * Proof for the refine regression.
 *
 * The homeowner Design step called `refine` and every attempt came back as
 * "Sorry — I couldn't apply that just now". The cause was NOT the model, the
 * key, or the database: `aiDesignerRequestSchema.session` is a **strict** zod
 * object, and the client spread the edge function's *response* session
 * (which carries an extra `briefRevision`) straight back into the request.
 * Zod rejected the whole request with `invalid_designer_request` (400) before
 * OpenAI was ever called.
 *
 * Run: npx esbuild ... (see refine-session-payload-smoke runner below)
 */
import { aiDesignerRequestSchema } from '../src/lib/layout/schemas';

const SESSION_ID = '1d6951ad-bc1b-4da5-b892-1223718e8c82';
const TOKEN = 'A'.repeat(43);

// A minimally-valid brief is all we need: we are testing the `session` gate,
// and zod reports every failing path, so we assert on the path, not on success.
const baseRequest = {
  mode: 'refine' as const,
  brief: {} as never,
  shape: 'l-shape' as const,
  currentSpec: {} as never,
  currentProposalId: '2f1b8f7a-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
  message: 'remove the fridge',
  history: [],
};

function sessionIssuePaths(session: unknown): string[] {
  const parsed = aiDesignerRequestSchema.safeParse({ ...baseRequest, session });
  if (parsed.success) return [];
  return parsed.error.issues
    .filter(i => i.path[0] === 'session')
    .map(i => `${i.path.join('.')}: ${i.code}${'keys' in i ? ` ${JSON.stringify((i as { keys: string[] }).keys)}` : ''}`);
}

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

// 1. What the OLD client sent: the response object spread back verbatim.
const oldClientPayload = {
  id: SESSION_ID,
  token: TOKEN,
  briefRevision: 1,
  designRevision: 1,
};

// 2. What the FIXED client sends: exactly the three authoritative keys.
const fixedClientPayload = {
  id: SESSION_ID,
  token: TOKEN,
  designRevision: 1,
};

check(
  'fixed client payload raises no session issue',
  sessionIssuePaths(fixedClientPayload).length === 0,
  JSON.stringify(sessionIssuePaths(fixedClientPayload)),
);

// After the server-side tolerance change, the OLD payload must also survive,
// so a browser holding a cached pre-fix bundle degrades to working.
check(
  'legacy payload with briefRevision is now tolerated',
  sessionIssuePaths(oldClientPayload).length === 0,
  JSON.stringify(sessionIssuePaths(oldClientPayload)),
);

// A genuinely unknown key must still be rejected — tolerance is for one
// known-benign field, not a hole in the strict contract.
check(
  'an unknown session key is still rejected',
  sessionIssuePaths({ ...fixedClientPayload, injected: 'nope' }).length > 0,
  'strictness was lost',
);

// A malformed token must still be rejected by the session sub-schema itself.
check(
  'a malformed session token is still rejected',
  sessionIssuePaths({ ...fixedClientPayload, token: 'short' }).length > 0,
  'token regex was lost',
);

// NOTE: the "refine mode requires a session" rule lives in the schema's
// `.superRefine`, which zod only runs once the base object parses. This smoke
// test deliberately uses a stub brief, so that rule is out of scope here — it
// is exercised by the edge function's own request path.

console.log(failures === 0 ? '\nREFINE SESSION PAYLOAD: all assertions pass' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
