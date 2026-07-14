# WS11 — Website Review & Deploy (final workflow step)

**Complexity: LOW–MED. The last gate before/at deploy.** Repos: BOTH
(website `bower-cabinet-web-site` + planner). Run this after every other
workstream so the public site and the planner ship linked and working.

The point: the website and the planner are two separate deployments. It's easy
to ship a website whose "Open Kitchen Planner" / flat-lay handoff points at
`localhost`. This step exists to catch that and to review the site end-to-end.

## 1. Planner link is production-correct (highest priority)

The website links to the planner in two places, both via
`getPlannerUrl()` / `VITE_PLANNER_URL` (see `src/lib/dreamweaverBridge.ts`,
`src/pages/PlannerPage.tsx`, `src/pages/showrooms/FlatLayGeneratorPage.tsx`):

- `PlannerPage` "Open Kitchen Planner" button
- Flat-lay generator "Open in Planner" → `${plannerUrl}/trade/job/new?handoff=<id>`

**Deploy checklist**

- [ ] Set `VITE_PLANNER_URL=https://planner.bowerbuilding.net` in the website's
      production build env (Netlify/Vercel/host). Without it the links fall back
      to `http://localhost:8080` and break in production. Placeholder added to
      `.env.example`; local dev value in `.env.local` is `http://localhost:8081`.
- [ ] Confirm the planner is actually deployed and reachable at that URL.
- [ ] The handoff lands on `/trade/job/new?handoff=…`, which the planner's
      `JobEditor` (`usePlannerHandoff`) consumes to create the job. This route is
      trade-auth protected — verify the intended CTA audience is signed in as a
      trade user, or adjust the route guard if homeowners should follow it.

## 2. End-to-end review (do on the deployed site, not just localhost)

- [ ] Home → `/planner` → "Open Kitchen Planner" opens the planner (new tab), no
      dead end; quote/contact capture stays on the website.
- [ ] `/showrooms/flat-lay`: generate a flat-lay, "Open in Planner" creates a
      `planner_handoffs` row and the planner opens with the room prefilled.
- [ ] Images (flat-lay / joinery) generate — these use the Supabase edge
      functions with `OPENAI_API_KEY` (set in Supabase, not the website build).
- [ ] AI kitchen designer works — requires the `ai-designer` edge function to be
      **deployed** (now OpenAI-based, reuses `OPENAI_API_KEY`; see
      `docs/AI-DESIGNER-BUILD-STATUS.md`).
- [ ] No console errors; links, nav, and mobile layout sane.

## 3. Exit test

Website (prod) → planner (prod) → back to `/quote`, plus one flat-lay handoff
that opens a prefilled room in the deployed planner. Green = shippable.
