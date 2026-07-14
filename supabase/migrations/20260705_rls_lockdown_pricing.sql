-- WS6 RLS hardening (2026-07-05).
-- Audit finding: anonymous requests could read raw trade supplier costs
-- (material/hardware/parts/benchtop pricing returned rows with just the anon
-- key). The original schema used "Anyone can view X" SELECT policies.
-- Rule from the handover: trade buy prices stay internal — public showroom
-- pages may show products/images, but cost data is for logged-in users only.
--
-- This migration flips every pricing SELECT policy to authenticated-only.
-- Admin manage policies are untouched. microvellum_products stays readable to
-- authenticated (catalog), products likewise.

-- material_pricing
drop policy if exists "Anyone can view material pricing" on public.material_pricing;
create policy "Authenticated can view material pricing"
  on public.material_pricing for select to authenticated using (true);

-- hardware_pricing
drop policy if exists "Anyone can view hardware pricing" on public.hardware_pricing;
create policy "Authenticated can view hardware pricing"
  on public.hardware_pricing for select to authenticated using (true);

-- parts_pricing
drop policy if exists "Anyone can view parts pricing" on public.parts_pricing;
create policy "Authenticated can view parts pricing"
  on public.parts_pricing for select to authenticated using (true);

-- edge_pricing
drop policy if exists "Anyone can view edge pricing" on public.edge_pricing;
create policy "Authenticated can view edge pricing"
  on public.edge_pricing for select to authenticated using (true);

-- door_drawer_pricing
drop policy if exists "Anyone can view door drawer pricing" on public.door_drawer_pricing;
create policy "Authenticated can view door drawer pricing"
  on public.door_drawer_pricing for select to authenticated using (true);

-- benchtop_pricing (renamed from stone_pricing — policy name carried over)
drop policy if exists "Anyone can view stone pricing" on public.benchtop_pricing;
drop policy if exists "Anyone can view benchtop pricing" on public.benchtop_pricing;
create policy "Authenticated can view benchtop pricing"
  on public.benchtop_pricing for select to authenticated using (true);

-- labor_rates
drop policy if exists "Anyone can view labor rates" on public.labor_rates;
create policy "Authenticated can view labor rates"
  on public.labor_rates for select to authenticated using (true);

-- products (catalog prices are sell-side but still internal until homeowner mode defines public pricing)
drop policy if exists "Anyone can view products" on public.products;
create policy "Authenticated can view products"
  on public.products for select to authenticated using (true);
