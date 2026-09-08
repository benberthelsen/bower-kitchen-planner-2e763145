// price-quote — price a cabinet schedule with the real BowerOS engine against
// the LIVE catalogue in this project. Build Flow calls this; when a price in
// material_pricing / hardware_pricing / labor_rates / client_markup_settings
// changes, the next call reflects it. No copies of the engine, no snapshots of
// the tables.
//
// The engine itself is `engine.mjs`, an esbuild bundle of src/lib/pricing built
// by `npm run build:pricing-engine` — regenerate it whenever the engine changes.
//
// Auth: this is a server-to-server endpoint. Callers present a shared secret in
// `x-bower-pricing-key` (Build Flow's `bower-price` proxy holds it; end users
// never see it). verify_jwt is off in config.toml because Build Flow users are
// not planner users.
//
//   POST /price-quote           { schedule, selections, supplyMode?, defaultRoom?, markupPct? }
//   GET  /price-quote?catalog=1 { materials, edges, hinges, runners, handles, markup }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, errorResponse, gate, jsonResponse, readJsonBody } from '../_shared/roomScan/security.ts';
import { quoteFromSchedule } from './engine.mjs';

const PAGE = 1000;

/** PostgREST caps a response at 1,000 rows and the hardware catalogue is ~3,800. */
async function fetchAll<T>(sb: SupabaseClient, table: string, select = '*'): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 25; page++) {
    const from = page * PAGE;
    const { data, error } = await sb.from(table).select(select).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return rows;
  }
  throw new Error(`${table} exceeded the paging limit`);
}

async function loadCatalogue(sb: SupabaseClient) {
  const [parts, materials, edges, hardware, labor, markupRows] = await Promise.all([
    fetchAll<Record<string, unknown>>(sb, 'parts_pricing'),
    fetchAll<Record<string, unknown>>(sb, 'material_pricing'),
    fetchAll<Record<string, unknown>>(sb, 'edge_pricing'),
    fetchAll<Record<string, unknown>>(sb, 'hardware_pricing'),
    fetchAll<Record<string, unknown>>(sb, 'labor_rates'),
    fetchAll<Record<string, unknown>>(sb, 'client_markup_settings'),
  ]);
  // The default row governs. Categories are all one figure at Bower; take
  // labor_markup as the single rate and say where it came from.
  const def = markupRows.find((r) => r.is_default) ?? markupRows[0];
  const pct = def ? Number(def.labor_markup ?? def.material_markup ?? 0) : null;
  const markup = def && pct !== null
    ? { pct: String(def.markup_type) === 'percentage' ? pct / 100 : pct, source: `client_markup_settings "${def.name}"` }
    : { pct: 0.40, source: 'ASSUMED 40% — no client_markup_settings row' };
  return { parts, materials, edges, hardware, labor, markup };
}

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));
/** Numeric columns arrive as strings from PostgREST for numeric(…) types; the engine wants numbers. */
function numify<T extends Record<string, unknown>>(rows: T[], keys: string[]): T[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const k of keys) if (k in o) o[k] = num(o[k]);
    return o as T;
  });
}

serve(async (req) => {
  const gated = gate(req);
  if (gated) return gated;
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });

  const expected = Deno.env.get('BOWER_PRICING_KEY');
  if (!expected || req.headers.get('x-bower-pricing-key') !== expected) {
    return errorResponse(req, 401, 'unauthorized');
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const cat = await loadCatalogue(sb);
    const url = new URL(req.url);

    if (req.method === 'GET' && url.searchParams.get('catalog')) {
      const pick = (rows: Record<string, unknown>[], keys: string[]) =>
        rows.filter((r) => (r.visibility_status ?? 'Available') === 'Available')
            .map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
      const hw = (types: RegExp) => cat.hardware.filter((r) => types.test(String(r.hardware_type ?? '')) && Number(r.unit_cost) > 0);
      return jsonResponse(req, 200, {
        materials: pick(cat.materials.filter((m) => Number(m.area_cost) > 0), ['id', 'item_code', 'name', 'brand', 'thickness', 'material_type', 'area_cost']),
        edges: pick(cat.edges.filter((e) => Number(e.length_cost) > 0), ['id', 'item_code', 'name', 'brand', 'thickness', 'length_cost']),
        hinges: pick(hw(/hinge/i), ['item_code', 'name', 'brand', 'unit_cost']),
        runners: pick(hw(/runner|slide/i), ['item_code', 'name', 'brand', 'unit_cost', 'runner_depth', 'runner_height']),
        handles: pick(hw(/handle|knob|pull/i), ['item_code', 'name', 'brand', 'unit_cost']),
        markup: cat.markup,
      });
    }

    if (req.method !== 'POST') return errorResponse(req, 405, 'method_not_allowed');
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const b = body as Record<string, unknown>;
    const schedule = Array.isArray(b.schedule) ? b.schedule : (b.schedule as Record<string, unknown> | undefined)?.items;
    const selections = b.selections as Record<string, string> | undefined;
    if (!Array.isArray(schedule) || schedule.length === 0) return errorResponse(req, 400, 'no_schedule');
    for (const k of ['carcaseMaterialId', 'exteriorMaterialId', 'edgeId', 'hingeType', 'drawerType']) {
      if (!selections?.[k]) return errorResponse(req, 400, `missing_selection_${k}`);
    }

    const pricing = {
      parts: numify(cat.parts, ['handling_cost', 'area_handling_cost', 'machining_cost', 'area_machining_cost', 'assembly_cost', 'area_assembly_cost']),
      materials: numify(cat.materials, ['thickness', 'sheet_width', 'sheet_length', 'area_cost', 'area_handling_cost', 'area_assembly_cost', 'expected_yield_factor', 'minimum_job_area', 'minimum_usage_rollover', 'double_sided_cost', 'horizontal_grain_surcharge']),
      edges: numify(cat.edges, ['thickness', 'length_cost', 'handling_cost', 'area_handling_cost', 'application_cost']),
      hardware: numify(cat.hardware, ['unit_cost', 'inner_unit_cost', 'handling_cost', 'machining_cost', 'assembly_cost', 'runner_depth', 'runner_height']),
      labor: numify(cat.labor, ['rate']),
      doorDrawer: [], benchtop: [],
    };
    const markupPct = typeof b.markupPct === 'number' ? b.markupPct : cat.markup.pct;
    const markupSource = typeof b.markupPct === 'number' ? 'request override' : cat.markup.source;

    const result = quoteFromSchedule(schedule, pricing, selections, {
      markupPct, markupSource,
      supplyMode: (b.supplyMode as string | undefined) ?? 'assembled_installed',
    }, { defaultRoom: (b.defaultRoom as string | undefined) ?? 'Kitchen' });

    return jsonResponse(req, 200, {
      ...result,
      pricedAt: new Date().toISOString(),
      catalogue: { parts: cat.parts.length, materials: cat.materials.length, hardware: cat.hardware.length, labor: cat.labor.length },
    });
  } catch (e) {
    console.error('price-quote', e);
    return errorResponse(req, 500, 'pricing_failed');
  }
});
