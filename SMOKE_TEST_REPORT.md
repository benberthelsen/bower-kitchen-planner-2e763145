# Smoke Test Report — 2 July 2026

Full walkthrough as admin and as trade end user: new job → L-shaped room wizard → planner → cabinets → drawer heights → quote → submit for approval → admin review queue.

## What works well

The full order loop completes: create job, configure room (shape/materials/hardware/dimensions/gaps), place cabinets with wall snapping and live dimension lines, edit drawer front heights, save, submit for approval, and the job lands in the admin review queue as Pending (#341, "1 Pending Review" chip). Live per-cabinet pricing responds to edits. The new dimension presets dropdown (#17) and drawer-front height editor (#20) both function, and custom drawer heights (100/250/385) render correctly in 3D. Corner cabinets show proper L-shaped footprints with no phantom geometry (#8 fix confirmed). Hinge/runner defaults are series-grouped (#1 fix confirmed). The 2D dimensions diagram in the wizard (#2) and gap summary (#3) look good.

## Bugs found (highest impact first)

1. **Three different job totals shown simultaneously.** For the same 2-cabinet room: planner toolbar Est. Total **$2,162.45**, cabinet list panel Est. Total **$1,965.87**, job page Quote State **$1,016.40** (Subtotal $924.00 + GST). One pricing source of truth is needed; the toolbar also doesn't refresh after cabinet edits (only after adds/view switches).
2. **Job cost not persisted.** Admin Jobs list and dashboard show **$0** for every job, including the freshly submitted #341 ($1,016.40). `jobs.cost_incl_tax`/`cost_excl_tax` apparently never get written on save/submit.
3. **"Browse Colours" buttons do nothing** (wizard Materials step, both Exterior and Carcase). No dialog, no error. The dropdown pickers work, so this is the only path to visual colour browsing.
4. **Pending DB migrations.** `benchtop_pricing` (admin page shows "Failed to load"), `dimension_presets` (preset save fails; wizard uses built-in fallbacks), `job_notes` (notes never persist), `funnel_events`, `supplier_feeds` are all missing from the live Supabase. Apply the migrations in `supabase/migrations/` dated 20260616–20260702.
5. **"2D View" toggle shows an eye-level 3D walkthrough view**, not a top-down 2D plan.
6. **No obvious camera orbit.** Left-drag on empty canvas doesn't rotate the view, so you can't easily look at cabinet fronts (couldn't visually verify corner pie-cut doors because of this). If orbit is right-drag/middle-drag only, it needs a hint; ideally add view preset buttons (Front/Top/Corner).
7. **Corner cabinets don't snap into a corner** when added — they land mid-wall like standard cabinets, rotated 0°, with the pie-cut face against the wall.
8. **Trade job page header shows the raw UUID** ("Job #e81e80b9-…") even though the job has a friendly number (#341, visible in admin).
9. **First navigation to /admin rendered a blank page** (fine after refresh). Likely a lazy-load/mount hiccup worth a look in AdminLayout.

## Cosmetic / hard-to-use

- "1 quote **have** been idle" → "has" (trade dashboard); "At-risk value: $0" reads oddly when the value is unknown.
- Notes composer says "⌘Enter to send" on Windows — should be Ctrl+Enter (platform detection).
- Scene dimension labels (e.g. "1400") bleed through on top of the cabinet edit dialog (z-index).
- Catalog thumbnails are inconsistent — some line-art plan icons, some grey 3D renders, changing between visits.
- Drawer-front height editor: fixed mid-test — typed values were being re-normalised on each keystroke (committed: raw values now stick, with a scale-to-fit note).

## Suggested next steps

Apply the pending migrations first (unblocks benchtops, presets, notes, feeds, analytics), then fix the pricing single-source-of-truth + cost persistence pair — they're the credibility issues a customer would notice. Then Browse Colours, then planner camera/2D view.
