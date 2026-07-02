# WS9 — Legacy Dead-Code Removal

**Complexity: LOW (mechanical, needs care with imports) — small model fine.
DO NOT start until WS1 is merged** (the configurator work touches shared files)
and Ben signs off that the legacy routes are truly unused.
Repo: kitchen planner. Reference: docs/phase-1-architecture-note.md.

## Remove
- `src/pages/Index.tsx` (legacy consumer planner page)
- `src/pages/TradePlanner.tsx` (legacy shell — `/trade-planner` already
  redirects to `/trade/dashboard`)
- `src/store/PlannerContext.tsx` (deprecated context) and hooks/components
  ONLY it references (trace importers first: `grep -rn "PlannerContext" src`)
- `src/hooks/useExternalDesignSync.ts` + `src/components/SaveDesignDialog.tsx`
  (only used by the legacy pages)
- `src/integrations/external-supabase/` (already a shim over the main client)
- Legacy route aliases in `src/App.tsx` can stay as redirects.

## Method
1. `grep -rn` each candidate for importers; anything imported by LIVE code
   stays (move shared bits out first).
2. Delete in one commit per cluster; after each: tsc + `npm run
   test:functional` + `npm run test:snapping` (on Windows) + click through
   `/trade/dashboard`, planner, admin.
3. Update `docs/phase-1-architecture-note.md` to mark cleanup done.

## Acceptance
- No references to PlannerContext / externalSupabase remain.
- Bundle size drops (note before/after from `npm run build` output).
- All routes still resolve (legacy paths redirect).
