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

async function scannerBridge(input: BridgeInput): Promise<Response> {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to the planner to view this scan.');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scanner-private-bridge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(input),
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Scanner access was denied or expired. Reopen the saved scan.');
    if (response.status === 403) throw new Error('This scan is not linked to this saved room.');
    if (response.status === 409) throw new Error('The scan changed. Review the new scan before linking it.');
    throw new Error(`Scanner connection failed (${response.status}).`);
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
  if (manifest.captureId !== session.captureId || manifest.sourceRevision !== sourceRevision
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
