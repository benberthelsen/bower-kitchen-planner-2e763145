/**
 * csp-report — collects the planner's Content-Security-Policy violation
 * reports (security plan step 7). public/_headers names this function in
 * the report-only CSP (report-uri, and report-to through
 * Reporting-Endpoints), so a week of counts can show what enforcing the
 * policy would block.
 *
 * Accepts both report formats: `{ "csp-report": {...} }` (report-uri) and
 * `[{ type: "csp-violation", body: {...} }]` (Reporting API). Each report is
 * reduced to its disposition, directive, blocked origin or CSP keyword, page
 * (origin and path, ids masked) and source origin, and counted per UTC day
 * through record_csp_report_v1. No IP, user agent, query, fragment, sample
 * or full URL is kept. Browsers send no JWT, so verify_jwt is off; the
 * function is limited per instance only, which stores no caller key.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  gate,
  logOutcome,
  newRequestId,
  rateKeys,
  rateLimited,
} from '../_shared/roomScan/security.ts';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REPORTS = 20;
const KEYWORDS = new Set([
  'inline', 'eval', 'wasm-eval', 'self', 'data', 'blob', 'trusted-types-policy', 'trusted-types-sink',
]);
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Report = { disposition: string; directive: string; blocked: string; page: string; source: string };

function text(source: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    if (typeof value === 'string') return value.trim().slice(0, 2048);
  }
  return '';
}

/** Scheme and host of a URL, or the keyword or bare scheme a browser reports. */
function originOf(value: string): string {
  if (!value) return '';
  if (KEYWORDS.has(value)) return value;
  try {
    const url = new URL(value);
    if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return url.origin.slice(0, 200);
    const scheme = url.protocol.slice(0, -1);
    return /^[a-z][a-z0-9+.-]{0,30}$/.test(scheme) ? scheme : 'other';
  } catch {
    return 'other';
  }
}

/** Origin and path of the page, with ids and other values masked. The
 *  planner's own route segments are short words (letters and hyphens), so
 *  anything with a digit, any other character or over 24 letters is masked. */
function pageOf(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'other';
    const path = url.pathname.split('/').map((segment) => {
      if (UUID_SEGMENT.test(segment)) return ':id';
      return !segment || /^[a-z][a-z-]{0,23}$/i.test(segment) ? segment : ':value';
    }).join('/');
    return `${url.origin}${path}`.slice(0, 200);
  } catch {
    return 'other';
  }
}

function normalise(raw: Record<string, unknown>): Report {
  const disposition = text(raw, 'disposition');
  const directive = (text(raw, 'effectiveDirective', 'effective-directive')
    || text(raw, 'violated-directive').split(/\s+/)[0]).toLowerCase();
  return {
    disposition: disposition === 'enforce' || disposition === 'report' ? disposition : 'unknown',
    directive: /^[a-z-]{1,40}$/.test(directive) ? directive : 'other',
    blocked: originOf(text(raw, 'blockedURL', 'blocked-uri')) || 'none',
    page: pageOf(text(raw, 'documentURL', 'document-uri')),
    source: originOf(text(raw, 'sourceFile', 'source-file')),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The violation bodies in either format; anything else yields none. */
function violations(body: unknown): Record<string, unknown>[] {
  if (isObject(body) && isObject(body['csp-report'])) return [body['csp-report']];
  if (!Array.isArray(body)) return [];
  return body
    .filter((entry) => isObject(entry) && entry.type === 'csp-violation' && isObject(entry.body))
    .map((entry) => (entry as { body: Record<string, unknown> }).body);
}

serve(async (req) => {
  const started = Date.now();
  const rid = newRequestId();
  const gated = gate(req);
  if (gated) return gated;
  if (rateLimited(await rateKeys(req, 'csp-report'), 300)) {
    logOutcome('csp-report', rid, 'throttled', started);
    return errorResponse(req, 429, 'rate_limited');
  }

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return errorResponse(req, 413, 'body_too_large');
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return errorResponse(req, 413, 'body_too_large');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse(req, 400, 'invalid_json');
  }

  const reports = new Map<string, Report>();
  for (const violation of violations(body).slice(0, MAX_REPORTS)) {
    const report = normalise(violation);
    reports.set(JSON.stringify(report), report);
  }
  if (!reports.size) {
    logOutcome('csp-report', rid, 'no_reports', started);
    return errorResponse(req, 400, 'invalid_report');
  }

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let outcome = 'ok';
  for (const report of reports.values()) {
    const { data, error } = await service.rpc('record_csp_report_v1', {
      p_disposition: report.disposition,
      p_directive: report.directive,
      p_blocked: report.blocked,
      p_page: report.page,
      p_source: report.source,
    });
    if (error) outcome = 'store_failed';
    else if (data === false && outcome === 'ok') outcome = 'day_full';
  }
  logOutcome('csp-report', rid, outcome, started);
  return new Response(null, { status: 204, headers: corsHeaders(req) });
});
