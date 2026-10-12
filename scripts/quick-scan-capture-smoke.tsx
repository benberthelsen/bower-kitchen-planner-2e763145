// Quick scan capture smoke: drives the real /wizard/scan page (ScanRoom) with
// a fake WebXR session. Only native pieces are faked — the AR session, its
// poses and hit results, sessionStorage, the document and three.js (no
// WebGL) — so the page's own tracking check, corner marks, ceiling reading,
// saved progress and resume card run for real. No DOM library is installed,
// so the page renders through a minimal react-reconciler host.
// Runs via `npm run test:quick-scan-capture`.
import { browser, network, storage, xr, type FakeXRSession } from './stubs/quick-scan-browser';
import React from 'react';
import Reconciler from 'react-reconciler';
import { DefaultEventPriority, LegacyRoot } from 'react-reconciler/constants.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ScanRoom, { PENDING_SCAN_KEY } from '../src/pages/homeowner/ScanRoom';
import { QUICK_SCAN_PROGRESS_KEY } from '../src/lib/roomScan/quickScanProgress';
import { renderers } from './stubs/three-xr-stub';

// ── Minimal host renderer ───────────────────────────────────────────────────
type Props = Record<string, unknown> & { children?: unknown; disabled?: boolean; onClick?: (event: unknown) => void };
interface HostText { text: string; parent: HostNode | null }
class HostNode extends EventTarget {
  children: (HostNode | HostText)[] = [];
  parent: HostNode | null = null;
  constructor(public type: string, public props: Props) { super(); }
  click() { /* the file picker is not used here */ }
  focus() { /* nothing to focus */ }
}
type Child = HostNode | HostText;
const detach = (parent: HostNode, child: Child) => {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
};
const attach = (parent: HostNode, child: Child, before?: Child) => {
  detach(parent, child);
  const index = before ? parent.children.indexOf(before) : -1;
  if (index >= 0) parent.children.splice(index, 0, child);
  else parent.children.push(child);
  child.parent = parent;
};
const noop = () => { /* not needed by this host */ };
const reconciler = Reconciler({
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  warnsIfNotActing: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getRootHostContext: () => ({}),
  getChildHostContext: (context: object) => context,
  getPublicInstance: (instance: unknown) => instance,
  getCurrentEventPriority: () => DefaultEventPriority,
  prepareForCommit: () => null,
  resetAfterCommit: noop,
  preparePortalMount: noop,
  createInstance: (type: string, props: Props) => new HostNode(type, props),
  createTextInstance: (text: string): HostText => ({ text, parent: null }),
  appendInitialChild: attach,
  appendChild: attach,
  appendChildToContainer: attach,
  insertBefore: attach,
  insertInContainerBefore: attach,
  removeChild: detach,
  removeChildFromContainer: detach,
  finalizeInitialChildren: () => false,
  prepareUpdate: () => true,
  commitUpdate: (node: HostNode, _payload: unknown, _type: string, _old: Props, next: Props) => { node.props = next; },
  commitTextUpdate: (node: HostText, _old: string, next: string) => { node.text = next; },
  commitMount: noop,
  shouldSetTextContent: () => false,
  resetTextContent: noop,
  clearContainer: (container: HostNode) => { container.children = []; },
  hideInstance: noop,
  unhideInstance: noop,
  hideTextInstance: noop,
  unhideTextInstance: noop,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: noop,
  afterActiveInstanceBlur: noop,
  prepareScopeUpdate: noop,
  getInstanceFromScope: () => null,
  detachDeletedInstance: noop,
} as unknown as Parameters<typeof Reconciler>[0]);

let container = new HostNode('root', {});
let root: ReturnType<typeof reconciler.createContainer> | null = null;
function mount() {
  if (root) reconciler.updateContainer(null, root, null, null);
  container = new HostNode('root', {});
  root = reconciler.createContainer(container, LegacyRoot, null, false, null, '', (error: unknown) => { throw error; }, null);
  reconciler.updateContainer(
    <MemoryRouter initialEntries={['/wizard/scan']}>
      <Routes>
        <Route path="/wizard/scan" element={<ScanRoom />} />
        <Route path="/wizard" element={<p>Wizard step 1</p>} />
      </Routes>
    </MemoryRouter>,
    root, null, null,
  );
}

const textOf = (node: Child): string => ('text' in node ? node.text : node.children.map(textOf).join(''));
const findAll = (match: (node: HostNode) => boolean, node: HostNode = container, found: HostNode[] = []) => {
  for (const child of node.children) {
    if (!(child instanceof HostNode)) continue;
    if (match(child)) found.push(child);
    findAll(match, child, found);
  }
  return found;
};
const buttons = (label: RegExp) => findAll((n) => n.type === 'button' && label.test(textOf(n)));
const button = (label: RegExp) => {
  const found = buttons(label);
  if (found.length !== 1) throw new Error(`expected one button ${label}, found ${found.length}`);
  return found[0];
};
const shows = (text: RegExp) => text.test(textOf(container));
/** Let promise chains and React's passive effects (the progress save) run. */
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); };
const press = async (node: HostNode) => {
  node.props.onClick?.({ preventDefault: noop, stopPropagation: noop });
  await settle();
};

// ── Fake AR frames ──────────────────────────────────────────────────────────
type V3 = { x: number; y: number; z: number };
/** A viewer pose at `eye`, looking at `target` (the centre of the view). */
function viewerAt(eye: V3, target: V3, emulatedPosition = false) {
  const f = [target.x - eye.x, target.y - eye.y, target.z - eye.z];
  const fl = Math.hypot(f[0], f[1], f[2]);
  const z = f.map((v) => -v / fl);
  const xl = Math.hypot(z[2], z[0]);
  const x = [z[2] / xl, 0, -z[0] / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return { emulatedPosition, transform: { matrix: [...x, 0, ...y, 0, ...z, 0, eye.x, eye.y, eye.z, 1] } };
}
/** A hit-test result; its pose's Y axis is the surface normal. */
const hitAt = (p: V3, surface: 'level' | 'upright') => ({
  getPose: () => ({
    emulatedPosition: false,
    transform: {
      position: p,
      matrix: surface === 'level'
        ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p.x, p.y, p.z, 1]
        : [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, p.x, p.y, p.z, 1],
    },
  }),
});
type Viewer = ReturnType<typeof viewerAt> | null;
const step = (viewer: Viewer, hit?: ReturnType<typeof hitAt>) => {
  const renderer = renderers[renderers.length - 1];
  if (!renderer?.loop) throw new Error('no AR animation loop is running');
  renderer.loop(0, { getViewerPose: () => viewer, getHitTestResults: () => (hit ? [hit] : []) });
};
const session = (): FakeXRSession => xr.sessions[xr.sessions.length - 1];
const tap = async () => { session().select(); await settle(); };
const saved = (): { corners: { x: number; z: number }[]; heightMm: number | null; heightSource: string | null } | null => {
  const raw = storage.get(QUICK_SCAN_PROGRESS_KEY);
  return raw ? JSON.parse(raw) : null;
};
const savedCount = () => saved()?.corners.length ?? 0;
/** The big capture button, under each label it can carry. */
const markButton = () => button(/Place corner|Waiting for tracking|First aim at|Second aim|Mark wall point|Lock .* wall|Use recognised corner/);

let pass = 0;
let fail = 0;
const check = (name: string, ok: unknown, detail = '') => {
  if (ok) pass += 1;
  else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

// A 4 × 3 m room walked A → B → C → D, from the middle with the phone at 1.4 m.
const EYE = { x: 2, y: 1.4, z: 1.5 };
const floor = (x: number, z: number) => ({ x, y: 0, z });
const [A, B, C, D] = [floor(0, 0), floor(4, 0), floor(4, 3), floor(0, 3)];

mount();
await settle();
check('lobby offers the quick scan', buttons(/Start quick scan/).length === 1);

// 1. Start: dom-overlay and plane detection are asked for, not required.
await press(button(/Start quick scan/));
const first = xr.requests[0]?.init;
check('session requires only hit-test and local-floor',
  JSON.stringify(first?.requiredFeatures) === '["hit-test","local-floor"]'
    && first?.optionalFeatures?.includes('dom-overlay') && first?.optionalFeatures?.includes('plane-detection'),
  JSON.stringify([first?.requiredFeatures, first?.optionalFeatures]));
check('scan is running', buttons(/Start quick scan/).length === 0 && !!renderers[renderers.length - 1]?.loop);

// 2. Tracking lost: no viewer pose, then an emulated one with a floor hit
// under the ring. Mark is disabled and a tap marks nothing.
step(null);
check('no pose: Mark is disabled and waits for tracking', markButton().props.disabled === true && /Waiting for tracking/.test(textOf(markButton())));
await tap();
check('no pose: a tap marks nothing and says why', savedCount() === 0 && shows(/Tracking is lost/));
step(viewerAt(EYE, A, true), hitAt(A, 'level'));
check('emulated pose: Mark stays disabled', markButton().props.disabled === true);
await tap();
check('emulated pose: a tap marks nothing', savedCount() === 0);

// 3. Tracked, floor hit under the ring: corner 1, saved straight away.
step(viewerAt(EYE, A), hitAt(A, 'level'));
check('tracked floor hit: Mark is enabled', markButton().props.disabled === false && /Place corner 1/.test(textOf(markButton())));
await press(markButton());
check('corner 1 is saved to sessionStorage on the mark', savedCount() === 1 && near(saved().corners[0].x, 0) && near(saved().corners[0].z, 0), JSON.stringify(saved()));
// Tracking lost after a good frame at a new corner: that aim must not be reused.
step(viewerAt(EYE, B));
step(viewerAt(EYE, B, true));
check('tracking lost mid-scan: Mark is disabled again', markButton().props.disabled === true);
await tap();
check('tracking lost mid-scan: a tap does not reuse the last aim', savedCount() === 1, JSON.stringify(saved()));

// 4. The ring on the wall 0.3 m up (an upright hit): the floor ray would mark
// a corner 0.4 m behind the wall, so Mark is disabled and a tap refused.
const onWall = { x: 2, y: 0.3, z: 0 };
step(viewerAt(EYE, onWall), hitAt(onWall, 'upright'));
check('wall hit: Mark is disabled', markButton().props.disabled === true);
await tap();
check('wall hit: a tap marks nothing and asks to aim lower', savedCount() === 1 && shows(/not floor level/));

// 5. Corner B with no hit at all: the aim ray meets the floor plane.
step(viewerAt(EYE, B));
check('no hit: Mark is enabled by the floor ray', markButton().props.disabled === false && shows(/Aiming at the floor/));
await tap();
check('no hit: corner 2 marked where the aim meets the floor', savedCount() === 2 && near(saved().corners[1].x, 4) && near(saved().corners[1].z, 0), JSON.stringify(saved()));

// 6. A benchtop in front of corner C: the level hit falls back to the floor ray.
step(viewerAt(EYE, C), hitAt({ x: 3.4, y: 0.9, z: 2.6 }, 'level'));
await tap();
check('bench hit: corner 3 marked on the floor behind it', savedCount() === 3 && near(saved().corners[2].x, 4) && near(saved().corners[2].z, 3), JSON.stringify(saved()));

// 7. Corner D hidden behind cabinets, with no wall plane detected: Two aims
// is offered first. The 4-point fallback refuses a benchtop top as a wall.
await press(button(/Corner blocked\?/));
check('hidden corner: two aims is the method with no wall planes', /First aim at the corner edge/.test(textOf(markButton())));
await press(button(/^4 points$/));
const benchTop = { x: 0.6, y: 0.9, z: 2.6 };
step(viewerAt(EYE, benchTop), hitAt(benchTop, 'level'));
await tap();
check('4-point fallback: a benchtop top is not a wall point', shows(/flat surface, not a wall/) && /wall point 1 of 4/.test(textOf(markButton())));
await press(button(/^Two aims$/));
const edgeD = { x: 0, y: 1.2, z: 3 };
const spot1 = { x: 1, y: 1.4, z: 1 };
const spot2 = { x: 2.2, y: 1.4, z: 1.2 };
step(viewerAt(spot1, edgeD));
await tap();
check('two aims: the first aim is kept', shows(/First aim saved/) && savedCount() === 3);
step(viewerAt({ x: 1.1, y: 1.4, z: 1.05 }, edgeD));
check('two aims: barely moved keeps Mark disabled', markButton().props.disabled === true);
step(viewerAt(spot2, edgeD));
check('two aims: far enough apart enables Mark', markButton().props.disabled === false);
await tap();
check('two aims: hidden corner 4 lands on the corner edge', savedCount() === 4 && near(saved().corners[3].x, 0, 1e-6) && near(saved().corners[3].z, 3, 1e-6), JSON.stringify(saved()));

// 8. Corner 1 tapped again to close the room: refused, still 4 corners.
step(viewerAt(EYE, floor(0.08, 0.05)), hitAt(floor(0.08, 0.05), 'level'));
await tap();
check('closing tap on corner 1 is refused', savedCount() === 4 && shows(/corner 1 again/), JSON.stringify(saved()));

// 9. Ceiling with no ceiling hit: aims at the top edge of wall A-B.
await press(button(/Walls done \(4\)/));
check('walls done: the ceiling step is next', shows(/2 · Ceiling/));
const near15 = { x: 2, y: 1.4, z: 1.5 };
const near25 = { x: 2, y: 1.4, z: 2.5 };
const edge = { x: 2, y: 2.4, z: 0 };
step(viewerAt(near15, edge));
await tap();
check('wall edge: the first reading waits for a second', shows(/First reading 2\.40 m/) && shows(/2 · Ceiling/));
// Aimed at the ceiling itself from a second distance: refused, start again.
step(viewerAt(near25, { x: 2, y: 1.4 + 2.5 / 1.5, z: 0 }));
await tap();
check('wall edge: a ceiling aim from another distance disagrees and is refused',
  shows(/differ by 667 mm/) && !shows(/First reading/) && shows(/2 · Ceiling/));
step(viewerAt(near15, edge));
await tap();
step(viewerAt({ x: 2.3, y: 1.4, z: 1.6 }, { x: 2.3, y: 2.4, z: 0 }));
await tap();
check('wall edge: a second reading from nearly the same distance asks for a step, keeping the first',
  shows(/then put the ring on the same wall–ceiling line again/) && shows(/First reading 2\.40 m/));
step(viewerAt(near25, edge));
await tap();
check('wall edge: two readings on the line agree; openings next', shows(/3 · Openings/));
check('wall edge: the height is saved as a wall-edge reading', saved()?.heightMm === 2400 && saved()?.heightSource === 'wall-edge', JSON.stringify(saved()));

// 10. The page goes to the background: AR ends, the corners stay and are offered.
browser.setVisibility('hidden');
await settle();
browser.setVisibility('visible');
check('backgrounding ends the AR session', session().ended >= 1 && buttons(/Scan again from corner 1/).length === 1);
check('resume card offers the 4 corners', shows(/4 corners marked before the camera closed/) && buttons(/Use these 4 corners/).length === 1);

// 11. Start never silently discards them, and a refused camera keeps them.
const requestsBefore = xr.requests.length;
await press(button(/Scan again from corner 1/));
check('Scan again asks first and starts nothing', xr.requests.length === requestsBefore && shows(/Start again from corner 1\?/) && savedCount() === 4);
await press(button(/Keep them/));
check('Keep them keeps the corners', buttons(/Use these 4 corners/).length === 1 && savedCount() === 4);
xr.refuseNext = 'NotAllowedError';
await press(button(/Scan again from corner 1/));
await press(button(/Clear and scan again/));
check('a refused camera keeps the corners', shows(/Camera access was not allowed/) && savedCount() === 4 && buttons(/Use these 4 corners/).length === 1);

// 12. Use them: the wizard gets a RoomScanV1, the progress is cleared.
await press(button(/Use these 4 corners/));
const pending = JSON.parse(storage.get(PENDING_SCAN_KEY) ?? 'null');
check('Use these corners stores a RoomScanV1 for the wizard',
  pending?.schemaVersion === 1 && pending?.source === 'webxr' && pending?.state === 'unconfirmed'
    && pending?.room.width === 4000 && pending?.room.depth === 3000,
  JSON.stringify(pending?.room));
check('the wall-edge ceiling reaches the wizard as an estimate', pending?.room.height === 2400 && pending?.confidence.fields.height === 'estimated', JSON.stringify(pending?.confidence));
check('the wizard opens and the progress is cleared', shows(/Wizard step 1/) && !storage.has(QUICK_SCAN_PROGRESS_KEY));

// 13. No dom-overlay: the scan stops before anything is marked and says why.
mount();
await settle();
xr.overlay = false;
await press(button(/Start quick scan/));
check('no dom-overlay: the session is ended and explained',
  session().ended === 1 && shows(/would not show the scan buttons/) && buttons(/Scan with taps only/).length === 1 && savedCount() === 0);
await press(button(/Scan with taps only/));
check('taps only: a new session runs', session().ended === 0 && !!renderers[renderers.length - 1]?.loop);
for (const corner of [A, B, C, D]) {
  step(viewerAt(EYE, corner), hitAt(corner, 'level'));
  await tap();
}
step(viewerAt(EYE, floor(0.05, -0.05)), hitAt(floor(0.05, -0.05), 'level'));
await tap();
check('taps only: each tap marks a corner and corner 1 again is ignored', savedCount() === 4, JSON.stringify(saved()));
// A stray last tap that makes the outline cross itself.
step(viewerAt(EYE, floor(2, -1)));
await tap();
check('taps only: the stray tap is saved too', savedCount() === 5);

// 14. The phone's Back button (pagehide): the corners are offered, the bad
// outline is explained, and the stray last corner can be removed.
browser.window.dispatchEvent(new Event('pagehide'));
await settle();
check('a bad outline is explained, not offered for use',
  shows(/5 corners marked before the camera closed/) && shows(/do not make a room yet: the corner path crosses itself/)
    && buttons(/Use these/).length === 0);
await press(button(/Remove last corner/));
check('Remove last corner fixes it', savedCount() === 4 && shows(/4 corners marked/) && buttons(/Use these 4 corners/).length === 1);
await press(button(/Discard/));
check('Discard clears the kept corners', !storage.has(QUICK_SCAN_PROGRESS_KEY) && !shows(/marked before the camera closed/));

check('nothing was uploaded', network.calls === 0, String(network.calls));

console.log(`quick scan capture smoke: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
