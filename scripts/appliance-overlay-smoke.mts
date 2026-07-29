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
  synthesiseApplianceOverlays,
  filterCatalogToCooking,
  excludedCategories,
  APPLIANCE_CATEGORY_ORDER,
} from '../src/pages/homeowner/applianceSelection';
import type { ApplianceCategory } from '../src/pages/homeowner/applianceSelection';
import { DEFAULT_GLOBAL_DIMENSIONS } from '../src/constants';

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
  product({ id: '11111111-1111-4111-8111-111111111111', name: 'Single Bowl Undermount Sink', category: 'sink', width_mm: 440, height_mm: 200, depth_mm: 440, finish: 'Stainless Steel' }),
  product({ id: '22222222-2222-4222-8222-222222222222', name: '60cm Induction Cooktop', category: 'cooktop', width_mm: 590, height_mm: 60, depth_mm: 520, finish: 'Black Glass' }),
  product({ id: '33333333-3333-4333-8333-333333333333', name: 'Kitchen Mixer Tap', category: 'tap', finish: 'Matte Black' }),
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

  check('the cooktop sits on the benchtop, not inside the cabinet',
    cooktop.y - cooktop.height / 2 >= benchtopTop - 1,
    `cooktop base ${cooktop.y - cooktop.height / 2} vs benchtop ${benchtopTop}`);

  check('the sink is centred on its host cabinet',
    sink.x === hostSink.x && sink.z === hostSink.z && sink.rotation === hostSink.rotation,
    `${sink.x},${sink.z}@${sink.rotation} vs ${hostSink.x},${hostSink.z}@${hostSink.rotation}`);

  // The tap has no item of its own — it rides on the sink.
  check('the chosen matte black tap reaches the sink item',
    sink.tapId === 'tap-goose-bk', String(sink.tapId));

  check('the product snapshot travels with the item, for AR and the quote',
    sink.applianceProductId === chosen.sink && !!sink.applianceSnapshot,
    JSON.stringify(sink.applianceSnapshot));
}

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

console.log(failures === 0
  ? '\nAPPLIANCE OVERLAYS + COOKING FILTER: all assertions pass'
  : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
