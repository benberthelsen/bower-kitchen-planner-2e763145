# Bower Supplier Catalog Data Bundle

Generated: 2026-07-13T11:14:56+10:00

This folder is the handoff from the board, material, and supplier product scrapers into the kitchen planner.

The scraper stays in the website/scraper project. The planner should treat this folder as a generated data feed. Do not hand-edit these files, because they will be replaced the next time the scraper export runs.

## What This Data Is

- 2207 material rows: 1922 from the current Microvellum raw board import and 285 from the Laminex public catalogue capture.
- 406 Hafele product/hardware rows from the latest Hafele pricing capture.
- Prices are raw supplier cost, ex GST, pre markup.
- Laminex catalogue rows do not include raw prices yet. They are included for selection and image data, and marked for price review until the authorised price book is added.
- Hafele rows use captured buy price where available, then captured sale price only if buy price is blank. Price-upon-request rows are kept but marked for review.
- GST and customer/trade markup must be applied by the planner pricing engine, not baked into this data.
- Display images are copied into this folder so the planner can show swatches without needing the scraper project.
- Main image coverage: 2202 ready, 5 needing review.
- Polytec texture/full-sheet images are included where available.

## Which File To Use

Use one of these paths depending on the integration stage:

1. Local planner UI or material picker

Use:

```text
planner-materials.json
```

This is the richest file for the app. It includes image paths, sheet size, raw cost, source details, review status, and metadata.

2. Existing planner Material Pricing CSV import

Use:

```text
material_pricing.csv
```

This is the safest simple import file. It contains only the columns the planner pricing import already understands:

```text
item_code,name,material_type,brand,finish,substrate,thickness,area_cost,area_handling_cost,area_assembly_cost,source_supplier,source_url,sample_image_url,thumbnail_url
```

3. Planner admin review or richer CSV import

Use:

```text
material_pricing_enriched.csv
```

This adds sheet length, sheet width, sheet cost, image URLs, status fields, source name, source page, and a stable hash.

4. Supabase function import

Use:

```text
supplier-material-products.json
```

This is shaped for the planner Supabase function:

```text
import-supplier-materials
```

Send the file's `records` array like this:

```json
{
  "records": [],
  "publish": true,
  "defaultVisibility": "Needs Review"
}
```

5. Direct Supabase SQL load

Use:

```text
material_pricing_supabase_upsert.sql
```

Review before running. It upserts by `item_code` into `public.material_pricing`.

6. Hafele product and hardware pricing data

Use:

```text
hafele-products.json
hardware_pricing.csv
hardware_pricing_enriched.csv
hardware_pricing_supabase_upsert.sql
```

`hafele-products.json` keeps all captured Hafele source fields, image URLs, RRP, sale price, pricing status, and review status.
`hardware_pricing.csv` is the simple planner import for `public.hardware_pricing`.
`hardware_pricing_enriched.csv` is the audit file.
`hardware_pricing_supabase_upsert.sql` upserts Hafele rows by `item_code` into `public.hardware_pricing`.

## Planner Loading Example

From the kitchen planner app, this file can be fetched from the public folder:

```ts
type PlannerMaterialsBundle = {
  schemaVersion: number;
  generatedAt: string;
  priceBasis: string;
  recordCount: number;
  materials: Array<{
    item_code: string;
    name: string;
    material_type: string;
    brand: string;
    finish: string;
    substrate: string;
    thickness: number | null;
    area_cost: number | null;
    sheet_length: number | null;
    sheet_width: number | null;
    sheet_cost: number | null;
    sample_image_url: string;
    texture_image_url: string;
    source_supplier: string;
    source_url: string;
    review_status: string;
    visibility_status: string;
  }>;
};

export async function loadSupplierMaterials(): Promise<PlannerMaterialsBundle> {
  const response = await fetch("/data/bower-supplier-catalog/planner-materials.json");
  if (!response.ok) {
    throw new Error("Could not load supplier material bundle");
  }
  return response.json();
}
```

Use `sample_image_url` for swatches in material selectors. The paths are already relative to the planner public folder, for example:

```text
/data/bower-supplier-catalog/assets/polytec/colours/nomad/showroom/nomad.jpg
```

## Suggested Planner Use

- Use `item_code` as the stable key.
- Use `name`, `brand`, `finish`, `substrate`, and `thickness` in material selectors.
- Use `area_cost` as the raw ex GST supply cost per square metre.
- Use `sheet_cost` only where the planner needs supplier sheet pricing or audit display.
- Use `sheet_length` and `sheet_width` for sheet optimisation.
- Use `visibility_status = Available` for normal options.
- Show or filter `review_status = needs_image_review` separately.
- Keep customer markup, trade markup, wastage, labour, and GST inside the planner.

## Current Known Review Items

The current source data has a small number of material rows without matched display images. They are still included in the data, but marked for review:

- EGGER Natural Anthor Oak H3330 ST36, 3650 x 600
- EGGER Natural Anthor Oak H3330 ST36, 3650 x 920
- EGGER White Halifax Oak H1176 ST37, 3650 x 600
- EGGER White Halifax Oak H1176 ST37, 3650 x 920
- MEGANITE Snow White Flex

Laminex rows are included, but the captured public catalogue does not contain raw price values. Keep those rows as `Needs Review` until the authorised Laminex price book is imported.

Hafele rows with `Price upon request` or no captured buy/sale price are included, but remain `Needs Review` so they do not silently become trusted costs.

## How To Update This Bundle

From the scraper project:

```powershell
npm run export:planner-data
```

While actively scraping:

```powershell
npm run export:planner-data:watch
```

The watch command rebuilds this bundle when the scraper output changes.

## Source Of Truth

The source of truth remains the scraper output and audited price files in the website/scraper project. This folder is a generated handoff for the kitchen planner and Supabase.
