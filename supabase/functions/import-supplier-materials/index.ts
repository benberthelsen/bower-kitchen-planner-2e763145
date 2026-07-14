import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonObject = Record<string, unknown>;

interface FinishVariant {
  name?: string;
  productCode?: string;
  finishCode?: string;
  source_url?: string;
  image_url?: string;
  sample_image_url?: string;
  thumbnail_url?: string;
  selected?: boolean;
}

interface SheetSize {
  label: string;
  length: number;
  width: number;
}

interface SupplierProduct {
  name?: string;
  color?: string;
  brand?: string;
  material?: string;
  material_type?: string;
  product_type?: string;
  finish_type?: string;
  range_name?: string;
  supplier?: string;
  source_supplier?: string;
  sku?: string;
  image_url?: string;
  sample_image_url?: string;
  thumbnail_url?: string;
  source_url?: string;
  description?: string;
  thickness?: string | number;
  sheet_length?: string | number;
  sheet_width?: string | number;
  area_cost?: string | number;
  areaCost?: string | number;
  price_per_sqm?: string | number;
  captured_unit_price?: string | number;
  price?: string | number;
  price_unit?: string;
  price_status?: string;
  metadata?: JsonObject;
  finish_variants?: FinishVariant[];
  finishVariants?: FinishVariant[];
}

interface PlannerMaterialRow {
  item_code: string;
  name: string;
  description: string | null;
  material_type: string | null;
  brand: string | null;
  finish: string | null;
  substrate: string | null;
  thickness: number | null;
  prefix: string | null;
  door_filter: string | null;
  horizontal_grain: boolean;
  double_sided: boolean;
  area_cost: number;
  area_handling_cost: number;
  area_assembly_cost: number;
  minimum_usage_rollover: number;
  expected_yield_factor: number;
  minimum_job_area: number;
  sheet_length: number | null;
  sheet_width: number | null;
  visibility_status: string;
  source_supplier: string | null;
  source_url: string | null;
  sample_image_url: string | null;
  thumbnail_url: string | null;
  supplier_product_id: string | null;
  supplier_variant_code: string | null;
  supplier_finish_code: string | null;
  supplier_range: string | null;
  supplier_category: string | null;
  price_status: string;
  price_source: string | null;
  price_captured_at: string | null;
  price_unit: string | null;
  captured_unit_price: number | null;
  technical_documents: unknown[];
  finish_variants: FinishVariant[];
  scraper_metadata: JsonObject;
  review_status: string;
  last_scraped_at: string;
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[$,\s]/g, "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function parseThickness(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed ?? null;
}

function parseSheetSize(value: unknown): SheetSize | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*mm?\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const length = Number(match[1]);
  const width = Number(match[2]);
  if (!Number.isFinite(length) || !Number.isFinite(width)) return undefined;
  return { label: `${length} x ${width}`, length, width };
}

function sheetSizesFor(product: SupplierProduct): SheetSize[] {
  const metadata = product.metadata ?? {};
  const filters = metadata.filters as JsonObject | undefined;
  const filterSizes = Array.isArray(filters?.size) ? filters.size : [];
  const parsed = filterSizes.map(parseSheetSize).filter(Boolean) as SheetSize[];
  if (parsed.length > 0) return parsed;

  const length = numberValue(product.sheet_length);
  const width = numberValue(product.sheet_width);
  if (length && width) return [{ label: `${length} x ${width}`, length, width }];

  return [{ label: "2400 x 1200", length: 2400, width: 1200 }];
}

function finishVariantsFor(product: SupplierProduct): FinishVariant[] {
  const metadata = product.metadata ?? {};
  const variants =
    product.finish_variants ??
    product.finishVariants ??
    (Array.isArray(metadata.finishVariants) ? metadata.finishVariants as FinishVariant[] : undefined);

  if (variants && variants.length > 0) return variants;

  return [{
    name: product.finish_type || "Standard",
    productCode: product.sku,
    source_url: product.source_url,
    selected: true,
  }];
}

function materialTypeFor(product: SupplierProduct): string | null {
  const source = `${product.material_type ?? ""} ${product.product_type ?? ""} ${product.material ?? ""}`.toLowerCase();
  if (/stone|quartz|mineral|porcelain|ultra/.test(source)) return "Stone";
  if (/solid\s*surface/.test(source)) return "Solid Surface";
  if (/laminate|formica|hpl/.test(source)) return "Laminate";
  if (/melamine/.test(source)) return "Melamine";
  if (/mdf|particle|board|panel/.test(source)) return "Board";
  return product.material_type ?? product.material ?? null;
}

function firstFilter(product: SupplierProduct, key: string): string | undefined {
  const filters = product.metadata?.filters as JsonObject | undefined;
  const value = filters?.[key];
  if (Array.isArray(value)) return text(value[0]);
  return text(value);
}

function resolveAreaCost(product: SupplierProduct, sheet: SheetSize): { areaCost: number; unitPrice: number | null; unit: string | null } {
  const explicitArea =
    numberValue(product.area_cost) ??
    numberValue(product.areaCost) ??
    numberValue(product.price_per_sqm) ??
    numberValue((product.metadata?.pricing as JsonObject | undefined)?.areaCostPerSqm);

  const unitPrice =
    numberValue(product.captured_unit_price) ??
    numberValue(product.price) ??
    numberValue((product.metadata?.pricing as JsonObject | undefined)?.capturedUnitPrice);

  const unit =
    text(product.price_unit) ??
    text((product.metadata?.pricing as JsonObject | undefined)?.unit) ??
    null;

  if (explicitArea !== undefined) return { areaCost: explicitArea, unitPrice: unitPrice ?? null, unit };

  if (unitPrice !== undefined && unit && /m2|sqm|square/i.test(unit)) {
    return { areaCost: unitPrice, unitPrice, unit };
  }

  if (unitPrice !== undefined && unit && /sheet|board|panel/i.test(unit)) {
    const sheetArea = (sheet.length * sheet.width) / 1_000_000;
    return { areaCost: sheetArea > 0 ? unitPrice / sheetArea : 0, unitPrice, unit };
  }

  return { areaCost: 0, unitPrice: unitPrice ?? null, unit };
}

function buildRows(product: SupplierProduct, options: { publish: boolean; defaultVisibility: string }): PlannerMaterialRow[] {
  const now = new Date().toISOString();
  const supplier = product.source_supplier ?? product.supplier ?? product.brand ?? "Supplier";
  const colourName = product.color ?? product.name ?? "Supplier material";
  const sheetSizes = sheetSizesFor(product);
  const finishVariants = finishVariantsFor(product);
  const technicalDocuments = Array.isArray(product.metadata?.technicalDocuments)
    ? product.metadata?.technicalDocuments as unknown[]
    : [];
  const supplierCategory = text(product.metadata?.supplierCategory) ?? text(product.product_type);
  const supplierRange = product.range_name ?? text(product.metadata?.supplierRange) ?? text(product.metadata?.range);
  const substrate = firstFilter(product, "substrate") ?? product.product_type ?? null;
  const doubleSided = /double/i.test(firstFilter(product, "face") ?? "");

  const rows: PlannerMaterialRow[] = [];

  for (const variant of finishVariants) {
    const finishName = variant.name ?? product.finish_type ?? "Standard";
    const variantCode = variant.productCode ?? product.sku ?? `${supplier}-${colourName}-${finishName}`;

    for (const sheet of sheetSizes) {
      const { areaCost, unitPrice, unit } = resolveAreaCost(product, sheet);
      const hasMultipleSheetSizes = sheetSizes.length > 1;
      const finish = hasMultipleSheetSizes ? `${finishName} ${sheet.label}` : finishName;
      const priceStatus =
        product.price_status ??
        text((product.metadata?.pricing as JsonObject | undefined)?.status) ??
        (areaCost > 0 ? "captured" : "not_captured");
      const visibility = options.publish && areaCost > 0 ? "Available" : options.defaultVisibility;

      rows.push({
        item_code: `${variantCode}${hasMultipleSheetSizes ? `-${sheet.length}x${sheet.width}` : ""}`,
        name: colourName,
        description: product.description ?? null,
        material_type: materialTypeFor(product),
        brand: product.brand ?? supplier,
        finish,
        substrate,
        thickness: parseThickness(product.thickness ?? firstFilter(product, "thickness")),
        prefix: supplier ? slug(supplier).toUpperCase() : null,
        door_filter: finishName,
        horizontal_grain: /wood|grain|oak|walnut|timber/i.test(`${colourName} ${finishName}`),
        double_sided: doubleSided,
        area_cost: areaCost,
        area_handling_cost: numberValue(product.metadata?.areaHandlingCost) ?? 0,
        area_assembly_cost: numberValue(product.metadata?.areaAssemblyCost) ?? 0,
        minimum_usage_rollover: 0,
        expected_yield_factor: /wood|grain|oak|walnut|timber/i.test(`${colourName} ${finishName}`) ? 0.82 : 0.85,
        minimum_job_area: 0,
        sheet_length: sheet.length,
        sheet_width: sheet.width,
        visibility_status: visibility,
        source_supplier: supplier,
        source_url: variant.source_url ?? product.source_url ?? null,
        sample_image_url: variant.sample_image_url ?? variant.image_url ?? product.sample_image_url ?? product.image_url ?? null,
        thumbnail_url: variant.thumbnail_url ?? variant.image_url ?? product.thumbnail_url ?? product.image_url ?? null,
        supplier_product_id: product.sku ?? null,
        supplier_variant_code: variant.productCode ?? product.sku ?? null,
        supplier_finish_code: variant.finishCode ?? null,
        supplier_range: supplierRange ?? null,
        supplier_category: supplierCategory ?? null,
        price_status: priceStatus,
        price_source: text(product.metadata?.priceSource) ?? null,
        price_captured_at: text(product.metadata?.priceCapturedAt) ?? null,
        price_unit: unit,
        captured_unit_price: unitPrice,
        technical_documents: technicalDocuments,
        finish_variants: finishVariants,
        scraper_metadata: {
          sourceProduct: product,
          importedShape: "supplier_material",
          sheetSize: sheet,
          finishVariant: variant,
        },
        review_status: areaCost > 0 ? "pending" : "needs_price",
        last_scraped_at: now,
      });
    }
  }

  return rows;
}

async function requireAdmin(req: Request, supabase: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization header");

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) throw new Error("Unauthorized");

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) throw new Error("Admin access required");
  return user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const user = await requireAdmin(req, supabase);

    const body = await req.json();
    const products = (body.records ?? body.products ?? body.scraperProducts ?? []) as SupplierProduct[];
    if (!Array.isArray(products) || products.length === 0) {
      throw new Error("No supplier material records provided");
    }

    const options = {
      publish: body.publish === true,
      defaultVisibility: text(body.defaultVisibility) ?? "Hidden",
    };

    const rows = products.flatMap((product) => buildRows(product, options));

    if (body.dryRun === true) {
      return new Response(JSON.stringify({
        success: true,
        dryRun: true,
        productsReceived: products.length,
        rowsMapped: rows.length,
        sample: rows.slice(0, 50),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const { data: existing, error: existingError } = await supabase
        .from("material_pricing")
        .select("id, area_cost, visibility_status")
        .eq("item_code", row.item_code)
        .limit(1)
        .maybeSingle();

      if (existingError) {
        errors.push(`${row.item_code}: ${existingError.message}`);
        continue;
      }

      if (existing?.id) {
        const rowForUpdate = {
          ...row,
          visibility_status: options.publish && row.area_cost > 0
            ? "Available"
            : existing.visibility_status ?? row.visibility_status,
        };

        const { error } = await supabase
          .from("material_pricing")
          .update(rowForUpdate)
          .eq("id", existing.id);

        if (error) {
          errors.push(`${row.item_code}: ${error.message}`);
          continue;
        }

        updated++;

        if (row.area_cost !== Number(existing.area_cost ?? 0) || row.captured_unit_price !== null) {
          await supabase.from("material_supplier_price_history").insert({
            material_pricing_id: existing.id,
            item_code: row.item_code,
            supplier: row.source_supplier,
            source_url: row.source_url,
            old_area_cost: existing.area_cost,
            new_area_cost: row.area_cost,
            captured_unit_price: row.captured_unit_price,
            price_unit: row.price_unit,
            captured_at: row.price_captured_at,
            captured_by: user.id,
            metadata: row.scraper_metadata,
          });
        }
      } else {
        const { data, error } = await supabase
          .from("material_pricing")
          .insert(row)
          .select("id")
          .single();

        if (error) {
          errors.push(`${row.item_code}: ${error.message}`);
          continue;
        }

        inserted++;

        if (row.captured_unit_price !== null || row.area_cost > 0) {
          await supabase.from("material_supplier_price_history").insert({
            material_pricing_id: data.id,
            item_code: row.item_code,
            supplier: row.source_supplier,
            source_url: row.source_url,
            old_area_cost: null,
            new_area_cost: row.area_cost,
            captured_unit_price: row.captured_unit_price,
            price_unit: row.price_unit,
            captured_at: row.price_captured_at,
            captured_by: user.id,
            metadata: row.scraper_metadata,
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: errors.length === 0,
      productsReceived: products.length,
      rowsMapped: rows.length,
      inserted,
      updated,
      errors,
    }), {
      status: errors.length === rows.length ? 500 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Supplier material import error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: /authorization|unauthorized|admin/i.test(message) ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
