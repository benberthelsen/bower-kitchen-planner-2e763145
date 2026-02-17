# NOTES

## Assumptions made
- The primary “client usable” planner flow is the trade room planner route (`/trade/job/:jobId/room/:roomId/planner`) and not the legacy `/trade-planner` shell.
- Benchtops are rendered through the existing 3D cabinet assembly pipeline for placed base cabinets, so no separate benchtop subsystem rewrite was introduced.
- Pricing in the room planner is estimated from catalog pricing with a width-based scale factor (`cabinet width / default width`) to keep pricing reactive with cabinet edits while preserving existing architecture.
- Export acceptance is satisfied by robust JSON plan export from the room planner toolbar.

## Quick local verification
1. `npm install`
2. `npm run dev`
3. Open `http://localhost:5173/trade/job/demo/room/demo/planner`
4. Add cabinet(s), drag them, edit dimensions, then click **Export**.
5. Confirm pricing shown in cabinet list updates and build works via `npm run build`.
