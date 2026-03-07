
# Fix Kitchen Presets and Merge Conflicts

## 1. Fix PlannerScene.tsx Merge Conflicts

The file has git merge conflict markers from a bad merge. Resolution: keep the `onInteractionChange` prop (it's more complete).

**Lines 35-50 and 392-395** — remove conflict markers, keep the version with `onInteractionChange`.

---

## 2. Recalculate Sample Kitchen Layouts

The current presets have arbitrary x/z positions causing gaps between cabinets. All positions need recalculating so cabinets sit flush edge-to-edge.

**Positioning rules** (all values in mm, center-based coordinates):
- `wallGap = 10mm` (gap between cabinet back and wall)
- Rotation 0 (back wall): z auto-set by `createPlacedItem`; x must be calculated
- Rotation 90 (right wall): x auto-set; z must be calculated
- Rotation 180 (front wall): z auto-set; x must be calculated
- Rotation 270 (left wall): x auto-set; z must be calculated
- First cabinet in a run: `x = wallGap + width/2`
- Subsequent: `x = prev_x + prev_width/2 + curr_width/2`

**Add end panels and fillers** — extend the preset item type to include optional `endPanelLeft`, `endPanelRight`, and `fillerLeft`/`fillerRight` fields, and pass them through in `createPlacedItem`.

---

### Single Wall (room 4000 x 2500)
All rotation 0 (back wall), flush left-to-right:

| # | Product | Width | x (center) | End panels |
|---|---------|-------|------------|------------|
| 1 | tall-600-2d | 600 | 310 | endPanelLeft |
| 2 | base-600-3dr | 600 | 910 | — |
| 3 | base-600-sink | 600 | 1510 | — |
| 4 | base-600-ov | 600 | 2110 | — |
| 5 | base-600-1d | 600 | 2710 | endPanelRight |
| 6 | wall-600-2d | 600 | 910 | — (above base 2) |
| 7 | wall-900-rh | 900 | 1660 | — (above base 3-4) |

### L-Shaped Basic (room 4000 x 3500, L-Shape)
**Back wall run** (rotation 0, left-to-right):

| # | Product | Width | x |
|---|---------|-------|---|
| 1 | base-600-3dr | 600 | 310 | endPanelLeft |
| 2 | base-600-sink | 600 | 910 |
| 3 | app-dw-600 | 600 | 1510 |
| 4 | base-600-1d | 600 | 2110 |
| 5 | base-900-lc | 900 | 2860 | corner into right wall |

**Right wall run** (rotation 90, top-to-bottom, z descending):

| # | Product | Width | x (auto) | z |
|---|---------|-------|----------|---|
| 6 | base-600-ov | 600 | auto | 2540 |
| 7 | base-600-3dr | 600 | auto | 1940 |
| 8 | tall-600-2d | 600 | auto | 1340 | endPanelRight (run end) |

**Wall cabinets** (back wall, rotation 0, aligned above bases):

| # | Product | Width | x |
|---|---------|-------|---|
| 9 | wall-600-2d | 600 | 310 |
| 10 | wall-600-1d | 600 | 910 |
| 11 | wall-900-rh | 900 | 1660 |
| 12 | wall-600-2d | 600 | 2410 |

### Galley Kitchen (room 4500 x 2400)
**Top wall** (rotation 0):

| # | Product | Width | x |
|---|---------|-------|---|
| 1 | tall-600-2d | 600 | 310 | endPanelLeft |
| 2 | base-600-ov | 600 | 910 |
| 3 | base-600-3dr | 600 | 1510 |
| 4 | base-900-2d | 900 | 2260 | endPanelRight |

**Bottom wall** (rotation 180):

| # | Product | Width | x |
|---|---------|-------|---|
| 5 | base-600-sink | 600 | 310 | endPanelLeft |
| 6 | app-dw-600 | 600 | 910 |
| 7 | base-600-1d | 600 | 1510 |
| 8 | base-600-3dr | 600 | 2110 | endPanelRight |

**Wall cabinets** above top wall:

| # | Product | Width | x |
|---|---------|-------|---|
| 9 | wall-600-2d | 600 | 910 |
| 10 | wall-900-2d | 900 | 1660 |

### U-Shaped Large (room 5000 x 4000)
**Left wall** (rotation 270, bottom-to-top by z):

| # | Product | Width | z |
|---|---------|-------|---|
| 1 | tall-600-2d | 600 | 310 | endPanelLeft (run start) |
| 2 | base-600-ov | 600 | 910 |
| 3 | base-600-3dr | 600 | 1510 |
| 4 | base-900-lc | 900 | 2260 | corner |

**Back wall** (rotation 0):

| # | Product | Width | x |
|---|---------|-------|---|
| 5 | base-600-3dr | 600 | 960 |
| 6 | base-600-sink | 600 | 1560 |
| 7 | app-dw-600 | 600 | 2160 |
| 8 | base-600-1d | 600 | 2760 |
| 9 | base-900-lc | 900 | 3510 | corner into right wall |

**Right wall** (rotation 90):

| # | Product | Width | z |
|---|---------|-------|---|
| 10 | base-600-3dr | 600 | 2740 |
| 11 | base-600-1d | 600 | 2140 |
| 12 | tall-450-1d | 450 | 1615 | endPanelRight |

**Wall cabinets** above back wall, aligned:

| # | Product | Width | x |
|---|---------|-------|---|
| 13 | wall-600-2d | 600 | 960 |
| 14 | wall-600-1d | 600 | 1560 |
| 15 | wall-900-rh | 900 | 2310 |
| 16 | wall-600-2d | 600 | 3060 |

---

## 3. Add End Panel and Filler Support to Presets

Extend the `SampleKitchenPreset` item type:

```typescript
items: Array<{
  definitionId: string;
  x: number;
  z: number;
  rotation: number;
  endPanelLeft?: boolean;
  endPanelRight?: boolean;
  fillerLeft?: number;
  fillerRight?: number;
}>;
```

Update `createPlacedItem` to pass these through to the returned `PlacedItem`.

End panels go on:
- The first cabinet in a wall run (endPanelLeft)
- The last cabinet in a wall run (endPanelRight)
- Tall cabinets at run ends

---

## Technical Summary

**Files to modify:**
1. `src/components/trade/planner/PlannerScene.tsx` — resolve 3 merge conflict blocks (keep `onInteractionChange`)
2. `src/data/sampleKitchens.ts` — recalculate all positions, add end panel/filler fields to type and `createPlacedItem`, update all 4 preset layouts
