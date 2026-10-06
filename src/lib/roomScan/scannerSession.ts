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

export function scannerApiOrigin(): string | null {
  const configured = import.meta.env?.VITE_ROOM_SCANNER_ORIGIN
    || 'https://bower-room-scanner-test-20260912.bowerbuilding.chatgpt.site';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

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

export async function linkScannerRoom(session: ScannerSession, jobId: string, roomId: string,
  sourceRevision?: string): Promise<void> {
  if (!session.linkToken) throw new Error('The scanner link has expired. Reopen the scan to link this room.');
  const origin = scannerApiOrigin();
  if (!origin) throw new Error('Scanner service is not configured.');
  const response = await fetch(`${origin}/api/room-capture/jobs/${session.captureId}/planner-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, roomId, sourceRevision, linkToken: session.linkToken }),
  });
  if (!response.ok) throw new Error(`Scanner link failed (${response.status}).`);
  try {
    sessionStorage.setItem(keyFor(session.captureId), JSON.stringify({ captureId: session.captureId,
      ...(session.evidenceToken ? { evidenceToken: session.evidenceToken } : {}) }));
  } catch { /* The server link is already durable. */ }
}
