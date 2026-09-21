-- Glasstech mirror glass for BowerOS - CATALOGUE ROW, NOT APPLIED
-- ============================================================================
-- Written 21 Sep 2026. This file is a HANDOFF, not a migration: nothing here has been run against any database,
-- and it is deliberately NOT in supabase/migrations so a future commit cannot apply it by accident. Move it there
-- (renamed <timestamp>_glasstech_mirror.sql) only after Ben has confirmed the two points below.
--
-- BEN, TWO THINGS TO CONFIRM BEFORE THIS IS APPLIED
-- -----------------------------------------------------------------------------------------------------------
-- 1. THIS REVERSES WHAT YOU TOLD ME ON 17 SEP. You said mirror is charged as a WHOLE SHEET as bought. Your own
--    Glasstech proforma of 1 Sep 2026 says otherwise: the glass is CUT TO SIZE and billed on the measured area
--    of each piece, with no minimum and no rounding up. The engine now follows the invoice. Say if the whole
--    sheet was right and the invoice is the exception.
-- 2. THERE ARE NO OTHER PART NUMBERS. You asked me to look up the other part numbers on the Glasstech email.
--    The proforma carries none at all - only the description "4.00mm SILVER VINYLBACK SAFETY", printed twice,
--    once for each size. So item_code 'GT-MIR-4SVB' below is BOWER'S OWN code, not Glasstech's. If they have a
--    price list with real codes, send it and this row gets their code instead.
--
-- THE INVOICE THIS IS SEEDED FROM
-- -----------------------------------------------------------------------------------------------------------
--   Glasstech (QLD) Pty Ltd, 5 Industrial Avenue, Stratford QLD 4870, ABN 83 084 231 649
--   PROFORMA INVOICE (an order confirmation, NOT a tax invoice), Order Number 180617, Order Date 1/09/2026
--   Customer BOWER BUILDING (PRE-PAID ACC), 122 Ronald Rd, Forest Creek 4873.  Reference: 4MM MIRROR
--
--     QTY  DESCRIPTION                       SIZE         MEASURE   RATE $   NET $
--       2  4.00mm SILVER VINYLBACK SAFETY    2009 X 760    3.0536    90.21   275.47
--       2  4.00mm SILVER VINYLBACK SAFETY    1991 X 724    2.8830    90.21   260.08
--                                            Sub-total    535.54    GST 53.55    Total 589.09
--
--   HOW THEY MEASURE, checked against the printed digits:
--     2009 x 760 = 1.52684 m2 -> rounded to 4 dp = 1.5268, x 2 = 3.0536   (printed 3.0536)
--     1991 x 724 = 1.441484 m2 -> rounded to 4 dp = 1.4415, x 2 = 2.8830   (printed 2.8830)
--   So MEASURE = round(per-piece m2, 4 dp) x quantity: the EXACT cut area, no over-measure, no minimum charge,
--   no size band. NET = MEASURE x RATE rounded to cents (3.0536 x 90.21 = 275.4653 -> 275.47). The sub-total is
--   the sum of the UNROUNDED nets (535.5407 -> 535.54), which is why 275.47 + 260.08 does not equal it to the
--   cent. That is their rounding, not a rule worth copying.
--
-- WHY THE ROW LOOKS LIKE THIS
-- -----------------------------------------------------------------------------------------------------------
--   * sheet_length and sheet_width are NULL ON PURPOSE. Mirror is not nested and no sheet is bought, so there is
--     no sheet size to hold. Together with material_type 'glass_cut_to_size' this is what keeps the glass out of
--     the whole-board sheet path.
--   * expected_yield_factor 1 and minimum_job_area 0: there is no waste to carry - the glazier cuts to size.
--   * area_cost 90.21 is EX GST, like every other captured price in material_pricing.
--   * THE ENGINE RESOLVES THIS ROW BY item_code ONLY (robeSliderDoors.GLASSTECH_MIRROR_ITEM_CODE), never by
--     name. The catalogue's only other "mirror" row is Laminex 'Mirror Smoke' (AU1003078), a decorative LAMINATE
--     at $273.73/m2 - three times the price of the glass. A name match would silently pick it. Do not rename
--     this row to something a name search would rank first, and do not add a name-based lookup.
--   * material_pricing has NO unique index on item_code and no check constraint on material_type, so the insert
--     is guarded by NOT EXISTS rather than ON CONFLICT, and the new material_type value is safe.
--
-- WHAT IS STILL NOT PRICED: the BACKER board behind a mirror robe leaf. A leaf is 4 mm of glass plus the rest of
-- a 16-18 mm build-up, and only the glass is priced here; the engine keeps the backer on the buyout list. Ben:
-- which board is the backer?
-- ============================================================================

insert into public.material_pricing (
  item_code, name, material_type, brand, finish, substrate, thickness,
  sheet_length, sheet_width, area_cost, expected_yield_factor, minimum_job_area,
  visibility_status, source_supplier, description,
  price_status, price_source, price_captured_at, price_unit, captured_unit_price
)
select
  'GT-MIR-4SVB',
  'Mirror 4mm Silver Vinylback Safety (cut to size)',
  'glass_cut_to_size',
  'Glasstech',
  'Silver vinylback safety',
  'Glass',
  4,
  null,                     -- cut to size by the glazier: there is no sheet to nest against
  null,
  90.21,                    -- $/m2 EX GST, Glasstech proforma 180617
  1,                        -- no waste: the supplier cuts to size
  0,
  'Available',
  'Glasstech',
  'Charged on the MEASURED cut area of each piece - round(w x h in m2, 4 dp) x qty x rate - never as a whole '
  || 'sheet. One of only two exceptions to Bower''s whole-board rule; the other is the toe-kick facing laminate. '
  || 'Seeded from Glasstech (QLD) Pty Ltd proforma 180617, 1 Sep 2026, ref "4MM MIRROR", for Bower Building: '
  || '2 x 2009 x 760 = 3.0536 m2 = $275.47 and 2 x 1991 x 724 = 2.8830 m2 = $260.08, sub-total $535.54 ex GST. '
  || 'The proforma carries NO supplier part number - this item_code is Bower''s own. Resolved by item_code only: '
  || 'a name match would find Laminex "Mirror Smoke" (AU1003078), a laminate at $273.73/m2.',
  'captured_raw_ex_gst',
  'Glasstech (QLD) Pty Ltd proforma invoice 180617, 1 Sep 2026 (ref 4MM MIRROR)',
  timestamptz '2026-09-01 10:30:34+10',
  'm2',
  90.21
where not exists (
  select 1 from public.material_pricing where item_code = 'GT-MIR-4SVB'
);

-- OPTIONAL. Nothing in the pricing engine reads the suppliers table - this is only so Glasstech appears where
-- ForestOne, Hafele, Laminex and Polytec already do. Check the real column list before running it.
--
-- insert into public.suppliers (name, category)
-- select 'Glasstech', 'glass'
-- where not exists (select 1 from public.suppliers where name = 'Glasstech');

-- CHECK AFTER APPLYING: this should return the two invoice lines to the cent.
--
--   select
--     round(round(2009 * 760 / 1000000.0, 4) * 2 * area_cost, 2) as two_2009x760,   -- expect 275.47
--     round(round(1991 * 724 / 1000000.0, 4) * 2 * area_cost, 2) as two_1991x724    -- expect 260.08
--   from public.material_pricing where item_code = 'GT-MIR-4SVB';
