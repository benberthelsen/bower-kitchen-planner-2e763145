/** Optional links from the trade planner into the private room scanner.
 * The scanner Site only admits its owner, so callers show these links to
 * admin accounts only, and VITE_ROOM_SCANNER_URL stays unset in builds for
 * everyone else. The browser never fetches from the scanner; the links only
 * open its pages. Private photo reads go through scanner-private-bridge. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScannerEntry =
  | { page: 'corners' }
  | { page: 'captures' }
  | { page: 'capture'; captureId: string };

/** Pure so the routing can be checked without a browser. */
export function buildScannerEntryUrl(configuredOrigin: string | undefined, isDev: boolean,
  entry: ScannerEntry): string | null {
  const candidate = configuredOrigin?.trim() || '';
  if (!candidate) return null;
  let base: URL;
  try { base = new URL(candidate); } catch { return null; }
  // An exact origin only: never carry credentials, a configured path or a
  // query into the scanner entry.
  if (base.protocol !== 'https:' && !(isDev && base.protocol === 'http:')) return null;
  if (!isDev && LOCAL_HOSTNAMES.has(base.hostname)) return null;
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash) return null;
  if (entry.page === 'capture') {
    if (!UUID.test(entry.captureId)) return null;
    // The review page sends each kind of capture (photo room, corner scan,
    // AR wall run, photo wall plan) to the page that holds its planner button.
    const url = new URL('/room-review/', base);
    url.searchParams.set('capture', entry.captureId);
    return url.toString();
  }
  const url = new URL(entry.page === 'corners' ? '/room-corners/' : '/room-capture/', base);
  url.searchParams.set('source', 'planner-trade');
  return url.toString();
}

export const scannerEntryUrl = (entry: ScannerEntry): string | null =>
  buildScannerEntryUrl(import.meta.env.VITE_ROOM_SCANNER_URL as string | undefined,
    Boolean(import.meta.env.DEV), entry);
