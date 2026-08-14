# Bower Kitchen Planner

Bower's homeowner and trade kitchen-planning application. It combines measured
room capture, deterministic professional layout rules, Microvellum-backed
cabinet products, editable 3D designs, indicative pricing and an AI-assisted
Design Studio.

The repository and GitHub history are the source of truth. Production is hosted
on Cloudflare Pages, built from `main`.

The repo is also connected to a Lovable project, which two-way-syncs `main` and
publishes its own preview at `bower-plan-precise.lovable.app`. As of 14 August
2026 the Lovable agent is not used to author code — changes are written and
reviewed in this repository. Anything committed from the Lovable chat lands
directly on `main` and reaches production without review.

## Live services

- Planner: <https://planner.bowercabinets.com>
- Public website: <https://www.bowercabinets.com>
- Source: <https://github.com/benberthelsen/bower-kitchen-planner-2e763145>
- AI designer backend: Supabase Edge Function `ai-designer`

Cloudflare Pages builds the planner from the `main` branch. The Supabase Edge
Function is deployed separately so its copy of the shared layout engine must be
kept in sync.

## Local development

Requires Node.js 20 and npm.

```powershell
npm ci
npm run dev
```

For the unified Design Studio and local AI test harness:

```powershell
npm run dev:design-studio
```

To exercise a real model locally, copy `.env.design-studio.local.example` to
`.env.design-studio.local`, add the private server-side key, and restart the
preview. Never put provider keys in a `VITE_*` variable or commit the local
file.

## Validation

```powershell
npm run test:ci
npm run build:design-studio
```

The release suite covers the layout engine, Design Studio, 200 synthetic
customer journeys, editor geometry, pricing, room-scan contracts, trade
handoff, rendering fidelity and production builds.

## Release path

1. Run `npm run ai:sync-shared` whenever shared layout or trade code changes.
2. Run `npm run test:ci` and `npm run build:design-studio`.
3. Merge the reviewed release into `main`; Cloudflare Pages then deploys the
   planner automatically.
4. When `supabase/functions/ai-designer` or its shared engine changed, deploy
   it to the linked Bower Supabase project.
5. Verify the Cloudflare and GitHub checks, then smoke-test the live wizard.

## Continue the design training

Read [Kitchen AI University](docs/KITCHEN-AI-UNIVERSITY.md) before changing the
designer. It records the professional rules, architecture, evidence workflow,
test gates and the safest way to teach the planner another kitchen-design
lesson without losing earlier knowledge.

Start at [docs/README.md](docs/README.md) — it is the index and the only
document that states what is current.

Note that [Unified AI Kitchen Design Studio v5](docs/AI-DESIGN-STUDIO-v5-HANDOFF.md)
describes a feature that is **off in the live build** (`designStudio` in
`src/lib/featureFlags.ts`). It is a design document, not a description of what
users see.
