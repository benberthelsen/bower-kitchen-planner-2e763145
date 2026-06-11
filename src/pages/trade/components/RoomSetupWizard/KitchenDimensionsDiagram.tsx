import React from 'react';

/**
 * Dynamic kitchen dimensions diagram (side elevation).
 * Every measurement is drawn against the geometry it controls and updates
 * live as the wizard inputs change. The dimension currently being edited
 * (focused input) is highlighted in amber.
 */

interface DiagramProps {
  toeKickHeight: number;
  baseHeight: number;
  baseDepth: number;
  wallHeight: number;
  wallDepth: number;
  tallHeight: number;
  tallDepth: number;
  roomHeight?: number;
  /** id of the input currently focused, e.g. "baseHeight" */
  highlight?: string | null;
}

const BENCHTOP = 33;      // mm (display constant)
const SPLASHBACK = 600;   // mm derived gap between benchtop and wall cabinets

export default function KitchenDimensionsDiagram({
  toeKickHeight,
  baseHeight,
  baseDepth,
  wallHeight,
  wallDepth,
  tallHeight,
  tallDepth,
  roomHeight = 2700,
  highlight,
}: DiagramProps) {
  // --- scale: fit the room height into the drawing area ---
  const H = 440;                 // svg drawing height (px)
  const W = 560;                 // svg width (px)
  const padTop = 26;
  const padBottom = 30;
  const usableH = H - padTop - padBottom;
  const maxMm = Math.max(roomHeight, tallHeight + 50, toeKickHeight + baseHeight + BENCHTOP + SPLASHBACK + wallHeight + 50);
  const s = usableH / maxMm;     // mm → px

  const floorY = H - padBottom;
  const mm = (v: number) => v * s;

  // --- wall section (right side): base stack + wall cabinet ---
  const wallX = W - 60;                       // face of the wall (px)
  const baseW = mm(baseDepth);
  const baseX = wallX - baseW;
  const kickY = floorY - mm(toeKickHeight);
  const carcassY = kickY - mm(baseHeight);
  const benchY = carcassY - mm(BENCHTOP);
  const wallCabBottomY = benchY - mm(SPLASHBACK);
  const wallCabTopY = wallCabBottomY - mm(wallHeight);
  const wallCabW = mm(wallDepth);
  const wallCabX = wallX - wallCabW;

  // --- tall unit (left side) ---
  const tallX = 70;
  const tallW = mm(tallDepth);
  const tallTopY = floorY - mm(tallHeight);

  const hl = (id: string) => (highlight === id ? '#d97706' : '#475569');
  const hlW = (id: string) => (highlight === id ? 2 : 1);
  const hlText = (id: string) => (highlight === id ? '#b45309' : '#334155');
  const hlSize = (id: string) => (highlight === id ? 13 : 11);

  /** vertical dimension line with arrows + label */
  const VDim = ({ x, y1, y2, label, id, side = 'left' }: { x: number; y1: number; y2: number; label: string; id: string; side?: 'left' | 'right' }) => (
    <g stroke={hl(id)} strokeWidth={hlW(id)}>
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
      <text
        x={side === 'left' ? x - 7 : x + 7}
        y={(y1 + y2) / 2}
        fill={hlText(id)}
        stroke="none"
        fontSize={hlSize(id)}
        fontWeight={highlight === id ? 700 : 500}
        textAnchor={side === 'left' ? 'end' : 'start'}
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );

  /** horizontal dimension line with label */
  const HDim = ({ y, x1, x2, label, id, above = true }: { y: number; x1: number; x2: number; label: string; id: string; above?: boolean }) => (
    <g stroke={hl(id)} strokeWidth={hlW(id)}>
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <text
        x={(x1 + x2) / 2}
        y={above ? y - 5 : y + 13}
        fill={hlText(id)}
        stroke="none"
        fontSize={hlSize(id)}
        fontWeight={highlight === id ? 700 : 500}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label="Kitchen cabinet dimensions diagram">
      {/* floor + wall */}
      <line x1={20} y1={floorY} x2={W - 20} y2={floorY} stroke="#334155" strokeWidth={2} />
      <line x1={wallX + mm(0)} y1={padTop - 6} x2={wallX} y2={floorY} stroke="#334155" strokeWidth={2} transform={`translate(${0},0)`} />
      {/* wall hatch */}
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={i} x1={wallX} y1={padTop + i * (usableH / 9) + 8} x2={wallX + 8} y2={padTop + i * (usableH / 9)} stroke="#94a3b8" strokeWidth={1} />
      ))}

      {/* ===== TALL CABINET (left) ===== */}
      <rect x={tallX} y={tallTopY} width={tallW} height={mm(tallHeight) - mm(toeKickHeight)} fill="#e2e8f0" stroke="#475569" />
      <rect x={tallX + 4} y={floorY - mm(toeKickHeight)} width={tallW - 8} height={mm(toeKickHeight)} fill="#cbd5e1" stroke="#64748b" />
      <text x={tallX + tallW / 2} y={tallTopY + 16} fontSize={10} fill="#64748b" textAnchor="middle">Tall</text>
      <VDim id="tallHeight" x={tallX - 14} y1={tallTopY} y2={floorY} label={`${tallHeight}`} />
      <HDim id="tallDepth" y={tallTopY - 10} x1={tallX} x2={tallX + tallW} label={`${tallDepth}`} />

      {/* ===== BASE CABINET stack (right, against wall) ===== */}
      {/* toe kick */}
      <rect x={baseX + 6} y={kickY} width={baseW - 6} height={mm(toeKickHeight)} fill="#cbd5e1" stroke="#64748b" />
      {/* carcass */}
      <rect x={baseX} y={carcassY} width={baseW} height={mm(baseHeight)} fill="#e2e8f0" stroke="#475569" />
      <text x={baseX + baseW / 2} y={carcassY + 16} fontSize={10} fill="#64748b" textAnchor="middle">Base</text>
      {/* benchtop (with small front overhang) */}
      <rect x={baseX - 5} y={benchY} width={baseW + 5} height={mm(BENCHTOP)} fill="#94a3b8" stroke="#475569" />
      {/* wall cabinet */}
      <rect x={wallCabX} y={wallCabTopY} width={wallCabW} height={mm(wallHeight)} fill="#e2e8f0" stroke="#475569" />
      <text x={wallCabX + wallCabW / 2} y={wallCabTopY + 16} fontSize={10} fill="#64748b" textAnchor="middle">Wall</text>

      {/* dimension lines for the stack */}
      <VDim id="toeKickHeight" x={baseX - 22} y1={kickY} y2={floorY} label={`${toeKickHeight}`} />
      <VDim id="baseHeight" x={baseX - 22} y1={carcassY} y2={kickY} label={`${baseHeight}`} />
      <VDim id="benchtop" x={baseX - 22} y1={benchY} y2={carcassY} label={`${BENCHTOP}`} />
      <VDim id="splashback" x={baseX - 22} y1={wallCabBottomY} y2={benchY} label={`${SPLASHBACK}*`} />
      <VDim id="wallHeight" x={wallCabX - 22} y1={wallCabTopY} y2={wallCabBottomY} label={`${wallHeight}`} />
      <HDim id="wallDepth" y={wallCabTopY - 10} x1={wallCabX} x2={wallX} label={`${wallDepth}`} />
      <HDim id="baseDepth" y={floorY + 6} x1={baseX} x2={wallX} label={`${baseDepth}`} above={false} />

      {/* bench height from floor (handy derived figure) */}
      <VDim id="benchHeightTotal" x={wallX + 28} y1={benchY} y2={floorY} label={`${toeKickHeight + baseHeight + BENCHTOP}`} side="right" />

      {/* legend */}
      <text x={20} y={padTop - 8} fontSize={10} fill="#64748b">All measurements in mm — * splashback gap shown at standard 600</text>
    </svg>
  );
}
