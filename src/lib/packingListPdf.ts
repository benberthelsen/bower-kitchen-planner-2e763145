import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QuoteBOM, CabinetBOM } from './pricing/types';

/**
 * Packing List PDF
 *
 * One page (or more) per cabinet:
 *  • Cabinet header: number, name, dimensions
 *  • Panel table: part name, L × W, qty  (with a □ tick box)
 *  • Hardware bag: item code, description, qty  (with a □ tick box)
 *
 * Used in the workshop for packing and QC.
 */
export function exportPackingListPdf(quoteBOM: QuoteBOM, jobName = 'Job') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date().toLocaleDateString('en-AU');

  let firstPage = true;

  for (const cab of quoteBOM.cabinets) {
    if (cab.parts.length === 0) continue; // appliances / fillers — skip

    if (!firstPage) doc.addPage();
    firstPage = false;

    printCabinetPackingPage(doc, cab, jobName, now, pageW);
  }

  doc.save(`${jobName.replace(/\s+/g, '_')}_packing_list.pdf`);
}

function printCabinetPackingPage(
  doc: jsPDF,
  cab: CabinetBOM,
  jobName: string,
  date: string,
  pageW: number,
) {
  // ── Cabinet header ────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 82);
  doc.rect(0, 0, pageW, 22, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`Cabinet ${cab.cabinetNumber}  –  ${cab.cabinetName}`, 14, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `W ${cab.dimensions.width} × H ${cab.dimensions.height} × D ${cab.dimensions.depth} mm`,
    14,
    17,
  );
  doc.text(`${jobName}   ${date}`, pageW - 14, 10, { align: 'right' });

  doc.setTextColor(0, 0, 0);

  let y = 28;

  // ── Panels ────────────────────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Panels', 14, y);
  y += 2;

  // Consolidate parts: same name + dims → sum qty
  const partMap = new Map<string, { name: string; L: number; W: number; qty: number; mat: string }>();
  for (const p of cab.parts) {
    const key = `${p.name}|${Math.round(p.length)}|${Math.round(p.width)}`;
    if (partMap.has(key)) {
      partMap.get(key)!.qty += p.quantity;
    } else {
      partMap.set(key, {
        name: p.name,
        L: Math.round(p.length),
        W: Math.round(p.width),
        qty: p.quantity,
        mat: p.materialRole === 'exterior' ? 'Ext' : 'Ccs',
      });
    }
  }

  const panelRows = [...partMap.values()].map((p) => [
    '□',
    p.name,
    `${p.L} × ${p.W}`,
    p.qty.toString(),
    p.mat,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['✓', 'Part Name', 'L × W (mm)', 'Qty', 'Board']],
    body: panelRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [80, 80, 80], textColor: 255 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'center', cellWidth: 10 },
      4: { halign: 'center', cellWidth: 14 },
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Hardware bag ──────────────────────────────────────────────────────────
  const hwItems = cab.hardware.filter((h) => h.quantity > 0);
  if (hwItems.length === 0) return;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Hardware Bag', 14, y);
  y += 2;

  // Group hardware by type for readability
  const groups = new Map<string, typeof hwItems>();
  for (const h of hwItems) {
    const g = humanHwType(h.hardwareType);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(h);
  }

  const hwRows: string[][] = [];
  for (const [group, items] of groups) {
    hwRows.push([`${group.toUpperCase()}`, '', '', '']);
    for (const h of items) {
      hwRows.push(['□', h.itemCode, h.name, h.quantity.toString()]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['✓', 'Item Code', 'Description', 'Qty']],
    body: hwRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [80, 80, 80], textColor: 255 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 30 },
      3: { halign: 'center', cellWidth: 12 },
    },
    didParseCell(data) {
      // Group header rows — no item code → bold, span look
      if (data.row.raw[1] === '' && data.row.raw[0] !== '□') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 230, 230];
      }
    },
  });
}

function humanHwType(t: string): string {
  if (/hinge.plate|hinge-plate/i.test(t)) return 'Hinge Plates';
  if (/hinge/i.test(t)) return 'Hinges';
  if (/runner|drawer/i.test(t)) return 'Drawer Runners';
  if (/consumable/i.test(t)) return 'Fixings / Screws';
  if (/handle/i.test(t)) return 'Handles';
  if (/leg/i.test(t)) return 'Legs';
  return t;
}
