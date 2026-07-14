import React from 'react';

/**
 * Photo-style illustrated kitchen used as the dimensions reference.
 * The kitchen picture is fixed; the dimension callouts read live from the
 * wizard inputs so the numbers always match the chosen standards.
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

export default function KitchenRenderReference({
  toeKickHeight, baseHeight, baseDepth, wallHeight, wallDepth,
  tallHeight, tallDepth, benchHeight = 900, highlight,
}: Props) {
  const hot = (id: string) => highlight === id;
  const lc = (id: string) => (hot(id) ? '#d97706' : '#0f172a');
  const tc = (id: string) => (hot(id) ? '#b45309' : '#1e293b');

  // Callout: value pill on a leader. dir 'l'|'r' for which side the pill sits.
  const Tag = ({ x, y, label, id }: { x: number; y: number; label: string; id: string }) => (
    <g>
      <rect x={x - 30} y={y - 11} rx={5} width={60} height={22}
        fill={hot(id) ? '#fffbeb' : '#ffffff'} stroke={lc(id)} strokeWidth={hot(id) ? 1.6 : 1} />
      <text x={x} y={y + 1} fontSize={12} fontWeight={700} fill={tc(id)} textAnchor="middle" dominantBaseline="middle">{label}</text>
    </g>
  );

  const VLeader = ({ x, y1, y2, id }: { x: number; y1: number; y2: number; id: string }) => (
    <g stroke={lc(id)} strokeWidth={hot(id) ? 1.8 : 1}>
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
    </g>
  );

  return (
    <svg viewBox="0 0 760 500" className="w-full" role="img" aria-label="Kitchen dimensions reference">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4efe7" /><stop offset="1" stopColor="#e9e2d6" />
        </linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8c3a0" /><stop offset="1" stopColor="#c7ad84" />
        </linearGradient>
        <linearGradient id="oak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cda063" /><stop offset="1" stopColor="#b6884c" />
        </linearGradient>
        <linearGradient id="white" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfcfc" /><stop offset="1" stopColor="#e7ebed" />
        </linearGradient>
        <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eceae4" /><stop offset="1" stopColor="#d6d2c8" />
        </linearGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* room */}
      <rect x="0" y="0" width="760" height="430" fill="url(#wall)" />
      <rect x="0" y="430" width="760" height="70" fill="url(#floor)" />
      <line x1="0" y1="430" x2="760" y2="430" stroke="#b9a07a" strokeWidth="1.5" />

      {/* ===== TALL PANTRY (oak) ===== */}
      <g filter="url(#soft)">
        <rect x="60" y="90" width="135" height="318" rx="3" fill="url(#oak)" stroke="#9c7740" />
      </g>
      <rect x="66" y="96" width="59" height="300" rx="2" fill="url(#oak)" stroke="#9c7740" />
      <rect x="73" y="104" width="45" height="284" rx="2" fill="none" stroke="#a9824a" />
      <rect x="129" y="96" width="60" height="300" rx="2" fill="url(#oak)" stroke="#9c7740" />
      <rect x="136" y="104" width="46" height="284" rx="2" fill="none" stroke="#a9824a" />
      <rect x="120" y="150" width="4" height="60" rx="2" fill="#1f2937" />
      <rect x="131" y="150" width="4" height="60" rx="2" fill="#1f2937" />
      <rect x="66" y="408" width="123" height="22" fill="#6f5230" />

      {/* ===== BASE RUN (oak) + benchtop ===== */}
      <g filter="url(#soft)">
        <rect x="300" y="300" width="390" height="108" fill="url(#oak)" stroke="#9c7740" />
      </g>
      {/* left: 3 drawers */}
      {[306, 340, 372].map((y, i) => (
        <g key={i}>
          <rect x="304" y={y} width="124" height={i === 2 ? 32 : 31} rx="2" fill="url(#oak)" stroke="#9c7740" />
          <rect x="350" y={y + (i === 2 ? 15 : 14)} width="32" height="4" rx="2" fill="#1f2937" />
        </g>
      ))}
      {/* middle + right: door pairs */}
      {[432, 562].map((x, i) => (
        <g key={i}>
          <rect x={x} y="306" width="62" height="98" rx="2" fill="url(#oak)" stroke="#9c7740" />
          <rect x={x + 64} y="306" width="62" height="98" rx="2" fill="url(#oak)" stroke="#9c7740" />
          <rect x={x + 56} y="320" width="4" height="40" rx="2" fill="#1f2937" />
          <rect x={x + 66} y="320" width="4" height="40" rx="2" fill="#1f2937" />
        </g>
      ))}
      <rect x="306" y="408" width="378" height="22" fill="#6f5230" />
      {/* benchtop */}
      <g filter="url(#soft)"><rect x="292" y="282" width="406" height="18" rx="2" fill="url(#stone)" stroke="#bdb8ad" /></g>

      {/* ===== SPLASHBACK ===== */}
      <rect x="360" y="190" width="330" height="92" fill="#efe9df" />
      {[395, 460, 525, 590, 655].map((x) => (<line key={x} x1={x} y1="190" x2={x} y2="282" stroke="#e2dccf" />))}

      {/* ===== WALL CABINETS (white) ===== */}
      <rect x="360" y="190" width="330" height="6" fill="#000" opacity="0.08" />
      <g filter="url(#soft)"><rect x="360" y="92" width="330" height="98" fill="url(#white)" stroke="#cfd6da" /></g>
      {[360, 470, 580].map((x) => (
        <g key={x}>
          <rect x={x + 3} y="96" width="104" height="90" rx="2" fill="url(#white)" stroke="#cfd6da" />
          <rect x={x + 48} y="170" width="34" height="4" rx="2" fill="#374151" />
        </g>
      ))}

      {/* ===== HEIGHT CALLOUTS (live) ===== */}
      <VLeader id="tallHeight" x={42} y1={90} y2={430} />
      <Tag x={42} y={258} label={`${tallHeight}`} id="tallHeight" />
      <VLeader id="baseHeight" x={276} y1={300} y2={408} />
      <Tag x={276} y={354} label={`${baseHeight}`} id="baseHeight" />
      <VLeader id="toeKickHeight" x={276} y1={408} y2={430} />
      <Tag x={250} y={419} label={`${toeKickHeight}`} id="toeKickHeight" />
      <VLeader id="benchHeight" x={722} y1={282} y2={430} />
      <Tag x={722} y={356} label={`${benchHeight}`} id="benchHeight" />
      <VLeader id="wallHeight" x={714} y1={92} y2={190} />
      <Tag x={714} y={140} label={`${wallHeight}`} id="wallHeight" />

      {/* depth caption */}
      <text x="380" y="470" fontSize="12.5" fill="#475569" textAnchor="middle">
        Depths — Base <tspan fill={hot('baseDepth') ? '#b45309' : '#0f172a'} fontWeight="700">{baseDepth}</tspan>
        {'  ·  '}Wall <tspan fill={hot('wallDepth') ? '#b45309' : '#0f172a'} fontWeight="700">{wallDepth}</tspan>
        {'  ·  '}Tall <tspan fill={hot('tallDepth') ? '#b45309' : '#0f172a'} fontWeight="700">{tallDepth}</tspan>{'  mm'}
      </text>
      <text x="16" y="22" fontSize="11" fill="#94a3b8">All measurements in mm — live</text>
    </svg>
  );
}
