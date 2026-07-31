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
  if (loadLatestDeployment()) event.preventDefault();
}
