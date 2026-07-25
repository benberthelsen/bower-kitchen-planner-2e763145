
# Stage 1 — Appliance Catalog + Add-to-Order

Purely additive. No 3D renderer changes. Cabinet/benchtop pricing byte-identical when no appliances are placed.

## 1. Database (migration)

New table `public.appliance_products` with all columns specified in the request. Storage bucket `appliance-assets` (public read, admin write).

- RLS:
  - `SELECT`: `anon` + `authenticated` where `is_active = true`
  - `INSERT/UPDATE/DELETE`: only `has_role(auth.uid(), 'admin')`
- GRANTs: SELECT to anon+authenticated, ALL to service_role, INSERT/UPDATE/DELETE to authenticated (RLS gates admin).
- `updated_at` trigger reusing `public.update_updated_at`.
- Bucket via `supabase--storage_create_bucket` (public). RLS policies on `storage.objects` restricting writes on this bucket to admins.

## 2. Seed data

Insert the 12 rows listed (all with `price_is_placeholder = true`, `is_active = true`, sensible `sort_order` per category). Tap finishes match existing `TAP_OPTIONS` (Chrome, Matte Black, Brushed Gunmetal).

## 3. Admin screen — `src/pages/admin/pricing/ApplianceCatalog.tsx`

- Route registered alongside `HardwarePricing` in the admin router.
- Table listing with filter by category, edit-in-drawer form for all fields.
- Image upload + GLB upload (`model_url`) + USDZ upload (`model_ios_url`) via storage bucket. Warn on GLB > 8 MB.
- `is_active` toggle. "Placeholder price" badge that clears (sets `price_is_placeholder=false`) when admin saves a numeric price via a "Confirm price" action.
- Add nav entry in admin pricing sidebar.

## 4. Catalog data hook + planner tab

- New hook `src/hooks/useApplianceCatalog.ts` — React Query, filters `is_active`, groups by category.
- `src/components/shared/UnifiedCatalog.tsx` (and the homeowner appliance chooser if separate): when on the "Appliances" tab, render two groups:
  - **From catalog** — one card per product (image, name, brand, W×H×D, price).
  - **Openings (client supplies appliance)** — keep the existing static `STATIC_LIBRARY_TEMPLATES` "Appliance Openings" entries.
- Selecting a catalog product creates a placed appliance item using its cutout/overall dimensions (same placement code path as today) and stores on the placed item:
  ```
  applianceProductId: string
  applianceSnapshot: { itemCode, name, category, unitPrice, isPlaceholderPrice }
  supplyWithOrder: boolean  // default true when unitPrice > 0
  ```
- `PlacedItem` type extended with these optional fields. Old saved designs (no `applianceProductId`) load unchanged.

## 5. Quote integration (additive)

Extend `src/lib/pricing/types.ts`:
```
ApplianceLineItem { productId, itemCode, name, category, quantity, unitPrice, lineTotal, isPlaceholderPrice }
QuoteBOM.applianceItems: ApplianceLineItem[]
QuoteBOM.grandTotal.appliances: number
QuoteBOM.grandTotal.hasPlaceholderAppliancePrices: boolean
CommercialOptions.applianceMarginPct?: number  // default 0
```

`generateQuoteBOM` (bomGenerator.ts):
- Collect placed items where `applianceProductId && supplyWithOrder && unitPrice > 0`.
- Build `applianceItems` (grouping identical productIds → quantity).
- Add `appliances` subtotal into `cost` and downstream margin/GST math, gated by `applianceItems.length > 0` so existing outputs stay byte-identical when empty.

Downstream:
- `src/hooks/useTradeJobPersistence.ts` — snapshot includes `applianceItems`.
- PDF quote (`src/lib/pdfQuoteGenerator.ts`): new "Appliances" section listing each line; footnote "Appliance prices to be confirmed" when any `isPlaceholderPrice`.
- Quote screen: amber warning banner under same condition.
- Edge function payloads (`submit-planner-enquiry`, `create-planner-handoff`) — include `applianceItems` in the outgoing JSON (client-side only; do not touch the edge function code).

## 6. Properties panel toggle

In the placed-item properties panel used by both planners, when the item has `applianceProductId`, show a "Supply with order" switch bound to `supplyWithOrder`. Hidden for opening-only items.

## 7. Stage 2 prep (data only)

`model_url` / `model_ios_url` are stored and passed through on placed items but NOT read by any renderer this stage. `ApplianceMesh.tsx` untouched.

## Verification

- `bunx tsgo --noEmit -p tsconfig.app.json` clean (aside from pre-existing Leads.tsx errors).
- Existing pricing smoke (`scripts/pricing-smoke.mjs`) still green — no appliance items ⇒ identical totals.
- Manual: load an existing saved job (no appliances) → totals unchanged. Place a catalog oven → appears in BOM, PDF, and quote panel with placeholder badge.
