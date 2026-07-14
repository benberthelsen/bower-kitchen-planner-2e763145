/**
 * R5/R6: Scheduled supplier import edge function.
 * Fetches CSV data from configured supplier_feeds URLs, diffs against the
 * current database, and either auto-applies or records the summary.
 *
 * Invocation:
 *   Manual (admin UI "Run now"):   POST with admin JWT in Authorization header
 *   Cron (pg_cron via pg_net):     POST with service role key in Authorization header
 *
 * Body (optional): { feedId?: string }  — omit to process all active feeds
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Table configs (mirrors SupplierImport.tsx) ───────────────────────────────

const TABLE_CONFIGS: Record<string, {
  keyCol: string | string[];
  numericCols: string[];
  importCols: string[];
}> = {
  material_pricing: {
    keyCol: "item_code",
    numericCols: ["area_cost", "area_handling_cost", "area_assembly_cost", "thickness"],
    importCols: [
      "item_code", "name", "material_type", "brand", "finish", "substrate", "thickness",
      "area_cost", "area_handling_cost", "area_assembly_cost", "source_supplier", "source_url",
      "sample_image_url", "thumbnail_url",
    ],
  },
  hardware_pricing: {
    keyCol: "item_code",
    numericCols: ["handling_cost", "unit_cost", "machining_cost", "assembly_cost", "runner_height", "runner_depth"],
    importCols: [
      "item_code", "name", "hardware_type", "brand", "series",
      "runner_height", "runner_depth", "handling_cost", "unit_cost", "machining_cost", "assembly_cost",
    ],
  },
  edge_tape_pricing: {
    keyCol: "item_code",
    numericCols: ["handling_cost", "length_cost", "application_cost", "thickness"],
    importCols: [
      "item_code", "name", "edge_type", "brand", "finish", "thickness",
      "handling_cost", "length_cost", "application_cost",
    ],
  },
  benchtop_pricing: {
    keyCol: ["brand", "material_type", "range_tier"],
    numericCols: [
      "stock_length_mm", "stock_depth_mm", "price_per_sheet", "price_per_lm",
      "trade_supply_per_sqm", "install_per_lm", "install_supply_per_sqm",
    ],
    importCols: [
      "brand", "range_tier", "material_type", "pricing_method",
      "stock_length_mm", "stock_depth_mm", "price_per_sheet", "price_per_lm",
      "trade_supply_per_sqm", "install_per_lm", "install_supply_per_sqm",
    ],
  },
};

// ─── CSV parser ───────────────────────────────────────────────────────────────

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if ((c === "," || c === "\t") && !inQ) { cells.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  cells.push(cur.trim());
  return cells;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map(line => {
    const cells = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
  return { headers, rows };
}

// ─── Key + diff helpers ───────────────────────────────────────────────────────

function getKey(row: Record<string, unknown>, keyCol: string | string[]): string {
  if (Array.isArray(keyCol)) return keyCol.map(k => String(row[k] ?? "")).join("|");
  return String(row[keyCol] ?? "");
}

function parseNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function valuesEqual(csvVal: string, dbVal: unknown, isNumeric: boolean): boolean {
  if (isNumeric) {
    const a = parseNum(csvVal);
    const b = dbVal == null ? null : Number(dbVal);
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(a - b) < 0.0001;
  }
  return (csvVal ?? "").trim() === String(dbVal ?? "").trim();
}

function coerceVal(csvVal: string, col: string, numericCols: string[]): unknown {
  if (numericCols.includes(col)) return csvVal === "" ? null : parseNum(csvVal);
  return csvVal === "" ? null : csvVal;
}

// ─── Import one feed ──────────────────────────────────────────────────────────

interface ImportSummary {
  inserted: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

async function importFeed(
  supabase: ReturnType<typeof createClient>,
  feed: { id: string; table_name: string; feed_url: string; auto_apply: boolean },
): Promise<ImportSummary> {
  const summary: ImportSummary = { inserted: 0, updated: 0, unchanged: 0, errors: [] };

  // Validate table
  const config = TABLE_CONFIGS[feed.table_name];
  if (!config) {
    summary.errors.push(`Unknown table: ${feed.table_name}`);
    return summary;
  }

  // Fetch CSV from supplier URL
  let csvText: string;
  try {
    const resp = await fetch(feed.feed_url, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    csvText = await resp.text();
  } catch (err) {
    summary.errors.push(`Fetch failed: ${(err as Error).message}`);
    return summary;
  }

  const { rows: csvRows } = parseCSV(csvText);
  if (csvRows.length === 0) {
    summary.errors.push("CSV has no data rows");
    return summary;
  }

  // Validate key column(s) present
  const keyColArr = Array.isArray(config.keyCol) ? config.keyCol : [config.keyCol];
  const csvHeaders = Object.keys(csvRows[0]);
  const missingKeys = keyColArr.filter(k => !csvHeaders.includes(k));
  if (missingKeys.length > 0) {
    summary.errors.push(`Missing key column(s): ${missingKeys.join(", ")}`);
    return summary;
  }

  // Fetch existing rows
  const { data: dbRows, error: dbErr } = await supabase.from(feed.table_name).select("*");
  if (dbErr) { summary.errors.push(`DB fetch: ${dbErr.message}`); return summary; }

  // Build key map
  const dbMap = new Map<string, Record<string, unknown>>();
  for (const row of (dbRows ?? [])) dbMap.set(getKey(row as Record<string, unknown>, config.keyCol), row as Record<string, unknown>);

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

  for (const csvRow of csvRows) {
    const key = getKey(csvRow, config.keyCol);
    if (!key.replace(/\|/g, "")) continue;

    const existing = dbMap.get(key);
    if (!existing) {
      // New row
      const newRow: Record<string, unknown> = {};
      for (const col of config.importCols) {
        if (col in csvRow) newRow[col] = coerceVal(csvRow[col], col, config.numericCols);
      }
      toInsert.push(newRow);
    } else {
      // Check for changes
      const patch: Record<string, unknown> = {};
      for (const col of config.importCols) {
        if (!(col in csvRow)) continue;
        if (!valuesEqual(csvRow[col], existing[col], config.numericCols.includes(col))) {
          patch[col] = coerceVal(csvRow[col], col, config.numericCols);
        }
      }
      if (Object.keys(patch).length > 0) {
        toUpdate.push({ id: existing.id as string, patch });
      } else {
        summary.unchanged++;
      }
    }
  }

  if (!feed.auto_apply) {
    // Log only — don't touch the DB
    summary.inserted = toInsert.length;
    summary.updated  = toUpdate.length;
    return summary;
  }

  // Apply inserts in batches
  const BATCH = 50;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { error } = await supabase.from(feed.table_name).insert(toInsert.slice(i, i + BATCH));
    if (error) summary.errors.push(`Insert batch ${i}: ${error.message}`);
    else summary.inserted += Math.min(BATCH, toInsert.length - i);
  }

  // Apply updates
  for (const { id, patch } of toUpdate) {
    const { error } = await supabase.from(feed.table_name).update(patch).eq("id", id);
    if (error) summary.errors.push(`Update ${id}: ${error.message}`);
    else summary.updated++;
  }

  return summary;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Always use service role for data operations
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check: accept admin JWT or service role key (for cron)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow service role key directly (cron context)
    const isServiceRole = token === serviceKey;
    if (!isServiceRole) {
      // Verify admin user JWT
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey);
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleRow } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).single();
      if (roleRow?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Parse body
    let feedId: string | undefined;
    try { feedId = (await req.json())?.feedId; } catch { /* no body */ }

    // Fetch target feeds
    let query = supabase.from("supplier_feeds").select("*").eq("is_active", true);
    if (feedId) query = query.eq("id", feedId);
    const { data: feeds, error: feedErr } = await query;

    if (feedErr) throw feedErr;
    if (!feeds || feeds.length === 0) {
      return new Response(JSON.stringify({ message: "No active feeds found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process each feed
    const results: Record<string, unknown>[] = [];
    for (const feed of feeds) {
      console.log(`[supplier-import] Processing feed: ${feed.label} → ${feed.table_name}`);
      const summary = await importFeed(supabase, feed as {
        id: string; table_name: string; feed_url: string; auto_apply: boolean;
      });

      const ok = summary.errors.length === 0;
      const msg = feed.auto_apply
        ? `${summary.inserted} added, ${summary.updated} updated, ${summary.unchanged} unchanged${ok ? "" : ` (${summary.errors.length} errors)`}`
        : `Diff only: ${summary.inserted} new, ${summary.updated} changed — manual review required`;

      await supabase.from("supplier_feeds").update({
        last_run_at: new Date().toISOString(),
        last_run_ok: ok,
        last_run_summary: msg,
      }).eq("id", feed.id);

      results.push({ feedId: feed.id, label: feed.label, ok, summary: msg });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[supplier-import] Fatal error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
