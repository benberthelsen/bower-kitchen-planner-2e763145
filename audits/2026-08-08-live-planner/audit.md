# Live Website and Kitchen Planner Audit

Date: 8 August 2026

Scope: the public journey from `www.bowercabinets.com` through the website design starter and the live homeowner kitchen planner at `planner.bowercabinets.com`.

## Overall verdict

The live planner works end to end through the quote form, the full planner CI suite passes, and the audited pages produced no browser-console errors. The highest-impact remaining issue is navigation clarity: visitors are being offered a website scope taker, an AI kitchen planner, a phone scanner, a flat-lay builder, and a quote path, but several prominent cards and titles do not take them directly to the feature they describe.

## Flow steps

1. **Website entry — Amber.** Strong visual identity and a clear `Start Online` action, but that action opens the website scope taker rather than the full kitchen planner. The page presents several different starting paths without clearly naming which one is the full planner.
   - Evidence: `01-website-entry.png`, `09-website-mobile.png`.
2. **Website scope taker — Red/amber.** The large `Job pathway`, `Rough measurements`, `Style direction`, and `Photos and plans` tiles look actionable but are static. The actual `Open Kitchen Planner` control appears below the first full form. This matches observed user feedback that people stop at the large title cards.
   - Evidence: `10-website-starter.png`.
3. **Planner room setup — Amber.** Functional and well labelled, but still a dense first step: dimensions, cabinet walls, preferred layout, openings, and services appear before the first kitchen visual.
   - Evidence: `02-room.png`.
4. **Cooking brief — Green/amber.** Clear grouped choices with good plain-language labels. It is another full step before the visual payoff.
   - Evidence: `03-cooking.png`.
5. **Appliances — Amber/red.** The recommended subset and real product imagery are improvements, but eight product categories in one page still produce a very long journey. The page also uses indicative appliance prices, so final-price certainty remains limited.
   - Evidence: `04-appliances.png`.
6. **Style — Green.** Real Polytec and EGGER identities now flow into the selected style, fixing the earlier flat-colour/placeholder weakness.
   - Evidence: `05-style.png`.
7. **Design — Amber.** A valid standard layout appears before contact details, which fixes the old early-contact gate. The copy says the layout follows clearance rules while the same screen lists bench-space and work-zone warnings. The 3D kitchen is also small and pale relative to the amount of empty canvas.
   - Evidence: `06-design.png`.
8. **Review and quote — Green/amber.** The design identity and price band are consistent, and there is one concise contact form. Minor copy issue: the price renders as `$8,500 – $11,000AUD inc. GST` without a space before `AUD`.
   - Evidence: `07-review.png`.

## Highest-impact fixes

1. Turn the scope-taker tiles into real links/actions. Prefer one large clickable target per card, with visible hover/focus treatment and no nested links.
2. Put `Open Kitchen Planner` above the fold on the scope-taker page and clearly label the existing form as `Quick project brief` so visitors understand the two different paths.
3. Correct the phone-scanner feature link: it currently opens `/wizard`; it should open the scanner route `/wizard/scan`.
4. Reduce the appliance step by collapsing unselected categories and keeping the three recommendations visible, with `View all` as the secondary path.
5. Make the standard-layout promise match its warnings: improve the default layout or change the copy from “follows your clearance rules” to “passes the hard fit checks; review these design warnings.”
6. Increase 3D visual scale/contrast and use more of the preview area.
7. Code-split the planner. The current production build is approximately 4.29 MB minified / 1.23 MB gzip for the main JavaScript bundle, above the project’s stated public-entry target.

## Suggested scope-card destinations

- `Job pathway` -> focus the Pathway selector or link to the relevant service chooser.
- `Rough measurements` -> phone scanner (`/wizard/scan`) with manual-entry wording retained.
- `Style direction` -> design scope/flat-lay builder (`/showrooms/flat-lay?source=planner`).
- `Photos and plans` -> the quote upload section, preserving the current starter values.
- Add a separate, visually primary `Full Kitchen Planner` card -> `planner.bowercabinets.com/wizard`.

## Accessibility notes

- When the tiles become interactive, implement each as one semantic link/button with a visible keyboard focus style and a descriptive accessible name.
- The light inactive step labels and some muted helper text warrant measured contrast testing.
- Screenshot review cannot confirm keyboard order, screen-reader announcements, zoom reflow, or full WCAG 2.2 AA compliance.

## Verification

- `npm run test:ci`: passed.
- Production build: passed.
- Live website, scope taker, and planner console errors/warnings during the audited journey: none.
- Quote submission was not performed because it would create a real external lead.
