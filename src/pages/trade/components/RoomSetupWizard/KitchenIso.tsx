import React from 'react';

/**
 * Isometric kitchen used as the dimensions reference (image-2 style):
 * a tall unit, a base run with benchtop, and overhead cabinets, drawn in 3/4
 * isometric so heights AND depths read clearly. Dimension callouts update live.
 */
interface Props {
  toeKickHeight: number;
  baseHeight: number;
  baseDepth: number;
  wallHeight: number;
  wallDepth: number;
  tallHeight: number;
  tallDepth: number;
  benchHeight?: number;
  roomHeight?: number;
  highlight?: string | null;
}

const SPLASH = 600;        // splashback gap (mm)
const BENCH_THK = 33;

export default function KitchenIso({
  toeKickHeight, baseHeight, baseDepth, wallHeight, wallDepth,
  tallHeight, tallDepth, benchHeight = 900, highlight,
}: Props) {
  const s = 0.155;                 // mm → px
  const A = 0.5, B = 0.28;         // isometric depth offset
  const ox = 150, oy = 430;        // world origin on screen (floor, front-left)

  const WALL = Math.max(tallDepth, baseDepth, wallDepth, 600); // back plane (z)
  const P = (x: number, y: number, z: number): [number, number] =>
    [ox + x * s + z * s * A, oy - y * s - z * s * B];
  const poly = (a: Array<[number, number, number]>) => a.map(p => P(...p).join(',')).join(' ');

  const carcaseTop = benchHeight - BENCH_THK;
  const wallBottom = benchHeight + SPLASH;

  // 3D box: front at z=back-depth (toward viewer), back at z=back (the wall).
  const Box = ({ x0, w, y0, h, depth, back = WALL, f, t, r }: {
    x0: number; w: number; y0: number; h: number; depth: number; back?: number;
    f: string; t: string; r: string;
  }) => {
    const zf = back - depth, zb = back, y1 = y0 + h, x1 = x0 + w;
    return (
      <g stroke="#5b6675" strokeWidth={1} strokeLinejoin="round">
        <polygon points={poly([[x1, y0, zf], [x1, y0, zb], [x1, y1, zb], [x1, y1, zf]])} fill={r} />
        <polygon points={poly([[x0, y1, zf], [x1, y1, zf], [x1, y1, zb], [x0, y1, zb]])} fill={t} />
        <polygon points={poly([[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]])} fill={f} />
      </g>
    );
  };

  // Front-face detail: vertical seams + a handle tick, drawn on z = front plane.
  const Fronts = ({ x0, w, y0, h, depth, n, handleTop }: {
    x0: number; w: number; y0: number; h: number; depth: number; n: number; handleTop?: boolean;
  }) => {
    const zf = WALL - depth;
    const items = [];
    for (let i = 1; i < n; i++) {
      const x = x0 + (w * i) / n;
      items.push(<line key={`s${i}`} {...lineProps(P(x, y0, zf), P(x, y0 + h, zf))} stroke="#5b6675" strokeWidth={0.8} />);
    }
    for (let i = 0; i < n; i++) {
      const hx = x0 + (w * (i + 0.5)) / n;
      const hy = handleTop ? y0 + h - 70 : y0 + 70;
      const [px, py] = P(hx, hy, zf);
      items.push(<circle key={`h${i}`} cx={px} cy={py} r={2.2} fill="#1f2937" />);
    }
    return <g>{items}</g>;
  };

  const dimC = (id: string) => (highlight === id ? '#d97706' : '#dc2626');
  const Dim = ({ a, b, label, id }: { a: [number, number, number]; b: [number, number, number]; label: string; id: string }) => {
    const [ax, ay] = P(...a), [bx, by] = P(...b);
    return (
      <g>
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke={dimC(id)} strokeWidth={highlight === id ? 2 : 1.3} />
        <circle cx={ax} cy={ay} r={2} fill={dimC(id)} /><circle cx={bx} cy={by} r={2} fill={dimC(id)} />
        <g transform={`translate(${(ax + bx) / 2},${(ay + by) / 2})`}>
          <rect x={-19} y={-9} width={38} height={18} rx={4} fill="#fff" stroke={dimC(id)} strokeWidth={highlight === id ? 1.4 : 1} />
          <text x={0} y={1} fontSize={11} fontWeight={700} fill={highlight === id ? '#b45309' : '#b91c1c'} textAnchor="middle" dominantBaseline="middle">{label}</text>
        </g>
      </g>
    );
  };

  // layout (world mm)
  const tallX = 0, tallW = 600;
  const baseX = 600, baseEnd = 3300, baseW = baseEnd - baseX;
  const ohX = 750, ohW = 2350;

  return (
    <svg viewBox="0 0 780 500" className="w-full" role="img" aria-label="Isometric kitchen dimensions">
      {/* floor + back wall */}
      <polygon points={poly([[-160, 0, 0], [baseEnd + 120, 0, 0], [baseEnd + 120, 0, WALL], [-160, 0, WALL]])} fill="#eef1f4" stroke="#dde3ea" />

      {/* OVERHEAD CABINETS */}
      <Box x0={ohX} w={ohW} y0={wallBottom} h={wallHeight} depth={wallDepth} f="#fbfcfd" t="#e7edf2" r="#d6dee6" />
      <Fronts x0={ohX} w={ohW} y0={wallBottom} h={wallHeight} depth={wallDepth} n={6} />

      {/* TALL UNIT */}
      <Box x0={tallX} w={tallW} y0={toeKickHeight} h={tallHeight - toeKickHeight} depth={tallDepth} f="#d7a866" t="#c2924f" r="#aa7e41" />
      <Fronts x0={tallX} w={tallW} y0={toeKickHeight} h={tallHeight - toeKickHeight} depth={tallDepth} n={2} handleTop />
      <Box x0={tallX + 25} w={tallW - 50} y0={0} h={toeKickHeight} depth={tallDepth - 25} f="#6f5230" t="#5c4427" r="#4d391f" />

      {/* BASE RUN */}
      <Box x0={baseX} w={baseW} y0={toeKickHeight} h={carcaseTop - toeKickHeight} depth={baseDepth} f="#d7a866" t="#c2924f" r="#aa7e41" />
      <Fronts x0={baseX} w={baseW} y0={toeKickHeight} h={carcaseTop - toeKickHeight} depth={baseDepth} n={5} handleTop />
      <Box x0={baseX + 25} w={baseW - 50} y0={0} h={toeKickHeight} depth={baseDepth - 25} f="#6f5230" t="#5c4427" r="#4d391f" />
      {/* benchtop */}
      <Box x0={baseX - 20} w={baseW + 40} y0={carcaseTop} h={BENCH_THK} depth={baseDepth + 25} f="#e9e7e1" t="#dad7cd" r="#c7c4b8" />

      {/* DIMENSIONS (live) */}
      <Dim id="tallHeight" a={[tallX, 0, 0]} b={[tallX, tallHeight, 0]} label={`${tallHeight}`} />
      <Dim id="benchHeight" a={[baseEnd, 0, 0]} b={[baseEnd, benchHeight, 0]} label={`${benchHeight}`} />
      <Dim id="wallHeight" a={[ohX + ohW, wallBottom, WALL - wallDepth]} b={[ohX + ohW, wallBottom + wallHeight, WALL - wallDepth]} label={`${wallHeight}`} />
      <Dim id="toeKickHeight" a={[baseX, 0, 0]} b={[baseX, toeKickHeight, 0]} label={`${toeKickHeight}`} />
      <Dim id="baseDepth" a={[baseEnd, carcaseTop, WALL - baseDepth]} b={[baseEnd, carcaseTop, WALL]} label={`${baseDepth}`} />
      <Dim id="tallDepth" a={[tallX, tallHeight, WALL - tallDepth]} b={[tallX, tallHeight, WALL]} label={`${tallDepth}`} />
      <Dim id="wallDepth" a={[ohX, wallBottom + wallHeight, WALL - wallDepth]} b={[ohX, wallBottom + wallHeight, WALL]} label={`${wallDepth}`} />

      <text x={16} y={22} fontSize={11} fill="#94a3b8">All measurements in mm — live preview</text>
    </svg>
  );
}

function lineProps([x1, y1]: [number, number], [x2, y2]: [number, number]) {
  return { x1, y1, x2, y2 };
}
