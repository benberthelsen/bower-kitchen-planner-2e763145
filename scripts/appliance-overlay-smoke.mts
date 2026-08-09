/**
 * Proof for the "my sink and cooktop never showed up" bug.
 *
 * The engine emits the sink and cooktop cabinets as `itemType: 'Cabinet'`, and
 * only `itemType === 'Appliance'` routes to the appliance renderers. So a
 * customer who chose products on the Appliances step saw none of them in the
 * 3D preview. `synthesiseApplianceOverlays` lays real appliance items on top.
 *
 * This asserts the things that are easy to get wrong and invisible when you do:
 * the Y convention, the id prefixes that keep the overlays out of the rules
 * engine and pricing, and the tap finish riding on the sink.
 *
 * Run: npm run test:appliance-overlays
 */
import { briefFromWizard } from '../src/lib/layout/wizardAdapter';
import { defaultSpecFor } from '../src/lib/layout/defaultSpec';
import { compileSpec } from '../src/lib/layout/compileSpec';
import {
  enrichItemsWithChosenAppliances,
  synthesiseApplianceOverlays,
  filterCatalogToCooking,
  filterApplianceProducts,
  recommendApplianceProducts,
  excludedCategories,
  APPLIANCE_CATEGORY_ORDER,
} from '../src/pages/homeowner/applianceSelection';
import type { ApplianceCategory } from '../src/pages/homeowner/applianceSelection';
import { DEFAULT_GLOBAL_DIMENSIONS } from '../src/constants';
import {
  isConcealedRangehoodAppliance,
  isIntegratedDishwasherAppliance,
} from '../src/components/3d/applianceClassification';
import { rectangularCutoutSegments } from '../src/components/3d/cabinet-parts/benchtopCutout';
import {
  benchtopTextureRunOffsetM,
  rectangularBenchtopGeometry,
} from '../src/components/3d/cabinet-parts/benchtopGeometry';
import { sinkOpeningDimensions } from '../src/components/3d/appliances/sinkDimensions';
import {
  cabinetBodyMaterialForRole,
  cabinetCategoryForLayoutRole,
  cabinetCornerTypeForLayoutRole,
  carcassMaterialForCategory,
  finishedEndPanelGeometry,
  kickboardFrontOffsetM,
  resolvedBenchtopThicknessM,
  shouldRenderKickboard,
} from '../src/components/3d/cabinetConstruction';
import { diagonalCornerGeometry } from '../src/components/3d/cabinet-parts/cornerGeometry';
import { underBenchTopLocalY } from '../src/components/3d/appliances/underBenchTop';
import { getConstructionRecipe } from '../src/lib/microvellum/constructionRecipes';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

const product = (over: Record<string, unknown>) => ({
  id: over.id as string,
  item_code: null,
  name: over.name as string,
  brand: null,
  category: over.category as string,
  subcategory: null,
  description: null,
  rrp: 449,
  sell_price: null,
  installed_price: null,
  width_mm: null,
  height_mm: null,
  depth_mm: null,
  cutout_width_mm: null,
  cutout_height_mm: null,
  cutout_depth_mm: null,
  finish: null,
  power_requirements: null,
  features: [],
  image_url: null,
  model_url: null,
  model_ios_url: null,
  is_active: true,
  price_is_placeholder: true,
  sort_order: 0,
  ...over,
}) as never;

const PRODUCTS = [
  product({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Single Bowl Undermount Sink',
    category: 'sink',
    width_mm: 440,
    height_mm: 200,
    depth_mm: 440,
    cutout_width_mm: 410,
    cutout_depth_mm: 380,
    finish: 'Stainless Steel',
  }),
  product({ id: '22222222-2222-4222-8222-222222222222', name: '60cm Induction Cooktop', category: 'cooktop', width_mm: 590, height_mm: 60, depth_mm: 520, finish: 'Black Glass' }),
  product({ id: '33333333-3333-4333-8333-333333333333', name: 'Kitchen Mixer Tap', category: 'tap', finish: 'Matte Black' }),
  product({ id: '44444444-4444-4444-8444-444444444444', name: '60cm Built-in Oven', category: 'oven', width_mm: 595, height_mm: 595, depth_mm: 570, finish: 'Stainless Steel' }),
];

const RANGEHOODS = [
  product({
    id: '55555555-5555-4555-8555-555555555555',
    name: '60cm Undermount rangehood',
    category: 'rangehood',
    width_mm: 600,
    height_mm: 248,
    depth_mm: 284,
  }),
  product({
    id: '66666666-6666-4666-8666-666666666666',
    name: '60cm Canopy rangehood',
    category: 'rangehood',
    width_mm: 600,
    depth_mm: 500,
  }),
];

const brief = briefFromWizard({ layoutPreference: 'single-wall', roomWidth: 3600, roomDepth: 3000, layoutStyle: 'standard' } as never);
const compiled = compileSpec(defaultSpecFor(brief, 'single-wall'), brief.room);

const chosen = {
  sink: '11111111-1111-4111-8111-111111111111',
  cooktop: '22222222-2222-4222-8222-222222222222',
  tap: '33333333-3333-4333-8333-333333333333',
};

const overlays = synthesiseApplianceOverlays(compiled, chosen, PRODUCTS);
const sink = overlays.find(o => o.instanceId === 'appl-sink');
const cooktop = overlays.find(o => o.instanceId === 'appl-cooktop');

check('the engine placed a sink and a cooktop to hang products on',
  !!compiled.rolePositions.sink && !!compiled.rolePositions.cooktop,
  JSON.stringify(Object.keys(compiled.rolePositions)));

check('a sink overlay is produced', !!sink, `got ${overlays.map(o => o.instanceId).join(', ')}`);
check('a cooktop overlay is produced', !!cooktop, `got ${overlays.map(o => o.instanceId).join(', ')}`);

if (sink && cooktop) {
  // There is no benchtop-height constant — it is always derived.
  const hostSink = compiled.rolePositions.sink!.item;
  const benchtopTop = hostSink.y + hostSink.height + DEFAULT_GLOBAL_DIMENSIONS.benchtopThickness;

  check('itemType is Appliance, or it renders as a cabinet and the whole thing is pointless',
    sink.itemType === 'Appliance' && cooktop.itemType === 'Appliance',
    `${sink.itemType} / ${cooktop.itemType}`);

  check('definitionId is the appliance catalog key',
    sink.definitionId === `appliance:${chosen.sink}`,
    sink.definitionId);

  // y is the CENTRE for benchtop-inset appliances (applianceClassification.ts).
  check('the sink hangs below the benchtop with its rim flush',
    Math.abs((sink.y + sink.height / 2) - benchtopTop) < 1,
    `sink top ${sink.y + sink.height / 2} vs benchtop ${benchtopTop}`);

  // A cooktop drops into a cut-out: glass a few mm proud, body below the stone.
  // The previous assertion here demanded the opposite — that the cooktop's BASE
  // be at or above the benchtop — and passed, which is how a 60 mm appliance came
  // to sit on the bench like a paver until Ben spotted it in the render. A test
  // can only protect the behaviour it describes, and this one described the bug.
  check('the cooktop glass sits just proud of the stone, not on top of it',
    cooktop.y + cooktop.height / 2 > benchtopTop &&
    cooktop.y + cooktop.height / 2 <= benchtopTop + 6,
    `cooktop top ${cooktop.y + cooktop.height / 2} vs benchtop ${benchtopTop}`);

  check('the cooktop body drops into the cabinet below the stone',
    cooktop.y - cooktop.height / 2 < benchtopTop,
    `cooktop base ${cooktop.y - cooktop.height / 2} vs benchtop ${benchtopTop}`);

  check('the sink is centred on its host cabinet',
    sink.x === hostSink.x && sink.z === hostSink.z && sink.rotation === hostSink.rotation,
    `${sink.x},${sink.z}@${sink.rotation} vs ${hostSink.x},${hostSink.z}@${hostSink.rotation}`);

  check('the sink identifies the cabinet whose benchtop must be cut',
    sink.applianceHostInstanceId === hostSink.instanceId,
    `${sink.applianceHostInstanceId} vs ${hostSink.instanceId}`);

  // The tap has no item of its own — it rides on the sink.
  check('the chosen matte black tap reaches the sink item',
    sink.tapId === 'tap-goose-bk', String(sink.tapId));

  check('the product snapshot travels with the item, for AR and the quote',
    sink.applianceProductId === chosen.sink && !!sink.applianceSnapshot,
    JSON.stringify(sink.applianceSnapshot));

  check('manufacturer cut-out dimensions travel with the sink',
    sink.applianceSnapshot?.cutoutWidthMm === 410
      && sink.applianceSnapshot?.cutoutDepthMm === 380,
    JSON.stringify(sink.applianceSnapshot));

  const opening = sinkOpeningDimensions(sink);
  check('the rendered bowl and benchtop use the same supplier-sized opening',
    opening.widthM === 0.41 && opening.depthM === 0.38,
    JSON.stringify(opening));
}

const cutoutCenter = { x: -0.025, z: -0.015 };
const cutoutSegments = rectangularCutoutSegments(
  0.65,
  0.59,
  0.41,
  0.38,
  cutoutCenter.x,
  cutoutCenter.z,
);
const slabArea = cutoutSegments.reduce(
  (area, segment) => area + segment.width * segment.depth,
  0,
);
const centerCovered = cutoutSegments.some(segment =>
  Math.abs(cutoutCenter.x - segment.x) < segment.width / 2
  && Math.abs(cutoutCenter.z - segment.z) < segment.depth / 2);

check('the benchtop is split into four solid pieces around the sink',
  cutoutSegments.length === 4,
  JSON.stringify(cutoutSegments));
check('the split slab has the expected opening area',
  Math.abs(slabArea - (0.65 * 0.59 - 0.41 * 0.38)) < 0.000001,
  String(slabArea));
check('no benchtop segment covers the centre of the sink',
  !centerCovered,
  JSON.stringify(cutoutSegments));

const dishwasherHeightM = 0.82;
const cabinetBenchHeightM = 0.73;
const centredDishwasherTopY = underBenchTopLocalY(
  dishwasherHeightM,
  cabinetBenchHeightM,
  'centred',
);
const baseOriginDishwasherTopY = underBenchTopLocalY(
  dishwasherHeightM,
  cabinetBenchHeightM,
  'base-origin',
);
check('dishwasher benchtop stays level with the cabinet run, not the appliance model',
  Math.abs(dishwasherHeightM / 2 + centredDishwasherTopY - cabinetBenchHeightM) < 0.000001
    && Math.abs(baseOriginDishwasherTopY - cabinetBenchHeightM) < 0.000001,
  JSON.stringify({ centredDishwasherTopY, baseOriginDishwasherTopY }));

const baseRecipe = getConstructionRecipe('Base 2 Door');
const dishwasherRecipe = getConstructionRecipe('Base Dishwasher');
const baseTopThicknessM = resolvedBenchtopThicknessM(
  DEFAULT_GLOBAL_DIMENSIONS,
  baseRecipe?.benchtop.thickness,
);
const dishwasherTopThicknessM = resolvedBenchtopThicknessM(
  DEFAULT_GLOBAL_DIMENSIONS,
  dishwasherRecipe?.benchtop.thickness,
);
check('dishwasher and adjoining base cabinets use the same benchtop thickness',
  Math.abs(baseTopThicknessM - dishwasherTopThicknessM) < 0.000001,
  JSON.stringify({ baseTopThicknessM, dishwasherTopThicknessM }));

const islandTop = rectangularBenchtopGeometry(0.6, 0.65, {
  front: 0.025,
  back: 0.025,
  left: 0.025,
  right: 0.025,
});
check('a storage island benchtop overhangs all four exposed edges',
  Math.abs(islandTop.totalWidth - 0.65) < 0.000001
    && Math.abs(islandTop.totalDepth - 0.7) < 0.000001
    && islandTop.xOffset === 0
    && islandTop.zOffset === 0,
  JSON.stringify(islandTop));

const seatingTop = rectangularBenchtopGeometry(0.6, 0.65, {
  front: 0.025,
  back: 0.3,
});
check('a seating island extends the stool edge without moving the cabinet fronts',
  Math.abs(seatingTop.totalDepth - 0.975) < 0.000001
    && Math.abs(seatingTop.zOffset + 0.1375) < 0.000001,
  JSON.stringify(seatingTop));

check('a floor-standing base cabinet keeps its kick despite noisy recipe metadata',
  shouldRenderKickboard({
    category: 'Base',
    productType: 'cabinet',
    productName: 'Base 1 Door',
    itemY: 0,
    recipeEnabled: false,
  }));
check('a genuinely suspended base cabinet does not gain a kick',
  !shouldRenderKickboard({
    category: 'Base',
    productType: 'cabinet',
    productName: '1 Drawer Suspended Cabinet',
    itemY: 0,
    recipeEnabled: false,
  }));
check('wall cabinets and applied panels never gain a kick',
  !shouldRenderKickboard({
    category: 'Wall',
    productType: 'cabinet',
    productName: 'Upper 2 Door',
    itemY: 1350,
    recipeEnabled: true,
  })
  && !shouldRenderKickboard({
    category: 'Base',
    productType: 'panel',
    productName: 'Base Applied Panel',
    itemY: 0,
    recipeEnabled: true,
  }));

const upperEndPanel = finishedEndPanelGeometry(0.35, 0.018, 0.002);
check('upper end panels retain the carcass back and finish flush with the door face',
  Math.abs(upperEndPanel.depthM - 0.37) < 0.000001
    && Math.abs(upperEndPanel.centerOffsetZM - 0.01) < 0.000001
    && Math.abs(
      upperEndPanel.centerOffsetZM - upperEndPanel.depthM / 2 + 0.35 / 2,
    ) < 0.000001
    && Math.abs(
      upperEndPanel.centerOffsetZM + upperEndPanel.depthM / 2 - (0.35 / 2 + 0.018 + 0.002),
    ) < 0.000001,
  JSON.stringify(upperEndPanel));

check('blind-corner kick is placed at the cabinet front instead of hidden through its centre',
  Math.abs(kickboardFrontOffsetM(0.625, true, 'blind') - 0.2725) < 0.000001);
check('pie-cut corner keeps its two joined kick faces centred on the corner origin',
  kickboardFrontOffsetM(0.9, true, 'l-shape') === 0);

check('generated floor and upper corners keep their correct construction categories',
  cabinetCategoryForLayoutRole('Wall', 'corner') === 'Base'
  && cabinetCategoryForLayoutRole('Base', 'wall-corner') === 'Wall');

check('generated upper corner defaults to bi-fold while diagonal remains an explicit choice',
  cabinetCornerTypeForLayoutRole(null, 'wall_corner_pie_cut_2_door', 'wall-corner') === 'l-shape'
  && cabinetCornerTypeForLayoutRole('l-shape', 'wall_corner_diagonal', 'wall-corner') === 'diagonal');

const upperCorner = diagonalCornerGeometry(0.6, 0.6, 0.35, 0.35);
check('optional 600mm angled upper corner uses shallow wall arms and a true diagonal face',
  Math.abs(upperCorner.leftArmWidth - 0.35) < 0.000001
  && Math.abs(upperCorner.backArmDepth - 0.35) < 0.000001
  && Math.abs(upperCorner.frontWidth - Math.hypot(0.25, 0.25)) < 0.000001
  && upperCorner.frontYaw === Math.PI / 4,
  JSON.stringify(upperCorner));

const timberCarcass = { finish: 'timber' };
const whiteMelamineCarcass = { finish: 'white-melamine' };
check('overhead carcass stays white while other cabinet categories keep their configured material',
  carcassMaterialForCategory('Wall', timberCarcass, whiteMelamineCarcass) === whiteMelamineCarcass
  && carcassMaterialForCategory('Base', timberCarcass, whiteMelamineCarcass) === timberCarcass
  && carcassMaterialForCategory('Tall', timberCarcass, whiteMelamineCarcass) === timberCarcass);

check('an open upper unit carries the selected door finish while a closed upper remains white inside',
  cabinetBodyMaterialForRole(
    'Wall', 'open-shelf', timberCarcass, timberCarcass, whiteMelamineCarcass,
  ) === timberCarcass
  && cabinetBodyMaterialForRole(
    'Wall', 'wall-cabinet', timberCarcass, timberCarcass, whiteMelamineCarcass,
  ) === whiteMelamineCarcass);

const northFirstTop = { x: 300, z: 287.5, width: 600, rotation: 0 };
const northSecondTop = { x: 900, z: 287.5, width: 600, rotation: 0 };
const southFirstTop = { x: 3300, z: 3712.5, width: 600, rotation: 180 };
const southSecondTop = { x: 2700, z: 3712.5, width: 600, rotation: 180 };
check('adjacent benchtops advance one continuous texture phase on north and south runs',
  Math.abs(
    benchtopTextureRunOffsetM(northSecondTop)
      - benchtopTextureRunOffsetM(northFirstTop)
      - 0.6,
  ) < 0.000001
  && Math.abs(
    benchtopTextureRunOffsetM(southSecondTop)
      - benchtopTextureRunOffsetM(southFirstTop)
      - 0.6,
  ) < 0.000001);

// These two are the load-bearing invariants. rules.ts detects islands via an
// `ai-` prefix, and both pricing paths read compiled.items — an overlay that
// leaked into either would silently corrupt a layout or a quote.
check('overlays never use the ai- instanceId prefix the rules engine watches',
  overlays.every(o => o.instanceId.startsWith('appl-') && !o.instanceId.startsWith('ai-')),
  overlays.map(o => o.instanceId).join(', '));

check('overlays are not in compiled.items, so neither pricing path sees them',
  compiled.items.every(i => !i.instanceId.startsWith('appl-')),
  'an overlay reached compiled.items');

check('overlays sit off the floor, so the rules engine (y === 0 only) ignores them',
  overlays.every(o => o.y > 0), overlays.map(o => `${o.instanceId}@${o.y}`).join(', '));

check('integrated dishwasher openings use a joinery front',
  isIntegratedDishwasherAppliance({
    definitionId: 'dishwasher_opening',
    applianceSnapshot: { name: 'Fully Integrated Dishwasher', finish: 'Panel ready' },
  } as never, null),
  'integrated dishwasher was classified as freestanding');
check('freestanding dishwashers retain their appliance front',
  !isIntegratedDishwasherAppliance({
    // The compiled placeholder id remains even after the product snapshot is
    // enriched, so the selected product must take priority over this id.
    definitionId: 'dishwasher_opening',
    applianceSnapshot: { name: 'Freestanding Dishwasher', finish: 'Stainless Steel' },
  } as never, null),
  'freestanding dishwasher was classified as integrated');

{
  const concealedItems = enrichItemsWithChosenAppliances(
    compiled.items,
    { rangehood: '55555555-5555-4555-8555-555555555555' },
    RANGEHOODS,
  );
  const concealed = concealedItems.find(item => item.layoutRole === 'rangehood');
  check('a selected built-in rangehood becomes a matching upper cabinet',
    concealed?.itemType === 'Cabinet' && concealed.shelfCount === 0,
    `${concealed?.itemType ?? 'missing'} / shelves ${concealed?.shelfCount ?? 'unset'}`);
  check('the built-in rangehood still carries its chosen product and quote identity',
    concealed?.applianceProductId === '55555555-5555-4555-8555-555555555555'
      && !!concealed.applianceSnapshot,
    JSON.stringify(concealed?.applianceSnapshot));
  check('the renderer recognises the chosen undermount product as concealed',
    !!concealed && isConcealedRangehoodAppliance(concealed, null),
    concealed?.applianceSnapshot?.name ?? 'missing');

  const canopyItems = enrichItemsWithChosenAppliances(
    compiled.items,
    { rangehood: '66666666-6666-4666-8666-666666666666' },
    RANGEHOODS,
  );
  const canopy = canopyItems.find(item => item.layoutRole === 'rangehood');
  check('a selected canopy rangehood remains an exposed appliance',
    canopy?.itemType === 'Appliance' && !isConcealedRangehoodAppliance(canopy, null),
    `${canopy?.itemType ?? 'missing'} / ${canopy?.applianceSnapshot?.name ?? 'no snapshot'}`);
}

// An oven without a tower falls back beneath the cooktop. Its appliance face
// must replace that cabinet's doors; otherwise the intact doors cover the oven
// and only its proud handle survives as a floating horizontal bar.
{
  const underbenchRoles = { ...compiled.rolePositions };
  delete (underbenchRoles as Record<string, unknown>)['oven-tower'];
  const underbench = synthesiseApplianceOverlays(
    { rolePositions: underbenchRoles },
    { oven: '44444444-4444-4444-8444-444444444444' },
    PRODUCTS,
  ).find(o => o.instanceId === 'appl-oven');
  const cooktopHost = compiled.rolePositions.cooktop?.item;
  check('an under-bench oven identifies the cabinet front it replaces',
    !!underbench && !!cooktopHost && underbench.applianceHostInstanceId === cooktopHost.instanceId,
    `${underbench?.applianceHostInstanceId ?? 'none'} vs ${cooktopHost?.instanceId ?? 'no host'}`);

  const tower = synthesiseApplianceOverlays(
    {
      rolePositions: {
        ...underbenchRoles,
        'oven-tower': compiled.rolePositions.cooktop!,
      },
    },
    { oven: '44444444-4444-4444-8444-444444444444' },
    PRODUCTS,
  ).find(o => o.instanceId === 'appl-oven');
  check('a tower oven does not suppress the whole tower cabinet front',
    !!tower && !tower.applianceHostInstanceId,
    tower?.applianceHostInstanceId ?? 'none');

  const wideOven = product({
    id: '77777777-7777-4777-8777-777777777777',
    name: '900mm Built-in Oven',
    category: 'oven',
    width_mm: 895,
    height_mm: 595,
    depth_mm: 570,
  });
  const mismatched = synthesiseApplianceOverlays(
    { rolePositions: underbenchRoles },
    { oven: '77777777-7777-4777-8777-777777777777' },
    [wideOven],
  );
  check('a 900mm oven is never drawn through a 600mm cabinet',
    !mismatched.some(item => item.instanceId === 'appl-oven'),
    JSON.stringify(mismatched));

  const cooktopPosition = compiled.rolePositions.cooktop!;
  const wideHostRoles = {
    ...underbenchRoles,
    cooktop: {
      ...cooktopPosition,
      widthMm: 900,
      item: { ...cooktopPosition.item, width: 900 },
    },
  };
  const correctlyHoused = synthesiseApplianceOverlays(
    { rolePositions: wideHostRoles },
    { oven: '77777777-7777-4777-8777-777777777777' },
    [wideOven],
  ).find(item => item.instanceId === 'appl-oven');
  check('a 900mm oven renders when its under-bench housing is 900mm',
    correctlyHoused?.width === 895 && correctlyHoused.applianceHostInstanceId === cooktopPosition.item.instanceId,
    JSON.stringify(correctlyHoused));
}

// An unfinished appliance selection must still communicate the proposed work
// zones without silently adding products or prices to the order.
const unchosenMarkers = synthesiseApplianceOverlays(compiled, {}, PRODUCTS);
check('an unfinished appliance selection still marks sink, cooktop and oven positions',
  ['appl-sink', 'appl-cooktop', 'appl-oven'].every(id => unchosenMarkers.some(item => item.instanceId === id)),
  `got ${unchosenMarkers.map(item => item.instanceId).join(', ')}`);
check('position markers are never priced or supplied as selected products',
  unchosenMarkers.every(item => !item.applianceProductId
    && item.supplyWithOrder === false
    && item.applianceSnapshot?.unitPrice === 0),
  JSON.stringify(unchosenMarkers));

const unloadedCatalogMarkers = synthesiseApplianceOverlays(compiled, chosen, []);
check('position markers remain visible while the appliance catalog is unavailable',
  ['appl-sink', 'appl-cooktop', 'appl-oven'].every(id => unloadedCatalogMarkers.some(item => item.instanceId === id)),
  `got ${unloadedCatalogMarkers.map(item => item.instanceId).join(', ')}`);

/* ── Cooking-step filter ───────────────────────────────────────────────────
 *
 * The customer answers gas-or-induction and 600-or-900 on the Cooking step,
 * then the Appliances step showed them the whole catalogue anyway. These cover
 * the two ways that filter can be wrong: too loose (a gas cooktop still on
 * screen for someone who picked induction) and too strict (a category emptied
 * so the customer cannot choose anything at all).
 */
const COOKING_CATALOG: Record<ApplianceCategory, unknown[]> = {
  sink: [product({ id: 'c-sink-1', name: 'Single Bowl Sink', category: 'sink' })],
  tap: [product({ id: 'c-tap-1', name: 'Mixer Tap', category: 'tap' })],
  dishwasher: [
    product({ id: 'c-dw-1', name: '600mm Freestanding Dishwasher', category: 'dishwasher', width_mm: 600 }),
    product({ id: 'c-dw-2', name: '600mm Integrated Dishwasher', category: 'dishwasher', width_mm: 600 }),
  ],
  oven: [
    product({ id: 'c-ov-600', name: '600mm Built-in Oven', category: 'oven', width_mm: 595 }),
    product({ id: 'c-ov-900', name: '900mm Built-in Oven', category: 'oven', width_mm: 895 }),
  ],
  cooktop: [
    product({ id: 'c-ct-gas', name: '600mm Gas Cooktop', category: 'cooktop', width_mm: 590 }),
    product({ id: 'c-ct-ind', name: '600mm Induction Cooktop', category: 'cooktop', width_mm: 590 }),
  ],
  rangehood: [product({ id: 'c-rh-1', name: '600mm Undermount Rangehood', category: 'rangehood', width_mm: 600 })],
  fridge: [],
  microwave: [],
} as never;

const ids = (rows: unknown[]) => (rows as { id: string }[]).map(r => r.id).sort().join(',');
const orderedIds = (rows: unknown[]) => (rows as { id: string }[]).map(r => r.id).join(',');

{
  const induction = filterCatalogToCooking(COOKING_CATALOG as never, { cooktop: 'induction' });
  check('picking induction hides the gas cooktop',
    ids(induction.filtered.cooktop) === 'c-ct-ind', ids(induction.filtered.cooktop));

  const gas = filterCatalogToCooking(COOKING_CATALOG as never, { cooktop: 'gas' });
  check('picking gas hides the induction cooktop',
    ids(gas.filtered.cooktop) === 'c-ct-gas', ids(gas.filtered.cooktop));

  const oven600 = filterCatalogToCooking(COOKING_CATALOG as never, { oven: '600' });
  check('picking a 600mm oven hides the 900mm oven',
    ids(oven600.filtered.oven) === 'c-ov-600', ids(oven600.filtered.oven));

  const noDw = filterCatalogToCooking(COOKING_CATALOG as never, { dishwasher: false });
  check('answering "no dishwasher" empties the dishwasher category',
    noDw.filtered.dishwasher.length === 0 && excludedCategories({ dishwasher: false }).includes('dishwasher'),
    `${noDw.filtered.dishwasher.length} rows left`);

  // The filter must never leave a customer with nothing to pick. A 750mm oven
  // answer matches neither fixture, so the category falls back to showing all.
  const impossible = filterCatalogToCooking(COOKING_CATALOG as never, { oven: '750' as never });
  check('an answer that matches nothing falls back to the full category',
    impossible.filtered.oven.length === 2, `${impossible.filtered.oven.length} rows left`);

  check('no cooking answers leaves every category untouched',
    APPLIANCE_CATEGORY_ORDER.every(
      cat => ids(filterCatalogToCooking(COOKING_CATALOG as never, undefined).filtered[cat])
             === ids(COOKING_CATALOG[cat])),
    'an unanswered Cooking step still filtered the catalogue');
}

/* ── Supplier catalogue search ─────────────────────────────────────────────
 *
 * The full Häfele category is now searchable from the appliance step. Article
 * codes, supplier fields and plain-English bowl aliases must all work because
 * customers use each of those when looking for a sink.
 */
{
  const sinks = [
    product({
      id: 'search-single',
      item_code: '567.33.130',
      name: 'Single bowl',
      brand: 'Häfele',
      category: 'sink',
      installation: 'Undermount',
      bowl_count: 1,
      width_mm: 445,
    }),
    product({
      id: 'search-double',
      item_code: '567.33.366',
      name: 'Squareline double bowl with drainer',
      brand: 'Häfele',
      category: 'sink',
      installation: 'Surface mount',
      bowl_count: 2,
      width_mm: 1200,
    }),
    product({
      id: 'search-three-quarter',
      item_code: 'P-01921564',
      name: 'Squareline',
      brand: 'Häfele',
      category: 'sink',
      bowl_count: 1.75,
    }),
  ] as never[];

  check('catalogue search finds an exact Häfele article code',
    ids(filterApplianceProducts(sinks, '567.33.130')) === 'search-single');
  check('catalogue search matches bowl aliases and installation',
    ids(filterApplianceProducts(sinks, 'single undermount')) === 'search-single');
  check('catalogue search matches 1 3/4 bowl terminology',
    ids(filterApplianceProducts(sinks, '1 3/4 bowl')) === 'search-three-quarter');
  check('catalogue search combines product features',
    ids(filterApplianceProducts(sinks, 'double drainer 1200')) === 'search-double');
  check('catalogue search tolerates common Häfele spellings',
    filterApplianceProducts(sinks, 'haffle').length === sinks.length);
  check('clearing catalogue search restores the full range',
    filterApplianceProducts(sinks, '  ').length === sinks.length);
}

/* Kitchen-specific recommendations
 *
 * Supplier ordering must never promote laundry or bathroom fixtures into the
 * kitchen shortlist. The unsuitable rows remain searchable in the full range.
 */
{
  const sinks = [
    product({ id: 'sink-laundry', item_code: '567.30.120', name: 'Laundry tub', category: 'sink', bowl_count: 1, sort_order: 10 }),
    product({ id: 'sink-round', item_code: '567.56.000', name: 'Round bowl', category: 'sink', bowl_count: 1, sort_order: 20 }),
    product({ id: 'sink-drainer', item_code: 'P-01582749', name: 'Squareline plus single bowl with drainer', category: 'sink', bowl_count: 1, width_mm: 860, installation: 'Surface mount', sort_order: 50 }),
    product({ id: 'sink-one-three-quarter', item_code: '567.33.116', name: '1 & 3/4 Bowl', category: 'sink', bowl_count: 1.75, width_mm: 800, installation: 'Undermount', sort_order: 100 }),
    product({ id: 'sink-double', item_code: '567.33.250', name: 'Squareline plus double bowl', category: 'sink', bowl_count: 2, width_mm: 780, installation: 'Surface mount, Undermount', sort_order: 110 }),
  ];
  const taps = [
    product({ id: 'tap-wall', item_code: '589.33.367', name: 'Rondo wall mixer, with trim', category: 'tap', sort_order: 10 }),
    product({ id: 'tap-basin', item_code: '589.33.031', name: 'Rondo basin mixer', category: 'tap', sort_order: 20 }),
    product({ id: 'tap-gooseneck', item_code: '566.58.220', name: 'Gooseneck', category: 'tap', sort_order: 40 }),
    product({ id: 'tap-spray', item_code: '569.40.200', name: 'With pull-out vegie spray', category: 'tap', sort_order: 50 }),
    product({ id: 'tap-combined', item_code: 'P-01581837', name: 'Gooseneck, with pullout vegie spray', category: 'tap', sort_order: 150 }),
  ];

  check('sink recommendations are the Bower kitchen shortlist',
    orderedIds(recommendApplianceProducts('sink', sinks as never[]))
      === 'sink-one-three-quarter,sink-double,sink-drainer');
  check('laundry and round utility bowls remain outside the recommended sinks',
    recommendApplianceProducts('sink', sinks as never[])
      .every(item => !/laundry|round bowl/i.test(item.name)));
  check('tap recommendations contain kitchen gooseneck and pull-out mixers',
    orderedIds(recommendApplianceProducts('tap', taps as never[]))
      === 'tap-combined,tap-spray,tap-gooseneck');
  check('wall and basin mixers remain outside the recommended taps',
    recommendApplianceProducts('tap', taps as never[])
      .every(item => !/wall mixer|basin/i.test(item.name)));
}

console.log(failures === 0
  ? '\nAPPLIANCE OVERLAYS + COOKING FILTER + CATALOGUE SEARCH: all assertions pass'
  : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
