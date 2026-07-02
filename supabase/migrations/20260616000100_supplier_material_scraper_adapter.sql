-- Extend planner material pricing so supplier scraper imports can drive
-- colour/finish pickers, sample images, ordering, and private price review.

alter table public.material_pricing
  add column if not exists description text,
  add column if not exists source_supplier text,
  add column if not exists source_url text,
  add column if not exists sample_image_url text,
  add column if not exists thumbnail_url text,
  add column if not exists supplier_product_id text,
  add column if not exists supplier_variant_code text,
  add column if not exists supplier_finish_code text,
  add column if not exists supplier_range text,
  add column if not exists supplier_category text,
  add column if not exists price_status text not null default 'not_captured',
  add column if not exists price_source text,
  add column if not exists price_captured_at timestamptz,
  add column if not exists price_unit text,
  add column if not exists captured_unit_price numeric,
  add column if not exists technical_documents jsonb not null default '[]'::jsonb,
  add column if not exists finish_variants jsonb not null default '[]'::jsonb,
  add column if not exists scraper_metadata jsonb not null default '{}'::jsonb,
  add column if not exists review_status text not null default 'pending',
  add column if not exists last_scraped_at timestamptz;

create index if not exists idx_material_pricing_item_code on public.material_pricing(item_code);
create index if not exists idx_material_pricing_source_supplier on public.material_pricing(source_supplier);
create index if not exists idx_material_pricing_price_status on public.material_pricing(price_status);
create index if not exists idx_material_pricing_review_status on public.material_pricing(review_status);

create table if not exists public.material_supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  material_pricing_id uuid references public.material_pricing(id) on delete set null,
  item_code text not null,
  supplier text,
  source_url text,
  old_area_cost numeric,
  new_area_cost numeric,
  captured_unit_price numeric,
  price_unit text,
  captured_at timestamptz,
  imported_at timestamptz not null default now(),
  captured_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.material_supplier_price_history enable row level security;

drop policy if exists "Admins can view supplier material price history" on public.material_supplier_price_history;
create policy "Admins can view supplier material price history"
on public.material_supplier_price_history for select
using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can insert supplier material price history" on public.material_supplier_price_history;
create policy "Admins can insert supplier material price history"
on public.material_supplier_price_history for insert
with check (has_role(auth.uid(), 'admin'::app_role));

create index if not exists idx_material_supplier_price_history_item_code
on public.material_supplier_price_history(item_code, imported_at desc);

comment on column public.material_pricing.sample_image_url is 'Supplier sample/swatch image used by the planner material picker.';
comment on column public.material_pricing.price_status is 'not_captured, requires_authorised_login, captured, manual_review, or unavailable.';
comment on column public.material_pricing.scraper_metadata is 'Raw supplier scrape metadata kept for audit/re-import decisions.';
