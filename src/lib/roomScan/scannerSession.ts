/** Scanner capabilities are tab-scoped and never become part of RoomDocument,
 * the job record, query parameters, or a downloaded room backup. */
export interface ScannerSession {
  captureId: string;
  linkToken?: string;
  evidenceToken?: string;
}

const capturePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/;
const keyFor = (captureId: string) => `bower.scannerSession.${captureId}`;

export function readScannerSession(captureId: string): ScannerSession | null {
  if (!capturePattern.test(captureId) || typeof sessionStorage === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(keyFor(captureId));
    if (!value) return null;
    const parsed = JSON.parse(value) as ScannerSession;
    return parsed.captureId === captureId
      && (!parsed.linkToken || tokenPattern.test(parsed.linkToken))
      && (!parsed.evidenceToken || tokenPattern.test(parsed.evidenceToken)) ? parsed : null;
  } catch { return null; }
}

/** Run before captureHandoffToken(), which removes the entire URL fragment. */
/** Keep the photo capability but drop a link token the person chose not to
 * use (the scanner refuses it once the room keeps its earlier revision), so
 * the room page does not show a link that can never finish. */
export function forgetScannerLink(captureId: string): void {
  const session = readScannerSession(captureId);
  if (!session?.linkToken) return;
  try {
    sessionStorage.setItem(keyFor(captureId), JSON.stringify({ captureId,
      ...(session.evidenceToken ? { evidenceToken: session.evidenceToken } : {}) }));
  } catch { /* Nothing stored, nothing to forget. */ }
}

export function captureScannerSession(): ScannerSession | null {
  if (typeof window === 'undefined') return null;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const captureId = fragment.get('scannerCaptureId');
  if (!captureId || !capturePattern.test(captureId)) return null;
  const linkToken = fragment.get('scannerLinkToken');
  const evidenceToken = fragment.get('scannerEvidenceToken');
  if ((linkToken && !tokenPattern.test(linkToken)) || (evidenceToken && !tokenPattern.test(evidenceToken))) return null;
  const existing = readScannerSession(captureId);
  const session: ScannerSession = {
    captureId,
    ...(linkToken || existing?.linkToken ? { linkToken: linkToken ?? existing!.linkToken } : {}),
    ...(evidenceToken || existing?.evidenceToken ? { evidenceToken: evidenceToken ?? existing!.evidenceToken } : {}),
  };
  try { sessionStorage.setItem(keyFor(captureId), JSON.stringify(session)); } catch { /* In-memory use still works. */ }
  // On the direct room route there is no handoff token reader to scrub the
  // fragment. Keep capability tokens out of copied URLs and browser history.
  fragment.delete('scannerCaptureId');
  fragment.delete('scannerLinkToken');
  fragment.delete('scannerEvidenceToken');
  if (!fragment.has('handoffToken')) {
    const rest = fragment.toString();
    window.history.replaceState(null, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''));
  }
  return session;
}

type BridgeAction = 'link' | 'manifest' | 'photo';
interface BridgeInput {
  action: BridgeAction;
  jobId: string;
  roomId: string;
  captureId: string;
  sourceRevision: string;
  token: string;
  photoId?: string;
}

/** The bridge's HTTP status, so a caller can tell an expired capability (401)
 * from a network fault and offer the right next step. */
export class ScannerBridgeError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ScannerBridgeError'; }
}

async function scannerBridge(input: BridgeInput): Promise<Response> {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to the planner to view this scan.');
  let response: Response;
  try { response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scanner-private-bridge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(input),
    redirect: 'error',
    cache: 'no-store',
  }); } catch {
    throw new ScannerBridgeError('The scan could not be reached. Check your connection and try again; your room is saved.', 0);
  }
  if (!response.ok) {
    const fail = (message: string) => new ScannerBridgeError(message, response.status);
    if (response.status === 401) throw fail('Scanner access has expired. Open the scan and press its kitchen planner button again.');
    if (response.status === 403) throw fail('This scan is not linked to this saved room.');
    if (response.status === 404) throw fail('That scan photo is no longer available. The rest of the scan is unaffected.');
    if (response.status === 409) throw fail('This scan is already linked to another kitchen, or it changed. Open that kitchen from the scan.');
    throw fail('The scan can’t be reached right now. Your room is saved; try again in a few minutes.');
  }
  return response;
}

export async function linkScannerRoom(session: ScannerSession, jobId: string, roomId: string,
  sourceRevision?: string, send: (input: BridgeInput) => Promise<Response> = scannerBridge): Promise<void> {
  if (!session.linkToken) throw new Error('The scanner link has expired. Reopen the scan to link this room.');
  if (!sourceRevision) throw new Error('Save the reviewed scan before linking it.');
  await send({ action: 'link', jobId, roomId, captureId: session.captureId,
    sourceRevision, token: session.linkToken });
  try {
    sessionStorage.setItem(keyFor(session.captureId), JSON.stringify({ captureId: session.captureId,
      ...(session.evidenceToken ? { evidenceToken: session.evidenceToken } : {}) }));
  } catch { /* The server link is already durable. */ }
}

export interface ScannerEvidenceManifest {
  captureId: string;
  sourceRevision: string;
  photos: { id: string; bytes: number }[];
}

export async function loadScannerManifest(session: ScannerSession, jobId: string, roomId: string,
  sourceRevision?: string): Promise<ScannerEvidenceManifest> {
  if (!session.evidenceToken || !sourceRevision) throw new Error('Reopen the saved scan to view its photos.');
  const response = await scannerBridge({ action: 'manifest', jobId, roomId,
    captureId: session.captureId, sourceRevision, token: session.evidenceToken });
  const manifest = await response.json() as ScannerEvidenceManifest;
  // The manifest names the scanner's current revision; photos are per capture,
  // so a room saved from an earlier revision still shows them.
  if (manifest.captureId !== session.captureId || typeof manifest.sourceRevision !== 'string'
    || !Array.isArray(manifest.photos)) throw new Error('Scanner evidence is invalid.');
  return manifest;
}

export async function loadScannerPhoto(session: ScannerSession, jobId: string, roomId: string,
  sourceRevision: string | undefined, photoId: string): Promise<Blob> {
  if (!session.evidenceToken || !sourceRevision) throw new Error('Reopen the saved scan to view its photos.');
  const response = await scannerBridge({ action: 'photo', jobId, roomId,
    captureId: session.captureId, sourceRevision, token: session.evidenceToken, photoId });
  const blob = await response.blob();
  if (blob.type !== 'image/jpeg' || blob.size > 2 * 1024 * 1024)
    throw new Error('Scanner returned an invalid photo.');
  return blob;
}
