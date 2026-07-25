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
import type { PlacedItem } from '@/types';

export const VIEW_AR_KEY = 'bower.viewArPayload';

/** ViewArPayloadV1 (brief v4.3 §4.8). Unversioned legacy payloads ({items})
 *  are accepted as v1; unknown future versions are rejected with friendly copy. */
interface Payload { version?: number; items: PlacedItem[] }

export default function ViewInRoomAr() {
  const navigate = useNavigate();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [taps, setTaps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tapsRef = useRef<{ x: number; z: number }[]>([]);
  const flipRef = useRef(1);
  const groupRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

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

  const placeKitchen = useCallback(() => {
    const group = groupRef.current;
    const [origin, along] = tapsRef.current;
    if (!group || !origin || !along) return;
    const dx = along.x - origin.x, dz = along.z - origin.z;
    if (Math.hypot(dx, dz) < 0.4) { setError('The two taps are too close — tap further along the wall.'); tapsRef.current = tapsRef.current.slice(0, 1); setTaps(1); return; }
    setError(null);
    const yaw = Math.atan2(dx, dz); // three.js Y-rotation mapping +Z→+X
    group.position.set(origin.x, 0, origin.z);
    group.rotation.set(0, Math.atan2(dz, dx) * -1, 0);
    group.scale.set(1, 1, flipRef.current);
    group.visible = true;
    void yaw;
  }, []);

  const start = useCallback(async () => {
    if (!payload?.items?.length) { setError('No design to show — generate a design first, then come back.'); return; }
    setError(null);
    tapsRef.current = [];
    setTaps(0);
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.xr.enabled = true;
      rendererRef.current = renderer;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x888877, 1.1));
      const camera = new THREE.PerspectiveCamera();

      // Kitchen group: canonical mm → metres, laid out from the tapped origin.
      const group = new THREE.Group();
      group.visible = false;
      for (const item of payload.items) {
        const r = itemRect(item);
        const w = (r.maxX - r.minX) / 1000, d = (r.maxZ - r.minZ) / 1000, h = item.height / 1000;
        const isAppliance = item.itemType === 'Appliance';
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({
            color: isAppliance ? 0x8a97a6 : 0xd8cfc0,
            transparent: true,
            opacity: 0.85,
          }),
        );
        mesh.position.set((r.minX + r.maxX) / 2000, item.y / 1000 + h / 2, (r.minZ + r.maxZ) / 2000);
        group.add(mesh);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({ color: 0x4a4137 }),
        );
        edges.position.copy(mesh.position);
        group.add(edges);
      }
      groupRef.current = group;
      scene.add(group);

      const session = await (navigator as unknown as { xr: XRSystem }).xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: overlayRef.current ? { root: overlayRef.current } : undefined,
      } as XRSessionInit);
      await renderer.xr.setSession(session as XRSession);
      setRunning(true);

      const refSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const hitSource = await (session as XRSession & {
        requestHitTestSource(o: { space: XRReferenceSpace }): Promise<XRHitTestSource | undefined>;
      }).requestHitTestSource({ space: viewerSpace });
      let lastHit: { x: number; z: number } | null = null;

      session.addEventListener('select', () => {
        if (!lastHit || tapsRef.current.length >= 2) return;
        tapsRef.current = [...tapsRef.current, lastHit];
        setTaps(tapsRef.current.length);
        if (navigator.vibrate) navigator.vibrate(40);
        if (tapsRef.current.length === 2) placeKitchen();
      });
      session.addEventListener('end', () => {
        setRunning(false);
        renderer.setAnimationLoop(null);
        renderer.dispose();
      });

      renderer.setAnimationLoop((_t: number, frame?: XRFrame) => {
        if (frame && hitSource) {
          const hits = frame.getHitTestResults(hitSource);
          const pose = hits.length ? hits[0].getPose(refSpace) : null;
          lastHit = pose ? { x: pose.transform.position.x, z: pose.transform.position.z } : null;
        }
        renderer.render(scene, camera);
      });
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : 'could not start the AR view');
    }
  }, [payload, placeKitchen]);

  useEffect(() => () => { void rendererRef.current?.xr.getSession()?.end().catch(() => {}); }, []);

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
        {supported === false && (
          <p className="text-sm text-slate-600 rounded-md bg-slate-50 border border-slate-200 p-3">
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </main>

      <div ref={overlayRef} className={running ? 'fixed inset-0 z-50 pointer-events-none' : 'hidden'}>
        <div className="absolute top-0 inset-x-0 p-4 text-center">
          <span className="inline-block rounded-full bg-black/70 text-white text-sm px-4 py-2">
            {taps === 0 ? 'Tap the room corner where your scan started'
              : taps === 1 ? 'Now tap a point along your main wall'
              : 'Your new kitchen — walk around it'}
          </span>
        </div>
        <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-3 pointer-events-auto">
          <Button
            variant="outline" className="bg-white/90"
            onClick={() => { tapsRef.current = []; setTaps(0); if (groupRef.current) groupRef.current.visible = false; }}
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
          <Button variant="outline" className="bg-white/90" onClick={() => { void rendererRef.current?.xr.getSession()?.end(); navigate('/wizard'); }}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
