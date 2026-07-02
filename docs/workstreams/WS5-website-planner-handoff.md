# WS5 — Website → Planner Handoff (Phases 1 + 3)

**Complexity: HIGH (cross-repo feature) — strong model. Do after WS6 function
deploys; both apps already share the Supabase project.**
Repos: BOTH (website `bower-cabinet-web-site` + planner).
Reference: website repo `docs/kitchen-planner-integration-plan.md` (the
`WebsitePlannerHandoff` contract is defined there) and planner
`docs/INTEGRATION_STATUS.md`.

## Phase 1 — the link (small)
On the website `/planner` page (`src/pages/PlannerPage.tsx`): a real "Open
Kitchen Planner" button → planner URL (env-configured:
`VITE_PLANNER_URL`, default `http://localhost:8080` in dev,
`https://planner.bowerbuilding.net` later) with query params
`source=website-planner&room=kitchen`. Keep quote/contact capture on the
website. Exit test: website → planner → back to /quote without dead ends.

## Phase 3 — starter-design handoff (the real work)
1. **Contract**: implement `WebsitePlannerHandoff` type in both repos
   (copy the shape from the integration plan; keep it identical).
2. **Website side**: the Design Scope Builder / flat-lay flow
   (`/showrooms/flat-lay`, `dreamweaverBridge.ts`) saves the user's selections
   as a scope lead row in Supabase (table exists? if not, add
   `planner_handoffs` migration: id, created_at, payload jsonb, lead contact
   fields, consumed_at). Button "Open in Kitchen Planner" → planner URL with
   `?handoff=<id>`.
3. **Planner side**: on `/trade/job/new?handoff=<id>` (and a public variant
   later), fetch the row, pre-fill the Room Setup Wizard: room type/name,
   dimensions if present, material defaults mapped by matching the handoff's
   material names/ids against `useMaterialsCatalog` (fall back to defaults +
   note). Mark handoff consumed. The wizard steps stay editable.
4. **Loop closure**: after job creation, write the job id back onto the
   handoff/lead row so admin Leads can link lead → job.

## Acceptance
- Pick materials in the website scope builder → Open in Planner → wizard
  arrives pre-filled → saved job appears in admin with the lead linked.
- No auth foot-guns: anonymous website users create leads via RLS-safe insert;
  the planner requires login before job creation (existing behaviour).
