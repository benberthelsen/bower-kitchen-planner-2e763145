import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CabinetBOM, HardwareItem, QuoteBOM } from './pricing/types';

type TableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

const NAVY: [number, number, number] = [30, 41, 82];
const BLUE: [number, number, number] = [55, 96, 160];
const PALE_BLUE: [number, number, number] = [237, 242, 250];
const BORDER: [number, number, number] = [205, 211, 222];
const TEXT: [number, number, number] = [24, 33, 53];
const MUTED: [number, number, number] = [91, 103, 125];

/**
 * Build a workshop packing list organised as one job, rather than one document
 * page per cabinet. ASCII-only table labels keep jsPDF's built-in font reliable.
 */
export function buildPackingListPdf(
  quoteBOM: QuoteBOM,
  jobName = 'Job',
  date = new Date().toLocaleDateString('en-AU'),
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const cabinets = quoteBOM.cabinets;

  printJobSummary(doc, cabinets, jobName, date);

  doc.addPage();
  printSectionTitle(doc, 'Panel packs by cabinet', 'Pack each cabinet as a labelled bundle.');
  printPanelTable(doc, cabinets);

  doc.addPage();
  printSectionTitle(
    doc,
    'Job hardware pick list',
    'Pick the full job quantity first, then split it into the cabinet bags below.',
  );
  printConsolidatedHardwareTable(doc, quoteBOM, cabinets);

  const lastY = getFinalY(doc);
  if (lastY > 205) doc.addPage();
  printSectionTitle(
    doc,
    'Cabinet hardware bags',
    'Bag and label hardware by cabinet after the job quantity has been picked.',
    getFinalY(doc) + 12,
  );
  printCabinetHardwareTable(doc, cabinets, getFinalY(doc) + 4);

  addPageFurniture(doc, jobName, date);
  return doc;
}

export function exportPackingListPdf(quoteBOM: QuoteBOM, jobName = 'Job') {
  const doc = buildPackingListPdf(quoteBOM, jobName);
  doc.save(`${safeFileName(jobName)}_packing_list.pdf`);
}

function printJobSummary(doc: jsPDF, cabinets: CabinetBOM[], jobName: string, date: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const panelPieces = cabinets.reduce(
    (sum, cabinet) => sum + cabinet.parts.reduce((partSum, part) => partSum + part.quantity, 0),
    0,
  );
  const hardwarePieces = cabinets.reduce(
    (sum, cabinet) => sum + cabinet.hardware.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );

  doc.setFillColor(...NAVY);
  doc.roundedRect(12, 17, pageW - 24, 27, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('JOB PACKING LIST', 18, 29);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(jobName, 18, 37);
  doc.text(date, pageW - 18, 37, { align: 'right' });

  summaryCard(doc, 12, 49, 57, 'CABINETS', String(cabinets.length));
  summaryCard(doc, 76, 49, 57, 'PANEL PIECES', String(panelPieces));
  summaryCard(doc, 140, 49, 57, 'HARDWARE PIECES', formatQuantity(hardwarePieces));

  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Cabinet packing and QC manifest', 12, 75);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text('Initial each box after the cabinet pack and final quality check are complete.', 12, 81);

  const rows = cabinets.map((cabinet) => [
    '[ ]',
    cabinet.cabinetNumber,
    cabinet.cabinetName,
    dimensions(cabinet),
    String(cabinet.parts.reduce((sum, part) => sum + part.quantity, 0)),
    String(cabinet.hardware.filter((item) => item.quantity > 0).length),
    '',
    '',
  ]);

  autoTable(doc, {
    startY: 85,
    margin: { left: 12, right: 12, top: 18, bottom: 17 },
    head: [['Pack', 'Cab #', 'Cabinet', 'W x H x D (mm)', 'Panels', 'HW lines', 'Packed by', 'QC']],
    body: rows.length ? rows : [['', '', 'No cabinets in this job', '', '', '', '', '']],
    styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 2.1, textColor: TEXT, lineColor: BORDER },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', lineColor: BLUE },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { cellWidth: 16, fontStyle: 'bold' },
      3: { cellWidth: 29, halign: 'center' },
      4: { cellWidth: 13, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 19 },
      7: { cellWidth: 13 },
    },
  });
}

function printPanelTable(doc: jsPDF, cabinets: CabinetBOM[]) {
  const rows: string[][] = [];

  for (const cabinet of cabinets) {
    const materialNames = new Map(cabinet.sheets.map((sheet) => [sheet.materialId, sheet.materialName]));
    const parts = consolidateCabinetParts(cabinet);
    for (const part of parts) {
      rows.push([
        '[ ]',
        cabinet.cabinetNumber,
        part.name,
        `${part.length} x ${part.width}`,
        String(part.quantity),
        part.materialRole === 'exterior' ? 'Exterior' : 'Carcase',
        materialNames.get(part.materialId) || '-',
      ]);
    }
  }

  autoTable(doc, {
    startY: 34,
    margin: { left: 12, right: 12, top: 18, bottom: 17 },
    head: [['Pack', 'Cab #', 'Part', 'L x W (mm)', 'Qty', 'Board role', 'Material']],
    body: rows.length ? rows : [['', '', 'No manufactured panels in this job', '', '', '', '']],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: TEXT, lineColor: BORDER },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', lineColor: BLUE },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { cellWidth: 15, fontStyle: 'bold' },
      3: { cellWidth: 27, halign: 'right' },
      4: { cellWidth: 11, halign: 'center' },
      5: { cellWidth: 19 },
      6: { cellWidth: 42 },
    },
  });
}

function printConsolidatedHardwareTable(
  doc: jsPDF,
  quoteBOM: QuoteBOM,
  cabinets: CabinetBOM[],
) {
  const items = quoteBOM.consolidatedHardware.length
    ? quoteBOM.consolidatedHardware
    : consolidateHardware(cabinets.flatMap((cabinet) => cabinet.hardware));
  const rows = [...items]
    .filter((item) => item.quantity > 0)
    .sort(compareHardware)
    .map((item) => [
      '[ ]',
      humanHardwareType(item.hardwareType),
      item.itemCode || '-',
      item.name,
      formatQuantity(item.quantity),
      '',
    ]);

  autoTable(doc, {
    startY: 34,
    margin: { left: 12, right: 12, top: 18, bottom: 17 },
    head: [['Pick', 'Category', 'Item code', 'Description', 'Job qty', 'Checked by']],
    body: rows.length ? rows : [['', '', '', 'No hardware in this job', '', '']],
    styles: { font: 'helvetica', fontSize: 8.3, cellPadding: 2, textColor: TEXT, lineColor: BORDER },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', lineColor: BLUE },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { cellWidth: 29 },
      2: { cellWidth: 31 },
      4: { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 22 },
    },
  });
}

function printCabinetHardwareTable(doc: jsPDF, cabinets: CabinetBOM[], startY: number) {
  const rows = cabinets.flatMap((cabinet) =>
    cabinet.hardware
      .filter((item) => item.quantity > 0)
      .sort(compareHardware)
      .map((item) => [
        '[ ]',
        cabinet.cabinetNumber,
        humanHardwareType(item.hardwareType),
        item.itemCode || '-',
        item.name,
        formatQuantity(item.quantity),
      ]),
  );

  autoTable(doc, {
    startY,
    margin: { left: 12, right: 12, top: 18, bottom: 17 },
    head: [['Bag', 'Cab #', 'Category', 'Item code', 'Description', 'Qty']],
    body: rows.length ? rows : [['', '', '', '', 'No cabinet hardware allocations', '']],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: TEXT, lineColor: BORDER },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', lineColor: BLUE },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { cellWidth: 15, fontStyle: 'bold' },
      2: { cellWidth: 28 },
      3: { cellWidth: 30 },
      5: { cellWidth: 11, halign: 'center' },
    },
  });
}

function printSectionTitle(doc: jsPDF, title: string, subtitle: string, y = 24) {
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 12, y);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(subtitle, 12, y + 5.5);
}

function summaryCard(doc: jsPDF, x: number, y: number, width: number, label: string, value: string) {
  doc.setFillColor(...PALE_BLUE);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(x, y, width, 17, 1.5, 1.5, 'FD');
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(label, x + 4, y + 6);
  doc.setTextColor(...TEXT);
  doc.setFontSize(12);
  doc.text(value, x + 4, y + 13);
}

function addPageFurniture(doc: jsPDF, jobName: string, date: string) {
  const pages = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.line(12, 12, pageW - 12, 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...NAVY);
    doc.text(jobName, 12, 9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`Packing list | ${date}`, pageW - 12, 9, { align: 'right' });
    doc.line(12, pageH - 12, pageW - 12, pageH - 12);
    doc.text('Bower Cabinets - workshop copy', 12, pageH - 7.5);
    doc.text(`Page ${page} of ${pages}`, pageW - 12, pageH - 7.5, { align: 'right' });
  }
}

function consolidateCabinetParts(cabinet: CabinetBOM) {
  const parts = new Map<
    string,
    {
      name: string;
      length: number;
      width: number;
      quantity: number;
      materialRole: 'carcase' | 'exterior';
      materialId: string;
    }
  >();

  for (const part of cabinet.parts) {
    const length = Math.round(part.length);
    const width = Math.round(part.width);
    const key = [part.name, length, width, part.materialRole, part.materialId].join('|');
    const existing = parts.get(key);
    if (existing) existing.quantity += part.quantity;
    else {
      parts.set(key, {
        name: part.name,
        length,
        width,
        quantity: part.quantity,
        materialRole: part.materialRole,
        materialId: part.materialId,
      });
    }
  }

  return [...parts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function consolidateHardware(items: HardwareItem[]): HardwareItem[] {
  const consolidated = new Map<string, HardwareItem>();
  for (const item of items) {
    const key = `${item.itemCode}|${item.name}|${item.hardwareType}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalCost += item.totalCost;
    } else {
      consolidated.set(key, { ...item });
    }
  }
  return [...consolidated.values()];
}

function compareHardware(a: HardwareItem, b: HardwareItem) {
  return (
    humanHardwareType(a.hardwareType).localeCompare(humanHardwareType(b.hardwareType)) ||
    a.name.localeCompare(b.name)
  );
}

function humanHardwareType(type: string): string {
  if (/hinge.plate|hinge-plate/i.test(type)) return 'Hinge plates';
  if (/hinge/i.test(type)) return 'Hinges';
  if (/runner|drawer/i.test(type)) return 'Drawer runners';
  if (/consumable|screw|fixing/i.test(type)) return 'Fixings and screws';
  if (/handle/i.test(type)) return 'Handles';
  if (/leg/i.test(type)) return 'Legs';
  if (/bin/i.test(type)) return 'Bins';
  return type || 'Other';
}

function dimensions(cabinet: CabinetBOM) {
  return `${Math.round(cabinet.dimensions.width)} x ${Math.round(cabinet.dimensions.height)} x ${Math.round(cabinet.dimensions.depth)}`;
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.00$/, '');
}

function getFinalY(doc: jsPDF) {
  return (doc as TableDoc).lastAutoTable?.finalY ?? 34;
}

function safeFileName(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'Job';
}
