import React from 'react';

/**
 * Isometric 3D kitchen dimensions diagram.
 * Shows a tall unit, a base+benchtop+wall stack in a 3/4 (isometric) view so
 * both HEIGHTS and DEPTHS read as real depth. Every measurement updates live
 * from the wizard inputs; the focused input highlights in amber.
 */

interface DiagramProps {
  toeKickHeight: number;
  baseHeight: number;
  baseDepth: number;
  wallHeight: number;
  wallDepth: number;
  tallHeight: number;
  tallDepth: number;
  benchHeight?: number;   // finished benchtop height from floor (default 900)
  benchtopThickness?: number;
  roomHeight?: number;
  highlight?: string | null;
}

const SPLASHBACK = 600; // mm gap between benchtop and wall cabinets

export default function KitchenDimensions3D({
  toeKickHeight,
  baseHeight,
  baseDepth,
  wallHeight,
  wallDepth,
  tallHeight,
  tallDepth,
  benchHeight = 900,
  benchtopThickness = 33,
  roomHeight = 2700,
  highlight,
}: DiagramProps) {
  const W = 600, H = 460;
  const s = 0.135;                 // mm → px scale
  const A = 0.46, B = 0.26;        // isometric depth offsets (per px of depth)
  const originX = 150;             // screen x of world origin
  const floorY = H - 70;           // screen y of floor (world y=0)

  // world(mm) → screen(px).  x = width(→right), y = height(up), z = depth(back)
  const P = (x: number, y: number, z: number): [number, number] => [
    originX + x * s + z * s * A,
    floorY - y * s - z * s * B,
  ];
  const pts = (arr: Array<[number, number, number]>) =>
    arr.map(([x, y, z]) => P(x, y, z).join(',')).join(' ');

  const hl = (id: string) => (highlight === id ? '#d97706' : '#64748b');
  const hlT = (id: string) => (highlight === id ? '#b45309' : '#334155');
  const isHot = (id: string) => highlight === id;

  // A 3D box anchored at front-bottom-left corner (x0, floor, z front=0),
  // extending +width(right), +height(up), +depth(back). Returns 3 faces.
  const Box = ({ x0, w, y0, h, depth, hueFront, hueTop, hueSide }: {
    x0: number; w: number; y0: number; h: number; depth: number;
    hueFront: string; hueTop: string; hueSide: string;
  }) => {
    const z0 = 0, z1 = depth, y1 = y0 + h;
    return (
      <g stroke="#475569" strokeWidth={1} strokeLinejoin="round">
        {/* back-right side */}
        <polygon points={pts([[x0 + w, y0, z0], [x0 + w, y0, z1], [x0 + w, y1, z1], [x0 + w, y1, z0]])} fill={hueSide} />
        {/* top */}
        <polygon points={pts([[x0, y1, z0], [x0 + w, y1, z0], [x0 + w, y1, z1], [x0, y1, z1]])} fill={hueTop} />
        {/* front */}
        <polygon points={pts([[x0, y0, z0], [x0 + w, y0, z0], [x0 + w, y1, z0], [x0, y1, z0]])} fill={hueFront} />
      </g>
    );
  };

  // Vertical dimension (height) drawn on a front edge, label to the left.
  const VDim = ({ x, z, y1, y2, label, id }: { x: number; z: number; y1: number; y2: number; label: string; id: string }) => {
    const [ax, ay] = P(x, y1, z);
    const [bx, by] = P(x, y2, z);
    return (
      <g stroke={hl(id)} strokeWidth={isHot(id) ? 2 : 1}>
        <line x1={ax} y1={ay} x2={bx} y2={by} />
        <line x1={ax - 4} y1={ay} x2={ax + 4} y2={ay} />
        <line x1={bx - 4} y1={by} x2={bx + 4} y2={by} />
        <text x={Math.min(ax, bx) - 7} y={(ay + by) / 2} fill={hlT(id)} stroke="none"
          fontSize={isHot(id) ? 13 : 11} fontWeight={isHot(id) ? 700 : 500} textAnchor="end" dominantBaseline="middle">{label}</text>
      </g>
    );
  };

  // Depth dimension drawn along the top, receding into the scene.
  const DDim = ({ x, y, z1, z2, label, id }: { x: number; y: number; z1: number; z2: number; label: string; id: string }) => {
    const [ax, ay] = P(x, y, z1);
    const [bx, by] = P(x, y, z2);
    return (
      <g stroke={hl(id)} strokeWidth={isHot(id) ? 2 : 1}>
        <line x1={ax} y1={ay} x2={bx} y2={by} />
        <text x={(ax + bx) / 2 + 6} y={(ay + by) / 2 - 4} fill={hlT(id)} stroke="none"
          fontSize={isHot(id) ? 13 : 11} fontWeight={isHot(id) ? 700 : 500} textAnchor="start">{label}</text>
      </g>
    );
  };

  // ----- layout (world mm) -----
  const tallX = 0, tallW = 600;
  const baseX = 1150, baseW = 700;
  const carcaseTop = benchHeight - benchtopThickness;          // top of base carcase
  const wallBottom = benchHeight + SPLASHBACK;                 // underside of wall cabs
  const benchOverhang = 30;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="3D kitchen dimensions">
      {/* floor */}
      <polygon points={pts([[ -120, 0, 0], [2100, 0, 0], [2100, 0, 1100], [-120, 0, 1100]])} fill="#f1f5f9" stroke="#e2e8f0" />

      {/* ===== TALL UNIT ===== */}
      <Box x0={tallX} w={tallW} y0={toeKickHeight} h={tallHeight - toeKickHeight} depth={tallDepth} hueFront="#eef2f7" hueTop="#dbe3ec" hueSide="#cdd7e3" />
      <Box x0={tallX + 30} w={tallW - 60} y0={0} h={toeKickHeight} depth={tallDepth - 30} hueFront="#cbd5e1" hueTop="#b8c2d0" hueSide="#aab5c4" />
      <text {...textPos(P(tallX + tallW / 2, tallHeight - 120, 0))} fontSize={11} fill="#64748b" textAnchor="middle">Tall</text>
      <VDim id="tallHeight" x={tallX} z={0} y1={0} y2={tallHeight} label={`${tallHeight}`} />
      <DDim id="tallDepth" x={tallX + tallW} y={tallHeight} z1={0} z2={tallDepth} label={`${tallDepth}`} />

      {/* ===== BASE + BENCH + WALL ===== */}
      {/* kick */}
      <Box x0={baseX + 30} w={baseW - 60} y0={0} h={toeKickHeight} depth={baseDepth - 30} hueFront="#cbd5e1" hueTop="#b8c2d0" hueSide="#aab5c4" />
      {/* base carcase */}
      <Box x0={baseX} w={baseW} y0={toeKickHeight} h={carcaseTop - toeKickHeight} depth={baseDepth} hueFront="#eef2f7" hueTop="#dbe3ec" hueSide="#cdd7e3" />
      <text {...textPos(P(baseX + baseW / 2, (carcaseTop + toeKickHeight) / 2, 0))} fontSize={11} fill="#64748b" textAnchor="middle">Base</text>
      {/* benchtop */}
      <Box x0={baseX - benchOverhang} w={baseW + benchOverhang} y0={carcaseTop} h={benchtopThickness} depth={baseDepth + benchOverhang} hueFront="#94a3b8" hueTop="#aab6c6" hueSide="#7f8da3" />
      {/* wall cabinet (set against the wall = max depth/back) */}
      <Box x0={baseX} w={baseW} y0={wallBottom} h={wallHeight} depth={wallDepth} hueFront="#eef2f7" hueTop="#dbe3ec" hueSide="#cdd7e3" />
      <text {...textPos(P(baseX + baseW / 2, wallBottom + wallHeight / 2, 0))} fontSize={11} fill="#64748b" textAnchor="middle">Wall</text>

      {/* dimensions */}
      <VDim id="toeKickHeight" x={baseX} z={0} y1={0} y2={toeKickHeight} label={`${toeKickHeight}`} />
      <VDim id="baseHeight" x={baseX} z={0} y1={toeKickHeight} y2={carcaseTop} label={`${baseHeight}`} />
      <VDim id="benchHeight" x={baseX + baseW + 70} z={0} y1={0} y2={benchHeight} label={`${benchHeight}`} />
      <VDim id="wallHeight" x={baseX} z={0} y1={wallBottom} y2={wallBottom + wallHeight} label={`${wallHeight}`} />
      <DDim id="baseDepth" x={baseX} y={toeKickHeight} z1={0} z2={baseDepth} label={`${baseDepth}`} />
      <DDim id="wallDepth" x={baseX + baseW} y={wallBottom + wallHeight} z1={0} z2={wallDepth} label={`${wallDepth}`} />

      <text x={16} y={20} fontSize={10} fill="#94a3b8">All measurements in mm — live preview</text>
    </svg>
  );
}

function textPos([x, y]: [number, number]) {
  return { x, y } as { x: number; y: number };
}
