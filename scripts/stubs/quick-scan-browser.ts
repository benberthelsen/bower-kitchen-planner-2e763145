// Browser globals for the quick-scan capture smoke test, installed before the
// page's own modules run: a secure window, a document that can be backgrounded,
// sessionStorage, and a navigator whose WebXR hands out fake AR sessions.
// fetch counts calls so the test can prove nothing is uploaded.

export class FakeXRSession extends EventTarget {
  ended = 0;
  domOverlayState: { type: string } | undefined;
  constructor(overlay: boolean) {
    super();
    this.domOverlayState = overlay ? { type: 'screen' } : undefined;
  }
  async requestReferenceSpace(type: string) { return { type }; }
  async requestHitTestSource() { return { cancel() { /* nothing to cancel */ } }; }
  async end() {
    this.ended += 1;
    this.dispatchEvent(new Event('end'));
  }
  /** A tap anywhere on the screen during the AR session. */
  select() { this.dispatchEvent(new Event('select')); }
}

export const storage = new Map<string, string>();
export const xr = {
  sessions: [] as FakeXRSession[],
  requests: [] as { mode: string; init: { requiredFeatures?: string[]; optionalFeatures?: string[] } }[],
  /** dom-overlay granted to the next sessions */
  overlay: true,
  /** the next request is refused with this error name */
  refuseNext: null as string | null,
  async isSessionSupported(mode: string) { return mode === 'immersive-ar'; },
  async requestSession(mode: string, init: { requiredFeatures?: string[]; optionalFeatures?: string[] }) {
    xr.requests.push({ mode, init });
    if (xr.refuseNext) {
      const error = new Error('Permission denied');
      error.name = xr.refuseNext;
      xr.refuseNext = null;
      throw error;
    }
    const session = new FakeXRSession(xr.overlay);
    xr.sessions.push(session);
    return session;
  },
};
export const network = { calls: 0 };

const page = Object.assign(new EventTarget(), { isSecureContext: true });
const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
const define = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });

define('window', page);
define('document', doc);
define('navigator', { userAgent: 'quick-scan-test', xr, vibrate: () => true });
define('sessionStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => storage.clear(),
});
define('fetch', async () => { network.calls += 1; throw new Error('the quick scan must not upload'); });

export const browser = {
  window: page,
  /** Put the page in the background (or bring it back), as switching apps does. */
  setVisibility(state: DocumentVisibilityState) {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event('visibilitychange'));
  },
};
