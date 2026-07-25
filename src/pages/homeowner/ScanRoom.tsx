/**
 * ScanRoom — two-lane room capture (master plan §10.1 + scanner buildout).
 *
 * Lane 1 — Quick scan (web AR): WebXR guided capture on supported Android
 *   Chrome. Phased flow: corners → ceiling height (optional) → doors &
 *   windows (optional) → UnconfirmedRoomScanV1.
 * Lane 2 — Pro scan (LiDAR): import an Apple RoomPlan JSON export from a
 *   LiDAR iPhone/iPad scanning app. RoomPlan detects walls/doors/windows
 *   itself; the importer maps them onto the same contract.
 *
 * Both lanes (and manual entry) produce the SAME UnconfirmedRoomScanV1 and
 * hand off through sessionStorage to /wizard, where RoomFeaturesEditor must
 * confirm — a scan is quote/design-grade input, never manufacturing
 * authority. An info dialog explains the two options to the customer.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Camera, Check, CircleDot, DoorOpen, Info, Redo2, Ruler, ScanLine, Upload,
} from 'lucide-react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  buildScanFromCapture, intersectWallLines, type XrCorner, type XrOpeningMark,
  dominantLine, snapToPlanes, type WallLine,
} from '@/lib/roomScan/webxrFit';
import { importRoomPlanFileText } from '@/lib/roomScan/roomplanImport';

export const PENDING_SCAN_KEY = 'bower.pendingScan';

type Support = 'checking' | 'insecure' | 'no-xr' | 'no-ar' | 'ready';
type Phase = 'corners' | 'height' | 'openings';
type OpeningType = XrOpeningMark['type'];

interface Hit { x: number; y: number; z: number }

/** Minimal WebXR plane-detection surface (not yet in the TS DOM lib). */
interface XRPlaneLike {
  planeSpace: XRSpace;
  polygon: { x: number; y: number; z: number }[];
  orientation: 'horizontal' | 'vertical';
  lastChangedTime: number;
}

const OPENING_LABELS: Record<OpeningType, string> = {
  door: 'Door', window: 'Window', walkway: 'Walkway',
};

export default function ScanRoom() {
  const navigate = useNavigate();
  const [support, setSupport] = useState<Support>('checking');
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<Phase>('corners');
  const [hasSurface, setHasSurface] = useState(false);
  const [corners, setCorners] = useState<XrCorner[]>([]);
  const [openings, setOpenings] = useState<XrOpeningMark[]>([]);
  const [pendingPoint, setPendingPoint] = useState<XrCorner | null>(null);
  const [openingType, setOpeningType] = useState<OpeningType>('door');
  const [heightMm, setHeightMm] = useState<number | null>(null);
  // Hidden-corner mode: the floor corner is blocked (existing kitchen), so the
  // customer taps 2 points on each wall instead; we intersect the wall lines.
  const [wallTaps, setWallTaps] = useState<XrCorner[]>([]);
  const [hiddenMode, setHiddenMode] = useState(false);
  const [hiddenHint, setHiddenHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Pre-commit preview of an imported RoomPlan scan (Fix B / Stage 2 §6).
  const [previewScan, setPreviewScan] = useState<null | {
    scan: import('@/lib/roomScan/contract').RoomScanV1;
    summary: { walls: number; doors: number; windows: number; walkways: number; heightMm: number };
  }>(null);

  const [dragActive, setDragActive] = useState(false);
  const [showManual, setShowManual] = useState(false);


  const sessionRef = useRef<XRSession | null>(null);
  const phaseRef = useRef<Phase>('corners');
  const cornersRef = useRef<XrCorner[]>([]);
  const wallTapsRef = useRef<XrCorner[]>([]);
  const hiddenModeRef = useRef(false);
  const openingsRef = useRef<XrOpeningMark[]>([]);
  const pendingPointRef = useRef<XrCorner | null>(null);
  const openingTypeRef = useRef<OpeningType>('door');
  const heightRef = useRef<number | null>(null);
  const lastHitRef = useRef<Hit | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Rebuilds the in-scene "ghost" of everything captured so far; assigned a
  // real implementation while an AR session is live.
  const rebuildGhostRef = useRef<() => void>(() => {});
  const hasSurfaceRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!window.isSecureContext) { setSupport('insecure'); return; }
    const xr = (navigator as unknown as { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
    if (!xr) { setSupport('no-xr'); return; }
    xr.isSessionSupported('immersive-ar')
      .then((ok) => setSupport(ok ? 'ready' : 'no-ar'))
      .catch(() => setSupport('no-ar'));
  }, []);

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // WebXR quirk: a tap on a DOM-overlay button ALSO fires the AR session's
  // 'select' event, placing a stray point — which made every overlay button
  // (notably "Corner hidden?") unreliable. beforexrselect is dispatched only
  // for taps that actually land on hit-testable overlay elements, so
  // preventDefault-ing it suppresses exactly those phantom selects.
  useEffect(() => {
    const root = overlayRef.current;
    if (!root) return;
    const suppress = (event: Event) => event.preventDefault();
    root.addEventListener('beforexrselect', suppress as EventListener);
    return () => root.removeEventListener('beforexrselect', suppress as EventListener);
  }, []);

  const endSession = useCallback(async () => {
    try { await sessionRef.current?.end(); } catch { /* already ended */ }
    rendererRef.current?.setAnimationLoop(null);
    rendererRef.current?.dispose();
    rendererRef.current = null;
    rebuildGhostRef.current = () => {};
    sessionRef.current = null;
    hasSurfaceRef.current = false;
    setHasSurface(false);
    setScanning(false);
  }, []);

  const storeAndGo = useCallback((scan: unknown): boolean => {
    try {
      sessionStorage.setItem(PENDING_SCAN_KEY, JSON.stringify(scan));
    } catch {
      return false;
    }
    navigate('/wizard');
    return true;
  }, [navigate]);

  const finish = useCallback(async () => {
    const result = buildScanFromCapture(cornersRef.current, {
      ...(heightRef.current !== null ? { heightMm: heightRef.current } : {}),
      openings: openingsRef.current,
    });
    await endSession();
    if ('reason' in result) { setError(result.reason); return; }
    if (!storeAndGo(result.scan)) {
      setError('could not store the scan — your browser may be blocking storage');
    }
  }, [endSession, storeAndGo]);

  const startScan = useCallback(async () => {
    setError(null);
    setCorners([]);
    setOpenings([]);
    setPendingPoint(null);
    setHeightMm(null);
    cornersRef.current = [];
    openingsRef.current = [];
    pendingPointRef.current = null;
    heightRef.current = null;
    wallTapsRef.current = [];
    hiddenModeRef.current = false;
    setWallTaps([]);
    setHiddenMode(false);
    setHiddenHint(null);
    lastHitRef.current = null;
    hasSurfaceRef.current = false;
    setHasSurface(false);
    setPhaseBoth('corners');
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    if (!xr) return;

    try {
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay', 'plane-detection'],
        domOverlay: overlayRef.current ? { root: overlayRef.current } : undefined,
      } as XRSessionInit);
      sessionRef.current = session;
      setScanning(true);

      // Ghost overlay: a real three.js scene renders everything captured so
      // far — corner posts, translucent wall panels, opening strips — so the
      // customer SEES the mapped room grow instead of tapping blind.
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.xr.enabled = true;
      rendererRef.current = renderer;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1));
      const camera = new THREE.PerspectiveCamera();
      const ghost = new THREE.Group();
      scene.add(ghost);
      const previewGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const preview = new THREE.Line(previewGeom, new THREE.LineBasicMaterial({ color: 0x34d399 }));
      preview.visible = false;
      scene.add(preview);
      // Ghost pillar under the reticle: place it against benchtops, door
      // frames or wall junctions to line a point up before tapping. Only the
      // floor position (x,z) is captured, so tapping on TOP of a benchtop at
      // a hidden corner works too.
      const previewPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 1.2, 10),
        new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.45 }),
      );
      previewPost.visible = false;
      scene.add(previewPost);
      // Detected wall planes (ARCore plane-detection), rendered sky-blue so
      // the customer SEES what the scanner has recognised. ACCUMULATED for
      // the whole session — walls stay in the world model when they leave the
      // camera's field of view and are exactly there when you pan back.
      const planesGroup = new THREE.Group();
      scene.add(planesGroup);
      const planeState = {
        map: new Map<object, { line: WallLine; t: number }>(),
        lines: [] as WallLine[],
        dirty: false,
        ceilingY: null as number | null,
      };
      const rebuildPlanes = () => {
        planesGroup.clear();
        planeState.lines = [...planeState.map.values()].map(v => v.line);
        for (const line of planeState.lines) {
          const len = Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z);
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(len, 1.0),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
          );
          mesh.position.set((line.a.x + line.b.x) / 2, 0.5, (line.a.z + line.b.z) / 2);
          mesh.rotation.y = -Math.atan2(line.b.z - line.a.z, line.b.x - line.a.x);
          planesGroup.add(mesh);
        }
      };
      await renderer.xr.setSession(session as XRSession);

      const EMERALD = 0x34d399, AMBER = 0xf59e0b;
      const post = (p: { x: number; z: number }, color: number, h: number) => {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, h, 10),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
        );
        mesh.position.set(p.x, h / 2, p.z);
        ghost.add(mesh);
      };
      const panel = (a: { x: number; z: number }, b: { x: number; z: number }, color: number, opacity: number, h: number, y0 = 0) => {
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.05) return;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(len, h),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
        );
        mesh.position.set((a.x + b.x) / 2, y0 + h / 2, (a.z + b.z) / 2);
        mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        ghost.add(mesh);
      };
      rebuildGhostRef.current = () => {
        ghost.clear();
        const wallH = heightRef.current ? Math.min(3, Math.max(1, heightRef.current / 1000)) : 1.2;
        const cs = cornersRef.current;
        for (const c of cs) post(c, EMERALD, wallH);
        for (let i = 0; i + 1 < cs.length; i++) panel(cs[i], cs[i + 1], EMERALD, 0.16, wallH);
        // Faint closing hint back to the first corner once the room takes shape.
        if (cs.length >= 3) panel(cs[cs.length - 1], cs[0], EMERALD, 0.06, wallH);
        for (const t of wallTapsRef.current) post(t, AMBER, 0.9);
        if (pendingPointRef.current) post(pendingPointRef.current, AMBER, 0.6);
        for (const o of openingsRef.current) {
          const h = o.type === 'window' ? 1.2 : o.type === 'door' ? 2.04 : 2.1;
          const y0 = o.type === 'window' ? 0.9 : 0;
          panel(o.a, o.b, AMBER, 0.35, h, y0);
        }
      };
      rebuildGhostRef.current();

      const refSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const hitTestSource = await (session as XRSession & {
        requestHitTestSource(o: { space: XRReferenceSpace }): Promise<XRHitTestSource | undefined>;
      }).requestHitTestSource({ space: viewerSpace });
      if (!hitTestSource) throw new Error('AR surface tracking could not start');

      // Tap = act on the point currently under the reticle, per phase.
      session.addEventListener('select', () => {
        const hit = lastHitRef.current;
        if (!hit) return;
        const p = phaseRef.current;
        if (p === 'corners') {
          if (hiddenModeRef.current) {
            // Collect 2 taps on the first wall, 2 on the second (on the wall
            // surface, above the benchtop — Y is dropped), then intersect.
            const tapSnap = snapToPlanes({ x: hit.x, z: hit.z }, planeState.lines);
            wallTapsRef.current = [...wallTapsRef.current, tapSnap.point];
            setWallTaps(wallTapsRef.current);
            if (wallTapsRef.current.length === 4) {
              const [a1, a2, b1, b2] = wallTapsRef.current;
              const corner = intersectWallLines(a1, a2, b1, b2);
              wallTapsRef.current = [];
              setWallTaps([]);
              if (corner) {
                cornersRef.current = [...cornersRef.current, corner];
                setCorners(cornersRef.current);
                hiddenModeRef.current = false;
                setHiddenMode(false);
                setHiddenHint('Hidden corner added from the wall lines ✓');
              } else {
                setHiddenHint('Those taps were too close or the walls too parallel — try again, spacing the two taps further apart along each wall');
              }
            }
          } else {
            const cornerSnap = snapToPlanes({ x: hit.x, z: hit.z }, planeState.lines);
            cornersRef.current = [...cornersRef.current, cornerSnap.point];
            setCorners(cornersRef.current);
            if (cornerSnap.kind !== 'none') {
              setHiddenHint(cornerSnap.kind === 'corner' ? 'Snapped to detected wall corner ✓' : 'Snapped to detected wall ✓');
              setTimeout(() => setHiddenHint(null), 2000);
            }
          }
        } else if (p === 'height') {
          // local-floor: y≈0 at floor level, so the ceiling hit's y IS the height.
          heightRef.current = Math.round(hit.y * 1000);
          setHeightMm(heightRef.current);
          setPhaseBoth('openings');
        } else {
          const point = { x: hit.x, z: hit.z };
          if (pendingPointRef.current) {
            openingsRef.current = [
              ...openingsRef.current,
              { a: pendingPointRef.current, b: point, type: openingTypeRef.current },
            ];
            setOpenings(openingsRef.current);
            pendingPointRef.current = null;
            setPendingPoint(null);
          } else {
            pendingPointRef.current = point;
            setPendingPoint(point);
          }
        }
        rebuildGhostRef.current();
        if (navigator.vibrate) navigator.vibrate(40);
      });
      session.addEventListener('end', () => {
        sessionRef.current = null;
        hasSurfaceRef.current = false;
        setHasSurface(false);
        setScanning(false);
      });

      renderer.setAnimationLoop((_t: number, frame?: XRFrame) => {
        if (!sessionRef.current || !frame) return;
        const results = frame.getHitTestResults(hitTestSource);
        if (results.length) {
          const pose = results[0].getPose(refSpace);
          if (pose) {
            lastHitRef.current = {
              x: pose.transform.position.x,
              y: pose.transform.position.y,
              z: pose.transform.position.z,
            };
            if (!hasSurfaceRef.current) {
              hasSurfaceRef.current = true;
              setHasSurface(true);
            }
          }
        } else {
          lastHitRef.current = null;
          if (hasSurfaceRef.current) {
            hasSurfaceRef.current = false;
            setHasSurface(false);
          }
        }

        // Plane detection: harvest vertical planes into wall lines (keyed by
        // plane object; refreshed when ARCore refines them, never discarded).
        const detected = (frame as XRFrame & { detectedPlanes?: Set<XRPlaneLike> }).detectedPlanes;
        if (detected) {
          detected.forEach((plane) => {
            const prev = planeState.map.get(plane);
            if (prev && prev.t === plane.lastChangedTime) return;
            const pose = frame.getPose(plane.planeSpace, refSpace);
            if (!pose) return;
            const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
            const world = plane.polygon.map((pt) => new THREE.Vector3(pt.x, pt.y, pt.z).applyMatrix4(m));
            if (plane.orientation === 'vertical') {
              const line = dominantLine(world.map(w => ({ x: w.x, z: w.z })));
              if (line) {
                planeState.map.set(plane, { line, t: plane.lastChangedTime });
                planeState.dirty = true;
              }
            } else if (plane.orientation === 'horizontal') {
              const y = world.reduce((sum, w) => sum + w.y, 0) / Math.max(1, world.length);
              if (y > 1.8 && (planeState.ceilingY === null || y < planeState.ceilingY)) planeState.ceilingY = y;
            }
          });
          if (planeState.dirty) { planeState.dirty = false; rebuildPlanes(); }
        }

        // Live preview line: from the last relevant point to the reticle.
        const hit = lastHitRef.current;
        const p = phaseRef.current;
        let from: { x: number; z: number } | null = null;
        let lineY = 0.02;
        if (hit) {
          if (p === 'corners') {
            if (hiddenModeRef.current) {
              from = wallTapsRef.current[wallTapsRef.current.length - 1] ?? null;
              lineY = 0.9;
            } else {
              from = cornersRef.current[cornersRef.current.length - 1] ?? null;
            }
          } else if (p === 'openings') {
            from = pendingPointRef.current;
          }
        }
        if (from && hit) {
          const pos = previewGeom.attributes.position as THREE.BufferAttribute;
          pos.setXYZ(0, from.x, lineY, from.z);
          pos.setXYZ(1, hit.x, lineY, hit.z);
          pos.needsUpdate = true;
          preview.visible = true;
        } else {
          preview.visible = false;
        }

        if (hit && (p === 'corners' || p === 'openings')) {
          // Snap the pillar onto detected wall geometry so it locks on target
          // instead of hovering nearby — the tap uses the same snapped point.
          const snap = p === 'corners' ? snapToPlanes({ x: hit.x, z: hit.z }, planeState.lines) : { point: { x: hit.x, z: hit.z }, kind: 'none' as const };
          previewPost.position.set(snap.point.x, 0.6, snap.point.z);
          const mat = previewPost.material as THREE.MeshBasicMaterial;
          mat.color.setHex(
            hiddenModeRef.current || p === 'openings' ? 0xf59e0b : snap.kind === 'none' ? 0x34d399 : 0x10b981,
          );
          mat.opacity = snap.kind === 'none' ? 0.45 : 0.9;
          previewPost.visible = true;
        } else {
          previewPost.visible = false;
        }

        renderer.render(scene, camera);
      });
    } catch (err) {
      setScanning(false);
      setError(err instanceof Error ? err.message : 'could not start the camera session');
    }
  }, []);

  useEffect(() => () => { void endSession(); }, [endSession]);

  const handleImportFile = useCallback(async (file: File) => {
    setImportError(null);
    setPreviewScan(null);
    setImporting(true);
    try {
      const text = await file.text();
      const result = importRoomPlanFileText(text);
      if ('reason' in result) { setImportError(result.reason); return; }
      const scan = result.scan;
      const doors = scan.room.openings.filter((o) => o.type === 'door').length;
      const windows = scan.room.openings.filter((o) => o.type === 'window').length;
      const walkways = scan.room.openings.filter((o) => o.type === 'walkway').length;
      setPreviewScan({
        scan,
        summary: { walls: result.walls, doors, windows, walkways, heightMm: scan.room.height },
      });
    } catch {
      setImportError('could not read that file — try exporting the scan again');
    } finally {
      setImporting(false);
    }
  }, []);

  const commitPreview = useCallback(() => {
    if (!previewScan) return;
    if (!storeAndGo(previewScan.scan)) {
      setImportError('could not store the scan — your browser may be blocking storage');
    }
  }, [previewScan, storeAndGo]);

  // Build a valid UnconfirmedRoomScanV1 from a plain rectangle + optional openings.
  const buildManualScan = useCallback((input: {
    widthMm: number; depthMm: number; heightMm: number;
    doorWall?: 'N' | 'E' | 'S' | 'W'; doorOffsetMm?: number; doorWidthMm?: number;
    windowWall?: 'N' | 'E' | 'S' | 'W'; windowOffsetMm?: number; windowWidthMm?: number;
  }): import('@/lib/roomScan/contract').UnconfirmedRoomScanV1 => {
    const openings: import('@/lib/roomScan/contract').OpeningV1[] = [];
    if (input.doorWall && input.doorWidthMm && input.doorWidthMm > 0) {
      openings.push({ id: 'door-1', wall: input.doorWall, type: 'door',
        offsetMm: input.doorOffsetMm ?? 0, widthMm: input.doorWidthMm });
    }
    if (input.windowWall && input.windowWidthMm && input.windowWidthMm > 0) {
      openings.push({ id: 'window-1', wall: input.windowWall, type: 'window',
        offsetMm: input.windowOffsetMm ?? 0, widthMm: input.windowWidthMm });
    }
    return {
      state: 'unconfirmed',
      schemaVersion: 1,
      source: 'manual',
      roomRevision: 1,
      coordinateFrame: {
        assignment: 'user-main-wall',
        sourcePlanAxes: 'x-z',
        sourceUnits: 'millimetres',
        sourceToCanonicalMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        snappedQuarterTurnDegrees: 0,
        originDescription: 'north-west-corner-in-canonical-plan',
      },
      room: {
        width: input.widthMm, depth: input.depthMm, height: input.heightMm,
        shape: 'Rectangle', cutoutWidth: 0, cutoutDepth: 0,
        openings, services: [],
      },
      confidence: {
        overall: 0.5,
        fields: { height: 'measured', openings: openings.length ? 'user-marked' : 'none-captured', services: 'none-captured' },
      },
      capturedAt: new Date().toISOString(),
    };
  }, []);

  const supportCopy: Record<Exclude<Support, 'ready' | 'checking'>, string> = {
    insecure: 'Quick scan needs a secure (https) connection.',
    'no-xr': "This browser can't run camera scanning. On an Android phone, open this page in Chrome.",
    'no-ar': "This device doesn't support browser AR scanning.",
  };


  // ── Overlay copy per phase ────────────────────────────────────────────────
  const topCaption =
    phase === 'corners'
      ? (hiddenMode
          ? (wallTaps.length < 2
              ? `Corner hidden: tap 2 points along the FIRST wall, above the bench (${wallTaps.length}/2)`
              : `Now tap 2 points along the SECOND wall (${wallTaps.length - 2}/2)`)
          : hiddenHint
            ?? (corners.length === 0
              ? 'Aim at the floor in a corner, then tap'
              : `${corners.length} corner${corners.length === 1 ? '' : 's'} marked — walk to the next one`))
      : phase === 'height'
        ? 'Aim at the CEILING and tap to measure height — or skip'
        : pendingPoint
          ? `Now tap the OTHER side of the ${OPENING_LABELS[openingType].toLowerCase()}`
          : `${openings.length} marked · Choose a type, then tap ONE side of it at floor level`;

  const reticleCaption =
    phase === 'height'
      ? (hasSurface ? 'Surface found — tap to measure' : 'Aim at the ceiling')
      : hasSurface
        ? (phase === 'corners'
            ? (hiddenMode ? 'Tap a point ON the wall surface' : 'Floor found — aim at the corner and tap')
            : 'Tap to mark this point')
        : 'Move slowly to find the surface';

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 bg-white z-20">
        <Link to="/wizard" className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to planner
        </Link>
        <span className="text-xs sm:text-sm text-slate-400">Room scanner · beta</span>
      </header>

      <main className="max-w-md mx-auto px-4 py-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Scan your room</h1>
          <p className="text-sm text-slate-500">
            Two ways to capture your room — pick the one that fits your phone.
            You'll check and fine-tune everything before any design is made, and a
            professional check measure always happens before manufacture.
          </p>
          <button
            onClick={() => setShowInfo(true)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
          >
            <Info className="w-4 h-4" /> Which option should I use?
          </button>
        </div>

        {/* ── Option 1: Quick scan (web AR) ── */}
        <section className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-slate-700" />
              <h2 className="font-semibold text-slate-900">Quick scan</h2>
            </div>
            <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">Android · Chrome</span>
          </div>
          <p className="text-sm text-slate-500">
            Use your phone camera to mark the room's corners, ceiling height, and
            doors &amp; windows. Works in the browser — nothing to install.
          </p>
          {support === 'checking' && <p className="text-sm text-slate-400">Checking your device…</p>}
          {support === 'ready' && !scanning && (
            <div className="space-y-3">
              <ol className="text-sm text-slate-600 space-y-2 rounded-md border border-slate-200 p-3">
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Walk to each corner of the room and tap to mark it — 4 corners, or 6 for an L-shaped room.</li>
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Corner blocked by an existing kitchen? Line the ghost pillar up and tap on TOP of the benchtop at the corner (only the floor position is used) — or tap "Corner hidden?" and mark two points on each wall and we'll find it for you.</li>
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Aim at the ceiling to measure the height — or skip it.</li>
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Mark each door and window by tapping both sides — or add them later on the plan.</li>
              </ol>
              <Button onClick={startScan} className="w-full h-11 bg-slate-900 text-white hover:bg-slate-700">
                <Camera className="w-4 h-4 mr-2" /> Start quick scan
              </Button>
              {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            </div>
          )}
          {support !== 'checking' && support !== 'ready' && (
            <p className="text-sm text-slate-500 rounded-md bg-slate-50 border border-slate-200 p-3">
              {supportCopy[support as Exclude<Support, 'ready' | 'checking'>]}{' '}
              If you have an iPhone Pro, use the Pro scan below — otherwise manual entry only takes a minute.
            </p>
          )}
        </section>

        {/* ── Option 2: Pro scan (LiDAR import) ── */}
        <section
          className={cn(
            'rounded-xl border p-4 space-y-3 transition-colors',
            dragActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200',
          )}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleImportFile(file);
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-slate-700" />
              <h2 className="font-semibold text-slate-900">Pro scan</h2>
            </div>
            <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">iPhone Pro · LiDAR</span>
          </div>
          <p className="text-sm text-slate-500">
            iPhone Pro models (12 Pro and newer Pro / Pro Max) have a LiDAR
            scanner and can capture your room automatically. Scan with a LiDAR
            room-scanning app such as <span className="font-medium">Polycam</span> or{' '}
            <span className="font-medium">RoomScan LiDAR</span>, export the room
            as a <span className="font-medium">JSON file</span>, then drop it
            below or tap Import. Walls, doors and windows are read for you.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleImportFile(file);
            }}
          />
          <Button
            variant="outline"
            className="w-full h-11 border-slate-300"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" /> {importing ? 'Importing…' : 'Choose or drop scan file'}
          </Button>
          {importError && <p className="text-sm text-red-600 text-center">{importError}</p>}

          {previewScan && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 space-y-2">
              <p className="text-sm font-medium text-emerald-900">
                Detected: {previewScan.summary.walls} wall surface{previewScan.summary.walls === 1 ? '' : 's'} · {previewScan.summary.doors} door
                {previewScan.summary.doors === 1 ? '' : 's'} · {previewScan.summary.windows} window
                {previewScan.summary.windows === 1 ? '' : 's'}
                {previewScan.summary.walkways > 0 ? ` · ${previewScan.summary.walkways} walkway${previewScan.summary.walkways === 1 ? '' : 's'}` : ''}
              </p>
              <p className="text-xs text-emerald-800">
                Room: {(previewScan.scan.room.width / 1000).toFixed(2)} m ×{' '}
                {(previewScan.scan.room.depth / 1000).toFixed(2)} m ·
                ceiling {(previewScan.summary.heightMm / 1000).toFixed(2)} m
                {previewScan.summary.walls > 4 ? ' · imported as a rectangular room' : ''}
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={commitPreview}>
                  <Check className="w-4 h-4 mr-1" /> Use this room
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPreviewScan(null)}>Discard</Button>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-400">
            A one-tap Bower scanning app for iPhone is on the roadmap — this import works today.
          </p>
        </section>

        {/* ── Manual entry ── */}
        <section className="rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-slate-700" />
            <h2 className="font-semibold text-slate-900">Enter measurements</h2>
          </div>
          <p className="text-sm text-slate-500">
            No LiDAR? No AR? Type your room in — takes about a minute.
          </p>
          <Button className="w-full h-11 bg-slate-900 text-white hover:bg-slate-700" onClick={() => setShowManual(true)}>
            <Ruler className="w-4 h-4 mr-2" /> Enter room by hand
          </Button>
        </section>
      </main>

      {/* ── Info dialog: the two options explained ── */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Two ways to scan</DialogTitle>
            <DialogDescription>Both feed the same planner — pick whichever fits your phone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-slate-200 p-3 space-y-1">
              <p className="font-semibold text-slate-900 flex items-center gap-2"><Camera className="w-4 h-4" /> Quick scan — most Android phones</p>
              <p className="text-slate-600">
                Runs in your browser using the camera. You tap to mark the room's
                corners, then optionally the ceiling and each door and window.
                Takes 2–3 minutes. Measurements are a strong starting point — you'll confirm
                them on a plan, and a professional check measure happens before manufacture.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-1">
              <p className="font-semibold text-slate-900 flex items-center gap-2"><ScanLine className="w-4 h-4" /> Pro scan — iPhone Pro / iPad Pro with LiDAR</p>
              <p className="text-slate-600">
                Uses Apple's room-scanning technology. Walk the room once and it
                detects the walls, doors and windows automatically — no tapping.
                Scan with a RoomPlan-compatible app, export the JSON file and
                import it here. Typically the most detailed capture.
              </p>
            </div>
            <p className="text-slate-500 text-xs">
              Not sure? If your phone is an iPhone 12 Pro or newer Pro model, use
              Pro scan. Otherwise try Quick scan — and if it isn't supported,
              manual entry only takes a minute. Every option is checked by a
              professional measure before manufacture.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manual entry dialog ── */}
      <ManualEntryDialog
        open={showManual}
        onOpenChange={setShowManual}
        onSubmit={(input) => {
          const scan = buildManualScan(input);
          setShowManual(false);
          if (!storeAndGo(scan)) setImportError('could not store the room — your browser may be blocking storage');
        }}
      />



      {/* ── DOM overlay shown inside the AR session ── */}
      <div ref={overlayRef} className={scanning ? 'fixed inset-0 z-50 pointer-events-none' : 'hidden'}>
        <div className="absolute top-0 inset-x-0 p-4 text-center pointer-events-none">
          <span className="inline-block rounded-full bg-black/70 text-white text-sm px-4 py-2">
            {topCaption}
          </span>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3">
          <div className={cn(
            'relative w-14 h-14 rounded-full border-2 transition-colors',
            hasSurface ? 'border-emerald-400 bg-emerald-400/15' : 'border-white/70 bg-black/10',
          )}>
            <span className={cn(
              'absolute left-1/2 top-2 bottom-2 w-0.5 -translate-x-1/2',
              hasSurface ? 'bg-emerald-300' : 'bg-white/70',
            )} />
            <span className={cn(
              'absolute top-1/2 left-2 right-2 h-0.5 -translate-y-1/2',
              hasSurface ? 'bg-emerald-300' : 'bg-white/70',
            )} />
          </div>
          <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">
            {reticleCaption}
          </span>
        </div>

        {/* Opening-type selector (openings phase only) */}
        {phase === 'openings' && (
          <div className="absolute bottom-32 inset-x-0 flex flex-wrap items-center justify-center gap-2 px-3 pointer-events-auto">
            {(Object.keys(OPENING_LABELS) as OpeningType[]).map((t) => (
              <button
                key={t}
                onClick={() => { openingTypeRef.current = t; setOpeningType(t); }}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium border',
                  openingType === t ? 'bg-white text-slate-900 border-white' : 'bg-black/50 text-white border-white/40',
                )}
              >
                {OPENING_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        <div className="absolute bottom-4 inset-x-0 flex flex-wrap items-center justify-center gap-2 px-3 pointer-events-auto">
          {phase === 'corners' && (
            <>
              <Button
                variant="outline"
                className="bg-white/90"
                onClick={() => {
                  if (wallTapsRef.current.length > 0) {
                    wallTapsRef.current = wallTapsRef.current.slice(0, -1);
                    setWallTaps(wallTapsRef.current);
                  } else if (hiddenModeRef.current) {
                    hiddenModeRef.current = false;
                    setHiddenMode(false);
                  } else {
                    cornersRef.current = cornersRef.current.slice(0, -1);
                    setCorners(cornersRef.current);
                  }
                  setHiddenHint(null);
                  rebuildGhostRef.current();
                }}
                disabled={corners.length === 0 && !hiddenMode && wallTaps.length === 0}
              >
                <Redo2 className="w-4 h-4 mr-1" /> Undo
              </Button>
              <Button
                variant="outline"
                className={cn('bg-white/90', hiddenMode && 'ring-2 ring-amber-400')}
                onClick={() => {
                  const next = !hiddenModeRef.current;
                  hiddenModeRef.current = next;
                  setHiddenMode(next);
                  wallTapsRef.current = [];
                  setWallTaps([]);
                  setHiddenHint(null);
                  rebuildGhostRef.current();
                }}
              >
                {hiddenMode ? 'Cancel hidden' : 'Corner hidden?'}
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-500 h-11 px-4"
                onClick={() => setPhaseBoth('height')}
                disabled={corners.length < 4 || hiddenMode}
              >
                <Check className="w-4 h-4 mr-1" /> Corners done ({corners.length})
              </Button>
              <Button variant="outline" className="bg-white/90" onClick={endSession}>Cancel</Button>
            </>
          )}

          {phase === 'height' && (
            <>
              <Button variant="outline" className="bg-white/90" onClick={() => setPhaseBoth('openings')}>
                Skip height
              </Button>
              <Button variant="outline" className="bg-white/90" onClick={endSession}>Cancel</Button>
            </>
          )}

          {phase === 'openings' && (
            <>
              <Button
                variant="outline"
                className="bg-white/90"
                onClick={() => {
                  if (pendingPointRef.current) {
                    pendingPointRef.current = null;
                    setPendingPoint(null);
                  } else {
                    openingsRef.current = openingsRef.current.slice(0, -1);
                    setOpenings(openingsRef.current);
                  }
                  rebuildGhostRef.current();
                }}
                disabled={openings.length === 0 && !pendingPoint}
              >
                <Redo2 className="w-4 h-4 mr-1" /> Undo
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-500 h-11 px-4"
                onClick={finish}
              >
                <DoorOpen className="w-4 h-4 mr-1" /> Finish{heightMm ? ` · ${(heightMm / 1000).toFixed(2)}m` : ''}
              </Button>
              <Button variant="outline" className="bg-white/90" onClick={endSession}>Cancel</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Manual entry dialog ────────────────────────────────────────────────────
// Compact step-through form for phones without LiDAR or WebXR. Produces the
// same UnconfirmedRoomScanV1 the two scan lanes do.
type ManualInput = {
  widthMm: number; depthMm: number; heightMm: number;
  doorWall?: 'N' | 'E' | 'S' | 'W'; doorOffsetMm?: number; doorWidthMm?: number;
  windowWall?: 'N' | 'E' | 'S' | 'W'; windowOffsetMm?: number; windowWidthMm?: number;
};

function ManualEntryDialog({
  open, onOpenChange, onSubmit,
}: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (input: ManualInput) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [widthM, setWidthM] = useState('3.6');
  const [depthM, setDepthM] = useState('3.0');
  const [heightM, setHeightM] = useState('2.4');
  const [doorWall, setDoorWall] = useState<'N' | 'E' | 'S' | 'W' | ''>('');
  const [doorOffsetMm, setDoorOffsetMm] = useState('0');
  const [doorWidthMm, setDoorWidthMm] = useState('820');
  const [windowWall, setWindowWall] = useState<'N' | 'E' | 'S' | 'W' | ''>('');
  const [windowOffsetMm, setWindowOffsetMm] = useState('600');
  const [windowWidthMm, setWindowWidthMm] = useState('1200');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setStep(1); setError(null); } }, [open]);

  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : NaN; };
  const submit = () => {
    const w = Math.round(num(widthM) * 1000);
    const d = Math.round(num(depthM) * 1000);
    const h = Math.round(num(heightM) * 1000);
    if (!(w >= 1000 && w <= 20000) || !(d >= 1000 && d <= 20000) || !(h >= 2000 && h <= 4500)) {
      setError('Widths must be 1–20 m and ceiling 2.0–4.5 m.'); setStep(2); return;
    }
    onSubmit({
      widthMm: w, depthMm: d, heightMm: h,
      ...(doorWall ? { doorWall, doorOffsetMm: num(doorOffsetMm) || 0, doorWidthMm: num(doorWidthMm) || 820 } : {}),
      ...(windowWall ? { windowWall, windowOffsetMm: num(windowOffsetMm) || 0, windowWidthMm: num(windowWidthMm) || 1200 } : {}),
    });
  };

  const WallPicker = ({ value, onChange }: { value: 'N' | 'E' | 'S' | 'W' | ''; onChange: (v: 'N' | 'E' | 'S' | 'W' | '') => void }) => (
    <div className="flex gap-2 flex-wrap">
      {(['', 'N', 'E', 'S', 'W'] as const).map((w) => (
        <button key={w || 'none'} type="button" onClick={() => onChange(w)}
          className={cn('h-9 px-3 rounded-md border text-sm',
            value === w ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300')}>
          {w === '' ? 'None' : `Wall ${w}`}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter your room · step {step} of 3</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Which shape is your room?'
              : step === 2 ? 'Room size and ceiling height.'
              : 'Doors and windows (optional).'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {step === 1 && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-slate-700">Rectangle rooms are supported here. L-shaped or unusual layouts — use the Pro scan or contact us and we'll capture your room together.</p>
              <div className="flex gap-2">
                <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-700" onClick={() => setStep(2)}>Rectangle — continue</Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-slate-600 mb-1">Room width (m, along the main wall)</span>
                <input inputMode="decimal" value={widthM} onChange={(e) => setWidthM(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-300" />
              </label>
              <label className="block">
                <span className="block text-slate-600 mb-1">Room depth (m)</span>
                <input inputMode="decimal" value={depthM} onChange={(e) => setDepthM(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-300" />
              </label>
              <label className="block">
                <span className="block text-slate-600 mb-1">Ceiling height (m)</span>
                <input inputMode="decimal" value={heightM} onChange={(e) => setHeightM(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-300" />
              </label>
              {error && <p className="text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-700" onClick={() => { setError(null); setStep(3); }}>Continue</Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="font-medium text-slate-800">Door (optional)</p>
                <WallPicker value={doorWall} onChange={setDoorWall} />
                {doorWall && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="block text-slate-600 mb-1">Offset (mm)</span>
                      <input inputMode="numeric" value={doorOffsetMm} onChange={(e) => setDoorOffsetMm(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-slate-300" /></label>
                    <label className="block"><span className="block text-slate-600 mb-1">Width (mm)</span>
                      <input inputMode="numeric" value={doorWidthMm} onChange={(e) => setDoorWidthMm(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-slate-300" /></label>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="font-medium text-slate-800">Window (optional)</p>
                <WallPicker value={windowWall} onChange={setWindowWall} />
                {windowWall && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="block text-slate-600 mb-1">Offset (mm)</span>
                      <input inputMode="numeric" value={windowOffsetMm} onChange={(e) => setWindowOffsetMm(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-slate-300" /></label>
                    <label className="block"><span className="block text-slate-600 mb-1">Width (mm)</span>
                      <input inputMode="numeric" value={windowWidthMm} onChange={(e) => setWindowWidthMm(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-slate-300" /></label>
                  </div>
                )}
              </div>
              {error && <p className="text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500" onClick={submit}>
                  <Check className="w-4 h-4 mr-1" /> Save room
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

