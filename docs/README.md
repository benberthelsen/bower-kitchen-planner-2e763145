# Documentation index

This folder is the project's memory. It had grown to 39 documents with five
overlapping completion plans and no statement of which one was current, so a
new contributor (human or AI) would read a stale plan and act on it.

**Read this file first. It is the only document that says what is current.**

## Current

| Document | What it is |
|---|---|
| `ONE-SHOT-GREEN-PLAN-2026-07-30.md` | **The active backlog.** Declares itself the only one. Everything else planning-related is history. |
| `POLYGON-GEOMETRY-PLAN-2026-07-21.md` | Room geometry model. Slices 1 and 2 are implemented and verified; slice 3 (segment-native runs, contract v2) is not started. |
| `AI-ROOM-SCANNER-MASTER-PLAN.md` | Scanner architecture. Still the reference. |
| `ROOM-SCANNER-BUILD-RUNBOOK.md` | Scanner build/exit criteria. Note: the "confidence/warning badges" exit criterion is **not met**. |
| `PRICING_ENGINE.md` | Pricing architecture. |
| `reports/pricing-integrity-audit-2026-08-01/` | Most recent pricing audit — 14 fixed, 7 open. |
| `../audits/2026-08-08-live-planner/audit.md` | Most recent end-to-end audit of the live site. |

## Superseded — history only, do not action

These are kept because they record *why* decisions were made. They do not
describe the current state and must not be used as a task list.

- `PROJECT_AUDIT_AND_ROADMAP.md`, `GO-LIVE-BETA-PLAN.md`,
  `PLANNER-ROADMAP-2026-07-21.md`, `audits/2026-07-30/KITCHEN-PLANNER-COMPLETION-PLAN.md`
  — superseded in sequence by `ONE-SHOT-GREEN-PLAN-2026-07-30.md`, which says so explicitly.
- `PRE-LIVE-AUDIT-2026-07-16.md`, `HANDOVER-2026-07-14.md`, `HANDOVER.md`,
  `BUILD-REVIEW-2026-07-20.md`, `AI-PLANNER-REWORK-2026-07-20.md`,
  `WIZARD-UPGRADE-2026-07-20.md` — pre-date the July rework.
- `AI-ROOM-SCANNER-INTEGRATION-PLAN-v2.md` — the master plan §1 declares it
  superseded in full and warns its prompts are stale.
- `STEP3-AI-DESIGNER-BRIEF-V2.md`, `-V4.md` and the two brief reviews —
  superseded by the v5 handoff.
- `../RUN_THROUGH_REPORT.md` (root, 13 June) — generated from a synthetic
  fixture with Supabase unreachable. Superseded by the 1 August live audit.

## Known contradictions between docs and code

Recorded here so nobody re-discovers them:

- `AI-DESIGN-STUDIO-v5-HANDOFF.md` describes the Design Studio, but
  `src/lib/featureFlags.ts` keeps `designStudio` **off** in the live build.
  The README's old claim that this is "the current implementation" was wrong.
- Several docs predate `.github/workflows/ci.yml` and say there is no
  release gate. There is.
- `CODE-REVIEW-2026-07-21.md` flags two rules systems (`src/lib/designV2/`
  vs `src/lib/layout/rules.ts`). **Both still exist**, and `designV2` is
  CI-gated, which entrenches it. This remains the largest open cleanup decision.
