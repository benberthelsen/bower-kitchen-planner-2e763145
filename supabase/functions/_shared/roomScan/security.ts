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
 * - Best-effort per-instance rate limiting keyed by a pseudonymous IP hash
 *   (daily salt, never a durable raw IP).
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

function allowedOrigins(): string[] {
  const env = Deno.env.get('SCANNER_ALLOWED_ORIGINS');
  if (env && env.trim()) return env.split(',').map((o) => o.trim()).filter(Boolean);
  return DEFAULT_DEV_ORIGINS;
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
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
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

/** Pseudonymous, day-scoped IP key — never store or log a raw IP. */
export async function ipKey(req: Request): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const daySalt = new Date().toISOString().slice(0, 10);
  return (await sha256Hex(`${daySalt}:${ip}`)).slice(0, 24);
}

// Best-effort per-instance limiter (resets on cold start; the gateway remains
// the durable layer — alerting on throttle rates is the §6.6 fast-follow).
const hits = new Map<string, { count: number; ts: number }>();
export function rateLimited(key: string, limit: number, windowMs = 3_600_000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.ts > windowMs) {
    hits.set(key, { count: 1, ts: now });
    return false;
  }
  h.count += 1;
  return h.count > limit;
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
