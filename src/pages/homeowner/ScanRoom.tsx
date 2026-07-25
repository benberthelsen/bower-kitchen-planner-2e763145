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
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  buildScanFromCapture, intersectWallLines, type XrCorner, type XrOpeningMark,
} from '@/lib/roomScan/webxrFit';
import { importRoomPlanFileText } from '@/lib/roomScan/roomplanImport';

export const PENDING_SCAN_KEY = 'bower.pendingScan';

type Support = 'checking' | 'insecure' | 'no-xr' | 'no-ar' | 'ready';
type Phase = 'corners' | 'height' | 'openings';
type OpeningType = XrOpeningMark['type'];

interface Hit { x: number; y: number; z: number }

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

  const endSession = useCallback(async () => {
    try { await sessionRef.current?.end(); } catch { /* already ended */ }
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
        optionalFeatures: ['dom-overlay'],
        domOverlay: overlayRef.current ? { root: overlayRef.current } : undefined,
      } as XRSessionInit);
      sessionRef.current = session;
      setScanning(true);

      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl', { xrCompatible: true }) as WebGLRenderingContext;
      await session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
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
            wallTapsRef.current = [...wallTapsRef.current, { x: hit.x, z: hit.z }];
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
            cornersRef.current = [...cornersRef.current, { x: hit.x, z: hit.z }];
            setCorners(cornersRef.current);
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
        if (navigator.vibrate) navigator.vibrate(40);
      });
      session.addEventListener('end', () => {
        sessionRef.current = null;
        hasSurfaceRef.current = false;
        setHasSurface(false);
        setScanning(false);
      });

      const onFrame = (_t: number, frame: XRFrame) => {
        if (!sessionRef.current) return;
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
        session.requestAnimationFrame(onFrame);
      };
      session.requestAnimationFrame(onFrame);
    } catch (err) {
      setScanning(false);
      setError(err instanceof Error ? err.message : 'could not start the camera session');
    }
  }, []);

  useEffect(() => () => { void endSession(); }, [endSession]);

  const handleImportFile = useCallback(async (file: File) => {
    setImportError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const result = importRoomPlanFileText(text);
      if ('reason' in result) { setImportError(result.reason); return; }
      if (!storeAndGo(result.scan)) {
        setImportError('could not store the scan — your browser may be blocking storage');
      }
    } catch {
      setImportError('could not read that file — try exporting the scan again');
    } finally {
      setImporting(false);
    }
  }, [storeAndGo]);

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
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Walk to each corner of the room and tap to mark it (4 corners).</li>
                <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Corner blocked by an existing kitchen? Tap "Corner hidden?" and mark two points on each wall instead — we'll find the corner for you.</li>
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
        <section className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-slate-700" />
              <h2 className="font-semibold text-slate-900">Pro scan</h2>
            </div>
            <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">iPhone Pro · LiDAR</span>
          </div>
          <p className="text-sm text-slate-500">
            LiDAR iPhones can scan the room automatically — walls, doors and
            windows are detected for you. Scan with a RoomPlan-compatible app,
            export the scan as a <span className="font-medium">JSON file</span>, and import it here.
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
            <Upload className="w-4 h-4 mr-2" /> {importing ? 'Importing…' : 'Import scan file'}
          </Button>
          {importError && <p className="text-sm text-red-600 text-center">{importError}</p>}
          <p className="text-xs text-slate-400">
            A one-tap Bower scanning app for iPhone is on the roadmap — this import works today.
          </p>
        </section>

        {/* ── Manual entry ── */}
        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate('/wizard')} className="text-slate-600">
            <Ruler className="w-4 h-4 mr-2" /> Or enter your room manually — it only takes a minute
          </Button>
        </div>
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
                Takes 2–3 minutes. Accuracy is good for quoting; you'll confirm
                the measurements on a plan before anything is designed.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-1">
              <p className="font-semibold text-slate-900 flex items-center gap-2"><ScanLine className="w-4 h-4" /> Pro scan — iPhone Pro / iPad Pro with LiDAR</p>
              <p className="text-slate-600">
                Uses Apple's room-scanning technology. Walk the room once and it
                detects the walls, doors and windows automatically — no tapping.
                Scan with a RoomPlan-compatible app, export the JSON file and
                import it here. The most accurate option.
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
          <div className="absolute bottom-24 inset-x-0 flex items-center justify-center gap-2 pointer-events-auto">
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

        <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-3 pointer-events-auto">
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
                }}
              >
                {hiddenMode ? 'Cancel hidden' : 'Corner hidden?'}
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-500 h-12 px-6"
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
                }}
                disabled={openings.length === 0 && !pendingPoint}
              >
                <Redo2 className="w-4 h-4 mr-1" /> Undo
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-500 h-12 px-6"
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
