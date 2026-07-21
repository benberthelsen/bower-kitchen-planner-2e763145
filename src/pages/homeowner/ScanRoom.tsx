/**
 * ScanRoom — WebXR guided room capture, Phase 2 DISCOVERY PROTOTYPE
 * (master plan §10.1). Quote/design-grade input only; never manufacturing
 * authority. Produces an UnconfirmedRoomScanV1 that the wizard pre-fills and
 * RoomFeaturesEditor must confirm — the same contract every capture source
 * uses.
 *
 * Flow: capability check → AR session (hit-test reticle) → tap to mark each
 * floor corner (3+) → finish → axis-aligned rectangle fit with an invertible
 * source→canonical transform → validated scan → sessionStorage handoff to
 * /wizard.
 *
 * Requirements: HTTPS (or localhost) + Android Chrome with ARCore. Everything
 * else falls back to manual entry, per the master plan.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Check, CircleDot, Redo2, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildScanFromCorners, type XrCorner } from '@/lib/roomScan/webxrFit';

export const PENDING_SCAN_KEY = 'bower.pendingScan';

type Support = 'checking' | 'insecure' | 'no-xr' | 'no-ar' | 'ready';

type Corner = XrCorner;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ScanRoom() {
  const navigate = useNavigate();
  const [support, setSupport] = useState<Support>('checking');
  const [scanning, setScanning] = useState(false);
  const [hasSurface, setHasSurface] = useState(false);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const cornersRef = useRef<Corner[]>([]);
  const lastHitRef = useRef<Corner | null>(null);
  const hasSurfaceRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.isSecureContext) { setSupport('insecure'); return; }
    const xr = (navigator as unknown as { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
    if (!xr) { setSupport('no-xr'); return; }
    xr.isSessionSupported('immersive-ar')
      .then((ok) => setSupport(ok ? 'ready' : 'no-ar'))
      .catch(() => setSupport('no-ar'));
  }, []);

  const endSession = useCallback(async () => {
    try { await sessionRef.current?.end(); } catch { /* already ended */ }
    sessionRef.current = null;
    hasSurfaceRef.current = false;
    setHasSurface(false);
    setScanning(false);
  }, []);

  const finish = useCallback(async () => {
    const result = buildScanFromCorners(cornersRef.current);
    await endSession();
    if ('reason' in result) { setError(result.reason); return; }
    try {
      sessionStorage.setItem(PENDING_SCAN_KEY, JSON.stringify(result.scan));
    } catch {
      setError('could not store the scan — your browser may be blocking storage');
      return;
    }
    navigate('/wizard');
  }, [endSession, navigate]);

  const startScan = useCallback(async () => {
    setError(null);
    setCorners([]);
    cornersRef.current = [];
    lastHitRef.current = null;
    hasSurfaceRef.current = false;
    setHasSurface(false);
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

      // Tap anywhere = mark the corner currently under the reticle.
      session.addEventListener('select', () => {
        const hit = lastHitRef.current;
        if (!hit) return;
        cornersRef.current = [...cornersRef.current, hit];
        setCorners(cornersRef.current);
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
            lastHitRef.current = { x: pose.transform.position.x, z: pose.transform.position.z };
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

  const supportCopy: Record<Exclude<Support, 'ready' | 'checking'>, string> = {
    insecure: 'Scanning needs a secure (https) connection. Open this page over https, or enter your room manually — it only takes a minute.',
    'no-xr': "This browser can't run camera scanning. On an Android phone, open this page in Chrome — or enter your room manually below.",
    'no-ar': "This device doesn't support AR room scanning. Enter your room manually below — it only takes a minute.",
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 bg-white z-20">
        <Link to="/wizard" className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to planner
        </Link>
        <span className="text-xs sm:text-sm text-slate-400">Room scanner · beta</span>
      </header>

      <main className="max-w-md mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Scan your room</h1>
          <p className="text-sm text-slate-500">
            Point your phone at the floor and tap to mark each corner of the room.
            You'll check and fine-tune everything before any design is made — and a
            professional check measure always happens before manufacture.
          </p>
        </div>

        {support === 'checking' && <p className="text-center text-sm text-slate-400">Checking your device…</p>}

        {support !== 'checking' && support !== 'ready' && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3 text-center">
            <p className="text-sm text-slate-600">{supportCopy[support]}</p>
            <Button onClick={() => navigate('/wizard')} className="bg-slate-900 text-white hover:bg-slate-700">
              <Ruler className="w-4 h-4 mr-2" /> Enter room manually
            </Button>
          </div>
        )}

        {support === 'ready' && !scanning && (
          <div className="space-y-3">
            <ol className="text-sm text-slate-600 space-y-2 rounded-md border border-slate-200 p-4">
              <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Stand where you can see the floor. Move your phone slowly until a marker appears.</li>
              <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Start at one corner of the room and tap the screen to mark it.</li>
              <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Walk to each corner in order and mark it — 4 corners for a normal room.</li>
              <li className="flex gap-2"><CircleDot className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" /> Tap Finish. You'll add doors, windows and plumbing on the plan afterwards.</li>
            </ol>
            <Button onClick={startScan} className="w-full h-12 bg-slate-900 text-white hover:bg-slate-700">
              <Camera className="w-4 h-4 mr-2" /> Start scanning
            </Button>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
        )}
      </main>

      {/* DOM overlay shown inside the AR session */}
      <div ref={overlayRef} className={scanning ? 'fixed inset-0 z-50 pointer-events-none' : 'hidden'}>
        <div className="absolute top-0 inset-x-0 p-4 text-center pointer-events-none">
          <span className="inline-block rounded-full bg-black/70 text-white text-sm px-4 py-2">
            {corners.length === 0
              ? 'Aim at the floor in a corner, then tap'
              : `${corners.length} corner${corners.length === 1 ? '' : 's'} marked — walk to the next one`}
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
            {hasSurface ? 'Floor found — aim at the corner and tap' : 'Move slowly to find the floor'}
          </span>
        </div>
        <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-3 pointer-events-auto">
          <Button
            variant="outline"
            className="bg-white/90"
            onClick={() => {
              cornersRef.current = cornersRef.current.slice(0, -1);
              setCorners(cornersRef.current);
            }}
            disabled={corners.length === 0}
          >
            <Redo2 className="w-4 h-4 mr-1" /> Undo
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-500 h-12 px-6"
            onClick={finish}
            disabled={corners.length < 4}
          >
            <Check className="w-4 h-4 mr-1" /> Finish ({corners.length})
          </Button>
          <Button variant="outline" className="bg-white/90" onClick={endSession}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
