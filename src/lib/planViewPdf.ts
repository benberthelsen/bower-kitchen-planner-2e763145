import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TradeRoom, ConfiguredCabinet } from '@/types/trade';

/**
 * Auto-generated PLAN VIEW export.
 * Draws a top-down, to-scale plan of the room with every placed cabinet,
 * dimension lines for the room, cabinet numbers, and a product schedule.
 */

interface PlanCabinet {
  cabinet: ConfiguredCabinet;
  /** axis-aligned footprint in room mm (x grows right, y grows toward the room front) */
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: number;
  isCorner: boolean;
  armLeft: number;
  armRight: number;
}

function effectiveFootprint(cab: ConfiguredCabinet): PlanCabinet | null {
  if (!cab.isPlaced || !cab.position) return null;
  const rot = ((Math.round(cab.position.rotation) % 360) + 360) % 360;
  const rotated = rot === 90 || rot === 270;
  const w = rotated ? cab.dimensions.depth : cab.dimensions.width;
  const d = rotated ? cab.dimensions.width : cab.dimensions.depth;
  return {
    cabinet: cab,
    x: cab.position.x - w / 2,
    y: cab.position.z - d / 2,
    w,
    d,
    rotation: rot,
    isCorner: /corner|pie[-_ ]?cut/i.test(cab.definitionId || ''),
    armLeft: cab.construction?.cabinetDepthLeft ?? 575,
    armRight: cab.construction?.cabinetDepthRight ?? 575,
  };
}

export function exportPlanViewPdf(room: TradeRoom, jobName?: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 297
  const pageH = doc.internal.pageSize.getHeight();  // 210

  const roomW = room.config.width;
  const roomD = room.config.depth;

  // ---- layout: plan on the left ~2/3, schedule on the right ----
  const margin = 18;
  const planMaxW = pageW * 0.62 - margin * 2;
  const planMaxH = pageH - margin * 2 - 18; // leave room for the title
  const scale = Math.min(planMaxW / roomW, planMaxH / roomD);
  const planW = roomW * scale;
  const planH = roomD * scale;
  const ox = margin + 12; // extra space for the depth dimension line
  const oy = margin + 16; // extra space for the title + width dimension line

  const X = (mm: number) => ox + mm * scale;
  const Y = (mm: number) => oy + mm * scale;

  // ---- title block ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${jobName ? `${jobName} — ` : ''}${room.name} — Plan View`, margin, margin - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Room ${roomW} × ${roomD} × ${room.config.height}mm   •   Scale 1:${Math.round(1 / scale)}   •   ${new Date().toLocaleDateString('en-AU')}`,
    margin,
    margin + 1,
  );

  // ---- room outline (double line = wall) ----
  doc.setDrawColor(40);
  doc.setLineWidth(0.8);
  doc.rect(X(0), Y(0), planW, planH);
  doc.setLineWidth(0.25);
  doc.rect(X(0) - 1.6, Y(0) - 1.6, planW + 3.2, planH + 3.2);

  // ---- room dimension lines ----
  doc.setLineWidth(0.2);
  doc.setFontSize(8);
  // width (top)
  const dimY = Y(0) - 6;
  doc.line(X(0), dimY, X(roomW), dimY);
  doc.line(X(0), dimY - 1.5, X(0), dimY + 1.5);
  doc.line(X(roomW), dimY - 1.5, X(roomW), dimY + 1.5);
  doc.text(`${roomW}`, X(roomW / 2), dimY - 1.2, { align: 'center' });
  // depth (left)
  const dimX = X(0) - 6;
  doc.line(dimX, Y(0), dimX, Y(roomD));
  doc.line(dimX - 1.5, Y(0), dimX + 1.5, Y(0));
  doc.line(dimX - 1.5, Y(roomD), dimX + 1.5, Y(roomD));
  doc.text(`${roomD}`, dimX - 1.2, Y(roomD / 2), { align: 'center', angle: 90 });

  // ---- room features: openings + services (master plan §8.2) ----
  // Same wall/offset convention as PlannerScene/RoomFeaturesEditor:
  // offsets run from the wall's left end viewed from inside the room.
  const OPENING_RGB: Record<string, [number, number, number]> = {
    door: [180, 83, 9], window: [3, 105, 161], walkway: [161, 161, 170],
  };
  const OPENING_LETTER: Record<string, string> = { door: 'D', window: 'W', walkway: 'O' };
  (room.config.openings ?? []).forEach((o) => {
    const rgb = OPENING_RGB[o.type] ?? [120, 120, 120];
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(1.2);
    const len = o.widthMm;
    let lx1: number, ly1: number, lx2: number, ly2: number;
    switch (o.wall) {
      case 'N': lx1 = X(o.offsetMm); ly1 = Y(0); lx2 = X(o.offsetMm + len); ly2 = Y(0); break;
      case 'S': lx1 = X(roomW - o.offsetMm - len); ly1 = Y(roomD); lx2 = X(roomW - o.offsetMm); ly2 = Y(roomD); break;
      case 'W': lx1 = X(0); ly1 = Y(roomD - o.offsetMm - len); lx2 = X(0); ly2 = Y(roomD - o.offsetMm); break;
      default:  lx1 = X(roomW); ly1 = Y(o.offsetMm); lx2 = X(roomW); ly2 = Y(o.offsetMm + len); break; // E
    }
    doc.line(lx1, ly1, lx2, ly2);
    doc.setFontSize(6);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(OPENING_LETTER[o.type] ?? '?', (lx1 + lx2) / 2, (ly1 + ly2) / 2 - 0.8, { align: 'center' });
  });
  const SERVICE_RGB: Record<string, [number, number, number]> = {
    drain: [37, 99, 235], 'water-supply': [8, 145, 178], gpo: [220, 38, 38],
    gas: [202, 138, 4], 'hood-duct': [124, 58, 237],
  };
  const SERVICE_LETTER: Record<string, string> = {
    drain: 'S', 'water-supply': 'W', gpo: 'P', gas: 'G', 'hood-duct': 'H',
  };
  (room.config.services ?? []).forEach((s) => {
    const rgb = SERVICE_RGB[s.type] ?? [120, 120, 120];
    let cx: number, cy: number;
    switch (s.wall) {
      case 'N': cx = X(s.offsetMm); cy = Y(0); break;
      case 'S': cx = X(roomW - s.offsetMm); cy = Y(roomD); break;
      case 'W': cx = X(0); cy = Y(roomD - s.offsetMm); break;
      default:  cx = X(roomW); cy = Y(s.offsetMm); break; // E
    }
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(cx, cy, 1.4, 'F');
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    doc.text(SERVICE_LETTER[s.type] ?? '?', cx, cy + 0.7, { align: 'center' });
  });
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(40);

  // ---- cabinets ----
  const placed = (room.cabinets || [])
    .map(effectiveFootprint)
    .filter((p): p is PlanCabinet => p !== null);

  placed.forEach((p) => {
    const px = X(p.x);
    const py = Y(p.y);
    const pw = p.w * scale;
    const pd = p.d * scale;
    const isWallCab = p.cabinet.category === 'Wall';

    doc.setDrawColor(isWallCab ? 130 : 40);
    doc.setLineWidth(isWallCab ? 0.25 : 0.45);
    if (isWallCab) doc.setLineDashPattern([1.2, 1.2], 0);

    if (p.isCorner) {
      // L-shaped footprint: solid corner nests into the room corner per
      // rotation (0 BL, 90 BR, 180 FR, 270 FL); notch faces the room.
      const aL = Math.min(p.armLeft, p.cabinet.dimensions.width) * scale;
      const aR = Math.min(p.armRight, p.cabinet.dimensions.depth) * scale;
      let pts: Array<[number, number]>;
      switch (p.rotation) {
        case 90: // back-right corner: solid corner at top-right
          pts = [[px, py], [px + pw, py], [px + pw, py + pd], [px + pw - aR, py + pd], [px + pw - aR, py + aL], [px, py + aL]];
          break;
        case 180: // front-right corner: solid at bottom-right
          pts = [[px + pw, py + pd], [px, py + pd], [px, py + pd - aR], [px + pw - aL, py + pd - aR], [px + pw - aL, py], [px + pw, py]];
          break;
        case 270: // front-left corner: solid at bottom-left
          pts = [[px, py + pd], [px, py], [px + aR, py], [px + aR, py + pd - aL], [px + pw, py + pd - aL], [px + pw, py + pd]];
          break;
        default: // 0 — back-left corner: solid at top-left
          pts = [[px, py], [px + pw, py], [px + pw, py + aR], [px + aL, py + aR], [px + aL, py + pd], [px, py + pd]];
      }
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        doc.line(x1, y1, x2, y2);
      }
    } else {
      doc.rect(px, py, pw, pd);
      // front line (door face) — thicker tick on the room-facing edge
      doc.setLineWidth(0.8);
      if (p.rotation === 0) doc.line(px, py + pd, px + pw, py + pd);
      else if (p.rotation === 90) doc.line(px, py, px, py + pd);
      else if (p.rotation === 180) doc.line(px, py, px + pw, py);
      else doc.line(px + pw, py, px + pw, py + pd);
    }
    doc.setLineDashPattern([], 0);

    // label: cabinet number + width
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(p.cabinet.cabinetNumber || '', px + pw / 2, py + pd / 2 - 0.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(`${p.cabinet.dimensions.width}`, px + pw / 2, py + pd / 2 + 2.5, { align: 'center' });
  });

  // ---- product schedule (right side) ----
  const tableX = pageW * 0.62 + 4;
  autoTable(doc, {
    startY: margin + 2,
    margin: { left: tableX, right: margin / 2 },
    head: [['#', 'Product', 'W', 'H', 'D']],
    body: (room.cabinets || [])
      .filter((c) => c.isPlaced)
      .map((c) => [
        c.cabinetNumber || '',
        c.productName,
        String(c.dimensions.width),
        String(c.dimensions.height),
        String(c.dimensions.depth),
      ]),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [30, 41, 59], fontSize: 7 },
    columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 12 }, 3: { cellWidth: 12 }, 4: { cellWidth: 12 } },
  });

  const filename = `${(jobName || room.name).replace(/\s+/g, '-').toLowerCase()}-plan-view.pdf`;
  doc.save(filename);
}
