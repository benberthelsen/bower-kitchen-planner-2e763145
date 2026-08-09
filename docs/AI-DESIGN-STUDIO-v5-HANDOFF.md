# Unified AI Kitchen Design Studio v5 — implementation handoff

## Preview

The merged five-step Studio is opt-in until the Microvellum and human style
reviews below are signed off.

```powershell
npm run dev:design-studio
```

For a production-shaped local preview:

```powershell
npm run build:design-studio
npm run preview:design-studio
```

Open `http://127.0.0.1:8080/wizard`.

Both design-studio commands inherit the website's public `VITE_*` values from
the parent `.env.local` and remove surrounding dotenv quote marks. Private keys
are never copied into the planner or browser bundle.

### Local AI testing

The Design Studio preview enables a local candidate-ranking endpoint. Without
an API key it runs the clearly labelled workflow simulator, so comparison,
selection, chat refinement, undo and Review can be tested without a deployment.
The simulator is not presented as real AI.

To exercise the real model, copy `.env.design-studio.local.example` to the
gitignored `.env.design-studio.local`, set `OPENAI_API_KEY` (and optionally
`OPENAI_MODEL`), then restart `npm run preview:design-studio`. The key stays in
the local Vite server. The browser sends only summaries of deterministic,
rule-approved candidate IDs; the model cannot author or alter geometry.

## Release boundary

- The production-default feature flag remains off. The existing split
  Style/Design journey remains the rollback path.
- Five launch families currently have complete catalogue capability mappings:
  Classic White, Scandinavian, Coastal / Beach, Warm Timber and Modern Dark.
- Hamptons remains hidden until its required shaker/profiled doors, crown
  moulding and pillar-end products have exact Microvellum mappings. No generic
  cabinet is substituted for a missing mandatory feature.
- All sixteen planned families have versioned Style DNA, but future families
  remain absent from the customer UI until their required products are mapped.
- Every visible family still needs Bower's signed composition review against at
  least five external references before production activation.

## Architecture and guarantees

- The deterministic candidate engine authors all geometry, uses only mapped
  catalogue capabilities, rejects invalid layouts, scores professional quality
  and removes near-duplicates.
- Style DNA changes composition (overheads, open shelving, features, massing
  and storage character), not only finishes.
- The first preset design and later alternatives use the same engine and hard
  rules. Layout changes preserve finishes; finish changes preserve layout.
- The online AI receives approved candidate summaries and can only rank, name
  and explain approved IDs. If it is unavailable, the checked local options
  remain usable.
- Wizard v4 state migrates to v5 without discarding saved design data; the
  rollback mapping remains available when the flag is off.
- The room-scan contract, Deno mirror, website copy and lock hash are checked by
  `npm run roomscan:check`.

## Verification commands

```powershell
npm run test:ci
npm run build:design-studio
```

The synthetic Studio suite runs 100 AI-available and 100 AI-unavailable
website → planner → Design Studio → Review → quote journeys across rectangular
and L-shaped scans, including style-fidelity, planning and diversity gates.
