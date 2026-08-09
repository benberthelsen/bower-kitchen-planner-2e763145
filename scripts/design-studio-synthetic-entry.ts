import {
  STYLE_DNA,
  briefFromWizard,
  candidateDifference,
  compileSpec,
  generateCandidatePool,
  kitchenSpecSchema,
  previewStyleFamilies,
  validate,
} from '@/lib/layout';
import {
  confirmedRoomScanV1Schema,
  parseWebsitePlannerHandoff,
  type WebsitePlannerHandoffV1,
} from '@/lib/roomScan/contract';

const PROFESSIONAL_CODES = new Set([
  'cooktop-landing', 'fridge-landing', 'triangle-size',
  'triangle-obstruction', 'prep-space',
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function handoffFor(index: number, lShape: boolean): WebsitePlannerHandoffV1 {
  const width = 4800 + (index % 3) * 100;
  const depth = 4200 + (index % 2) * 100;
  const capturedAt = new Date(Date.UTC(2026, 7, 1, 0, index % 60)).toISOString();
  return {
    handoffSchemaVersion: 1,
    source: 'website',
    roomType: 'kitchen',
    styleTags: ['designer-studio', index % 2 ? 'timber' : 'light'],
    materials: {},
    roomScan: {
      schemaVersion: 1,
      state: 'unconfirmed',
      source: 'webxr',
      roomRevision: 1,
      coordinateFrame: {
        assignment: 'source-orientation',
        sourcePlanAxes: 'x-z',
        sourceUnits: 'millimetres',
        sourceToCanonicalMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        snappedQuarterTurnDegrees: 0,
        originDescription: 'north-west-corner-in-canonical-plan',
      },
      room: {
        width,
        depth,
        height: 2700,
        shape: lShape ? 'LShape' : 'Rectangle',
        cutoutWidth: lShape ? 1100 : 0,
        cutoutDepth: lShape ? 1000 : 0,
        openings: [{ id: `window-${index}`, wall: 'N', type: 'window', offsetMm: 2500, widthMm: 900, heightMm: 1000, sillHeightMm: 1000 }],
        services: [{ id: `drain-${index}`, wall: 'W', type: 'drain', offsetMm: 1300 }],
      },
      confidence: { overall: .91, fields: { height: 'measured', openings: 'user-marked', services: 'user-marked' } },
      capturedAt,
    },
  };
}

function runJourney(index: number, aiAvailable: boolean): void {
  const lShape = index % 2 === 1;
  const parsed = parseWebsitePlannerHandoff(handoffFor(index, lShape));
  assert(parsed.ok && parsed.handoff.roomScan, `journey ${index}: website handoff did not parse`);
  const scan = parsed.handoff.roomScan;
  const room = scan.room;
  const brief = briefFromWizard(
    {
      layoutPreference: 'l-shape',
      roomWidth: room.width,
      roomDepth: room.depth,
      layoutStyle: index % 3 === 0 ? 'full-storage' : 'standard',
    },
    {
      height: room.height,
      shape: room.shape,
      cutoutWidth: room.cutoutWidth,
      cutoutDepth: room.cutoutDepth,
      openings: room.openings,
      services: room.services,
    },
  );
  brief.appliances = { dishwasher: true, oven: '600', cooktop: 'induction', fridgeWidthMm: 900 };
  brief.priorities = index % 3 === 0 ? ['storage', 'bench-space'] : ['bench-space'];
  brief.island = 'if-it-fits';

  const families = previewStyleFamilies();
  const family = families[index % families.length];
  const style = {
    ...STYLE_DNA[family.id].defaultStyle,
    familyId: family.id,
    familyVersion: family.version,
    variantId: family.variants[index % family.variants.length].id,
  };
  const pool = generateCandidatePool({
    brief,
    style,
    preferredStrategy: 'l-shape',
    professionalGate: true,
    maxCandidates: 3,
  });
  assert(pool.candidates.length > 0, `journey ${index}: no professional candidate (${pool.rejected[0]?.reasons.join('; ')})`);
  for (let a = 0; a < pool.candidates.length; a++) {
    for (let b = a + 1; b < pool.candidates.length; b++) {
      assert(candidateDifference(pool.candidates[a], pool.candidates[b]) >= 3,
        `journey ${index}: alternatives are near-duplicates`);
    }
  }

  // AI-enabled journeys simulate the ranker's choice among approved IDs;
  // unavailable journeys use the exact deterministic first candidate.
  const selected = aiAvailable
    ? [...pool.candidates].sort((a, b) => b.score.total - a.score.total || a.candidateId.localeCompare(b.candidateId))[0]
    : pool.candidates[0];
  kitchenSpecSchema.parse(selected.spec);
  const compiled = compileSpec(selected.spec, brief.room);
  const findings = validate(compiled, brief.room, brief);
  assert(!findings.some(finding => finding.severity === 'error' || PROFESSIONAL_CODES.has(finding.code)),
    `journey ${index}: selected candidate has a blocking/professional finding`);

  const confirmedAt = new Date(Date.parse(scan.capturedAt) + 60_000).toISOString();
  const confirmedScan = confirmedRoomScanV1Schema.parse({
    ...scan,
    state: 'confirmed',
    roomRevision: 2,
    confirmedRevision: 2,
    confirmedAt,
  });
  const quotePayload = {
    wizardVersion: 5,
    source: 'website-planner-design-studio-review',
    roomScan: confirmedScan,
    styleIdentity: { familyId: family.id, version: family.version, variantId: style.variantId },
    spec: selected.spec,
    items: compiled.items,
    priceBand: selected.priceBand,
    aiAvailable,
  };
  assert(JSON.stringify(quotePayload).length > 500, `journey ${index}: quote payload was not assembled`);
}

console.log('design studio synthetic journeys');
for (let index = 0; index < 100; index++) runJourney(index, true);
console.log('  ✓ 100 journeys with AI ranking available reached Review + quote payload');
for (let index = 100; index < 200; index++) runJourney(index, false);
console.log('  ✓ 100 journeys with AI unavailable reached Review + quote payload');
console.log('  ✓ rectangular and L-shaped website scans covered in both cohorts');
