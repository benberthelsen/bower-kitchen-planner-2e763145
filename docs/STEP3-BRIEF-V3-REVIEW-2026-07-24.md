# Review of "Compatibility Brief v3" (2026-07-24)

v3 is a competent audit — **of the wrong tree**. It states it was verified
against GitHub `main` (`bower-kitchen-planner-2e763145`). But the working
tree on Ben's machine carries a large uncommitted batch (AR viewer + route +
button, scanner two-lane + hidden-corner, rules unification usage, `.cjs`
regression tests). Several of v3's "verified gaps" describe main's lag, not
missing work. **Do not act on v3's gap table until git is reconciled.**

## 1. The systemic problem: two diverging sources of truth

Evidence gathered today from the device (metadata is authoritative; the
bridge's file mount intermittently serves stale content):

- `src/pages/homeowner/ViewInRoomAr.tsx` **exists on disk** (9,878 bytes,
  modified today) while v3 asserts "no viewer exists".
- `src/App.tsx` on disk is 7,869 bytes — the pre-AR version was 7,665 and the
  route+lazy-import addition is ~200 bytes, so the routed version is almost
  certainly what's on disk.
- The `backups/*.cjs` regression tests v3 says "the repository does not use"
  exist on disk (`trade-ai.test.cjs`, `scanner-two-lane.test.cjs`, the
  polygon/rules/L-shape suites) — they are simply not on main yet.

Meanwhile main appears to carry changes the disk may not (v3 reports Style
at step 3 / Design at step 4; the disk Wizard read this week rendered Design
at step 3 / Style at step 4). Two agents are editing two trees. One
overwrite has possibly already occurred (StepDesign changed shape twice this
week). **First action, before any brief is "the" brief: on the PC run
`git status` + `git diff origin/main`, commit or stash the working batch,
pull, and resolve deliberately.** If main really moved Style before Design,
note that implements the style-first product decision — keep it, but merge
it consciously, don't discover it by accident.

## 2. v3 claims checked against the code

- **"Generate mode requires exactly three validated options" — WRONG**
  (verified byte-exact against `supabase/functions/ai-designer/index.ts`):
  generation fails only when `options.length === 0` (502 "No valid design
  produced"); the only `!== 3` in the file validates U-shape wall count. v3
  is also internally inconsistent: §2/§9 demand exactly three while its own
  §7 still says "return 1–3". Keep v2's rule: 1–3 options, honest copy when
  fewer, never pad with designs that failed hard rules.
- **Step-numbering note — unverifiable/suspect.** Contradicts the disk
  Wizard. Resolve via git reconciliation, then renumber docs once, not per
  brief.
- **"AR entirely outstanding" / "no .cjs tests" — wrong against the disk**
  (see §1). True against main only.

## 3. What v3 genuinely improves — keep these in v4

1. **The style-IDs gap (§2) is real and well spotted.** `buildBrief()` does
   not carry finishId/benchtopId/handleId; only optional `styleWords` reaches
   the AI; the wizard style is applied as a client overlay. v3's either/or is
   the right frame; resolve it the product way: **add the three style IDs to
   the generation contract** (style-first is a product decision — the AI
   should know the finish family when choosing layouts), keeping the client
   overlay as the authority on display.
2. **IME safety made concrete** (`nativeEvent.isComposing`) — better than
   v2's prose.
3. **Session-token wording** — v3's version is more accurate: the token
   necessarily exists client-side inside `useAiDesigner`; the requirement is
   that it never escapes the hook (components, UI, analytics, logs).
4. **Room-patch analysis sharpened** — correct observation that `StepDesign`
   unmounting discards local state naturally, and the surviving bug is
   parent-owned `state.design` (stale `proposalId`) plus session
   invalidation on room revision. Crisper than v2; adopt.
5. **§3.3 server-items clarification** — client compilation is authoritative
   for render + gating; server `items` are diagnostic (engine-drift
   detection). Good resolution of an ambiguity v2 left open.
6. **`typecheck` npm script** — yes; `ship-verify.ps1` already runs
   `tsc -p tsconfig.app.json --noEmit`, wiring it as `npm run typecheck` is
   strictly better.

## 4. What v3 lost from v2 that must come back

- The **1–3 options** service rule (v3 flipped §2/§9 to exactly-three on a
  false verification).
- The AR handoff as **built-and-uncommitted work to reconcile**, not
  greenfield "implement all three before claiming support".
- The test plan should be **union, not replacement**: the `.mjs` smoke
  scripts v3 lists AND the `.cjs` self-transpiling regression suites on
  disk; wiring both under `npm run test:*` names.

## 5. Verdict and next step

v3 ≠ supersedes v2; it's a main-branch compatibility report containing four
genuine improvements (§3) and three false gaps caused by auditing a stale
branch (§2). Recommended path: **(1)** reconcile git on the PC — commit the
working batch, pull main, merge deliberately; **(2)** then cut a v4 brief =
v2 + v3's §3 items, with the option-count rule restored to 1–3 and the gap
table re-verified against the merged tree. Cutting v4 before the merge just
produces a third document that's wrong about something.
