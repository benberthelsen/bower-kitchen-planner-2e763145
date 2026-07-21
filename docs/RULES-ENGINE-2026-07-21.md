# Rules Engine + Blocker Completion — 2026-07-21

Working the roadmap in the agreed order. This batch closes the two remaining
release blockers (6.1, 6.4) and builds roadmap step 2 — the **relational rules
engine** — the highest value-per-risk step and the spine the rest hangs off.

## Blockers closed

### 6.1 — `toPlacedItems` now imported — FIXED
`src/hooks/useTradeRoomPricing.ts`: added `import { toPlacedItems } from
'@/lib/trade/cabinetPlacedItem'` (local binding) and changed line 110 to
`export { toPlacedItems };` (re-export the local binding). The two call sites
now resolve; the `tsc -p tsconfig.app.json` error and the runtime ReferenceError
are gone.

### 6.4 — enquiry/admin email hardened — FIXED (deploy-gated)
- `submit-planner-enquiry/index.ts`: **stopped deriving the admin link from the
  request `Origin`** — that field is now gone from the email payload.
- `send-email/index.ts`: added `escapeHtml()` (applied to every payload-derived
  value in all three templates — name, email, phone, address, shape, quote ref,
  total, job title, admin note) and `safeUrl()` (admin/track/job links must be
  http(s) on `bowercabinets.com` or they fall back to a safe default). The admin
  link now derives from `PLANNER_ADMIN_URL` (new optional env var; falls back to
  the hardcoded planner URL), host-restricted.
- Pure helpers verified in a Node harness against injection payloads: `<script>`,
  attribute breakouts, `javascript:`/`data:` URLs, and forged hosts
  (`bowercabinets.com.evil.com`) are all neutralised; legitimate bower hosts
  pass. Still dormant until Resend is configured; must ship before any
  lead-alert email / CRM push goes live. Edge functions can't run in the sandbox
  — `supabase functions deploy` on the host is authoritative.

## Roadmap step 2 — relational rules engine (`src/lib/layout/rules.ts`, NEW)

Every design check is now a declarative `Rule { id, tier, scope, title, why,
evaluate }`:

- **Tiers:** `hard` (invalid → candidate rejected → Violation 'error'), `safety`
  (real problem, require correction → 'warn'), `soft` (preference/ranking →
  'warn'). This is the taxonomy the roadmap asked for.
- **Scope:** `relational` (role/topology — survives the coming polygon change)
  vs `spatial` (queries coordinates — to be re-implemented on the room polygon
  in the geometry phase). The tag tells the geometry migration exactly which
  rules to revisit, so the rules engine can be built now without rework later.
- **Plain-language `why`** on every rule — the raw material for the roadmap's
  "explain this design" feature (#8), exposed via `ruleWhy(id)`.
- **`RULE_INDEX`** enumerates every rule (id/tier/scope/title) so coverage is
  countable — the 20-July defects hid precisely because no rule existed for
  them; silent gaps are now visible.

`validate()` is refactored to a thin adapter that runs `evaluateRules()` and
maps findings to the legacy `Violation` shape (hard→error, safety/soft→warn,
`code`=rule id). **Every caller is unchanged**, and the behaviour is identical:
the 18-check engine smoke passes 18/18 and the placement sweep is byte-for-byte
the same (2,774 candidates, 0 errors, 0 crashes).

Current registry: **21 rules — 10 hard, 8 safety, 3 soft; 10 spatial, 11
relational.** All the old checks, now tiered and explainable, plus two new
relational rules:
- `corner-integrity` (safety) — a corner cabinet must be a real blind/pie-cut
  corner with `blindSide` set (guards the 20-July corner fix from regression).
- `appliance-gap-fit` (safety) — the fridge space must be ≥ the nominated fridge
  width and the dishwasher opening ≥ 600 mm.

Both fire on genuine defects and are silent on well-formed designs (verified).

### Reserved (documented, not silent)
`RESERVED_RULE_IDS = ['sink-bowl-fit', 'run-end-panel', 'filler-complete',
'cutout-intersection']` — these need catalogue data (SKU/sink-bowl/appliance
dims), the resolved-segment stream, or the room polygon, so they land in the
catalogue/geometry phases rather than being faked now.

## Files changed

| File | Change |
|---|---|
| `src/hooks/useTradeRoomPricing.ts` | 6.1 import fix |
| `supabase/functions/submit-planner-enquiry/index.ts` | 6.4 — drop Origin-derived admin link |
| `supabase/functions/send-email/index.ts` | 6.4 — escapeHtml + safeUrl + env admin URL |
| `src/lib/layout/rules.ts` | NEW — rules engine (registry, tiers, scope, why, RULE_INDEX) |
| `src/lib/layout/validate.ts` | refactored to a thin adapter over the registry |
| `src/lib/layout/index.ts` | export the rules API |

Test artifacts (in `backups/`, reference — run against a transpiled engine):
`rules-engine.test.cjs` (17 checks), `email-security.test.cjs` (13 checks).
Recommend wiring `rules-engine` as an `npm run test:rules` script next to
`test:layout`/`test:candidates` so the sweep/CI enforce rule coverage.

## Verification

- Engine typecheck (excl. zod `schemas.ts`, which needs node_modules): 0 errors.
- 18-check behavioural smoke: 18/18.
- Placement mini-sweep: 2,774 candidates, 0 errors, 0 crashes (unchanged).
- Rules integrity + behaviour: 17/17.
- Email security helpers: 13/13.
- **Host, authoritative:** `npx tsc -p tsconfig.app.json --noEmit` (now clean of
  6.1 too), `npm run ai:sweep`, `npm run ai:sync-shared`, then commit + deploy
  (front end via push; 6.4 edge functions via `deploy-planner-functions.ps1`).

## Where this leaves the roadmap

Done: blockers (6.1/6.4/6.2/6.3/6.5-gated) + step 2 relational rules. **Next up
is step 3 — authoritative room polygon geometry** (replaces the 6.5 gate, and
the spatial rules above get re-implemented against it), then the spatial-rule
upgrade, scanner confirmation, and catalogue/BOM. The `scope: 'spatial'` tags
are the worklist for the geometry phase.
