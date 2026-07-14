// RFC 8785/JCS known-vector tests for the submission fingerprint (master
// plan §6.2). Uses the same `canonicalize` reference implementation and the
// same version the Deno edge function imports (npm:canonicalize@2.0.0), so
// vectors proven here hold server-side.
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

let pass = 0;
let fail = 0;
const bad = [];
const check = (name, actual, expected) => {
  if (actual === expected) pass += 1;
  else {
    fail += 1;
    bad.push(`${name}: expected ${expected} got ${actual}`);
  }
};

// ── RFC 8785 behaviour vectors ─────────────────────────────────────────────
check('key ordering', canonicalize({ b: 2, a: 1 }), '{"a":1,"b":2}');
check('nested + arrays preserved', canonicalize({ z: [3, 1, 2], a: { y: 1, x: 2 } }), '{"a":{"x":2,"y":1},"z":[3,1,2]}');
check('literals', canonicalize({ x: [true, false, null] }), '{"x":[true,false,null]}');
check('ES number 1e30', canonicalize({ n: 1e30 }), '{"n":1e+30}');
check('ES number 0.002', canonicalize({ n: 0.002 }), '{"n":0.002}');
check('ES number 1e-7', canonicalize({ n: 1e-7 }), '{"n":1e-7}');
check('unicode key order (UTF-16 code units)', canonicalize({ 'é': 1, e: 2 }), '{"e":2,"é":1}');
check('string escaping', canonicalize({ a: '' }), '{"a":"\\u000f"}');

// ── Fingerprint v1 parity: mirrors _shared/roomScan/fingerprint.ts ─────────
const fingerprintV1 = (payload) =>
  createHash('sha256').update(canonicalize({ fpVersion: 1, payload }), 'utf8').digest('hex');

const jobA = { name: 'Ben – Kitchen Enquiry', design_data: { roomWidth: 3600, openings: [{ id: 'o1' }] }, cost_incl_tax: 18000 };
const jobB = { cost_incl_tax: 18000, design_data: { openings: [{ id: 'o1' }], roomWidth: 3600 }, name: 'Ben – Kitchen Enquiry' };

check('fingerprint stable across key insertion order', fingerprintV1({ job: jobA, handoffId: null }), fingerprintV1({ job: jobB, handoffId: null }));
check(
  'fingerprint distinguishes handoff context',
  fingerprintV1({ job: jobA, handoffId: null }) === fingerprintV1({ job: jobA, handoffId: '8b0c8d10-0000-4000-8000-000000000001' }),
  false,
);
check(
  'fingerprint distinguishes payload change',
  fingerprintV1({ job: jobA, handoffId: null }) === fingerprintV1({ job: { ...jobA, cost_incl_tax: 18001 }, handoffId: null }),
  false,
);
check('fingerprint is 64-hex', /^[0-9a-f]{64}$/.test(fingerprintV1({ job: jobA, handoffId: null })), true);

console.log(`fingerprint smoke: ${pass} passed, ${fail} failed`);
if (bad.length) {
  for (const b of bad) console.log(`  ✗ ${b}`);
  process.exit(1);
}
