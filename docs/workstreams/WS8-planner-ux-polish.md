# WS8 — Planner UX / 3D Polish

**Complexity: MEDIUM (three.js) — mid-to-strong model.**
Repo: kitchen planner. Independent; nice after WS1.

## Tasks
1. **Camera view presets**: buttons (or dropdown) in the planner toolbar —
   Front, Top, Corner/Iso — that tween the 3D camera (`UnifiedScene.tsx`
   `CameraController`/`cameraControls` API already exposes zoomIn/fitAll; add
   `setView(preset)`). Front view is the one users need to inspect door/drawer
   faces without learning right-drag.
2. **Catalog thumbnails**: make them consistent — either the plan-view line
   icons everywhere or the 3D-rendered thumbs everywhere (they currently mix,
   and change between visits). The 3D thumb generator exists
   (`real 3D catalogue thumbnails` commit 8ca3118); investigate why some items
   fall back to line art and cache results.
3. **Wall cabinet elevation in 3D**: selected wall cabinets get an up/down
   nudge (PgUp/PgDn keys + a small handle) adjusting `position.y`, persisted
   like the dialog's mounting height field.
4. **Texture tiling**: review door texture scale/rotation on wide cabinets
   (`textureGenerator.ts` / material map settings in `CabinetAssembler`) —
   woodgrain should run vertically on doors and not stretch.
5. **Toast/message pass**: dedupe stacked toasts when adding several cabinets
   quickly; ensure destructive actions (Delete cabinet) have an undo toast.

## Acceptance
- One-click Front view shows the kitchen elevation with door details visible.
- All catalog items show the same thumbnail style across reloads.
- Wall cabinet height adjustable in-scene, persists through save/reload.
- Woodgrain direction correct on doors and drawer fronts at 450/600/900 widths.
