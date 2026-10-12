/**
 * Shared security/response helper for the public room-scanner capability
 * functions (master plan §6.6). Every scanner endpoint uses this — the
 * repository's older wildcard-CORS snippets are NOT the template here.
 *
 * - Exact-origin CORS from SCANNER_ALLOWED_ORIGINS (comma-separated env),
 *   echoed with `Vary: Origin`; never `*`.
 * - `no-store` + no-referrer + nosniff on every response.
 * - Generic, stable public error codes; existence is never revealed to an
 *   invalid capability.
 * - Body-size caps before JSON parsing; POST-only data operations.
 * - Per-instance and durable rate limiting keyed by pseudonymous IP keys
 *   (HMAC under a server-side secret and the day, never a durable raw IP),
 *   counted against the platform address, or the leftmost X-Forwarded-For
 *   entry only when the platform address is missing.
 * - Redacted logging: function name, outcome, duration, request id only.
 */

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:4174',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4174',
];

// The shared-room-geometry rollout uses a fixed, private planner preview.
// Keep this exact origin in addition to the deployed origin list so scanner
// handoffs can be reviewed there without weakening CORS for other Pages builds.
const PLANNER_PREVIEW_ORIGINS = [
  'https://codex-shared-room-geometry.bower-kitchen-planner.pages.dev',
];

function allowedOrigins(): string[] {
  const env = Deno.env.get('SCANNER_ALLOWED_ORIGINS');
  const configured = env && env.trim()
    ? env.split(',').map((o) => o.trim()).filter(Boolean)
    : DEFAULT_DEV_ORIGINS;
  return [...new Set([...configured, ...PLANNER_PREVIEW_ORIGINS])];
}

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = { ...SECURITY_HEADERS, Vary: 'Origin' };
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-bower-synthetic-secret';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return headers;
}

/** Returns a Response for OPTIONS/method problems, or null to continue. */
export function gate(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return errorResponse(req, 405, 'method_not_allowed');
  return null;
}

export function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Generic public errors only — no resource-existence detail. */
export function errorResponse(req: Request, status: number, code: string): Response {
  return jsonResponse(req, status, { error: code });
}

const MAX_BODY_BYTES = 512 * 1024;

export async function readJsonBody(req: Request): Promise<unknown | Response> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY_BYTES) return errorResponse(req, 413, 'body_too_large');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return errorResponse(req, 413, 'body_too_large');
  try {
    return JSON.parse(text);
  } catch {
    return errorResponse(req, 400, 'invalid_json');
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** One rate-limit bucket per subscriber: an IPv6 caller is grouped by its /64,
 *  and an IPv4-mapped IPv6 address counts as the IPv4 address. Anything else
 *  is used as written (bounded). */
export function addressBucket(raw: string): string {
  const value = raw.trim().toLowerCase().slice(0, 64);
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (!value.includes(':') || !/^[0-9a-f:]+$/.test(value)) return value;
  const halves = value.split('::');
  if (halves.length > 2) return value;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0 || (halves.length === 2 && fill === 0)) return value;
  const groups = [...left, ...Array(fill).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return value;
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

// The caller-key secret. A plain hash of "<day>:<ip>" can be reversed by
// hashing every IPv4 address, so keys are an HMAC under a value only the
// server holds: RATE_LIMIT_KEY_SECRET when it is set, otherwise the service
// role key that every function already has. With neither (a misconfigured
// function), a random per-instance secret keeps keys irreversible, at the
// cost of each instance counting under its own durable keys.
let instanceSecret: string | null = null;
let hmacKey: { secret: string; key: Promise<CryptoKey> } | null = null;
function rateKeySecret(): string {
  const configured = Deno.env.get('RATE_LIMIT_KEY_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (configured) return configured;
  if (!instanceSecret) {
    instanceSecret = generateToken();
    console.error('[rate-limit] no RATE_LIMIT_KEY_SECRET or SUPABASE_SERVICE_ROLE_KEY: caller keys are per-instance');
  }
  return instanceSecret;
}
async function keyedHex(text: string): Promise<string> {
  const secret = rateKeySecret();
  if (hmacKey?.secret !== secret) {
    hmacKey = {
      secret,
      key: crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    };
  }
  const signature = await crypto.subtle.sign('HMAC', await hmacKey.key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Pseudonymous, day-scoped caller key: an HMAC of "<day>:<address>" under the
 * server-side secret above. Never store or log a raw IP, or anything a guess
 * of the IP can be checked against.
 *
 * CF-Connecting-IP is set by Cloudflare, which fronts Supabase, and a client
 * cannot choose it: a request that brings its own is refused at Cloudflare
 * (403, error 1000, checked against this project on 2026-10-12), and a
 * Worker on another zone always arrives as one fixed Workers address. When
 * it is present it is the only key. X-Forwarded-For is then ignored, because
 * its leftmost entry is whatever the client wrote whenever the gateway
 * appends to a client-sent header (reported for Supabase in 2025 as
 * `forged,<client>`). Counting that entry as well would let anyone spend a
 * victim's allowance by naming the victim's address in the header.
 *
 * Supabase does not document passing CF-Connecting-IP to Edge Functions, so
 * without it the leftmost X-Forwarded-For entry is the key, as before, under
 * its own `xff:` prefix: a header the client can write never produces the
 * key of a CF-identified caller. That fallback is spoofable, but every Edge
 * Function request in Supabase's gateway logs for the day to 2026-10-12
 * carried CF-Connecting-IP, and a forged X-Forwarded-For sent to the PR #42
 * limiter in production was not counted. The rightmost entry is never used:
 * behind Supabase's gateway it has been an internal hop that every caller
 * shares.
 *
 * Returns one key; the array shape lets limiters count several identities.
 */
export async function ipKeys(req: Request): Promise<string[]> {
  const platform = req.headers.get('cf-connecting-ip')?.trim();
  const identity = platform
    ? addressBucket(platform)
    : `xff:${addressBucket(req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown')}`;
  const day = new Date().toISOString().slice(0, 10);
  return [(await keyedHex(`rate-key-v2:${day}:${identity}`)).slice(0, 24)];
}

/** The first of ipKeys: the platform address when there is one. */
export async function ipKey(req: Request): Promise<string> {
  return (await ipKeys(req))[0];
}

/** ipKeys scoped to one limiter, e.g. `create-planner-handoff:<key>`. */
export async function rateKeys(req: Request, scope: string): Promise<string[]> {
  return (await ipKeys(req)).map((key) => `${scope}:${key}`);
}

// Best-effort per-instance limiter (resets on cold start; durableRateLimit is
// the shared layer). Every key is counted, and any key over the limit
// throttles the request.
const hits = new Map<string, { count: number; ts: number }>();
export function rateLimited(keys: string | readonly string[], limit: number, windowMs = 3_600_000): boolean {
  const now = Date.now();
  let limited = false;
  for (const key of typeof keys === 'string' ? [keys] : keys) {
    const h = hits.get(key);
    if (!h || now - h.ts > windowMs) {
      hits.set(key, { count: 1, ts: now });
      continue;
    }
    h.count += 1;
    if (h.count > limit) limited = true;
  }
  return limited;
}

type RateLimitStore = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export type RateLimitResult = 'allowed' | 'throttled' | 'unavailable';

/**
 * Shared fixed-window limit through bump_edge_rate_limit_v1 (service role),
 * with the per-instance limiter as the fast path. Every key is bumped, and
 * the request is throttled when any key is over the limit.
 *
 * Only a boolean answer counts: `false` throttles and `true` allows. An error,
 * a throw or any other value (null, a count, a row) means the store is
 * unavailable. The default is then to fall back to the per-instance limiter
 * and log the degradation. `failClosed: true` answers 'unavailable' instead,
 * so a fail-closed request is allowed only when every key came back `true`;
 * use it on every path that sends email.
 */
export async function durableRateLimit(
  service: RateLimitStore,
  keys: readonly string[],
  limit: number,
  options: { fn: string; windowSeconds?: number; failClosed?: boolean },
): Promise<RateLimitResult> {
  const windowSeconds = options.windowSeconds ?? 3600;
  if (rateLimited(keys, limit, windowSeconds * 1000)) return 'throttled';
  const results = await Promise.all(keys.map(async (key) => {
    try {
      return await service.rpc('bump_edge_rate_limit_v1', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }));
  if (results.some((result) => !result.error && result.data === false)) return 'throttled';
  const failed = results.find((result) => result.error || result.data !== true);
  if (failed) {
    const reason = failed.error
      ? String(failed.error.message ?? '')
      : `unexpected result (${failed.data === null ? 'null' : typeof failed.data})`;
    console.error(`[${options.fn}] durable rate limit unavailable`, reason.slice(0, 200));
    if (options.failClosed) return 'unavailable';
  }
  return 'allowed';
}

/** 429 for a throttled caller; 503 when a fail-closed limiter is down. */
export function rateLimitResponse(req: Request, result: Exclude<RateLimitResult, 'allowed'>): Response {
  return result === 'throttled'
    ? errorResponse(req, 429, 'rate_limited')
    : errorResponse(req, 503, 'rate_limit_unavailable');
}

export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 13);
}

/** Redacted structured log line. Never pass tokens, bodies, PII or paths. */
export function logOutcome(fn: string, requestId: string, outcome: string, startedAt: number): void {
  console.log(JSON.stringify({ fn, requestId, outcome, ms: Date.now() - startedAt }));
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const isToken = (v: unknown): v is string => typeof v === 'string' && v.length >= 32 && v.length <= 128;
