# Step 3 — AI Kitchen Designer · Implementation Brief v2 (2026-07-23)

Supersedes the v1 brief. Same intent, corrected against the live codebase
(`src/pages/homeowner/steps/StepDesign.tsx`, `Wizard.tsx`,
`hooks/useAiDesigner.ts`, `supabase/functions/ai-designer`, `src/lib/layout`,
`src/lib/designV2`). Changes from v1 are marked ⟲.

## 1. Purpose

Step 3 lets the customer generate, compare, preview and refine kitchen
layouts, and view the chosen design life-size in AR. The step must remain
fully usable when the AI service is unavailable: a deterministic Standard
layout is created on entry and is the fallback for every AI failure.

⟲ Two principles v1 implied but didn't state:

- **The AI proposes; the engine decides.** Every specification — default,
  generated or refined — is compiled and validated by the deterministic
  engine before it can gate anything. AI output is untrusted input.
- **One rules pipeline.** Gating uses `evaluateDesign()` (designV2), which
  wraps `validate()` and adds stable rule ids, concept/quote stages and
  regulatory `pending`. Components must not hand-roll
  `severity === 'error'` checks against raw `validate()` output.

## 2. Customer experience

### Standard path

1. Enter the step → deterministic **Standard layout** appears immediately.
2. **Design my kitchen with AI** → ⟲ **one to three** named options (the
   engine drops candidates that fail hard rules rather than shipping them;
   when fewer than three return, the UI says so plainly — never pad).
3. Each card: name · short rationale · AUD price band · warning count ·
   if blocked, the first blocking error and a disabled state.
4. Selecting a valid option shows it in the 3D preview with a chat refine
   bar ("move the sink under the window", "more drawers") and Undo.
5. ⟲ **See it in your room (AR)** opens `/wizard/view-ar` (Android Chrome;
   two-tap anchoring; same support envelope as the quick scan).

### Inputs to generation ⟲ (missing from v1)

Generation consumes the full brief, including two product-level decisions:

- **Style-first**: finish/benchtop/handle are chosen *before* generation and
  are inputs to `defaultSpecFor` and the AI brief. Wizard style is
  authoritative; an AI design never overrides it. AI-driven style change goes
  through the hook's `restyle` (mode `'style'`), not refine.
- **Wall selection**: `brief.allowedWalls` (customer picks which walls carry
  cabinetry). The candidate generator skips strategies needing a disallowed
  wall; omitted/empty = engine decides.

### AI failure path

Keep the current design; show customer-safe copy only (see §6); never leave
the step blank; never block wizard progress on an AI outage.

## 3. Functional requirements

### 3.1 Default design

As v1: create once per entry when no saved design exists, from brief + shape
+ style; `{ name: 'Standard layout', spec, aiGenerated: false }`; never
overwrite a saved design; same compile/validate/price/preview pipeline as AI
output. ⟲ Staleness fix: remount the step on a key derived from shape and
room revision (the wizard already uses key-remount for the room wizard)
rather than widening effect dependencies, which risks clobbering a chosen AI
design mid-step.

### 3.2 AI generation

As v1 (analytics, rotating progress copy, retain design on failure), plus ⟲:

- **Regenerating options clears the selected design, chat log and undo
  stack.** A refine against a pre-regeneration `proposalId`/session is the
  6.3 class of bug (shipped once, fixed 2026-07); the acceptance tests must
  cover regenerate-then-refine explicitly.
- Progress copy is illustrative and must not claim a check has passed.
- ⟲ Keep the existing analytics event names (`ai_generate_requested`,
  `ai_generate_succeeded`, `ai_generate_failed`, `ai_option_selected`,
  `ai_refine_used`). Renaming orphans the live funnel; add new events, don't
  rename old ones.

### 3.3 Option cards

⟲ Real contract (from `hooks/useAiDesigner.ts` — v1 omitted `items`):

```ts
interface AiDesignOption {
  proposalId: string;          // stable identity — React key + selected test
  name: string;
  spec: KitchenSpec;
  items: PlacedItem[];         // SERVER-compiled placements (render these)
  priceBand: { lowAud: number; highAud: number };
  violations: Violation[];     // server-side validation of this option
  rationale: string;
}
```

Rules: disable on any blocking violation, showing the first message; show
warning count; key and highlight by `proposalId` (never `name`); push the
current design onto undo before replacing.

### 3.4 Compilation, validation and gating

Client recompiles independently of the server (untrusted input):

```ts
const compiled = compileSpec(activeSpec, brief.room);   // CompiledDesign
const evald = evaluateDesign(compiled, brief.room, brief, activeSpec); // ⟲
```

- Gate on `evald.conceptBlocker` (not raw severity filtering).
- `evald.violations` keeps back-compat for warning display; merge with
  `compiled.notes`, dedupe.
- ⟲ v1's finding that "the parent can continue past blocking errors" was
  wrong: `Wizard.tsx` independently recompiles/revalidates the active design
  for `canAdvance` (step 3) and the final submit. **Keep that pattern** —
  the parent derives validity itself and must not trust the child — and
  migrate the parent's check to `evaluateDesign` in the same change.

### 3.5 3D preview

As v1 (Suspense + error boundary, closed doors, no selection, header shows
name + price band). No changes.

### 3.6 Refinement chat

⟲ Real contract — v1 omitted the session, which is the piece that makes
refinement safe:

```ts
refine(brief, shape, currentSpec, currentProposalId, message, history)
// hook internally sends session: { id, token, briefRevision, designRevision }
```

Requirements as v1 (trim/reject empty, IME-safe Enter, no double-submit,
bounded history), plus ⟲:

1. Build `nextChatLog` once; set state from it AND pass its tail to the
   request, so the just-typed message is in the sent history exactly once
   (v1 correctly spotted this; this is the concrete fix).
2. **Validate before apply**: compile + `evaluateDesign` the returned spec;
   if it has a concept blocker, reject it with an assistant message and keep
   the current design. (Today the app applies-then-gates — safe but jarring.)
3. Never log or send the session token anywhere client-side.
4. `unchanged: true` results append the summary without touching the design
   or undo stack.

### 3.7 Proposed room changes

As v1 (never silently applied; parent reviews). ⟲ The wizard already routes
`proposedRoomPatch` to step 1 as `pendingRoomPatch`; the outstanding work is
precisely: after the patch is **accepted**, clear options, proposalId, chat
and undo (stale against the new geometry) and prompt to regenerate.

### 3.8 Undo

As v1 (cap 10, push before apply, restore+pop, disabled while loading, chat
confirmation). ⟲ Resolve v1's open question: room, shape or regeneration
changes clear the undo history; style changes do not (style is orthogonal —
it overlays the spec and previous designs remain valid under it).

### 3.9 AR handoff

⟲ Versioned payload (v1's recommendation, adopted; current code stores bare
`{ items }` — upgrade it):

```ts
interface ViewArPayloadV1 {
  version: 1;
  items: PlacedItem[];              // compiled items driving the preview
  room: RoomSpec;
  globalDimensions: GlobalDimensions;
  finishId: string;
  benchtopId: string;
}
```

Store under `bower.viewArPayload`; navigate to `/wizard/view-ar` only after
storage succeeds; on failure show a toast and stay. The viewer rejects
unknown versions with friendly copy. Note the support envelope: WebXR =
Android Chrome; iOS falls back to the in-planner 3D preview.

## 4. State model

As v1's table, with ⟲ `design` owned by the parent, `loading`/`error` from
the hook, and one addition: the hook's design-session ref is internal to
`useAiDesigner` — components never touch it directly.

## 5. Interfaces

v1's `StepDesignProps` and `WizardDesign` stand. ⟲ Type-name corrections so
the brief matches the code: `Violation` (not `LayoutViolation`),
`CompiledDesign` with `notes: string[]` (not `CompiledKitchen`),
`AiDesignResult` additionally carries `changeSummary?`, `unchanged?`,
`proposedRoomPatch?`, `session?`, `modelTrace?`.

## 6. Error copy

Log technical detail through diagnostics only. Customers see: "The AI
designer is unavailable right now — you can keep going with the standard
layout." Never render the raw hook error string (today's `({error})` line
must go).

## 7. Service-side requirements

As v1 (authenticate, validate payloads, size/rate limits — `edge_rate_limits`
is live —, versioned JSON, stable proposal ids, unchanged-vs-failed
distinction, room patches separate, never sole validation authority, safe
error codes), with two ⟲ corrections: return **1–3** options, not exactly
three; and enforce the session revision protocol on refine (reject stale
`briefRevision`/`designRevision` — already implemented server-side; the brief
documents it as a requirement, not an accident).

## 8. Analytics

Keep existing names; add `ar_opened { payloadVersion }` and
`ar_open_failed { safeCode }`, and `ai_regenerated { clearedState: true }`.
Never send chat text, tokens, addresses or other personal data.

## 9. Acceptance criteria (delta from v1)

All v1 criteria stand except: "exactly three options" → **"one to three
options, with honest copy when fewer"**. Add:

- [ ] Regenerating options clears selection, chat and undo (6.3 regression).
- [ ] Refine result with a concept blocker is rejected before application.
- [ ] Gating (child and parent) runs through `evaluateDesign`, one pipeline.
- [ ] `allowedWalls` and style reach the generation request.
- [ ] AR payload is versioned; unknown versions rejected with friendly copy.
- [ ] Session token never appears in logs, analytics or error copy.

## 10. Test plan (adjusted to the real harness)

Unit/integration tests follow the repo's self-transpiling `.cjs` pattern in
`backups/` (no jest wired yet): default-design determinism, option gating,
`nextChatLog` bounding, undo cap/order, AR payload versioning, safe error
mapping, **regenerate-then-refine**, unchanged refinement, invalid refined
spec, room-patch acceptance clearing state. E2E (manual until Playwright is
wired): standard-only path; generate→select→refine→undo→continue; AI outage;
AR route on an Android phone; keyboard/screen-reader pass.

## 11. Definition of done

v1's list, plus: one rules pipeline end to end, regenerate clears state,
refinements validated before application, versioned AR payload, existing
analytics names preserved.
