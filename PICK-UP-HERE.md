# Pick up here

Entry point for anyone — human or AI — starting work on this repo.

## How this project is developed (changed 14 August 2026)

**The Lovable agent is no longer used to author code.** Changes are written and
reviewed in this Git repository. (The agent was used once, on 14 August 2026,
purely as a transport to land a pre-verified patch when direct push access was
unavailable. That is the exception, not the process.)

**Production is Cloudflare Pages, building from `main`.** Lovable is a second
consumer of the same branch that publishes its own preview copy at
`bower-plan-precise.lovable.app`. It is not the production deploy path and is
not required for one.

Practically:

1. Branch off `main`, make the change, open a PR.
2. `.github/workflows/ci.yml` runs `npm run test:ci` on every PR and on push to `main`.
3. Merge to `main`. Cloudflare Pages builds and deploys production.
4. **Do not type in the Lovable chat.** There is no setting that locks the
   agent out — the only control is not using it. An agent commit lands
   straight on the synced branch and will reach production via Cloudflare.

## Getting a green build locally

```bash
npm ci          # npm, not bun — see "Package manager" below
npm run test:ci # 39 sequential checks, ~2 minutes, ends with build + bundle budget
```

`test:ci` is a single `&&` chain in `package.json`, so it stops at the first
failure and everything after it is skipped. When something fails, read the
*last* passing step to know how far it got.

## Package manager

**npm.** `bun.lock` was removed on 14 August 2026. The repo had both `bun.lock`
and `package-lock.json` committed, while `README.md`, `NOTES.md` and CI all use
npm — so the bun lockfile was an orphan that could only cause drift. `npm ci`
installs clean in ~20 s and the full 39-step suite passes.

## What is not deployed by the front-end build

Two things are separate from the Cloudflare Pages build and always have been.
They are the usual cause of "the code shipped but the behaviour didn't change":

- **Supabase edge functions** — `deploy-functions.ps1` / `deploy-planner-functions.ps1`, via the Supabase CLI.
- **Database migrations** — `supabase/migrations/`, applied separately.

Check both before concluding a release is done.

## Where the real status lives

`docs/README.md` is the index and the only document that states what is
current. Read it before any planning document, several of which are stale and
contradict each other.

## Known open issues

The highest-value items as at 14 August 2026:

- `nearestWall()` in `src/lib/roomScan/webxrFit.ts` mirrors opening offsets on
  the **S and W walls** — the canonical convention in `src/lib/layout/geometry.ts`
  measures those from the E and S corners respectively. `tests/scanner-two-lane.test.cjs`
  currently asserts the wrong value, so fix the test first.
- The scan entry in `Wizard.tsx` is gated on `navigator.xr.isSessionSupported('immersive-ar')`,
  which is never true on iOS — so iPhone users cannot reach the RoomPlan import
  or manual entry lanes that exist for them.
- Scanner snap tolerances (0.3–0.55 m, corner gate ×1.5) are looser than the
  0.18 m clustering `tryFitLShape` needs, so L-shaped rooms almost never fit
  and everything falls back to a rectangle.
- Bundle is **4292 KiB against a 4394 KiB budget** — 97.7% used. The next
  feature will break `test:bundle-budget`.
