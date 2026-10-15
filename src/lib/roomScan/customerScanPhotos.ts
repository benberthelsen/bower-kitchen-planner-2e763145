/** Staff read the photos of a customer's photo walk from the public scanner
 * (scan.bowercabinets.com) with their own planner sign-in: the scanner checks
 * the Supabase access token and is_bower_staff before it answers, and allows
 * these requests only from the planner's origin. The capture is the one named
 * in the room the customer handed over (adapterState.captureId with access
 * 'customer-scanner'). Photos are never stored in the planner. */
export const CUSTOMER_SCANNER_ORIGIN = 'https://scan.bowercabinets.com';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_ID = /^\d{4}$/;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The public-scanner capture behind a hand-over payload or an enquiry's
 * design_data (both carry roomCaptureDraft), when it is a customer photo walk. */
export function customerScanCaptureId(source: unknown): string | null {
  const draft = isRecord(source) ? source.roomCaptureDraft : undefined;
  const state = isRecord(draft) ? draft.adapterState : undefined;
  return isRecord(state) && state.access === 'customer-scanner'
    && typeof state.captureId === 'string' && UUID.test(state.captureId) ? state.captureId : null;
}

export type HandoffReader = {
  from(table: 'planner_handoffs'): {
    select(columns: string): { in(column: 'job_id', values: string[]): PromiseLike<{ data: unknown; error: unknown }> };
  };
};

/** Jobs whose linked hand-over is a customer photo walk, read through the
 * staff-only planner_handoffs policy (anyone else reads no rows). Only the
 * draft's adapterState is selected, not the payload. */
export async function customerScanCapturesForJobs(client: HandoffReader, jobIds: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  // A bounded list per request keeps the query string short.
  for (let start = 0; start < jobIds.length; start += 100) {
    const { data, error } = await client.from('planner_handoffs')
      .select('job_id, adapterState:payload->roomCaptureDraft->adapterState').in('job_id', jobIds.slice(start, start + 100));
    if (error || !Array.isArray(data)) continue;
    for (const row of data) {
      const captureId = isRecord(row) ? customerScanCaptureId({ roomCaptureDraft: { adapterState: row.adapterState } }) : null;
      if (captureId && typeof row.job_id === 'string') found.set(row.job_id, captureId);
    }
  }
  return found;
}

export class CustomerScanError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'CustomerScanError'; }
}

export function customerScanMessage(status: number): string {
  if (status === 401) return 'Your sign-in has expired. Sign in again to see the scan photos.';
  if (status === 403) return 'Only Bower staff can see scan photos.';
  if (status === 404) return 'These scan photos are no longer on the scanner.';
  return 'The scanner could not be reached. Try again in a few minutes.';
}

/** One GET to the scanner's staff API with the staff member's access token. */
export function customerScanRequest(path: string, accessToken: string): [string, RequestInit] {
  return [`${CUSTOMER_SCANNER_ORIGIN}/api/room-admin/captures/${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  }];
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function get(path: string, accessToken: string, fetcher: Fetch): Promise<Response> {
  let response: Response;
  try { response = await fetcher(...customerScanRequest(path, accessToken)); }
  catch { throw new CustomerScanError(customerScanMessage(0), 0); }
  if (!response.ok) throw new CustomerScanError(customerScanMessage(response.status), response.status);
  return response;
}

export interface CustomerScanCapture { id: string; title: string; status: string; created: string; photos: { id: string }[] }

export async function loadCustomerScan(captureId: string, accessToken: string,
  fetcher: Fetch = (url, init) => fetch(url, init)): Promise<CustomerScanCapture> {
  if (!UUID.test(captureId)) throw new CustomerScanError(customerScanMessage(404), 404);
  const body: unknown = await (await get(captureId, accessToken, fetcher)).json().catch(() => null);
  if (!isRecord(body) || body.id !== captureId || !Array.isArray(body.photos)) throw new CustomerScanError(customerScanMessage(0), 0);
  const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 200) : '';
  return {
    id: captureId, title: text(body.title), status: text(body.status), created: text(body.created),
    photos: body.photos.flatMap(photo => isRecord(photo) && typeof photo.id === 'string' && PHOTO_ID.test(photo.id)
      ? [{ id: photo.id }] : []).slice(0, 200),
  };
}

export async function loadCustomerScanPhoto(captureId: string, photoId: string, accessToken: string,
  fetcher: Fetch = (url, init) => fetch(url, init)): Promise<Blob> {
  if (!UUID.test(captureId) || !PHOTO_ID.test(photoId)) throw new CustomerScanError(customerScanMessage(404), 404);
  const blob = await (await get(`${captureId}/photos/${photoId}`, accessToken, fetcher)).blob();
  if (blob.type !== 'image/jpeg' || blob.size > MAX_PHOTO_BYTES) throw new CustomerScanError(customerScanMessage(0), 0);
  return blob;
}
