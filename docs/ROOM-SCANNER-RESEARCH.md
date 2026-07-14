# Room Scanner — Implementation Research

_Research date: 2026-07-08. Companion to `AI-DESIGNER-HARNESS-PLAN.md`._

## The anchor decision (already made, already built)

Build around a platform-neutral room format, not around Android. **That format exists in the planner today**: `RoomSpec` (`src/lib/layout/types.ts`) — walls/dimensions + `Opening[]` (doors, windows, walkways with offsets, widths, sills, swings) + `ServicePoint[]` (drain, water, GPO, gas, hood-duct). Every scanner option below is just a producer of `RoomSpec`; the AI designer, validators, and pricing consume it unchanged.

```
Any scanner (Android now, iPhone later, manual wizard always)
        → RoomScan JSON (RoomSpec + confidence + photos)
        → AI interpretation/confirmation
        → Kitchen Planner Engine (already built)
```

Add one wrapper type:

```ts
interface RoomScan {
  room: RoomSpec;
  confidence: { overall: number; perWall?: Record<WallId, number> };
  source: 'manual' | 'webxr' | 'arcore' | 'cubicasa' | 'roomplan' | 'magicplan';
  photos?: { url: string; tag?: 'plumbing'|'power'|'window'|'general' }[];
  rawArtifactUrl?: string;   // original scan zip/usdz for reprocessing
  capturedAt: string;
}
```

---

## Option A — WebXR in the existing web app (no app install)

Chrome on Android supports WebXR with hit-testing, plane detection, and the Depth Sensing module — enough for a guided "tap each corner, tap door edges, tap the tap" flow rendered from the planner web app itself.

- **Flow**: wizard Step 1 gains a "Measure with your camera" button → AR session → user taps floor corners (hit-test ray to floor plane), then marks doors/windows/services on each wall → live wall lengths shown → confirm screen → `RoomSpec`.
- **Pros**: zero install, ships inside the existing Vite/React app, free, perfect fit with the lead-capture funnel (homeowner already in the wizard on their phone). Feature detection is mandatory (coverage varies by device); fall back to manual inputs.
- **Cons**: iOS Safari does NOT support WebXR AR — iPhone users keep the manual path until a native app arrives; tap-to-measure accuracy is ±1–3cm per point (fine for quoting; site measure still confirms before manufacture).
- **Effort**: ~1–2 weeks for the guided flow (three.js/@react-three/fiber already in the stack).

## Option B — Native Android app, DIY ARCore

Kotlin app using ARCore plane detection + hit-test + Raw Depth API (higher-accuracy sparse depth for geometry tasks). Depth API runs on ~87% of active ARCore devices without LiDAR, but featureless white walls give imprecise depth — corner-tap + human confirmation stays essential (same conclusion as the "AI-assisted measure, human confirmed" principle).

- **Pros**: full control, offline capture, no per-scan fees, can add photo capture + service tagging natively; open-source references exist (ARCoreMeasure et al.).
- **Cons**: a whole second codebase (Kotlin) + Play Store maintenance; the DIY auto-wall-detection rabbit hole is exactly the time sink to avoid.
- **Effort**: 4–8 weeks for a guided MVP.

## Option C — CubiCasa SDK embedded in a thin Android app

CubiCapture Android library provides a ready scanning Fragment; the scan zip uploads to CubiCasa's backend which returns a processed floor plan (walls, openings, fixed furniture). iOS SDK exists too → the same vendor covers iPhone later.

- **Pros**: proven scan-to-floor-plan quality without building CV; fastest route to "walk the room, get a plan"; cross-platform later.
- **Cons**: per-scan/SDK fees (sales-quoted; consumer scans are ~$23–30 each as a reference), processing is not instant (queue minutes), vendor lock-in, output needs a converter to `RoomSpec`.
- **Effort**: 2–3 weeks (thin app + converter + upload plumbing).

## Option D — magicplan as the interim field tool (buy, don't build)

magicplan (iOS + Android) has a REST API + webhooks: field staff measure in magicplan, a Custom Export webhook pushes plan data into the planner backend, converter maps it to `RoomSpec`.

- **Pros**: production-quality measuring TODAY for trade/site-measure jobs, zero app development; webhook integration is days not weeks.
- **Cons**: per-user subscription; unrealistic to ask homeowners to install and learn it — this is a staff tool, not the consumer wizard path.
- **Effort**: ~1 week for webhook receiver + converter.

## iPhone later — Apple RoomPlan

RoomPlan exports a parametric `CapturedRoom` (walls, doors, windows, openings arrays) as JSON/USDZ — and detects kitchen objects including sink, oven, fridge, dishwasher, stove, which map straight onto `ServicePoint`/appliance hints. A Swift capture view + JSON→`RoomSpec` converter reuses the whole pipeline.

---

## Recommendation (phased, all feeding the same RoomSpec)

| Phase | What | Why first |
|---|---|---|
| **1 (now)** | Manual room diagram in wizard Step 1 (openings/services editor — already on the roadmap) + photo upload with AI service-point suggestions (Claude vision on tagged photos) | Works on every device incl. iPhone from day one; the confirmation UI is needed by every scanner anyway — build it once |
| **2** | WebXR tap-to-measure in the wizard (Option A) | Cheapest real AR win, no install, Android-first as intended |
| **3** | Decide B vs C for the native Android scanner: prototype CubiCasa trial first; only go DIY ARCore if per-scan economics don't work at volume | Avoids burning months on CV |
| **4** | RoomPlan iOS app (or CubiCasa iOS if C won) | Same converter pattern, planner untouched |

Key principle confirmed by the device-accuracy findings: **AI-assisted measure with human confirmation** — auto-detection proposes, the user confirms wall lengths/openings/services, `confidence` travels with the scan, and anything below threshold gets flagged for a professional site measure before manufacture (protects the Microvellum/cabinetry pipeline).

## What the scanner pipeline enables (the differentiator)

Scan → `RoomSpec` → AI designer generates validated options → buildability flags (re-plumb, gas move, aisle violations — validators already do this) → price band → lead → trade planner → Microvellum. The scan apps stop at the floor plan; Bower continues to the quote and the cutting list.

## Sources

- [ARCore Depth developer guide](https://developers.google.com/ar/develop/java/depth/developer-guide) · [Raw Depth](https://developers.google.com/ar/develop/unity-arf/depth/raw-depth) · [Depth overview](https://developers.google.com/ar/develop/depth)
- [CubiCasa Android SDK example](https://github.com/CubiCasa/cubicasa-android-sdk-example-project) · [CubiCasa developers](https://www.cubi.casa/developers/) · [CubiCasa pricing](https://www.cubi.casa/pricing/)
- [WebXR Depth Sensing Module (W3C)](https://www.w3.org/TR/webxr-depth-sensing-1/) · [WebXR Device API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API) · [Chrome WebXR Depth status](https://chromestatus.com/feature/5742647199137792)
- [Apple RoomPlan](https://developer.apple.com/documentation/roomplan/) · [RoomPlan overview](https://developer.apple.com/augmented-reality/roomplan/) · [RoomPlan research (parametric representation)](https://machinelearning.apple.com/research/roomplan)
- [magicplan REST API docs](https://apidocs.magicplan.app/) · [magicplan integrations](https://magicplan.app/integrations)
- [ARCoreMeasure open-source reference](https://github.com/hl3hl3/ARCoreMeasure)
