import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QuoteBOM } from './pricing/types';

const AUD = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);

const fmt2 = (n: number) => n.toFixed(2);

/**
 * Ordering List PDF
 *
 * One document, three sections:
 *  1. Boards — consolidated whole sheets per material, item code, area, cost
 *  2. Edge Tape — by tape type, total LM, rolls (25 m), cost
 *  3. Hardware — consolidated item codes, qty, unit cost, total
 *
 * Intended to be sent directly to suppliers without modification.
 */
export function exportOrderingListPdf(quoteBOM: QuoteBOM, jobName = 'Job') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date().toLocaleDateString('en-AU');

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Ordering List', 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Job: ${jobName}`, 14, 26);
  doc.text(`Date: ${now}`, pageW - 14, 26, { align: 'right' });

  let y = 34;

  // ── Section 1: Boards ─────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Boards', 14, y);
  y += 2;

  const sheetRows = quoteBOM.consolidatedSheets.map((sh) => [
    sh.materialName,
    sh.materialId,
    `${sh.sheetLength} × ${sh.sheetWidth}`,
    sh.sheetsRequired.toString(),
    `${fmt2(sh.totalPartArea)} m²`,
    `${fmt2(sh.totalPartArea / sh.sheetArea * 100)}%`,
    AUD(sh.totalMaterialCost),
  ]);

  // Totals row
  const boardsTotal = quoteBOM.consolidatedSheets.reduce((s, sh) => s + sh.totalMaterialCost, 0);
  sheetRows.push(['', '', '', '', '', 'TOTAL', AUD(boardsTotal)]);

  autoTable(doc, {
    startY: y,
    head: [['Material', 'Item Code', 'Sheet Size (mm)', 'Sheets', 'Net Area', 'Yield Used', 'Cost']],
    body: sheetRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 82], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 55 },
      2: { cellWidth: 28 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 22 },
    },
    didParseCell(data) {
      if (data.row.index === sheetRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Section 2: Edge Tape ──────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 18; }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Edge Tape', 14, y);
  y += 2;

  const ROLL_LENGTH_M = 25;
  const tapeRows = quoteBOM.consolidatedEdgeTape.map((e) => {
    const rolls = e.rollsRequired ?? Math.ceil(e.linearMeters / ROLL_LENGTH_M);
    return [
      e.edgeName,
      e.edgeType,
      `${fmt2(e.linearMeters)} m`,
      `${ROLL_LENGTH_M} m rolls`,
      rolls.toString(),
      AUD(e.totalCost),
    ];
  });

  const tapeTotal = quoteBOM.consolidatedEdgeTape.reduce((s, e) => s + e.totalCost, 0);
  tapeRows.push(['', '', '', '', 'TOTAL', AUD(tapeTotal)]);

  autoTable(doc, {
    startY: y,
    head: [['Tape', 'Type', 'Linear Metres', 'Roll Size', 'Rolls', 'Cost']],
    body: tapeRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 82], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 55 },
      2: { halign: 'right', cellWidth: 26 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right', cellWidth: 22 },
    },
    didParseCell(data) {
      if (data.row.index === tapeRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Section 3: Hardware ───────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 18; }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Hardware', 14, y);
  y += 2;

  const hwRows = quoteBOM.consolidatedHardware
    .filter((h) => h.quantity > 0)
    .map((h) => [
      h.itemCode,
      h.name,
      h.hardwareType,
      h.quantity.toString(),
      AUD(h.unitCost),
      AUD(h.totalCost),
    ]);

  const hwTotal = quoteBOM.consolidatedHardware.reduce((s, h) => s + h.totalCost, 0);
  hwRows.push(['', '', '', '', 'TOTAL', AUD(hwTotal)]);

  autoTable(doc, {
    startY: y,
    head: [['Item Code', 'Description', 'Type', 'Qty', 'Unit Cost', 'Total']],
    body: hwRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 82], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 68 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 24 },
    },
    didParseCell(data) {
      if (data.row.index === hwRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Section 4: Benchtops ──────────────────────────────────────────────────
  const benchtops = quoteBOM.benchtops ?? [];
  let benchtopTotal = 0;

  if (benchtops.length > 0) {
    if (y > 220) { doc.addPage(); y = 18; }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Benchtops', 14, y);
    y += 2;

    const btRows = benchtops.map((bt) => {
      const qtyLabel =
        bt.pricingMethod === 'per_sheet'
          ? `${bt.sheetsRequired ?? 1} sheet${(bt.sheetsRequired ?? 1) !== 1 ? 's' : ''}`
          : bt.pricingMethod === 'per_lm'
          ? `${(bt.linearMetres ?? bt.runLengthMm / 1000).toFixed(2)} LM`
          : `${fmt2(bt.areaSqm)} m²`;

      const unitLabel =
        bt.pricingMethod === 'per_sheet'
          ? `${AUD(bt.pricePerUnit)}/sht`
          : bt.pricingMethod === 'per_lm'
          ? `${AUD(bt.pricePerUnit)}/LM`
          : `${AUD(bt.pricePerUnit)}/m²`;

      return [
        bt.wallLabel,
        bt.materialName,
        `${bt.runLengthMm} mm run`,
        qtyLabel,
        unitLabel,
        AUD(bt.supplyCost),
        AUD(bt.installCost),
        AUD(bt.totalCost),
      ];
    });

    benchtopTotal = benchtops.reduce((s, bt) => s + bt.totalCost, 0);
    btRows.push(['', '', '', '', '', '', 'TOTAL', AUD(benchtopTotal)]);

    autoTable(doc, {
      startY: y,
      head: [['Wall', 'Material', 'Run Length', 'Quantity', 'Rate', 'Supply', 'Install', 'Total']],
      body: btRows,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 82], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 46 },
        2: { halign: 'right', cellWidth: 22 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 18 },
        7: { halign: 'right', cellWidth: 20 },
      },
      didParseCell(data) {
        if (data.row.index === btRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ── Grand summary ─────────────────────────────────────────────────────────
  if (y > 255) { doc.addPage(); y = 18; }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const grandTotal = boardsTotal + tapeTotal + hwTotal + benchtopTotal;
  if (benchtopTotal > 0) {
    doc.setFont('helvetica', 'normal');
    doc.text(`Boards + Tape + Hardware: ${AUD(boardsTotal + tapeTotal + hwTotal)}`, 14, y);
    y += 5;
    doc.text(`Benchtops (supply + install): ${AUD(benchtopTotal)}`, 14, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
  }
  doc.text(
    `Total Material Cost: ${AUD(grandTotal)}   (ex GST)`,
    14,
    y,
  );

  doc.save(`${jobName.replace(/\s+/g, '_')}_ordering_list.pdf`);
}
