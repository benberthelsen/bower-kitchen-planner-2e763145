const RELOAD_AT_KEY = 'bower.latestDeploymentReloadAt';
const RELEASE_QUERY_KEY = '__bower_release';
const AUTO_RETRY_WINDOW_MS = 15_000;

const STALE_CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\d-]+ failed/i,
  /chunkloaderror/i,
];

export function isStaleDeploymentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return STALE_CHUNK_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Navigate to the same route with a unique document URL so Cloudflare and the
 * browser must fetch the current index.html and its current hashed chunks.
 * `location.reload()` alone can keep the stale module graph in a long-lived tab.
 */
export function loadLatestDeployment(force = false): boolean {
  if (typeof window === 'undefined') return false;

  const now = Date.now();
  const lastAttempt = Number(window.sessionStorage.getItem(RELOAD_AT_KEY) ?? 0);
  if (!force && now - lastAttempt < AUTO_RETRY_WINDOW_MS) return false;

  window.sessionStorage.setItem(RELOAD_AT_KEY, String(now));
  const latestUrl = new URL(window.location.href);
  latestUrl.searchParams.set(RELEASE_QUERY_KEY, String(now));
  window.location.replace(latestUrl.toString());
  return true;
}

export function handleVitePreloadError(event: Event): void {
  // Do not prevent the Vite error. Vite resolves the failed import as
  // `undefined` when this event is cancelled, which makes React.lazy throw the
  // misleading "reading default" error before navigation can complete.
  // Keeping the rejection intact lets ErrorBoundary identify it correctly.
  void event;
  loadLatestDeployment();
}

/**
 * Some browsers surface a rejected React.lazy() import only as a global
 * promise rejection. Recover before React is left showing a dead route.
 */
export function handleDeploymentRejection(event: PromiseRejectionEvent): void {
  if (!isStaleDeploymentError(event.reason)) return;
  if (loadLatestDeployment()) event.preventDefault();
}

/**
 * Safari and a few embedded Android browsers report module failures through
 * the window error channel rather than Vite's preload event.
 */
export function handleDeploymentWindowError(event: ErrorEvent): void {
  const error = event.error ?? event.message;
  if (!isStaleDeploymentError(error)) return;
  if (loadLatestDeployment()) event.preventDefault();
}
