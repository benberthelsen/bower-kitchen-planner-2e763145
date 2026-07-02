# WS7 — Admin & Reporting Polish

**Complexity: LOW — small model fine.**
Repo: kitchen planner. Independent.

## Tasks
1. **JobDetail counts/prices** (`src/pages/admin/JobDetail.tsx`):
   header shows "1 room, 0 cabinets" while the table lists 2 cabinets — the
   count reads a different field than the table (check `allCabinets` memo vs
   the header's source). Also ensure per-cabinet Sell Price column falls back
   to the room snapshot's perCabinetTotals AND handles cabinets added after
   the last snapshot (show "pending" rather than "—").
2. **Verify admin pages against unified DB**: Reports, Analytics (funnel
   events now insertable), Leads, Customers, Product Visibility — click
   through, fix any query/typing breaks (tables all exist now).
3. **Blank first-load on /admin**: reproduce (hard refresh, cold navigation).
   Likely a lazy-loaded chunk or auth-gate race in `AdminLayout`. Add a
   suspense fallback/spinner so it never renders white.
4. **Admin Jobs list**: confirm Cost column now populates for new jobs (cost
   persistence landed); backfill note: old jobs show $0 until re-opened in the
   planner — acceptable, document in the UI tooltip if trivial.

## Acceptance
- JobDetail header counts match the table; no "—" prices for placed cabinets.
- Every admin nav item renders data or a designed empty state — zero console
  errors on a full click-through.
- tsc clean, functional test passes.
