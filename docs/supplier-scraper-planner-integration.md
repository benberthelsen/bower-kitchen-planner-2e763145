# Supplier Scraper to Kitchen Planner Integration

## What was found

The Claude kitchen planner does not currently have supplier spreadsheets in this project folder. The ordering app uses the `material_pricing` database table as the main catalogue for board colours, finishes, sheet sizes, and square metre costing.

That means the supplier scraper should feed `material_pricing`, not a separate spreadsheet-only store.

## Import flow

1. Run the website supplier scraper against a supplier detail page or catalogue page.
2. Send the scraper result into the planner Edge Function `import-supplier-materials`.
3. Run with `dryRun: true` first so the mapped rows can be checked before saving.
4. Import new rows as `Hidden` by default.
5. Review sample images, finish variants, sheet sizes, and price status.
6. Publish rows only after the price is captured or manually confirmed.

## Data now supported by `material_pricing`

The planner can now store supplier-specific product data on each material row:

- supplier name and source URL
- supplier product code, variant code, and finish code
- colour/material sample image
- thumbnail image
- supplier range and category
- technical documents
- finish variants
- price status
- captured supplier price and price unit
- last scrape timestamp
- review status
- raw scraper metadata for audit/re-imports

## Price handling

Supplier prices that require an authorised login should stay internal. The importer records those rows as `requires_authorised_login` or `needs_price` until a logged-in/internal price is captured.

When a price is captured or changed, the importer writes a row into `material_supplier_price_history` so changes can be reviewed later.

## Planner behaviour

The room material picker now reads supplier sample images from `material_pricing.sample_image_url`. The user can choose a colour first, then choose the available finish for that colour.

The admin material pricing screen now shows sample images, source links, price status, and review status so supplier rows can be checked before they are made available for ordering.

## Deployment note

Before using this in the live planner database, deploy:

- migration `20260616000100_supplier_material_scraper_adapter.sql`
- Edge Function `import-supplier-materials`

The live planner Supabase project is currently configured as `wyiydozwukiayhwcdlcf`. Deploying may need access through the Lovable/Supabase account that owns that project.
