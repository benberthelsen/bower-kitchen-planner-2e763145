# AI Kitchen Designer · Implementation Brief v4 (2026-07-24)

**Repository:** `github.com/benberthelsen/bower-kitchen-planner-2e763145`
(branch `main`), working tree `C:\Users\bench\Claude\Projects\kitchen online
planner\bower-kitchen-planner`.
**Key files:** `src/pages/homeowner/steps/StepDesign.tsx` ·
`src/pages/homeowner/Wizard.tsx` · `src/hooks/useAiDesigner.ts` ·
`supabase/functions/ai-designer/index.ts` · `src/lib/layout` ·
`src/lib/designV2` · `src/pages/homeowner/ViewInRoomAr.tsx`.

Supersedes v1–v3 (this is v4.4 — gap table largely CLOSED; see §10). **The trees are MERGED**: commit `d3d19d1`
("Scanner two-lane + hidden corner, AR kitchen viewer, Step3 brief fixes,
docs", 2026-07-24) landed on `main` with no conflicts. `main` and the
working tree are now one source of truth; all statements below were
re-verified against post-merge `main`.

> **Reconciliation complete** (d3d19d1). One residue: `backups/` is
> gitignored (it holds CRM database dumps), so the `.cjs` regression suites
> exist only on the Windows machine. Move them to a tracked `tests/` folder
> before wiring any CI.

## 1. Principles

- **The AI proposes; the engine decides.** Every spec — default, generated,
  refined — is compiled and validated deterministically before it gates
  anything. AI output is untrusted input.
- **One rules pipeline.** Gate on `evaluateDesign()` (designV2) →
  `conceptBlocker`; never hand-roll `severity === 'error'` against raw
  `validate()`.
- **Client is authoritative.** The client recompiles `opt.spec` locally and
  renders/gates its own compilation. Server `items` are diagnostic only
  (engine-version drift detection).

## 2. Customer experience

1. Enter the Design stage → deterministic **Standard layout** immediately.
2. **Design my kitchen with AI** → named options. **RESOLVED (verified on
   merged `main`):** the prompt instructs the model to produce and finalize
   3 distinct options, but the function ships whatever validates and fails
   only at zero (`options.length === 0 → 502`) — so the effective contract
   is **"aim for 3, ship 1–3"**. The UI must handle 1–3 gracefully (honest
   copy when fewer); generation failure falls back to the Standard layout.
3. Cards: name · rationale · AUD price band · warning count · first blocking
   error + disabled state when blocked. Key/highlight by `proposalId`.
4. Selection → 3D preview + chat refine + Undo.
5. **See it in your room (AR)** → `/wizard/view-ar` (Android Chrome;
   two-tap anchoring; iOS falls back to the in-planner 3D preview). On
   `main` as of d3d19d1: viewer, route and StepDesign button all live.

**Wizard numbering:** verified `main` renders Style at internal step 3 and
Design at step 4. Refer to it as the **Design stage** in product copy, but use
step 4 in code and tests until a deliberate flow change is merged.

## 3. Inputs to generation

- **Style-first (contract change required):** finish/benchtop/handle are
  chosen before generation, but `buildBrief()` currently omits the three
  style IDs — only free-text `styleWords` reaches the AI, and the client
  overlays wizard style afterwards. **Add `styleIds: { finishId, benchtopId,
  handleId }` to the generation payload** so the AI knows the finish family
  when choosing layouts; the client overlay remains authoritative on
  display.
- **Wall selection:** `brief.allowedWalls` — the candidate generator skips
  strategies needing a disallowed wall; omitted/empty = engine decides.

## 4. Functional requirements

### 4.1 Default design
Create once per entry when no saved design exists (brief + shape + style →
`{ name: 'Standard layout', spec, aiGenerated: false }`); never overwrite a
saved design; same compile/validate/price/preview pipeline as AI output.
Staleness: remount the stage keyed on shape + room revision rather than
widening effect deps.

### 4.2 Generation
Existing analytics names stay (`ai_generate_requested/succeeded/failed`,
`ai_option_selected`, `ai_refine_used`) — add events, never rename.
**Regenerating restores a fresh Standard layout and clears chat and undo**
(the 6.3 regression class — test regenerate-then-refine explicitly). This is
safer than setting the design to `null`, because the mount-only default effect
would not immediately recreate it. Progress copy is illustrative and must not
claim a check passed.

### 4.3 Option cards — real contract (`useAiDesigner.ts`)
```ts
interface AiDesignOption {
  proposalId: string;   // stable identity — React key + selected test
  name: string;
  spec: KitchenSpec;
  items: PlacedItem[];  // server-compiled; diagnostic only (see §1)
  priceBand: { lowAud: number; highAud: number };
  violations: Violation[];
  rationale: string;
}
```
Disable on any blocking violation showing the first message; show warning
count; push current design onto undo before replacing.

### 4.4 Compile / validate / gate
```ts
const compiled = compileSpec(activeSpec, brief.room);           // CompiledDesign
const evald = evaluateDesign(compiled, brief.room, brief, activeSpec);
```
Gate on `evald.conceptBlocker`; warnings = `evald.violations` (warn tier)
merged with `compiled.notes`, deduped. **Migration:** `StepDesign`,
`Wizard` navigation gating and Review all still call `validate()` directly —
move all three to `evaluateDesign` in one change. Keep the wizard's
defence-in-depth (parent independently recompiles the active design for
`canAdvance` and submit) — that pattern is required, just via the unified
pipeline.

### 4.5 Refinement chat
```ts
refine(brief, shape, currentSpec, currentProposalId, message, history)
// hook internally sends session: { id, token, briefRevision, designRevision }
```
Trim/reject empty; Enter submits but not during IME composition (check
`nativeEvent.isComposing`); no double-submit while loading. Build
`nextChatLog` once — set state from it AND send its bounded tail, so the
just-typed message is in the history exactly once. **Validate before
apply**: compile + `evaluateDesign` the returned spec; concept blocker →
reject with an assistant message, keep the current design. `unchanged: true`
→ append summary only. The session token necessarily exists inside
`useAiDesigner`; it must never escape the hook (components, UI, analytics,
logs).

### 4.6 Proposed room changes
Never applied silently; routed to Room review as `pendingRoomPatch` (built).
Outstanding: on acceptance, parent-owned `state.design` (and its stale
`proposalId`) survives — reset it to a fresh Standard layout or clear it,
and invalidate the AI session on room revision.

### 4.7 Undo
Cap 10; push before every apply; restore+pop; disabled while loading or
empty; chat confirmation. Room/shape/regeneration changes clear history;
style changes don't (style overlays the spec).

### 4.8 AR handoff
```ts
interface ViewArPayloadV1 {
  version: 1;
  items: PlacedItem[];
  room: RoomSpec;
  globalDimensions: GlobalDimensions;
  finishId: string;
  benchtopId: string;
}
```
Store under `bower.viewArPayload`; navigate only after storage succeeds;
failure → toast, stay. Viewer rejects unknown versions with friendly copy.
Status: on `main` (d3d19d1); currently stores bare `{ items }` — upgrading
to the versioned payload above is open work under this brief.

## 5. Service-side (`ai-designer` edge function)
Authenticate; validate payloads; size + rate limits (`edge_rate_limits`
live); versioned JSON; stable proposal ids; exactly three generation options
on the current contract; unchanged ≠ failed;
room patches separate from cabinet changes; session revision protocol on
refine (reject stale `briefRevision`/`designRevision`); never the sole
validation authority; customer-safe error codes (raw detail server-side
only — the client's `({error})` render must go).

## 6. Analytics & privacy
Keep existing names; add `ar_opened { payloadVersion }`,
`ar_open_failed { safeCode }`, `ai_regenerated { clearedState: true }`.
Never send chat text, tokens, addresses or personal data.

## 7. Acceptance criteria
- [ ] Standard layout appears with no AI request; never overwritten on entry.
- [ ] Generation yields exactly three distinct validated options; failure →
      safe fallback copy.
- [ ] Blocked options unselectable; identity/keys by `proposalId`.
- [ ] Regenerate clears selection, chat, undo (6.3 regression test).
- [ ] Refine result with a concept blocker is rejected before application.
- [ ] Child and parent both gate via `evaluateDesign` (one pipeline).
- [ ] `allowedWalls` and `styleIds` reach generation per §3.
- [ ] Bounded history contains the just-typed message exactly once.
- [ ] Enter is IME-safe; no double submit.
- [ ] AR payload versioned; unknown version → friendly rejection.
- [ ] Session token never in UI, logs, or analytics; raw errors never shown.
- [ ] Accessibility: names on icon buttons, selection state exposed,
      `aria-live` status, disabled reasons available to AT.

## 8. Tests & build
Verified `main` exposes the `.mjs` smoke suites through `package.json`.
The self-transpiling `.cjs` suites under `backups/` are device-verified in
the working tree; wire them into CI once the batch is committed.

Run the verified checks:

```bash
npm run lint
npm run build
npm run test:layout
npm run test:design-contracts
npm run test:candidates
npm run test:rules
npm run test:designer-persistence
```

Add `"typecheck": "tsc --noEmit -p tsconfig.app.json"` and run it in the
ship-verification workflow. Focused tests: default-design determinism,
`proposalId` identity,
`nextChatLog` bounding, undo order, regenerate-then-refine, unchanged
refinement, blocked-refinement rejection, room-patch acceptance reset, safe
error mapping, AR payload versioning. E2E manual until a browser harness
lands: standard-only; generate→select→refine→undo→continue; AI outage;
keyboard/screen-reader; AR on a supported Android device.

## 9. Definition of done
Deterministic design always present; three validated generation options;
refinements
validated before application; regenerate clears state; room changes require
approval and reset stale design/session; one rules pipeline end to end;
versioned AR payload; 3D/AR fail safely; safe error copy; analytics names
preserved; accessibility + tests above.

## 10. Gap table (split by tree — re-verify after the git merge)

| Gap | Where verified | Status |
| --- | --- | --- |
| Raw `({error})` rendered | — | **DONE** (d3d19d1) |
| `key={opt.name}` identity | — | **DONE** (d3d19d1) |
| Stale `chatLog.slice(-6)` history | — | **DONE** (d3d19d1) |
| Apply-then-gate refinement | — | **DONE** (this batch: evaluateDesign before apply) |
| No `aria-` attributes | — | **DONE** basics (d3d19d1); full AT pass open |
| `validate()` in 3 callers | — | **DONE** (this batch: StepDesign, canAdvance, Review) |
| `styleIds` absent from payload | — | **DONE** (this batch: type+schema+buildBrief+prompt; redeploy ai-designer after ai:sync-shared) |
| Room-patch leaves stale `state.design` | — | **DONE** (this batch: cleared on acceptance) |
| AR payload | — | **DONE** (this batch: versioned writer + reader, legacy accepted) |
| AR button/route/viewer | on `main` (d3d19d1) | done |
| `.cjs` tests | — | **DONE** (this batch: `tests/` + `npm run test:trade-ai`/`test:scanner`/`typecheck`) |
| Wizard step order | Style 3 / Design 4 on verified `main` | keep unless deliberately changed |
| Generation count | resolved: aim-for-3, ship-1–3 | UI handles 1–3 |
