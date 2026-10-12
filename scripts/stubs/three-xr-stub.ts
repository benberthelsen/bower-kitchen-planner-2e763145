// three.js stand-in for the quick-scan capture smoke test: just enough of the
// API for ScanRoom's in-camera ghost, with no WebGL. Each renderer is kept so
// the test can step its XR animation loop with fake frames. Bundled in place
// of 'three' by the test:quick-scan-capture script (esbuild --alias).

type Loop = ((time: number, frame?: unknown) => void) | null;

class Disposable {
  dispose() { /* nothing to free */ }
}

class Material extends Disposable {
  color = { hex: 0, setHex(hex: number) { this.hex = hex; } };
  opacity: number;
  constructor(options: { opacity?: number } = {}) {
    super();
    this.opacity = options.opacity ?? 1;
  }
}

class Object3D {
  children: Object3D[] = [];
  visible = true;
  position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  rotation = { y: 0 };
  geometry?: Disposable;
  material?: Material;
  add(child: Object3D) { this.children.push(child); }
  clear() { this.children = []; }
  traverse(visit: (object: Object3D) => void) {
    visit(this);
    this.children.forEach((child) => child.traverse(visit));
  }
}

export class Scene extends Object3D {}
export class Group extends Object3D {}
export class HemisphereLight extends Object3D {}
export class PerspectiveCamera extends Object3D {}
export class Mesh extends Object3D {
  constructor(geometry?: Disposable, material?: Material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
export class Line extends Mesh {}
export class CylinderGeometry extends Disposable {}
export class PlaneGeometry extends Disposable {}
export class BufferGeometry extends Disposable {
  attributes = { position: { needsUpdate: false, setXYZ() { /* preview line only */ } } };
  setFromPoints() { return this; }
}
export class MeshBasicMaterial extends Material {}
export class LineBasicMaterial extends Material {}
export const DoubleSide = 2;

export class Matrix4 {
  elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  fromArray(values: ArrayLike<number>) { this.elements = Array.from(values); return this; }
}

export class Vector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  applyMatrix4(m: Matrix4) {
    const e = m.elements;
    const { x, y, z } = this;
    this.x = e[0] * x + e[4] * y + e[8] * z + e[12];
    this.y = e[1] * x + e[5] * y + e[9] * z + e[13];
    this.z = e[2] * x + e[6] * y + e[10] * z + e[14];
    return this;
  }
}

export const renderers: WebGLRenderer[] = [];

export class WebGLRenderer {
  loop: Loop = null;
  session: unknown = null;
  disposed = false;
  xr = { enabled: false, setSession: async (session: unknown) => { this.session = session; } };
  constructor() { renderers.push(this); }
  setAnimationLoop(loop: Loop) { this.loop = loop; }
  render() { /* nothing to draw */ }
  dispose() { this.disposed = true; }
}
