# Review of "Step 3 — AI Kitchen Designer" implementation brief (2026-07-23)

Reviewed against the live code (`src/pages/homeowner/steps/StepDesign.tsx`,
`Wizard.tsx`, `hooks/useAiDesigner.ts`, the `ai-designer` edge function, and
the designV2 pipeline), not just on its own terms. Verdict: **a strong brief —
keep it** — but it has one finding that is wrong, several contracts that don't
match the real code, and it misses the four most important platform-specific
risks. Corrections below, then recommended edits.

## 1. Confirmed correct — these findings are real (verified in code today)

- **#3 Raw AI errors exposed** — real: line 228 renders `({error})` verbatim.
- **#6 Unstable option identity** — real: `key={opt.name}` at line 195 and
  name-based selected test. `proposalId` exists on every option; use it.
- **#7 Stale refinement history** — real: `chatLog.slice(-6)` is read from the
  pre-update render; the new user message is never in the sent history.
- **#2 Refinement applied before local validation** — real, with nuance: the
  refined spec IS compiled+validated, but only *after* application (render
  memo + wizard gate). A blocking refined layout is applied, then flagged and
  blocks Continue — safe but jarring. Validate-before-apply is the right fix;
  the brief should note the current behaviour is "gated late", not "ungated".
- **#12 Accessibility** — real: zero `aria-` attributes in the component.
- **#13/#14 index keys / loadingLine reset** — real, minor.
- **§3.9 AR payload versioning** — agreed and worth adopting: the AR handoff
  shipped this week stores `{ items }` unversioned; the brief's
  `ViewArPayloadV1` (version + room + dimensions + finish) is better. Adopt,
  and have `ViewInRoomAr` reject payloads with an unknown version.

## 2. Wrong or already handled — correct these in the brief

- **#5 "Blocking errors are only displayed; the parent can continue" — WRONG.**
  `Wizard.tsx` derives `selectedDesignHasBlockingErrors` by independently
  recompiling and revalidating the active design (lines ~1293–1302) and
  `canAdvance` for step 3 requires a design with no blocking errors; step 5's
  submit is also disabled on blocking errors. The parent does NOT trust the
  child — it re-derives validity itself, which is *stronger* than what the
  brief asks for. The brief should document this as the required pattern
  rather than reporting it missing.
- **"Exactly three options" (§9) contradicts "up to three" (§2).** The engine
  legitimately returns 1–3 (candidates failing hard rules are dropped rather
  than shipped broken). Padding to exactly three would force showing worse
  designs. Resolve in favour of "1–3, cards explain when fewer" and drop the
  §7 requirement to "return three distinct options".
- **Analytics renames break funnel continuity.** The live events are
  `ai_refine_used`, etc. The brief renames to `ai_refine_requested/succeeded/
  failed`. Renaming orphans the existing funnel data — either keep current
  names or explicitly call out a migration; don't rename silently.

## 3. Missing — the platform-specific risks the brief doesn't know about

These are the highest-value additions; three of the four have already bitten
us in testing.

1. **Design-session revision protocol (biggest omission).** `refine()` in the
   real hook sends `session: sessionRef.current` — an authorised session with
   `briefRevision`/`designRevision` and a token, enforced server-side by the
   ai-designer's persistence layer. The brief's `refine()` contract omits it
   entirely. Consequence it therefore also misses: **regenerating options
   mid-conversation must clear the selected design, chat log and undo stack**,
   otherwise a refine can send a stale `proposalId` against a new session —
   this was release blocker 6.3, found and fixed this month. Add both: the
   session parameter in the contract, and "regenerate clears selection/chat/
   undo" to §3.2 and the acceptance criteria.
2. **The unified rules pipeline.** The brief specifies raw
   `validate()` + `severity === 'error'`. The platform's single pipeline is
   now `evaluateDesign()` (designV2): geometric validate PLUS the policy layer
   (stable KRN-* rule ids, concept/quote stages, regulatory `pending`).
   Step 3's gate should be `conceptBlocker` from `evaluateDesign`, so the
   wizard and any future quote gate can't diverge. Specifying bare `validate`
   re-entrenches the two-systems problem the codebase just fixed.
3. **Wall selection and style-first are product requirements.** The brief's
   inputs (§5) omit `brief.allowedWalls` (the customer chooses which walls
   carry cabinetry — the candidate generator skips strategies needing a
   disallowed wall) and treats style as a post-hoc merge (§6 item 10), when
   the product decision is style-first: style is chosen *before* generation
   and feeds `defaultSpecFor`/the AI brief. §3.1/§3.2 should list
   `allowedWalls` and style as generation inputs, and §6 item 10 resolves to:
   wizard style is authoritative by design; `restyle` (mode `'style'`, which
   the hook already exposes and the brief never mentions) is the AI path for
   style changes.
4. **`AiDesignOption` contract is wrong.** The real option (hooks/
   useAiDesigner.ts) also carries `items: PlacedItem[]` — the SERVER-compiled
   placements — and the server's violations. This matters architecturally:
   options render and gate from server-compiled output, and the client
   recompiles independently (untrusted-input principle, which §7 states but
   the interface contradicts). Also the real result type includes
   `changeSummary`, `unchanged`, `proposedRoomPatch`, `session`, and
   `modelTrace` — the brief's `AiDesignerResult` should match or say it's
   abridged. Same for `validate` returning `Violation[]` (not
   `LayoutViolation[]`) and `compileSpec` returning `CompiledDesign` with
   `notes` (which §3.4 uses but the contract omits).

## 4. Smaller improvements

- **§6 item 1 (stale default-design effect)**: valid; note the concrete fix —
  the wizard already remounts steps on key inputs elsewhere (RoomSetupWizard
  keying); recommend `key={shape + roomRevision}` style remount over adding
  effect dependencies, which risks clobbering a chosen AI design.
- **§6 item 9 / §3.7**: the wizard already routes `proposedRoomPatch` to
  step 1 as `pendingRoomPatch` for explicit review — the brief should state
  the surviving gap precisely: *invalidation of stale options/undo after the
  patch is accepted*, not the review flow itself.
- **§10 tests**: point them at the repo's actual harness — self-transpiling
  `.cjs` tests in `backups/` (`trade-ai.test.cjs`, `scanner-two-lane.test.cjs`
  pattern), since the sandbox/CI story has no jest wired yet; and add the 6.3
  regression (regenerate-then-refine) to the integration list.
- **§8 privacy**: add "never log the session token"; it's in the refine body.
- **Terminology**: "AR viewer" requirements should name the real route
  (`/wizard/view-ar`) and storage key, and inherit the Android-Chrome-only
  support envelope note so acceptance testing targets the right devices.

## 5. Suggested priority order for the fixes the brief motivates

1. Regenerate-clears-state + session in refine contract (correctness; 6.3
   class of bug). 2. Validate-before-apply on refinement + gate via
   `evaluateDesign().conceptBlocker`. 3. Stable option identity (`proposalId`
   keys). 4. Bounded-history fix (`nextChatLog` built once). 5. Customer-safe
   error copy (drop `({error})`). 6. Versioned AR payload. 7. Accessibility
   pass. 8. Analytics: keep names, add the missing AR events.
