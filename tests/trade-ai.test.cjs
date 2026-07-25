// Trade-side AI wiring — pure-logic regression test (code review §2).
//
// Self-contained: transpiles the real src TS (ts.transpileModule strips the
// type-only @/ imports) into a temp dir and exercises the actual helpers.
// Run from the repo root:  node backups/trade-ai.test.cjs
//
// Covers src/lib/trade/aiDesignForRoom.ts (+ proposalToTradeRoom, cabinetPlacedItem):
//   brief mapping, openings/services defaulting, shape defaulting, that only
//   Cabinet/Appliance items convert, that spec.style flows into the room
//   defaults, and that applyAiOptionToRoom returns a PATCH that preserves the
//   room's identity (no id/config/shape/dimensions).

const ts = require('typescript');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-ai-'));

const FILES = {
  'cabinetPlacedItem.js': path.join(SRC, 'lib/trade/cabinetPlacedItem.ts'),
  'proposalToTradeRoom.js': path.join(SRC, 'lib/trade/proposalToTradeRoom.ts'),
  'aiDesignForRoom.js': path.join(SRC, 'lib/trade/aiDesignForRoom.ts'),
};
for (const [outName, srcPath] of Object.entries(FILES)) {
  const js = ts.transpileModule(fs.readFileSync(srcPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: srcPath,
  }).outputText
    .replace(/require\("\.\/proposalToTradeRoom"\)/g, 'require("./proposalToTradeRoom.js")')
    .replace(/require\("\.\/cabinetPlacedItem"\)/g, 'require("./cabinetPlacedItem.js")');
  fs.writeFileSync(path.join(OUT, outName), js);
}

if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const {
  buildBriefForRoom, defaultTradeAiInputs, roomSpecFromTradeRoom,
  applyAiOptionToRoom, defaultShapeForRoom,
} = require(path.join(OUT, 'aiDesignForRoom.js'));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (c ? '' : '  ' + (x ?? ''))); if (!c) fail++; };

const now = new Date('2026-07-21T00:00:00Z');

const mkRoom = (shape) => ({
  id: 'room-1', name: 'Test Kitchen', description: 'coastal oak',
  shape: shape === 'LShape' ? 'l-shaped' : 'rectangular',
  config: {
    width: 4000, depth: 3000, height: 2400, shape,
    cutoutWidth: shape === 'LShape' ? 1500 : 0,
    cutoutDepth: shape === 'LShape' ? 1200 : 0,
    // openings/services deliberately omitted to test defaulting
  },
  dimensions: { toeKickHeight: 150, baseHeight: 720, baseDepth: 560, wallHeight: 720, wallDepth: 320, tallHeight: 2100, tallDepth: 560, doorGap: 3, drawerGap: 3, wallMountHeight: 1350, shelfSetback: 20, leftGap: 2, rightGap: 2, topMargin: 5, bottomMargin: 5 },
  materialDefaults: { exteriorFinish: 'white-matte', carcaseFinish: 'white-board', doorStyle: 'shaker', edgeBanding: 'abs-white' },
  hardwareDefaults: { handleType: 'bar-handle', handleColor: '#111', hingeType: 'blum', drawerType: 'blum-legra', softClose: true, supplyHardware: true, adjustableLegs: true },
  cabinets: [], createdAt: now, updatedAt: now,
});

const mkOption = () => ({
  proposalId: 'prop-123', name: "Chef's Galley", rationale: 'sink under window',
  priceBand: { lowAud: 12000, highAud: 15000 }, violations: [],
  spec: { runs: [], style: { finishId: 'oak-natural', benchtopId: 'stone-white', handleId: 'handle-bar-ss' }, rationale: 'x' },
  items: [
    { instanceId: 'i1', definitionId: 'base_sink_800', itemType: 'Cabinet', x: 100, y: 0, z: 50, rotation: 0, width: 800, height: 720, depth: 560 },
    { instanceId: 'i2', definitionId: 'wall_double_600', itemType: 'Cabinet', x: 900, y: 1350, z: 50, rotation: 0, width: 600, height: 720, depth: 320 },
    { instanceId: 'i3', definitionId: 'oven_opening_600', itemType: 'Appliance', x: 1500, y: 0, z: 50, rotation: 0, width: 600, height: 720, depth: 560 },
    { instanceId: 'i4', definitionId: 'decor_panel', itemType: 'Panel', x: 0, y: 0, z: 0, rotation: 0, width: 18, height: 720, depth: 560 },
  ],
});

const rectRoom = mkRoom('Rectangle');
const lRoom = mkRoom('LShape');

// shape defaulting
ok('rect room defaults to u-shape', defaultShapeForRoom(rectRoom) === 'u-shape');
ok('L room defaults to l-shape', defaultShapeForRoom(lRoom) === 'l-shape');
const di = defaultTradeAiInputs(rectRoom);
ok('default inputs seed shape from room', di.shape === 'u-shape');
ok('default priorities are storage+bench', JSON.stringify(di.priorities) === JSON.stringify(['storage', 'bench-space']));
ok('default styleWords from description', di.styleWords === 'coastal oak');

// roomSpec defaulting
const rs = roomSpecFromTradeRoom(rectRoom);
ok('openings defaulted to []', Array.isArray(rs.openings) && rs.openings.length === 0);
ok('services defaulted to []', Array.isArray(rs.services) && rs.services.length === 0);
ok('roomSpec carries dimensions', rs.width === 4000 && rs.depth === 3000);

// brief building
const inputs = { ...di, cooktop: 'gas', oven: '900', dishwasher: false, island: 'want', priorities: ['baking'], budgetBand: 'premium', styleWords: '   ' };
const brief = buildBriefForRoom(rectRoom, inputs);
ok('brief cooktop mapped', brief.appliances.cooktop === 'gas');
ok('brief oven mapped', brief.appliances.oven === '900');
ok('brief dishwasher=false mapped', brief.appliances.dishwasher === false);
ok('brief island mapped', brief.island === 'want');
ok('brief priorities mapped', JSON.stringify(brief.priorities) === JSON.stringify(['baking']));
ok('brief budgetBand mapped', brief.budgetBand === 'premium');
ok('blank styleWords falls back to description', brief.styleWords === 'coastal oak');
ok('no allowedWalls => undefined', brief.allowedWalls === undefined);
ok('household defaults to {}', JSON.stringify(brief.household) === '{}');

// apply option => merge patch
const patch = applyAiOptionToRoom(rectRoom, mkOption(), rs, { now });
ok('only Cabinet/Appliance convert (Panel excluded)', patch.cabinets.length === 3, patch.cabinets.length);
ok('finish flows from spec.style', patch.materialDefaults.exteriorFinish === 'oak-natural');
ok('handle flows from spec.style', patch.hardwareDefaults.handleType === 'handle-bar-ss');
ok('carcase falls back to room default', patch.materialDefaults.carcaseFinish === 'white-board');
ok('patch omits id (identity preserved on merge)', patch.id === undefined);
ok('patch omits config', patch.config === undefined);
ok('patch omits shape', patch.shape === undefined);
ok('patch omits dimensions', patch.dimensions === undefined);
ok('updatedAt is a Date', patch.updatedAt instanceof Date);
ok('oven opening categorised as Appliance', patch.cabinets.find(c => c.definitionId === 'oven_opening_600').category === 'Appliance');
ok('sequential cabinet numbers', JSON.stringify(patch.cabinets.map(c => c.cabinetNumber)) === JSON.stringify(['C01', 'C02', 'C03']));
ok('every cabinet placed with a position', patch.cabinets.every(c => c.isPlaced && c.position));

fs.rmSync(OUT, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILURES` : '\nTRADE-AI WIRING: 27/27 assertions pass');
process.exit(fail ? 1 : 0);
