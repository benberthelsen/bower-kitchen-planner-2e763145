// Room-scan contract smoke tests. Run via `npm run roomscan:test`
// (esbuild bundles src/lib/roomScan/contract.ts to .tmp-snap-test/roomscan.mjs first).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const C = await import(pathToFileURL(resolve('.tmp-snap-test/roomscan.mjs')).href);

let pass = 0;
let fail = 0;
const bad = [];
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    bad.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const loadFixtures = (file) =>
  JSON.parse(readFileSync(resolve(`src/lib/roomScan/__fixtures__/${file}`), 'utf8'));

const parseByKind = (kind, data) => {
  switch (kind) {
    case 'scan':
      return C.parseRoomScan(data);
    case 'draft':
      return C.parseRoomCaptureDraft(data);
    case 'handoff':
      return C.parseWebsitePlannerHandoff(data);
    case 'legacy':
      return C.parseLegacyWebsitePlannerHandoff(data);
    default:
      throw new Error(`unknown fixture kind ${kind}`);
  }
};

// ── Valid fixtures must parse ok ──────────────────────────────────────────
for (const f of loadFixtures('valid.json')) {
  const r = parseByKind(f.kind, f.data);
  check(`valid/${f.name}`, r.ok === true, r.ok ? '' : r.reason);
  if (r.ok && f.kind === 'legacy') {
    const e = f.expect ?? {};
    if (e.hasScan === false) check(`valid/${f.name} scan stripped/absent`, r.handoff.roomScan === undefined);
    if (e.hasDraft === false) check(`valid/${f.name} draft absent`, r.handoff.roomCaptureDraft === undefined);
    if (e.strippedScan) {
      check(
        `valid/${f.name} reports stripped-scan issue`,
        r.issues.some((i) => i.code === 'invalid_scan_stripped'),
        JSON.stringify(r.issues),
      );
    }
    check(`valid/${f.name} normalized to V1`, r.handoff.handoffSchemaVersion === 1);
  }
}

// ── Invalid fixtures must be rejected ─────────────────────────────────────
for (const f of loadFixtures('invalid.json')) {
  const r = parseByKind(f.kind, f.data);
  check(`invalid/${f.name} rejected`, r.ok === false, 'unexpectedly parsed ok');
}

// ── Programmatic cases ────────────────────────────────────────────────────

// Oversized adapterState (UTF-8 byte limit, not char count).
{
  const draft = {
    schemaVersion: 1,
    state: 'draft',
    source: 'webxr',
    photos: [],
    notes: 'big state',
    adapterState: { blob: 'x'.repeat(17 * 1024) },
    capturedAt: '2026-07-14T05:00:00.000Z',
  };
  check('prog/oversized-adapter-state rejected', C.parseRoomCaptureDraft(draft).ok === false);
}

// Draft with no useful content.
{
  const draft = {
    schemaVersion: 1,
    state: 'draft',
    source: 'manual',
    photos: [],
    capturedAt: '2026-07-14T05:00:00.000Z',
  };
  check('prog/useless-draft rejected', C.parseRoomCaptureDraft(draft).ok === false);
}

// Parsers never throw on garbage.
for (const junk of [null, 42, 'scan', [], { nested: { deep: true } }]) {
  try {
    C.parseRoomScan(junk);
    C.parseRoomCaptureDraft(junk);
    C.parseWebsitePlannerHandoff(junk);
    C.parseLegacyWebsitePlannerHandoff(junk);
    check(`prog/never-throws(${JSON.stringify(junk)})`, true);
  } catch (err) {
    check(`prog/never-throws(${JSON.stringify(junk)})`, false, String(err));
  }
}

// Coordinate-frame round trip: source → canonical → source within tolerance.
{
  const frame = {
    assignment: 'user-main-wall',
    sourcePlanAxes: 'x-z',
    sourceUnits: 'metres',
    // scale ×1000, 30° yaw, translation — a realistic WebXR alignment.
    sourceToCanonicalMatrix: [866.0254, -500, 1234.5, 500, 866.0254, -321.75, 0, 0, 1],
    snappedQuarterTurnDegrees: 0,
    originDescription: 'north-west-corner-in-canonical-plan',
  };
  const parsed = C.coordinateFrameV1Schema.safeParse(frame);
  check('prog/rotated-frame validates', parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues));
  const points = [
    { s1: 0, s2: 0 },
    { s1: 3.6, s2: 0 },
    { s1: 3.6, s2: 3.0 },
    { s1: -1.25, s2: 2.5 },
  ];
  let worst = 0;
  for (const p of points) {
    const there = C.applyFrameToPoint(frame, p);
    const back = C.invertFramePoint(frame, there);
    worst = Math.max(worst, Math.abs(back.s1 - p.s1), Math.abs(back.s2 - p.s2));
  }
  check('prog/matrix-round-trip within 1e-9', worst < 1e-9, `worst error ${worst}`);
}

// Discriminator sanity: accepted states match their schema.
{
  const valid = loadFixtures('valid.json');
  const unconf = valid.find((f) => f.name === 'webxr-unconfirmed-rectangle');
  const r = C.parseRoomScan(unconf.data);
  check('prog/unconfirmed-state preserved', r.ok && r.scan.state === 'unconfirmed' && r.scan.confirmedAt === undefined);
  const conf = valid.find((f) => f.name === 'manual-confirmed-rectangle');
  const r2 = C.parseRoomScan(conf.data);
  check('prog/confirmed-state preserved', r2.ok && r2.scan.state === 'confirmed' && r2.scan.confirmedRevision === r2.scan.roomRevision);
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`roomscan smoke: ${pass} passed, ${fail} failed`);
if (bad.length) {
  console.log('failures:');
  for (const b of bad) console.log(`  ✗ ${b}`);
  process.exit(1);
}
