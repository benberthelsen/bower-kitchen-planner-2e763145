/**
 * Analytics must describe product behaviour, never identify a customer.
 *
 * This defensive filter is intentionally applied at the analytics boundary so
 * a future call site cannot accidentally put contact details into
 * `funnel_events.metadata`. Lead/contact payloads belong in the lead system.
 */

const SENSITIVE_KEYS = new Set([
  'name',
  'firstname',
  'lastname',
  'fullname',
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'contact',
  'contactname',
  'contactemail',
  'contactphone',
  'address',
  'street',
  'suburb',
  'postcode',
  'postalcode',
]);

const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 256;

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH || value === null) return value === null ? null : undefined;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeValue(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (typeof value !== 'object') return undefined;

  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(normalizedKey(key))) continue;
    const sanitized = sanitizeValue(nested, depth + 1);
    if (sanitized !== undefined) clean[key] = sanitized;
  }
  return clean;
}

export function sanitizeAnalyticsMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(metadata, 0) as Record<string, unknown>;
}
