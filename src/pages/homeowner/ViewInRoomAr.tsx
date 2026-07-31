/**
 * ViewInRoomAr — see the designed kitchen life-size in the real room (web AR).
 *
 * StepDesign/Review writes { items, room } to sessionStorage under
 * VIEW_AR_KEY and navigates here. Because a fresh AR session has its own
 * coordinate origin, the customer re-anchors with two taps: (1) the room
 * corner they started their scan from (canonical NW origin), (2) a point
 * along the main wall. A Flip button mirrors the room if it appears on the
 * wrong side of the wall. Cabinets render as correctly-sized boxes via the
 * engine's own itemRect (so placement conventions can't drift), tinted and
 * slightly transparent so the real room stays visible. Android Chrome only —
 * same support envelope as the quick scan.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Redo2 } from 'lucide-react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { itemRect } from '@/lib/layout';
import type { GlobalDimensions, PlacedItem, RoomConfig } from '@/types';
import { getApplianceMaterial, resolveFinishKey } from '@/components/3d/materials/applianceMaterials';
import { configureApplianceGltfLoader } from '@/components/3d/ApplianceModel';
import { resolveApplianceModelUrl } from '@/components/3d/applianceModelUrl';
import {
  isBenchtopInsetAppliance,
  isConcealedRangehoodAppliance,
} from '@/components/3d/applianceClassification';
import { useApplianceCatalog } from '@/hooks/useApplianceCatalog';
import { trackEvent } from '@/lib/analytics';
import {
  createArBoxMaterials,
  disposeArMaterial,
  loadArSurfaceTexture,
  resolveArSurfaceSelection,
  shouldAddArBenchtop,
} from '@/lib/ar/surfaceMaterials';


export const VIEW_AR_KEY = 'bower.viewArPayload';

/** ViewArPayloadV1 (brief v4.3 §4.8). Unversioned legacy payloads ({items})
 *  are accepted as v1; unknown future versions are rejected with friendly copy. */
interface Payload {
  version?: number;
  items: PlacedItem[];
  room?: RoomConfig;
  globalDimensions?: GlobalDimensions;
  finishId?: string;
  benchtopId?: string;
}

export function arSessionErrorMessage(error: unknown): string {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || message.includes('permission')) {
    return 'Camera access was not allowed. Enable camera permission for this site, then try again.';
  }
  if (name === 'NotSupportedError' || message.includes('not supported')) {
    return 'Life-size AR is not available on this device. You can still orbit the full 3D kitchen in the planner.';
  }
  if (name === 'InvalidStateError') {
    return 'Another camera or AR session is already open. Close it, reload this page, and try again.';
  }
  if (message.includes('hit test') || message.includes('surface')) {
    return 'AR surface tracking could not start. Try again in a well-lit room with a clear floor area.';
  }
  return 'The AR view could not start. Try again, or continue with the interactive 3D preview.';
}

export default function ViewInRoomAr() {
  const navigate = useNavigate();
  const { products: applianceProducts } = useApplianceCatalog();
  const applianceProductsRef = useRef(applianceProducts);
  useEffect(() => { applianceProductsRef.current = applianceProducts; }, [applianceProducts]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [hasSurface, setHasSurface] = useState(false);
  const [taps, setTaps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tapsRef = useRef<{ x: number; z: number }[]>([]);
  const flipRef = useRef(1);
  const groupRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const hasSurfaceRef = useRef(false);
  // Aborts any in-flight GLB upgrade loop. Bumped on session `end`, on
  // unmount, and whenever a fresh AR session is started; the loop stops
  // when its captured session id no longer matches. Without this, tapping
  // "Start AR view" twice spawns two independent loops that each download
  // every GLB into a detached scene the user will never see.
  const sessionIdRef = useRef(0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(VIEW_AR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Payload;
        if (parsed?.version !== undefined && parsed.version !== 1) {
          setError('This design was saved by a newer version of the planner — go back, regenerate your design, and try again.');
        } else if (Array.isArray(parsed?.items)) {
          setPayload(parsed);
        }
      }
    } catch { /* stays null */ }
    const xr = (navigator as unknown as { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
    if (!window.isSecureContext || !xr) { setSupported(false); return; }
    xr.isSessionSupported('immersive-ar').then(setSupported).catch(() => setSupported(false));
  }, []);

  const selectedSurfaces = resolveArSurfaceSelection(payload?.finishId, payload?.benchtopId);

  const placeKitchen = useCallback(() => {
    const group = groupRef.current;
    const [origin, along] = tapsRef.current;
    if (!group || !origin || !along) return;
    const dx = along.x - origin.x, dz = along.z - origin.z;
    if (Math.hypot(dx, dz) < 0.4) { setError('The two taps are too close — tap further along the wall.'); tapsRef.current = tapsRef.current.slice(0, 1); setTaps(1); return; }
    setError(null);
    group.position.set(origin.x, 0, origin.z);
    group.rotation.set(0, Math.atan2(dz, dx) * -1, 0);
    group.scale.set(1, 1, flipRef.current);
    group.visible = true;
    trackEvent('ar_kitchen_placed', { platform: 'android-webxr' });
  }, []);

  const cleanupArResources = useCallback(() => {
    sessionIdRef.current++;
    cleanupRef.current();
    cleanupRef.current = () => {};
    rendererRef.current?.setAnimationLoop(null);
    rendererRef.current?.dispose();
    rendererRef.current = null;
    groupRef.current = null;
    hasSurfaceRef.current = false;
    setHasSurface(false);
    setRunning(false);
  }, []);

  const endSession = useCallback(async () => {
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    try { await activeSession?.end(); } catch { /* already ended */ }
    cleanupArResources();
  }, [cleanupArResources]);

  const start = useCallback(async () => {
    if (!payload?.items?.length) { setError('No design to show — generate a design first, then come back.'); return; }
    setError(null);
    hasSurfaceRef.current = false;
    setHasSurface(false);
    tapsRef.current = [];
    setTaps(0);
    // Bump the session id so any previous session's upgrade loop bails out
    // on its next abort check. Capture the new id for this session's loop.
    const mySessionId = ++sessionIdRef.current;
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.xr.enabled = true;
      rendererRef.current = renderer;
      const scene = new THREE.Scene();
      cleanupRef.current = () => {
        renderer.setAnimationLoop(null);
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          if (mesh.material) disposeArMaterial(mesh.material);
        });
        renderer.dispose();
      };
      scene.add(new THREE.HemisphereLight(0xffffff, 0x888877, 1.1));
      const camera = new THREE.PerspectiveCamera();

      // Kitchen group: canonical mm → metres, laid out from the tapped origin.
      // Real finish materials (cached, shared across items) replace the earlier
      // wireframe outlines. Appliances with a resolved model URL upgrade in
      // place once their GLB has downloaded — we NEVER block entering AR.
      const group = new THREE.Group();
      group.visible = false;

      const surfaces = resolveArSurfaceSelection(payload.finishId, payload.benchtopId);
      const cabinetMat = new THREE.MeshStandardMaterial({
        color: surfaces.cabinet.hex,
        roughness: surfaces.cabinet.roughness ?? 0.55,
        metalness: surfaces.cabinet.metalness ?? 0,
      });
      const benchtopMat = new THREE.MeshStandardMaterial({
        color: surfaces.benchtop.hex,
        roughness: surfaces.benchtop.roughness ?? 0.5,
        metalness: surfaces.benchtop.metalness ?? 0,
      });

      // Hard triangle budget for AR — degrade least-important items to boxes
      // when we go over. Approximate box tri count = 12.
      const TRI_BUDGET = 150_000;
      let triUsed = 0;
      const simplified: string[] = [];

      type UpgradeSlot = { placeholder: THREE.Mesh; item: PlacedItem };
      const upgrades: UpgradeSlot[] = [];

      for (const item of payload.items) {
        const r = itemRect(item);
        const w = (r.maxX - r.minX) / 1000, d = (r.maxZ - r.minZ) / 1000, h = item.height / 1000;
        // Concealed rangehoods read as joinery in AR too: a matching upper
        // cabinet, not a stainless appliance box or exposed GLB.
        const isAppliance =
          item.itemType === 'Appliance' && !isConcealedRangehoodAppliance(item, null);
        const cx = (r.minX + r.maxX) / 2000;
        const cy = item.y / 1000 + h / 2;
        const cz = (r.minZ + r.maxZ) / 2000;

        const finishKey = isAppliance ? resolveFinishKey(item.applianceSnapshot?.finish) ?? 'stainless' : null;
        const mat = isAppliance
          ? getApplianceMaterial(finishKey ?? 'stainless').clone()
          : (item.itemType === 'Structure' ? benchtopMat : cabinetMat);

        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        box.position.set(cx, cy, cz);
        if (!isAppliance) {
          box.userData.arSurface = item.itemType === 'Structure' ? 'benchtop' : 'cabinet';
          box.userData.arDimensions = { widthM: w, heightM: h, depthM: d };
        }
        group.add(box);
        triUsed += 12;

        if (shouldAddArBenchtop(item)) {
          const thickness = Math.max(0.02, (payload.globalDimensions?.benchtopThickness ?? 33) / 1000);
          const overhang = Math.max(0, (payload.globalDimensions?.benchtopOverhang ?? 25) / 1000);
          const benchW = w + overhang * 2;
          const benchD = d + overhang * 2;
          const bench = new THREE.Mesh(
            new THREE.BoxGeometry(benchW, thickness, benchD),
            benchtopMat,
          );
          bench.position.set(cx, item.y / 1000 + h + thickness / 2, cz);
          bench.userData.arSurface = 'benchtop';
          bench.userData.arDimensions = { widthM: benchW, heightM: thickness, depthM: benchD };
          group.add(bench);
          triUsed += 12;
        }

        // Queue every appliance for a possible GLB upgrade — URL resolution
        // is deferred to the loader loop so items placed before their GLB
        // was uploaded (or before the catalog resolves) can still upgrade.
        if (isAppliance && triUsed < TRI_BUDGET) upgrades.push({ placeholder: box, item });
      }

      // Best-effort GLB upgrades — never blocks entry to AR.
      if (upgrades.length) {
        void (async () => {
          const isAborted = () => sessionIdRef.current !== mySessionId;
          try {
            const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
            if (isAborted()) return;
            const loader = new GLTFLoader();
            configureApplianceGltfLoader(loader);

            // Two passes so snapshot-backed URLs never wait on the catalog.
            // Snapshot URLs are on the placed item itself, so we can resolve
            // them synchronously and download immediately. Anything that
            // still has no URL needs the appliance catalog — only THOSE
            // slots pay the poll cost.
            const withSnapshotUrl: Array<{ slot: UpgradeSlot; url: string }> = [];
            const needsCatalog: UpgradeSlot[] = [];
            for (const slot of upgrades) {
              const snap = resolveApplianceModelUrl(slot.item, null);
              if (snap) withSnapshotUrl.push({ slot, url: snap });
              else needsCatalog.push(slot);
            }

            const applyGlb = async (slot: UpgradeSlot, url: string) => {
              if (isAborted()) return;
              try {
                const gltf = await loader.loadAsync(url);
                if (isAborted()) return;
                const scene3 = gltf.scene;
                let tri = 0;
                scene3.traverse((n: THREE.Object3D) => {
                  const m = n as THREE.Mesh;
                  if (m.isMesh && m.geometry) {
                    const g = m.geometry as THREE.BufferGeometry;
                    tri += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
                  }
                });
                if (triUsed + tri > TRI_BUDGET) {
                  simplified.push(slot.item.applianceSnapshot?.name ?? slot.item.definitionId);
                  return;
                }
                triUsed += tri;

                const bbox = new THREE.Box3().setFromObject(scene3);
                const size = new THREE.Vector3(); bbox.getSize(size);
                const targetW = slot.item.width / 1000;
                const targetH = slot.item.height / 1000;
                const targetD = slot.item.depth / 1000;
                const sx = size.x > 1e-4 ? targetW / size.x : 1;
                const sy = size.y > 1e-4 ? targetH / size.y : 1;
                const sz = size.z > 1e-4 ? targetD / size.z : 1;
                const cx2 = (bbox.min.x + bbox.max.x) / 2;
                const cz2 = (bbox.min.z + bbox.max.z) / 2;

                // Sink/cooktop follow the benchtop-inset Y convention
                // (model CENTRE at item.y). Look up the product row so the
                // shared helper can use `category` first — same authority as
                // the planner path.
                const prod = applianceProductsRef.current?.find(
                  p => `appliance:${p.id}` === slot.item.definitionId,
                );
                const defLike = prod
                  ? ({ applianceProduct: prod, sku: prod.item_code ?? '', name: prod.name } as unknown as Parameters<typeof isBenchtopInsetAppliance>[1])
                  : null;
                const benchtopInset = isBenchtopInsetAppliance(slot.item, defLike);
                const anchorY = benchtopInset ? (bbox.min.y + bbox.max.y) / 2 : bbox.min.y;

                // Mirror the planner's transform order (see GlbInner in
                // ApplianceModel.tsx): centring offset on a CHILD group so
                // it's applied BEFORE the parent's rotation.
                scene3.position.set(-cx2 * sx, -anchorY * sy, -cz2 * sz);
                scene3.scale.set(sx, sy, sz);
                const wrapper = new THREE.Group();
                wrapper.position.copy(slot.placeholder.position);
                // Placeholder box was centred at (item.y + h/2). For the
                // standard convention, drop by h/2 so base sits at item.y;
                // for sink/cooktop, drop by h so CENTRE sits at item.y.
                wrapper.position.y -= benchtopInset
                  ? slot.item.height / 1000
                  : slot.item.height / 2000;
                wrapper.rotation.set(0, -THREE.MathUtils.degToRad(slot.item.rotation), 0);
                wrapper.add(scene3);
                group.add(wrapper);
                group.remove(slot.placeholder);
                slot.placeholder.geometry.dispose();
              } catch {
                // Leave placeholder box in place.
              }
            };

            for (const { slot, url } of withSnapshotUrl) {
              if (isAborted()) return;
              await applyGlb(slot, url);
            }

            if (needsCatalog.length) {
              // Poll ONLY for slots that need the catalog — snapshot-backed
              // items already downloaded above and never paid for this wait.
              const deadline = Date.now() + 5000;
              while (!applianceProductsRef.current?.length && Date.now() < deadline) {
                if (isAborted()) return;
                await new Promise((r) => setTimeout(r, 100));
              }
              for (const slot of needsCatalog) {
                if (isAborted()) return;
                const url = resolveApplianceModelUrl(slot.item, applianceProductsRef.current);
                if (!url) continue;
                await applyGlb(slot, url);
              }
            }

            if (simplified.length) {
              // eslint-disable-next-line no-console
              console.info('[ViewInRoomAr] simplified over-budget items:', simplified);
            }
          } catch {
            /* loader import failed — placeholders remain */
          }
        })();
      }



      groupRef.current = group;
      scene.add(group);

      const session = await (navigator as unknown as { xr: XRSystem }).xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: overlayRef.current ? { root: overlayRef.current } : undefined,
      } as XRSessionInit);
      sessionRef.current = session;
      await renderer.xr.setSession(session as XRSession);
      setRunning(true);
      trackEvent('ar_view_started', { platform: 'android-webxr', itemCount: payload.items.length });

      const refSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const hitSource = await (session as XRSession & {
        requestHitTestSource(o: { space: XRReferenceSpace }): Promise<XRHitTestSource | undefined>;
      }).requestHitTestSource({ space: viewerSpace });
      if (!hitSource) throw new Error('AR surface tracking could not start');
      let lastHit: { x: number; z: number } | null = null;

      // Supplier textures load after the AR session begins so camera launch
      // keeps the user's click activation. The selected Polytec/EGGER colours
      // are already visible as the immediate, offline-safe fallback.
      void (async () => {
        const [cabinetTexture, benchtopTexture] = await Promise.all([
          loadArSurfaceTexture(surfaces.cabinet),
          loadArSurfaceTexture(surfaces.benchtop),
        ]);
        if (sessionIdRef.current !== mySessionId) {
          cabinetTexture?.dispose();
          benchtopTexture?.dispose();
          return;
        }
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          const surface = mesh.userData.arSurface as 'cabinet' | 'benchtop' | undefined;
          const dimensions = mesh.userData.arDimensions as
            | { widthM: number; heightM: number; depthM: number }
            | undefined;
          if (!surface || !dimensions) return;
          const option = surface === 'cabinet' ? surfaces.cabinet : surfaces.benchtop;
          const texture = surface === 'cabinet' ? cabinetTexture : benchtopTexture;
          mesh.material = createArBoxMaterials(
            option,
            texture,
            dimensions.widthM,
            dimensions.heightM,
            dimensions.depthM,
          );
        });
        cabinetMat.dispose();
        benchtopMat.dispose();
        cabinetTexture?.dispose();
        benchtopTexture?.dispose();
      })();

      session.addEventListener('select', () => {
        if (!lastHit || tapsRef.current.length >= 2) return;
        tapsRef.current = [...tapsRef.current, lastHit];
        setTaps(tapsRef.current.length);
        if (navigator.vibrate) navigator.vibrate(40);
        if (tapsRef.current.length === 2) placeKitchen();
      });
      session.addEventListener('end', () => {
        if (sessionRef.current === session) sessionRef.current = null;
        cleanupArResources();
      });

      renderer.setAnimationLoop((_t: number, frame?: XRFrame) => {
        if (frame && hitSource) {
          const hits = frame.getHitTestResults(hitSource);
          const pose = hits.length ? hits[0].getPose(refSpace) : null;
          lastHit = pose ? { x: pose.transform.position.x, z: pose.transform.position.z } : null;
          if (hasSurfaceRef.current !== Boolean(lastHit)) {
            hasSurfaceRef.current = Boolean(lastHit);
            setHasSurface(hasSurfaceRef.current);
          }
        }
        renderer.render(scene, camera);
      });
    } catch (e) {
      await endSession();
      trackEvent('ar_view_failed', { platform: 'android-webxr' });
      setError(arSessionErrorMessage(e));
    }
  }, [cleanupArResources, endSession, payload, placeKitchen]);

  useEffect(() => () => { void endSession(); }, [endSession]);

  useEffect(() => {
    const root = overlayRef.current;
    if (!root) return;
    const suppress = (event: Event) => event.preventDefault();
    root.addEventListener('beforexrselect', suppress as EventListener);
    return () => root.removeEventListener('beforexrselect', suppress as EventListener);
  }, []);

  useEffect(() => {
    if (!running) return;
    const stopWhenBackgrounded = () => {
      if (document.visibilityState === 'hidden') void endSession();
    };
    document.addEventListener('visibilitychange', stopWhenBackgrounded);
    window.addEventListener('pagehide', endSession);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenBackgrounded);
      window.removeEventListener('pagehide', endSession);
    };
  }, [endSession, running]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-20">
        <Link to="/wizard" className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to planner
        </Link>
        <span className="text-xs text-slate-400">See it in your room · beta</span>
      </header>
      <main className="max-w-md mx-auto px-4 py-10 space-y-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto"><Eye className="w-7 h-7" /></div>
        <h1 className="text-2xl font-bold text-slate-900">See your new kitchen in your room</h1>
        <p className="text-sm text-slate-500">
          Stand in your kitchen. Tap the corner where you started your scan, then tap a point
          along your main wall — your new kitchen appears life-size, right where it will be built.
        </p>
        {!!payload?.items?.length && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
            <p className="text-xs font-semibold text-slate-800">Your selected surfaces</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span
                  className="h-7 w-7 shrink-0 rounded border border-slate-200 bg-cover bg-center"
                  style={{
                    backgroundColor: selectedSurfaces.cabinet.hex,
                    backgroundImage: selectedSurfaces.cabinet.swatchUrl
                      ? `url("${selectedSurfaces.cabinet.swatchUrl}")`
                      : undefined,
                  }}
                />
                <span>
                  <span className="block font-medium text-slate-800">{selectedSurfaces.cabinet.name}</span>
                  {selectedSurfaces.cabinet.supplier}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-7 w-7 shrink-0 rounded border border-slate-200 bg-cover bg-center"
                  style={{
                    backgroundColor: selectedSurfaces.benchtop.hex,
                    backgroundImage: selectedSurfaces.benchtop.swatchUrl
                      ? `url("${selectedSurfaces.benchtop.swatchUrl}")`
                      : undefined,
                  }}
                />
                <span>
                  <span className="block font-medium text-slate-800">{selectedSurfaces.benchtop.name}</span>
                  {selectedSurfaces.benchtop.supplier}
                </span>
              </div>
            </div>
          </div>
        )}
        {supported === null && <p role="status" className="text-sm text-slate-400">Checking AR support…</p>}
        {supported === false && (
          <p role="status" className="text-sm text-slate-600 rounded-md bg-slate-50 border border-slate-200 p-3">
            This device can't run browser AR (Android Chrome is needed). You can still explore the
            3D preview inside the planner.
          </p>
        )}
        {!payload?.items?.length && (
          <p className="text-sm text-amber-700 rounded-md bg-amber-50 border border-amber-200 p-3">
            No design loaded — generate your design in the planner first, then tap "See it in your room".
          </p>
        )}
        {supported && !!payload?.items?.length && !running && (
          <Button onClick={start} className="w-full h-12 bg-slate-900 text-white hover:bg-slate-700">
            <Eye className="w-4 h-4 mr-2" /> Start AR view
          </Button>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </main>

      <div ref={overlayRef} className={running ? 'fixed inset-0 z-50 pointer-events-none' : 'hidden'}>
        <div className="absolute top-0 inset-x-0 p-4 text-center">
          <span className="inline-block rounded-full bg-black/70 text-white text-sm px-4 py-2">
            {taps === 0 ? 'Tap the room corner where your scan started'
              : taps === 1 ? 'Now tap a point along your main wall'
              : 'Your new kitchen — walk around it'}
          </span>
        </div>
        {taps < 2 && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <div className={cn(
              'relative h-14 w-14 rounded-full border-2 transition-colors',
              hasSurface ? 'border-emerald-400 bg-emerald-400/15' : 'border-white/80 bg-black/10',
            )}>
              <span className={cn(
                'absolute left-1/2 top-2 bottom-2 w-0.5 -translate-x-1/2',
                hasSurface ? 'bg-emerald-300' : 'bg-white/80',
              )} />
              <span className={cn(
                'absolute top-1/2 left-2 right-2 h-0.5 -translate-y-1/2',
                hasSurface ? 'bg-emerald-300' : 'bg-white/80',
              )} />
            </div>
            <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">
              {hasSurface ? 'Surface found — tap to anchor' : 'Move slowly to find the floor'}
            </span>
          </div>
        )}
        <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-3 pointer-events-auto">
          <Button
            variant="outline" className="bg-white/90"
            onClick={() => {
              tapsRef.current = [];
              setTaps(0);
              setError(null);
              if (groupRef.current) groupRef.current.visible = false;
            }}
            disabled={taps === 0}
          >
            <Redo2 className="w-4 h-4 mr-1" /> Re-place
          </Button>
          <Button
            variant="outline" className={cn('bg-white/90')}
            onClick={() => { flipRef.current *= -1; placeKitchen(); }}
            disabled={taps < 2}
          >
            Flip side
          </Button>
          <Button variant="outline" className="bg-white/90" onClick={() => { void endSession().then(() => navigate('/wizard')); }}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
