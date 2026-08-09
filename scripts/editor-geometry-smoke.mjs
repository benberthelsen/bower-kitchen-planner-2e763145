import {
  cabinetWidthGuidance,
  fillCabinetRunGap,
  getCabinetRunSpacing,
  handleItemClick,
  lShapeCornerGeometry,
} from '../.tmp-snap-test/editor-geometry.mjs';

let passed = 0;
let failed = 0;
const check = (condition, message) => {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL: ${message}`); }
};

const room = { config: { width: 3000, depth: 2600 }, dimensions: { wallGap: 10 } };
const cabinet = (id, x, width = 600, rotation = 0, z = 297.5) => ({
  instanceId: id,
  cabinetNumber: id.toUpperCase(),
  productName: 'Base cabinet',
  category: 'Base',
  isPlaced: true,
  dimensions: { width, depth: 575 },
  position: { x, z, rotation, y: 0 },
});

const selected = cabinet('c2', 900);
const before = cabinet('c1', 300);
const afterWithGap = cabinet('c3', 1900);
const spacing = getCabinetRunSpacing(selected, [before, selected, afterWithGap], room);
check(spacing?.before.gapMm === 0, 'joined previous cabinet measures zero gap');
check(spacing?.after.gapMm === 400, 'next cabinet gap is measured edge-to-edge');
check(spacing?.after.neighbourLabel === 'C3', 'neighbor cabinet is identified');

const filled = fillCabinetRunGap(selected, spacing, 'after');
check(filled?.dimensions.width === 1000, 'fill increases cabinet width by measured gap');
check(filled?.position.x === 1100, 'fill shifts centre to keep opposite edge fixed');
check((filled.position.x - filled.dimensions.width / 2) === 600, 'fixed edge remains in place');

const leftWall = cabinet('l1', 297.5, 600, 270, 900);
const leftNext = cabinet('l2', 297.5, 600, 270, 1500);
const leftSpacing = getCabinetRunSpacing(leftWall, [leftWall, leftNext], room);
check(leftSpacing?.wall === 'left' && leftSpacing.axis === 'z', 'side-wall run uses the Z axis');
check(leftSpacing?.after.gapMm === 0, 'side-wall joined cabinet measures zero gap');

const standardGuidance = cabinetWidthGuidance({ productName: 'Drawer base cabinet', definitionId: 'BASE_DRAWER', dimensions: { width: 1000, depth: 575 } });
check(standardGuidance.aboveRecommended, 'standard 1000mm cabinet gets oversize warning');
const sinkGuidance = cabinetWidthGuidance({ productName: 'Sink cabinet', definitionId: 'BASE_SINK', dimensions: { width: 450, depth: 575 } });
check(sinkGuidance.minimumWidthMm === 600 && sinkGuidance.belowMinimum, 'sink cabinet enforces a 600mm minimum');
const cornerGuidance = cabinetWidthGuidance({ productName: 'Pie cut corner', definitionId: 'BASE_CORNER', dimensions: { width: 1000, depth: 900 } });
check(cornerGuidance.recommendedMaximumWidthMm === null, 'corner cabinet is exempt from straight-run 900mm warning');

const leftCorner = lShapeCornerGeometry(0.9, 0.9, 0.575, 0.575, 'Left');
const rightCorner = lShapeCornerGeometry(0.9, 0.9, 0.575, 0.575, 'Right');
check(Math.abs(leftCorner.sideDoorPlaneX - 0.125) < 0.0001,
  'left-return corner face lands on the adjoining 575mm cabinet plane');
check(Math.abs(rightCorner.sideDoorPlaneX + 0.125) < 0.0001,
  'right-return corner face mirrors onto the adjoining 575mm cabinet plane');
check(Math.abs(rightCorner.backDoorWidth - 0.325) < 0.0001
  && Math.abs(rightCorner.sideDoorWidth - 0.325) < 0.0001,
  '900mm pie-cut keeps two 325mm visible door leaves');

const group = (id, parent = null) => ({ userData: { itemId: id }, parent });
let selectedId = null;
handleItemClick({
  e: { stopPropagation() {}, intersections: [{ object: group('front') }, { object: group('corner') }] },
  itemId: 'front',
  isSelected: true,
  onSelect: (id) => { selectedId = id; },
});
check(selectedId === 'corner', 'second click cycles to the cabinet behind the front hit');

console.log(`editor geometry smoke: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
