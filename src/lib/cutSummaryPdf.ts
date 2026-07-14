import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QuoteBOM } from './pricing/types';

const fmt2 = (n: number) => n.toFixed(2);
const fmt1 = (n: number) => n.toFixed(1);

/**
 * Cut Summary PDF
 *
 * Two sections:
 *  1. Sheet schedule — material, role (carcase / exterior/CNC), sheets, area, machine hours
 *  2. Time breakdown — cut / edge / assembly hours by stage for the whole job
 *
 * Used by the shop to plan CNC scheduling and capacity.
 */
export function exportCutSummaryPdf(quoteBOM: QuoteBOM, jobName = 'Job') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date().toLocaleDateString('en-AU');

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Cut Summary', 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Job: ${jobName}`, 14, 26);
  doc.text(`Date: ${now}`, pageW - 14, 26, { align: 'right' });

  let y = 34;

  // ── Section 1: Sheet schedule ─────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Sheet Schedule', 14, y);
  y += 2;

  // Accumulate machine hours from per-cabinet buildHours split by material role.
  // timeModel allocates cut hours fractionally per sheet; we report consolidated totals.
  // Cut hours per sheet: carcase = 0.25 h, exterior/CNC = 0.50 h (from production constants).
  const CUT_HR_CARCASE = 0.25;
  const CUT_HR_EXTERIOR = 0.50;

  const sheetRows = quoteBOM.consolidatedSheets.map((sh) => {
    const isExterior = sh.materialRole === 'exterior';
    const cutHr = sh.sheetsRequired * (isExterior ? CUT_HR_EXTERIOR : CUT_HR_CARCASE);
    return [
      sh.materialName,
      isExterior ? 'Exterior / CNC' : 'Carcase',
      `${sh.sheetLength} × ${sh.sheetWidth}`,
      sh.sheetsRequired.toString(),
      `${fmt2(sh.totalPartArea)} m²`,
      `${fmt1(cutHr)} h`,
    ];
  });

  const totalSheets = quoteBOM.consolidatedSheets.reduce((s, sh) => s + sh.sheetsRequired, 0);
  const totalCutHrs = quoteBOM.consolidatedSheets.reduce((s, sh) => {
    const isExterior = sh.materialRole === 'exterior';
    return s + sh.sheetsRequired * (isExterior ? CUT_HR_EXTERIOR : CUT_HR_CARCASE);
  }, 0);

  sheetRows.push(['', '', 'TOTAL', totalSheets.toString(), '', `${fmt1(totalCutHrs)} h`]);

  autoTable(doc, {
    startY: y,
    head: [['Material', 'Role', 'Sheet (mm)', 'Sheets', 'Net Area', 'Cut Hrs']],
    body: sheetRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 82], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 28 },
      2: { cellWidth: 28 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 20 },
    },
    didParseCell(data) {
      if (data.row.index === sheetRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
      // Highlight exterior rows so CNC operator sees them quickly
      if (data.column.index === 1 && data.cell.raw === 'Exterior / CNC') {
        data.cell.styles.textColor = [180, 60, 0];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ── Section 2: Time breakdown ─────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 18; }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Time Breakdown', 14, y);
  y += 2;

  const bh = quoteBOM.buildHours;
  const MACHINE_RATE = 120;
  const LABOUR_RATE  = 95;

  const timeRows = [
    ['Sheet Cutting', `${fmt1(bh.cut)} h`, `$${MACHINE_RATE}/h`, `$${(bh.cut * MACHINE_RATE).toFixed(0)}`],
    ['Edge Banding',  `${fmt1(bh.edge)} h`, `$${MACHINE_RATE}/h`, `$${(bh.edge * MACHINE_RATE).toFixed(0)}`],
    ['Assembly',      `${fmt1(bh.assembly)} h`, `$${LABOUR_RATE}/h`, `$${(bh.assembly * LABOUR_RATE).toFixed(0)}`],
    ['TOTAL',         `${fmt1(bh.total)} h`, '', `$${(bh.cost).toFixed(0)}`],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Stage', 'Hours', 'Rate', 'Cost (est.)']],
    body: timeRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 82], textColor: 255 },
    columnStyles: {
      1: { halign: 'right', cellWidth: 24 },
      2: { halign: 'right', cellWidth: 24 },
      3: { halign: 'right', cellWidth: 24 },
    },
    didParseCell(data) {
      if (data.row.raw[0] === 'TOTAL') {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ── Per-cabinet time detail ───────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 18; }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Per Cabinet', 14, y);
  y += 2;

  const cabRows = quoteBOM.cabinets
    .filter((c) => c.parts.length > 0)
    .map((c) => {
      const bh = c.buildHours;
      return [
        c.cabinetNumber,
        c.cabinetName,
        `${c.dimensions.width}w`,
        `${fmt1(bh.cut)} h`,
        `${fmt1(bh.edge)} h`,
        `${fmt1(bh.assembly)} h`,
        `${fmt1(bh.total)} h`,
      ];
    });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Cabinet', 'Width', 'Cut', 'Edge', 'Assem', 'Total']],
    body: cabRows,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [80, 80, 80], textColor: 255 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'right', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 16 },
      6: { halign: 'right', cellWidth: 16 },
    },
  });

  doc.save(`${jobName.replace(/\s+/g, '_')}_cut_summary.pdf`);
}
