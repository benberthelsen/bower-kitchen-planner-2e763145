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
  AppWindow, ArrowLeft, Camera, Check, CircleDot, DoorOpen, Info, Plus, Redo2, Ruler,
  ScanLine, Trash2, Upload,
} from 'lucide-react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  buildScanFromCapture, intersectWallLines, type XrCorner, type XrOpeningMark,
  dominantLine, intersectDetectedWallLines, snapToPlanes, type PlaneSnap, type WallLine,
} from '@/lib/roomScan/webxrFit';
import { importRoomPlanFileText } from '@/lib/roomScan/roomplanImport';
import {
  MANUAL_WALL_OPTIONS,
  manualWallLabel,
  validateManualOpeningDrafts,
  type ManualOpeningDraft,
  type ManualOpeningInput,
  type ManualOpeningType,
} from '@/lib/roomScan/manualEntry';

/**
 * How far a tap is allowed to move when it snaps to detected geometry.
 *
 * These are deliberately shared between the live ghost preview and the commit
 * path. They used to differ (preview 0.55, commit 0.3 in the four-point
 * fallback), so the pillar showed a lock the commit would not perform.
 *
 * Previous values were 0.3 / 0.55 with a corner gate of 1.5x on top, i.e. a
 * committed corner could sit 450 mm — or 825 mm in hidden mode — from where
 * the customer aimed, with no feedback beyond a green tick. The two-wall lock
 * was worse: it accepted an intersection up to 2 m away.
 */
const CORNER_SNAP_TOL_M = 0.15;
/** Hidden mode aims at a wall face rather than the corner, so it needs a
 *  little more room — but nothing like the old 0.55. */
const HIDDEN_SNAP_TOL_M = 0.3;
/** Maximum distance between where the customer aimed and the corner computed
 *  by intersecting two locked wall planes. Two 3 m walls each off by 3 deg
 *  already intersect ~300 mm from truth, so 2 m accepted near-nonsense. */
const HIDDEN_CORNER_MAX_M = 0.6;
/** A corner tap must land near the floor. local-floor reference space puts
 *  y = 0 at the floor, so this rejects taps that hit a benchtop or island. */
const FLOOR_TOLERANCE_M = 0.25;

export const PENDING_SCAN_KEY = 'bower.pendingScan';

type Support = 'checking' | 'insecure' | 'no-xr' | 'no-ar' | 'ready';
type Phase = 'corners' | 'height' | 'openings';
type OpeningType = XrOpeningMark['type'];
type AimTarget = 'searching' | 'floor' | 'surface' | 'wall' | 'corner';
type HiddenCaptureMode = 'smart' | 'manual';

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

const MAX_ROOMPLAN_FILE_BYTES = 10 * 1024 * 1024;

export function quickScanErrorMessage(error: unknown): string {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';

  if (name === 'NotAllowedError' || name === 'SecurityError' || message.includes('permission')) {
    return 'Camera access was not allowed. Enable camera permission for this site, then try again.';
  }
  if (name === 'NotSupportedError' || message.includes('not supported')) {
    return 'Quick scan is not available on this device. Use Pro scan or enter the room by hand below.';
  }
  if (name === 'InvalidStateError') {
    return 'Another camera or AR session is already open. Close it, reload this page, and try again.';
  }
  if (message.includes('hit test') || message.includes('surface tracking')) {
    return 'AR surface tracking could not start. Move to a well-lit room and try again, or enter measurements by hand.';
  }
  return 'The camera scan could not start. Try again, or use Pro scan or manual measurements below.';
}

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
  const [detectedHeightMm, setDetectedHeightMm] = useState<number | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);
  // Hidden-corner mode: the floor corner is blocked (existing kitchen), so the
  // customer taps 2 points on each wall instead; we intersect the wall lines.
  const [wallTaps, setWallTaps] = useState<XrCorner[]>([]);
  const [hiddenMode, setHiddenMode] = useState(false);
  const [hiddenCaptureMode, setHiddenCaptureMode] = useState<HiddenCaptureMode>('smart');
  const [lockedWallCount, setLockedWallCount] = useState(0);
  const [detectedWallCount, setDetectedWallCount] = useState(0);
  const [floorLocked, setFloorLocked] = useState(false);
  const [aimTarget, setAimTarget] = useState<AimTarget>('searching');
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
  const hiddenCaptureModeRef = useRef<HiddenCaptureMode>('smart');
  const lockedWallLineRef = useRef<WallLine | null>(null);
  const detectedWallCountRef = useRef(0);
  const aimTargetRef = useRef<AimTarget>('searching');
  const currentPlaneSnapRef = useRef<PlaneSnap | null>(null);
  const openingsRef = useRef<XrOpeningMark[]>([]);
  const pendingPointRef = useRef<XrCorner | null>(null);
  const openingTypeRef = useRef<OpeningType>('door');
  const heightRef = useRef<number | null>(null);
  const detectedHeightRef = useRef<number | null>(null);
  const lastHitRef = useRef<Hit | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const arCleanupRef = useRef<() => void>(() => {});
  // Rebuilds the in-scene "ghost" of everything captured so far; assigned a
  // real implementation while an AR session is live.
  const rebuildGhostRef = useRef<() => void>(() => {});
  const captureCurrentPointRef = useRef<() => void>(() => {});
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

  const cleanupSessionResources = useCallback(() => {
    arCleanupRef.current();
    arCleanupRef.current = () => {};
    rendererRef.current?.setAnimationLoop(null);
    rendererRef.current?.dispose();
    rendererRef.current = null;
    rebuildGhostRef.current = () => {};
    captureCurrentPointRef.current = () => {};
    lastHitRef.current = null;
    currentPlaneSnapRef.current = null;
    lockedWallLineRef.current = null;
    detectedWallCountRef.current = 0;
    aimTargetRef.current = 'searching';
    hasSurfaceRef.current = false;
    setHasSurface(false);
    setDetectedWallCount(0);
    setFloorLocked(false);
    setAimTarget('searching');
    setLockedWallCount(0);
    setScanning(false);
  }, []);

  const endSession = useCallback(async () => {
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    try { await activeSession?.end(); } catch { /* already ended */ }
    cleanupSessionResources();
  }, [cleanupSessionResources]);

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
    // Keep the AR session alive until the fit is known to be good. Ending it
    // first meant a single mis-ordered or mis-snapped corner threw away the
    // whole capture — corners, height and openings — with no way back.
    if ('reason' in result) {
      // The reason MUST go to scanHint, not just error: `error` renders only on
      // the lobby screen, which sits behind the immersive session. Setting it
      // alone made a failed fit look like the Finish button doing nothing.
      setScanHint(`${result.reason} — undo a corner and re-mark it, or Cancel to enter the room by hand.`);
      setError(result.reason);
      return;
    }
    await endSession();
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
    setDetectedHeightMm(null);
    setScanHint(null);
    cornersRef.current = [];
    openingsRef.current = [];
    pendingPointRef.current = null;
    heightRef.current = null;
    detectedHeightRef.current = null;
    wallTapsRef.current = [];
    hiddenModeRef.current = false;
    hiddenCaptureModeRef.current = 'smart';
    lockedWallLineRef.current = null;
    detectedWallCountRef.current = 0;
    aimTargetRef.current = 'searching';
    currentPlaneSnapRef.current = null;
    setWallTaps([]);
    setHiddenMode(false);
    setHiddenCaptureMode('smart');
    setLockedWallCount(0);
    setDetectedWallCount(0);
    setFloorLocked(false);
    setAimTarget('searching');
    setHiddenHint(null);
    lastHitRef.current = null;
    hasSurfaceRef.current = false;
    setHasSurface(false);
    setPhaseBoth('corners');
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    if (!xr) {
      setSupport('no-xr');
      setError('This browser cannot run camera scanning. Use Chrome on a compatible Android phone, or enter the room by hand.');
      return;
    }

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
      arCleanupRef.current = () => {
        renderer.setAnimationLoop(null);
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
          materials.forEach((material) => material.dispose());
        });
        renderer.dispose();
      };
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
        ceiling: null as { y: number; area: number } | null,
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
        if (lockedWallLineRef.current) {
          panel(lockedWallLineRef.current.a, lockedWallLineRef.current.b, EMERALD, 0.42, 1.2);
        }
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
      setFloorLocked(true);
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const hitTestSource = await (session as XRSession & {
        requestHitTestSource(o: { space: XRReferenceSpace }): Promise<XRHitTestSource | undefined>;
      }).requestHitTestSource({ space: viewerSpace });
      if (!hitTestSource) throw new Error('AR surface tracking could not start');

      const completeHiddenCorner = (corner: XrCorner, message: string) => {
        cornersRef.current = [...cornersRef.current, corner];
        setCorners(cornersRef.current);
        hiddenModeRef.current = false;
        setHiddenMode(false);
        hiddenCaptureModeRef.current = 'smart';
        setHiddenCaptureMode('smart');
        lockedWallLineRef.current = null;
        setLockedWallCount(0);
        wallTapsRef.current = [];
        setWallTaps([]);
        setHiddenHint(message);
      };

      // Both a screen tap and the large overlay capture button call this same
      // action. The button makes acquisition explicit; tap-anywhere remains as
      // a convenient shortcut for customers already familiar with AR capture.
      const captureCurrentPoint = () => {
        const hit = lastHitRef.current;
        if (!hit) return;
        const p = phaseRef.current;
        if (p === 'corners') {
          if (hiddenModeRef.current) {
            if (hiddenCaptureModeRef.current === 'smart') {
              const aimedAt = { x: hit.x, z: hit.z };
              const planeSnap = snapToPlanes(aimedAt, planeState.lines, HIDDEN_SNAP_TOL_M);
              currentPlaneSnapRef.current = planeSnap;

              if (planeSnap.kind === 'corner') {
                completeHiddenCorner(planeSnap.point, 'Corner calculated from the two detected wall planes ✓');
              } else if (planeSnap.kind === 'wall' && planeSnap.line) {
                if (!lockedWallLineRef.current) {
                  lockedWallLineRef.current = planeSnap.line;
                  setLockedWallCount(1);
                  setHiddenHint('First wall locked ✓ Now point at the adjoining wall.');
                } else {
                  const corner = intersectDetectedWallLines(
                    lockedWallLineRef.current,
                    planeSnap.line,
                    aimedAt,
                    HIDDEN_CORNER_MAX_M,
                  );
                  if (corner) {
                    completeHiddenCorner(corner, 'Hidden corner calculated from two wall locks ✓');
                  } else {
                    setHiddenHint('That looks like the same wall. Keep the first wall locked and point at the wall around the corner.');
                  }
                }
              } else {
                setHiddenHint('No wall plane is locked yet. Move the phone slowly across the wall until the reticle turns blue.');
              }
            } else {
              // Compatibility fallback for devices that expose hit testing but
              // not vertical plane detection: two points on each wall.
              const tapSnap = snapToPlanes({ x: hit.x, z: hit.z }, planeState.lines, HIDDEN_SNAP_TOL_M);
              wallTapsRef.current = [...wallTapsRef.current, tapSnap.point];
              setWallTaps(wallTapsRef.current);
              if (wallTapsRef.current.length === 4) {
                const [a1, a2, b1, b2] = wallTapsRef.current;
                const corner = intersectWallLines(a1, a2, b1, b2);
                wallTapsRef.current = [];
                setWallTaps([]);
                if (corner) {
                  completeHiddenCorner(corner, 'Hidden corner added from the four wall points ✓');
                } else {
                  setHiddenHint('Those points did not form a reliable corner. Space each pair further apart and try again.');
                }
              }
            }
          } else {
            // The ray returns the NEAREST hit of any orientation, so aiming at
            // a floor corner across a kitchen often lands on a benchtop front,
            // an island or a bin — several hundred mm out. y is already known
            // to be floor-relative here (local-floor reference space).
            if (Math.abs(hit.y) > FLOOR_TOLERANCE_M) {
              setHiddenHint('That is not floor level — aim at the floor, or use "Corner blocked?" for a hidden corner.');
              setTimeout(() => setHiddenHint(null), 3000);
              return;
            }
            const cornerSnap = snapToPlanes({ x: hit.x, z: hit.z }, planeState.lines, CORNER_SNAP_TOL_M);
            cornersRef.current = [...cornersRef.current, cornerSnap.point];
            setCorners(cornersRef.current);
            if (cornerSnap.kind !== 'none') {
              // Report HOW FAR the point moved. A 20 mm snap and a 450 mm snap
              // previously produced identical feedback, which is what made bad
              // corners impossible to notice until the fit failed at the end.
              const movedMm = Math.round(
                Math.hypot(cornerSnap.point.x - hit.x, cornerSnap.point.z - hit.z) * 1000,
              );
              const what = cornerSnap.kind === 'corner' ? 'wall corner' : 'wall';
              setHiddenHint(
                movedMm >= 5
                  ? `Snapped ${movedMm}mm to a detected ${what} ✓`
                  : `On a detected ${what} ✓`,
              );
              setTimeout(() => setHiddenHint(null), 2500);
            }
          }
        } else if (p === 'height') {
          // local-floor: y≈0 at floor level, so the ceiling hit's y IS the height.
          const measuredMm = Math.round(hit.y * 1000);
          if (measuredMm < 2000 || measuredMm > 4500) {
            setScanHint('That does not look like a ceiling. Aim overhead, or use the detected height or Skip height.');
            return;
          }
          heightRef.current = measuredMm;
          setHeightMm(heightRef.current);
          setScanHint(null);
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
      };
      captureCurrentPointRef.current = captureCurrentPoint;
      session.addEventListener('select', captureCurrentPoint);
      session.addEventListener('end', () => {
        if (sessionRef.current === session) sessionRef.current = null;
        cleanupSessionResources();
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
        // plane object; refreshed when ARCore refines them, and evicted below
        // when ARCore drops them).
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
              const area = Math.abs(world.reduce((sum, point, index) => {
                const next = world[(index + 1) % world.length];
                return sum + point.x * next.z - next.x * point.z;
              }, 0) / 2);
              if (y >= 2 && y <= 4.5 && area >= 0.5 && (!planeState.ceiling || area > planeState.ceiling.area)) {
                planeState.ceiling = { y, area };
                const nextHeight = Math.round(y * 1000);
                if (Math.abs(nextHeight - (detectedHeightRef.current ?? 0)) >= 20) {
                  detectedHeightRef.current = nextHeight;
                  setDetectedHeightMm(nextHeight);
                }
              }
            }
          });
          // ARCore removes planes when it merges them into a larger one. Left
          // in the map they stayed as snap targets and stayed drawn, so the
          // customer saw walls the scanner no longer believed in and taps could
          // lock onto lines that had drifted out of date.
          for (const key of [...planeState.map.keys()]) {
            if (!(detected as unknown as Set<object>).has(key)) {
              planeState.map.delete(key);
              planeState.dirty = true;
            }
          }
          if (planeState.dirty) {
            planeState.dirty = false;
            rebuildPlanes();
            const count = planeState.lines.length;
            if (count !== detectedWallCountRef.current) {
              detectedWallCountRef.current = count;
              setDetectedWallCount(count);
            }
          }
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

        let currentSnap: PlaneSnap | null = null;
        let nextAimTarget: AimTarget = hit ? 'surface' : 'searching';
        if (hit && p === 'corners') {
          currentSnap = snapToPlanes({ x: hit.x, z: hit.z }, planeState.lines, hiddenModeRef.current ? HIDDEN_SNAP_TOL_M : CORNER_SNAP_TOL_M);
          currentPlaneSnapRef.current = currentSnap;
          nextAimTarget = currentSnap.kind === 'corner'
            ? 'corner'
            : currentSnap.kind === 'wall'
              ? 'wall'
              : Math.abs(hit.y) <= 0.2
                ? 'floor'
                : 'surface';
        } else {
          currentPlaneSnapRef.current = null;
        }
        if (nextAimTarget !== aimTargetRef.current) {
          aimTargetRef.current = nextAimTarget;
          setAimTarget(nextAimTarget);
        }

        if (hit && (p === 'corners' || p === 'openings')) {
          // Snap the pillar onto detected wall geometry so it locks on target
          // instead of hovering nearby — the tap uses the same snapped point.
          const snap = currentSnap ?? { point: { x: hit.x, z: hit.z }, kind: 'none' as const };
          previewPost.position.set(snap.point.x, 0.6, snap.point.z);
          const mat = previewPost.material as THREE.MeshBasicMaterial;
          mat.color.setHex(p === 'openings'
            ? 0xf59e0b
            : snap.kind === 'corner'
              ? 0x10b981
              : snap.kind === 'wall'
                ? 0x38bdf8
                : hiddenModeRef.current
                  ? 0xf59e0b
                  : 0x34d399);
          mat.opacity = snap.kind === 'none' ? 0.45 : 0.9;
          previewPost.visible = true;
        } else {
          previewPost.visible = false;
        }

        renderer.render(scene, camera);
      });
    } catch (err) {
      await endSession();
      setError(quickScanErrorMessage(err));
    }
  }, [endSession]);

  useEffect(() => () => { void endSession(); }, [endSession]);

  useEffect(() => {
    if (!scanning) return;
    const stopWhenBackgrounded = () => {
      if (document.visibilityState === 'hidden') void endSession();
    };
    document.addEventListener('visibilitychange', stopWhenBackgrounded);
    window.addEventListener('pagehide', endSession);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenBackgrounded);
      window.removeEventListener('pagehide', endSession);
    };
  }, [endSession, scanning]);

  const handleImportFile = useCallback(async (file: File) => {
    setImportError(null);
    setPreviewScan(null);
    setImporting(true);
    try {
      const looksLikeJson = file.name.toLowerCase().endsWith('.json')
        || file.type === 'application/json'
        || file.type === '';
      if (!looksLikeJson) {
        setImportError('Choose the JSON file exported by your room-scanning app.');
        return;
      }
      if (file.size > MAX_ROOMPLAN_FILE_BYTES) {
        setImportError('That scan file is over 10 MB. Export the room as JSON without photos or mesh data, then try again.');
        return;
      }
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
  const buildManualScan = useCallback((input: ManualInput): import('@/lib/roomScan/contract').UnconfirmedRoomScanV1 => {
    const openings: import('@/lib/roomScan/contract').OpeningV1[] = input.openings.map((opening) => {
      if (opening.type === 'door') {
        return {
          ...opening,
          heightMm: Math.min(2040, input.heightMm),
        };
      }
      const sillHeightMm = Math.min(900, Math.max(0, input.heightMm - 1200));
      return {
        ...opening,
        heightMm: Math.min(1200, input.heightMm - sillHeightMm),
        sillHeightMm,
      };
    });
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
          ? (hiddenCaptureMode === 'smart'
              ? hiddenHint
                ?? (detectedWallCount === 0
                  ? 'Move slowly across both walls so the camera can recognise their planes.'
                  : lockedWallCount === 0
                    ? 'Point anywhere at the first wall above the cabinets, then lock it.'
                    : 'First wall locked. Point at the adjoining wall to calculate the hidden corner.')
              : (wallTaps.length < 2
                  ? `Fallback: mark 2 spaced points on the first wall (${wallTaps.length}/2)`
                  : `Now mark 2 spaced points on the adjoining wall (${wallTaps.length - 2}/2)`))
          : hiddenHint
            ?? (corners.length === 0
              ? 'Floor level is locked. Aim at the first room corner and capture it.'
              : `${corners.length} corner${corners.length === 1 ? '' : 's'} captured — move to the next one.`))
      : phase === 'height'
        ? (detectedHeightMm
            ? `Ceiling detected at about ${(detectedHeightMm / 1000).toFixed(2)} m — use it or tap to remeasure`
            : 'Aim at the CEILING and tap to measure height — or skip')
        : pendingPoint
          ? `Now tap the OTHER side of the ${OPENING_LABELS[openingType].toLowerCase()}`
          : `${openings.length} marked · Choose a type, then tap ONE side of it at floor level`;

  const reticleCaption =
    phase === 'height'
      ? (detectedHeightMm
          ? `Detected ${(detectedHeightMm / 1000).toFixed(2)} m`
          : hasSurface ? 'Surface found — tap to measure' : 'Aim at the ceiling')
      : phase === 'corners' && hiddenMode && hiddenCaptureMode === 'smart'
        ? (aimTarget === 'corner'
            ? 'Two walls found — corner ready'
            : aimTarget === 'wall'
              ? (lockedWallCount ? 'Adjoining wall ready' : 'Wall ready to lock')
              : detectedWallCount === 0
                ? 'Scan slowly across the wall'
                : 'Aim at a blue wall plane')
        : hasSurface
          ? (phase === 'corners'
              ? aimTarget === 'corner'
                ? 'Corner recognised — capture'
                : aimTarget === 'wall'
                  ? 'Wall found — aim toward its end'
                  : 'Floor locked — aim at the corner'
              : 'Tap to mark this point')
          : 'Move slowly to find a surface';

  const cornerCaptureLabel = hiddenMode
    ? hiddenCaptureMode === 'smart'
      ? aimTarget === 'corner'
        ? 'Use recognised corner'
        : lockedWallCount
          ? 'Lock adjoining wall'
          : 'Lock first wall'
      : `Mark wall point ${Math.min(wallTaps.length + 1, 4)} of 4`
    : `Place corner ${corners.length + 1}`;

  const cornerCaptureDisabled = !hasSurface || (
    hiddenMode
    && hiddenCaptureMode === 'smart'
    && aimTarget !== 'wall'
    && aimTarget !== 'corner'
  );

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
            Let your phone recognise the floor and walls, then capture the room's
            corners, ceiling height, doors and windows. Nothing to install.
          </p>
          {support === 'checking' && <p className="text-sm text-slate-400">Checking your device…</p>}
          {support === 'ready' && !scanning && (
            <div className="space-y-3">
              <ol className="text-sm text-slate-600 space-y-2 rounded-md border border-slate-200 p-3">
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Move the camera slowly while the floor and wall planes lock, then capture each room corner — 4 corners, or 6 for an L-shaped room.</li>
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Existing cabinets hiding a corner? Tap "Corner blocked?", lock the two adjoining walls above the benchtop, and Smart wall lock calculates the corner for you.</li>
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Aim at the ceiling to measure the height — or skip it.</li>
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Mark each door and window by tapping both sides — or add them later on the plan.</li>
              </ol>
              <Button onClick={startScan} className="w-full h-11 bg-slate-900 text-white hover:bg-slate-700">
                <Camera className="w-4 h-4 mr-2" /> Start quick scan
              </Button>
              {error && <p role="alert" className="text-sm text-red-600 text-center">{error}</p>}
            </div>
          )}
          {support !== 'checking' && support !== 'ready' && (
            <p role="status" className="text-sm text-slate-500 rounded-md bg-slate-50 border border-slate-200 p-3">
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
          {importError && <p role="alert" className="text-sm text-red-600 text-center">{importError}</p>}

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
                Runs in your browser using the camera. Your phone recognises floor
                and wall planes, and Smart wall lock can calculate corners hidden
                behind existing cabinets. You confirm the corners, then optionally
                the ceiling and each door and window.
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
        <div className="absolute top-0 inset-x-0 p-3 pointer-events-none">
          <div className="mx-auto max-w-sm rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-white shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
              <span>{phase === 'corners' ? '1 · Map walls' : phase === 'height' ? '2 · Ceiling' : '3 · Openings'}</span>
              <span>{phase === 'corners' ? `${corners.length} corners` : phase === 'openings' ? `${openings.length} marked` : 'Optional'}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-snug">{topCaption}</p>
            {phase === 'corners' && (
              <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
                <span className={cn(
                  'rounded-full border px-2.5 py-1',
                  floorLocked
                    ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
                    : 'border-white/20 bg-white/5 text-slate-300',
                )}>
                  {floorLocked ? '✓ Floor locked' : 'Finding floor…'}
                </span>
                <span className={cn(
                  'rounded-full border px-2.5 py-1',
                  detectedWallCount > 0
                    ? 'border-sky-300/40 bg-sky-400/15 text-sky-100'
                    : 'border-white/20 bg-white/5 text-slate-300',
                )}>
                  {detectedWallCount} wall plane{detectedWallCount === 1 ? '' : 's'} seen
                </span>
              </div>
            )}
            {phase === 'corners' && (
              <p className="mt-2 text-[10px] leading-snug text-slate-400">
                Plane matching runs on your phone. Room photos are not uploaded.
              </p>
            )}
          </div>
          {scanHint && (
            <span role="alert" className="mt-2 mx-auto block max-w-sm rounded-lg bg-amber-500/95 text-slate-950 text-xs px-3 py-2">
              {scanHint}
            </span>
          )}
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3">
          <div className={cn(
            'relative w-16 h-16 rounded-full border-2 transition-all duration-200',
            aimTarget === 'corner'
              ? 'scale-110 border-emerald-300 bg-emerald-400/20 shadow-[0_0_0_8px_rgba(52,211,153,0.12)]'
              : aimTarget === 'wall'
                ? 'border-sky-300 bg-sky-400/20 shadow-[0_0_0_6px_rgba(56,189,248,0.10)]'
                : hasSurface
                  ? 'border-emerald-400 bg-emerald-400/15'
                  : 'border-white/70 bg-black/10',
          )}>
            <span className={cn(
              'absolute left-1/2 top-2 bottom-2 w-0.5 -translate-x-1/2',
              aimTarget === 'wall' ? 'bg-sky-200' : hasSurface ? 'bg-emerald-300' : 'bg-white/70',
            )} />
            <span className={cn(
              'absolute top-1/2 left-2 right-2 h-0.5 -translate-y-1/2',
              aimTarget === 'wall' ? 'bg-sky-200' : hasSurface ? 'bg-emerald-300' : 'bg-white/70',
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

        <div className="absolute bottom-3 inset-x-0 flex items-center justify-center px-3 pointer-events-auto">
          {phase === 'corners' && (
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-950/85 p-3 shadow-2xl backdrop-blur-md">
              {hiddenMode && (
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">Hidden corner</p>
                      <p className="text-[11px] text-slate-300">
                        {hiddenCaptureMode === 'smart' ? 'Smart wall lock' : 'Four-point fallback'}
                      </p>
                    </div>
                    {hiddenCaptureMode === 'smart' && (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className={cn(
                          'rounded-full px-2 py-1',
                          lockedWallCount > 0 ? 'bg-emerald-400 text-emerald-950' : 'bg-white/10 text-slate-300',
                        )}>Wall 1</span>
                        <span className="text-slate-500">→</span>
                        <span className={cn(
                          'rounded-full px-2 py-1',
                          aimTarget === 'corner' ? 'bg-emerald-400 text-emerald-950' : 'bg-white/10 text-slate-300',
                        )}>Wall 2</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button
                className={cn(
                  'h-12 w-full text-sm font-semibold text-white',
                  aimTarget === 'wall' && hiddenMode && hiddenCaptureMode === 'smart'
                    ? 'bg-sky-500 hover:bg-sky-400'
                    : 'bg-emerald-600 hover:bg-emerald-500',
                )}
                onClick={() => captureCurrentPointRef.current()}
                disabled={cornerCaptureDisabled}
              >
                <ScanLine className="mr-2 h-4 w-4" /> {cornerCaptureLabel}
              </Button>

              {hiddenMode && (
                <button
                  type="button"
                  className="mt-2 w-full rounded-lg py-1.5 text-xs text-slate-300 underline underline-offset-2 hover:text-white"
                  onClick={() => {
                    const next: HiddenCaptureMode = hiddenCaptureModeRef.current === 'smart' ? 'manual' : 'smart';
                    hiddenCaptureModeRef.current = next;
                    setHiddenCaptureMode(next);
                    lockedWallLineRef.current = null;
                    setLockedWallCount(0);
                    wallTapsRef.current = [];
                    setWallTaps([]);
                    setHiddenHint(null);
                    rebuildGhostRef.current();
                  }}
                >
                  {hiddenCaptureMode === 'smart'
                    ? 'Phone not finding walls? Use 4-point fallback'
                    : 'Try Smart wall lock instead'}
                </button>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => {
                    if (lockedWallLineRef.current) {
                      lockedWallLineRef.current = null;
                      setLockedWallCount(0);
                    } else if (wallTapsRef.current.length > 0) {
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
                  disabled={corners.length === 0 && !hiddenMode && wallTaps.length === 0 && lockedWallCount === 0}
                >
                  <Redo2 className="mr-1 h-4 w-4" /> Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white',
                    hiddenMode && 'border-amber-300/60 bg-amber-400/20',
                  )}
                  onClick={() => {
                    const next = !hiddenModeRef.current;
                    hiddenModeRef.current = next;
                    setHiddenMode(next);
                    hiddenCaptureModeRef.current = 'smart';
                    setHiddenCaptureMode('smart');
                    lockedWallLineRef.current = null;
                    setLockedWallCount(0);
                    wallTapsRef.current = [];
                    setWallTaps([]);
                    setHiddenHint(null);
                    rebuildGhostRef.current();
                  }}
                >
                  {hiddenMode ? 'Cancel hidden' : 'Corner blocked?'}
                </Button>
                <Button
                  size="sm"
                  className="bg-white text-slate-950 hover:bg-slate-100"
                  onClick={() => setPhaseBoth('height')}
                  disabled={corners.length < 4 || hiddenMode}
                >
                  <Check className="mr-1 h-4 w-4" /> Walls done ({corners.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-300 hover:bg-white/10 hover:text-white"
                  onClick={endSession}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {phase === 'height' && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {detectedHeightMm && (
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => {
                    heightRef.current = detectedHeightMm;
                    setHeightMm(detectedHeightMm);
                    setScanHint(null);
                    setPhaseBoth('openings');
                  }}
                >
                  <Check className="w-4 h-4 mr-1" /> Use {(detectedHeightMm / 1000).toFixed(2)} m
                </Button>
              )}
              <Button variant="outline" className="bg-white/90" onClick={() => setPhaseBoth('openings')}>
                Skip height
              </Button>
              <Button variant="outline" className="bg-white/90" onClick={endSession}>Cancel</Button>
            </div>
          )}

          {phase === 'openings' && (
            <div className="flex flex-wrap items-center justify-center gap-2">
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
            </div>
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
  openings: ManualOpeningInput[];
};

function ManualEntryDialog({
  open, onOpenChange, onSubmit,
}: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (input: ManualInput) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [widthM, setWidthM] = useState('3.6');
  const [depthM, setDepthM] = useState('3.0');
  const [heightM, setHeightM] = useState('2.4');
  const [openingDrafts, setOpeningDrafts] = useState<ManualOpeningDraft[]>([]);
  const nextOpeningId = useRef(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setOpeningDrafts([]);
    nextOpeningId.current = 1;
    setError(null);
  }, [open]);

  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : NaN; };
  const readDimensions = (): Pick<ManualInput, 'widthMm' | 'depthMm' | 'heightMm'> | null => {
    const dimensions = {
      widthMm: Math.round(num(widthM) * 1000),
      depthMm: Math.round(num(depthM) * 1000),
      heightMm: Math.round(num(heightM) * 1000),
    };
    if (
      !(dimensions.widthMm >= 1000 && dimensions.widthMm <= 20000)
      || !(dimensions.depthMm >= 1000 && dimensions.depthMm <= 20000)
      || !(dimensions.heightMm >= 2000 && dimensions.heightMm <= 4500)
    ) {
      setError('Room width and depth must be 1–20 m, and the ceiling must be 2.0–4.5 m.');
      return null;
    }
    return dimensions;
  };

  const continueToOpenings = () => {
    if (!readDimensions()) return;
    setError(null);
    setStep(3);
  };

  const submit = () => {
    const dimensions = readDimensions();
    if (!dimensions) { setStep(2); return; }

    const result = validateManualOpeningDrafts(openingDrafts, dimensions);
    if (result.error) {
      setError(result.error);
      return;
    }

    onSubmit({ ...dimensions, openings: result.openings });
  };

  const addOpening = (type: ManualOpeningType) => {
    const sequence = nextOpeningId.current++;
    setOpeningDrafts((current) => [
      ...current,
      {
        id: `manual-${type}-${sequence}`,
        type,
        wall: '',
        offsetMm: type === 'door' ? '0' : '600',
        widthMm: type === 'door' ? '820' : '1200',
      },
    ]);
    setError(null);
  };

  const updateOpening = (
    id: string,
    patch: Partial<Pick<ManualOpeningDraft, 'wall' | 'offsetMm' | 'widthMm'>>,
  ) => {
    setOpeningDrafts((current) =>
      current.map((opening) => opening.id === id ? { ...opening, ...patch } : opening));
    setError(null);
  };

  const removeOpening = (id: string) => {
    setOpeningDrafts((current) => current.filter((opening) => opening.id !== id));
    setError(null);
  };

  const openingLabel = (opening: ManualOpeningDraft, index: number) => {
    const sameTypeCount = openingDrafts.filter((candidate) => candidate.type === opening.type).length;
    const number = openingDrafts.slice(0, index + 1)
      .filter((candidate) => candidate.type === opening.type).length;
    const typeLabel = opening.type === 'door' ? 'Door' : 'Window';
    return sameTypeCount > 1 ? `${typeLabel} ${number}` : typeLabel;
  };

  const WallPicker = ({ opening }: { opening: ManualOpeningDraft }) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-800">Which wall is it on?</legend>
      <div className="grid grid-cols-2 gap-2">
        {MANUAL_WALL_OPTIONS.map((option) => {
          const selected = opening.wall === option.value;
          const length = option.dimension === 'width' ? widthM : depthM;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => updateOpening(opening.id, { wall: option.value })}
              className={cn(
                'min-h-14 rounded-lg border px-3 py-2 text-left transition-colors',
                selected
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500',
              )}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className={cn('block text-xs', selected ? 'text-slate-300' : 'text-slate-500')}>
                {length} m
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enter your room · step {step} of 3</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Which shape is your room?'
              : step === 2 ? 'Room size and ceiling height.'
              : 'Add any doors or windows, or skip this for now.'}
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
              {error && <p role="alert" className="text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-700" onClick={continueToOpenings}>Continue</Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                Use the <span className="font-medium text-slate-800">main wall</span> from the previous step as your reference.
                Add as many openings as you need. You can also adjust them later on the room plan.
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 justify-center border-slate-300"
                  onClick={() => addOpening('door')}
                >
                  <DoorOpen className="mr-2 h-4 w-4" />
                  Add a door
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 justify-center border-slate-300"
                  onClick={() => addOpening('window')}
                >
                  <AppWindow className="mr-2 h-4 w-4" />
                  Add a window
                </Button>
              </div>

              {openingDrafts.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center">
                  <p className="font-medium text-slate-800">No openings added</p>
                  <p className="mt-1 text-xs text-slate-500">
                    That is okay—save the room now if you are unsure.
                  </p>
                </div>
              )}

              {openingDrafts.map((opening, index) => {
                const label = openingLabel(opening, index);
                const OpeningIcon = opening.type === 'door' ? DoorOpen : AppWindow;
                return (
                  <section
                    key={opening.id}
                    aria-labelledby={`${opening.id}-title`}
                    className="space-y-3 rounded-xl border border-slate-300 bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                          <OpeningIcon className="h-4 w-4" />
                        </span>
                        <p id={`${opening.id}-title`} className="font-semibold text-slate-900">{label}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Remove ${label}`}
                        onClick={() => removeOpening(opening.id)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
                    </div>

                    <WallPicker opening={opening} />

                    {opening.wall && (
                      <>
                        <p className="rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-900">
                          Stand inside the room facing the {manualWallLabel(opening.wall).toLowerCase()}.
                          Measure from its left corner to the left edge of the opening.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="mb-1 block text-slate-600">From left corner (mm)</span>
                            <input
                              inputMode="numeric"
                              value={opening.offsetMm}
                              onChange={(event) => updateOpening(opening.id, { offsetMm: event.target.value })}
                              className="h-10 w-full rounded-md border border-slate-300 px-3"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-slate-600">Opening width (mm)</span>
                            <input
                              inputMode="numeric"
                              value={opening.widthMm}
                              onChange={(event) => updateOpening(opening.id, { widthMm: event.target.value })}
                              className="h-10 w-full rounded-md border border-slate-300 px-3"
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </section>
                );
              })}

              {openingDrafts.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="border border-dashed border-slate-300 text-slate-600"
                    onClick={() => addOpening('door')}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Another door
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="border border-dashed border-slate-300 text-slate-600"
                    onClick={() => addOpening('window')}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Another window
                  </Button>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                  {error}
                </p>
              )}
              <div className="flex gap-2 border-t border-slate-200 pt-3">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500" onClick={submit}>
                  <Check className="mr-1 h-4 w-4" />
                  Save room
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

