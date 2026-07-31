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
import { sinkOpeningDimensions } from '../src/components/3d/appliances/sinkDimensions';
import {
  carcassMaterialForCategory,
  shouldRenderKickboard,
} from '../src/components/3d/cabinetConstruction';

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

const timberCarcass = { finish: 'timber' };
const whiteMelamineCarcass = { finish: 'white-melamine' };
check('overhead carcass stays white while other cabinet categories keep their configured material',
  carcassMaterialForCategory('Wall', timberCarcass, whiteMelamineCarcass) === whiteMelamineCarcass
  && carcassMaterialForCategory('Base', timberCarcass, whiteMelamineCarcass) === timberCarcass
  && carcassMaterialForCategory('Tall', timberCarcass, whiteMelamineCarcass) === timberCarcass);

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
}

// Nothing chosen must stay a no-op.
check('no chosen products yields no overlays',
  synthesiseApplianceOverlays(compiled, {}, PRODUCTS).length === 0, 'produced overlays from an empty selection');
check('no catalog yields no overlays',
  synthesiseApplianceOverlays(compiled, chosen, []).length === 0, 'produced overlays with no catalog');

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

console.log(failures === 0
  ? '\nAPPLIANCE OVERLAYS + COOKING FILTER + CATALOGUE SEARCH: all assertions pass'
  : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
