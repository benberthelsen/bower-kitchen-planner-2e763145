/** The scanner's private Sites gateway can only be reached by this server.
 * Keep route selection and job/capture matching independent of HTTP so they
 * can be regression-tested without exposing a gateway credential. */
export type ScannerBridgeInput = {
  action: 'link' | 'manifest' | 'photo';
  jobId: string;
  roomId: string;
  captureId: string;
  sourceRevision: string;
  token: string;
  photoId?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// TradeRoom IDs predate the scanner and are not necessarily UUIDs.
const roomIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const capability = /^[A-Za-z0-9_-]{40,80}$/;
const photoIdPattern = /^\d{4}$/;

export function parseScannerBridgeInput(value: unknown): ScannerBridgeInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.action !== 'link' && input.action !== 'manifest' && input.action !== 'photo') return null;
  if (typeof input.jobId !== 'string' || !uuid.test(input.jobId)
    || typeof input.roomId !== 'string' || !roomIdPattern.test(input.roomId)
    || typeof input.captureId !== 'string' || !uuid.test(input.captureId)
    || typeof input.sourceRevision !== 'string' || input.sourceRevision.length < 1
    || input.sourceRevision.length > 256
    || Array.from(input.sourceRevision).some((char) => char.charCodeAt(0) < 32)
    || typeof input.token !== 'string' || !capability.test(input.token)) return null;
  if (input.action === 'photo') {
    if (typeof input.photoId !== 'string' || !photoIdPattern.test(input.photoId)
      || Number(input.photoId) >= 160) return null;
  } else if (input.photoId !== undefined) return null;
  return {
    action: input.action,
    jobId: input.jobId,
    roomId: input.roomId,
    captureId: input.captureId,
    sourceRevision: input.sourceRevision,
    token: input.token,
    ...(input.action === 'photo' ? { photoId: input.photoId as string } : {}),
  };
}

/** Require the *saved* room and source revision, not a client-supplied draft. */
export function savedRoomMatchesCapture(designData: unknown, input: ScannerBridgeInput): boolean {
  if (!designData || typeof designData !== 'object') return false;
  const rooms = (designData as { tradeRooms?: unknown }).tradeRooms;
  if (!Array.isArray(rooms)) return false;
  return rooms.some((room: unknown) => {
    if (!room || typeof room !== 'object') return false;
    const record = room as { id?: unknown; roomDocument?: { capture?: {
      captureId?: unknown; sourceRevision?: unknown } } };
    return record.id === input.roomId
      && record.roomDocument?.capture?.captureId === input.captureId
      && record.roomDocument?.capture?.sourceRevision === input.sourceRevision;
  });
}

export function scannerBridgePath(input: ScannerBridgeInput): string {
  const base = `/api/room-capture/jobs/${input.captureId}`;
  return input.action === 'link' ? `${base}/planner-link`
    : input.action === 'manifest' ? `${base}/planner-evidence`
      : `${base}/planner-evidence/photos/${input.photoId}`;
}

/** Photographs belong to the capture, not to one review revision: the scanner
 * issues each evidence capability for the revision current at that moment,
 * so a room saved from an earlier revision must still see the same photos.
 * The saved room's revision is already checked by savedRoomMatchesCapture. */
export function validScannerManifest(value: unknown, input: ScannerBridgeInput): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as { captureId?: unknown; sourceRevision?: unknown; photos?: unknown };
  return record.captureId === input.captureId
    && typeof record.sourceRevision === 'string' && record.sourceRevision.length >= 1
    && record.sourceRevision.length <= 256
    && Array.isArray(record.photos) && record.photos.length <= 160
    && record.photos.every((photo: unknown) => {
      if (!photo || typeof photo !== 'object') return false;
      const entry = photo as { id?: unknown; bytes?: unknown };
      return typeof entry.id === 'string' && photoIdPattern.test(entry.id)
        && Number(entry.id) < 160 && typeof entry.bytes === 'number'
        && Number.isInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= 2 * 1024 * 1024;
    });
}

export function validScannerPhotoBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

/** Upstream error bodies may contain private details; expose only a category.
 * 403 means the scanner rejected this function's Origin (PLANNER_ORIGIN does
 * not match its PLANNER_TRADE_URL), which is a configuration fault, not an
 * outage; 404 means the capture or photograph no longer exists. */
export function scannerUpstreamFailure(status: number): { status: number; code: string } | null {
  if (status === 401) return { status: 401, code: 'scanner_access_denied' };
  if (status === 403) return { status: 502, code: 'scanner_origin_rejected' };
  if (status === 404) return { status: 404, code: 'scanner_not_found' };
  if (status === 409) return { status: 409, code: 'scanner_revision_conflict' };
  if (status < 200 || status >= 300) return { status: 502, code: 'scanner_unavailable' };
  return null;
}

const PREVIEW_SCANNER_ORIGIN = 'https://bower-room-scanner-test-20260912.bowerbuilding.chatgpt.site';
const PREVIEW_PLANNER_ORIGIN = 'https://codex-shared-room-geometry.bower-kitchen-planner.pages.dev';

/** Exact https origins only: no path, query, fragment or credentials. */
function exactHttpsOrigin(value: string): string | null {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || (url.pathname !== '/' && url.pathname !== '')) return null;
  return url.origin;
}

/** The scanner Site the bridge calls and the planner origin it presents.
 * Both come from Edge secrets so a production planner can be paired with a
 * production scanner without a code change; the private preview pair is the
 * default. Returns null when a configured value is not an exact https origin,
 * so a typo fails closed instead of calling an unexpected host. */
export function bridgeOrigins(read: (name: string) => string | undefined):
  { scanner: string; planner: string } | null {
  const scannerValue = read('SCANNER_ORIGIN')?.trim();
  const plannerValue = read('PLANNER_ORIGIN')?.trim();
  const scanner = scannerValue ? exactHttpsOrigin(scannerValue) : PREVIEW_SCANNER_ORIGIN;
  const planner = plannerValue ? exactHttpsOrigin(plannerValue) : PREVIEW_PLANNER_ORIGIN;
  if (!scanner || !planner) return null;
  return { scanner, planner };
}

/** Cap the actual stream, not just Content-Length (which may be absent or false). */
export async function readBoundedBytes(response: Request | Response, maximum: number): Promise<Uint8Array | null> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > maximum) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
