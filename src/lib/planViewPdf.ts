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
