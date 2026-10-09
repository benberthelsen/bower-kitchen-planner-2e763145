# Shared room geometry: private-preview gate

`src/lib/roomDocument` is the planner-owned millimetre model. `TradeRoom.roomDocument`
is authoritative for custom, angled, concave, recessed and open-chain rooms.
Legacy `config.width` and `config.depth` are derived extents for older screens;
they do not establish a floor boundary. The pre-migration room is retained in
`legacySnapshot`. The scanner and website use the versioned contract copied by
`npm run roomscan:sync -- --website` after a planner commit.

The trade room setup and room planner use `RoomDocumentEditor` for wall,
corner, opening, service and fitting edits. The 2D plan and 3D shell use the
same wall IDs, positions and rotations. Placed catalogue products remain in
`TradeRoom.cabinets`; `reconcileTradeRoomCabinets` projects them into the
document's proposed layer without replacing surveyed fittings. Wall-run
suggestions are preliminary, and an island requires a confirmed floor
boundary. A partial scan never gains an imaginary closing wall.

The scanner opens the authenticated trade job route with a short-lived handoff
token in a URL fragment. Once the job room is durably saved, the planner binds
its job/room IDs to the scanner's owner-scoped capture using a one-time link
token. Later revisions are offered as additive review: existing measured
walls, user edits, cabinets and confirmed floor stay intact. Private photos
are fetched individually through a capture-scoped, four-hour capability; no
photo bytes, private paths or capabilities are stored in the room document.
The `scanner-private-bridge` Edge function is the only planner component that
reaches the scanner Site. It reads three server-side secrets: `SCANNER_ORIGIN`
(the Site origin), `PLANNER_ORIGIN` (the exact origin the scanner's
`PLANNER_TRADE_URL` points at, which the scanner requires as the request
Origin) and `SCANNER_SITES_ACCESS_TOKEN`. There are no default origins: when
either origin is unset, or is not an exact https origin, the bridge answers
503 rather than call an unexpected host. The Site must configure its planner
handoff endpoint, planner URL and publishable API key, and must run behind its
trusted owner identity gateway.

While the scanner admits only its owner, its planner paths are staff-only.
The bridge answers 403 unless the caller owns the job and
`is_bower_staff` is true. `get-planner-handoff` returns a `source='scanner'`
handoff only with a staff JWT; any other caller gets the same 404
`invalid_capability` as a wrong token. Website handoffs still open with the
token alone, and the job editor shows the scanner entry only to admins.

Release checks:

1. `npm run test:ci`, `npm run roomscan:check`, scanner/Site tests and builds,
   plus the website open-chain handoff test must pass against one contract SHA.
2. On desktop and 320–430 px phones, create and reopen a rectangle, an L and
   concave room, and open 30°, 45° and Eight Hibiscus 135° wall runs. Check
   wall dimensions, openings, fixed appliances, undo/redo, 2D/3D alignment,
   settings persistence and collision/clearance behavior.
3. In a private preview, sign in from a scanner handoff, save a room, reopen
   the same capture, inspect private photos, accept a later scan revision and
   confirm that earlier manual edits survive. Test expired/forged capabilities,
   another owner, revision conflicts and a failed scanner-link retry.
4. Review the Eight Hibiscus fridge wall correction against the latest saved
   owner-authorized draft before applying its recorded user provenance. The
   local correction proposal must not overwrite an unknown newer version.

Do not replace the current public scanner/planner setup flows until these
private-preview checks pass. Scanner measurement accuracy, including the
requested ±30 mm target, remains a separate validation task.
