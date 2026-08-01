import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QuoteBOM } from './pricing/types';
import { ProjectSettings, GlobalDimensions, HardwareOptions } from '@/types';
import type {
  CabinetAccessories,
  CabinetConstruction,
  CabinetHardware,
  CabinetMaterials,
  RoomHardwareDefaults,
  RoomMaterialDefaults,
} from '@/types/trade';
import { normalizePricingTotals } from '@/lib/pricing/money';

interface QuoteData {
  quoteBOM: QuoteBOM;
  projectSettings: ProjectSettings;
  globalDimensions: GlobalDimensions;
  hardwareOptions: HardwareOptions;
  finishName: string;
  benchtopName: string;
}

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n || 0);

export function generateQuotePDF(data: QuoteData): void {
  const { quoteBOM, projectSettings, finishName, benchtopName, hardwareOptions } = data;
  const doc = new jsPDF();
  
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;
  
  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('KITCHEN QUOTE', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 15;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-AU')}`, pageWidth / 2, yPos, { align: 'center' });
  
  // Job Details Box
  yPos += 15;
  doc.setDrawColor(200);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, yPos, pageWidth - 28, 35, 3, 3, 'FD');
  
  yPos += 8;
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Job Details', 20, yPos);
  
  yPos += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const leftCol = 20;
  const rightCol = pageWidth / 2 + 10;
  
  doc.text(`Job Name: ${projectSettings.jobName || 'Untitled'}`, leftCol, yPos);
  doc.text(`Reference: ${projectSettings.jobReference || '-'}`, rightCol, yPos);
  
  yPos += 6;
  doc.text(`Contact: ${projectSettings.contactNumber || '-'}`, leftCol, yPos);
  doc.text(`Delivery: ${projectSettings.deliveryMethod === 'pickup' ? 'Customer Pickup' : 'Delivery'}`, rightCol, yPos);
  
  // Specifications
  yPos += 20;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Specifications', 14, yPos);
  
  yPos += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Door Finish: ${finishName}`, leftCol, yPos);
  doc.text(`Benchtop: ${benchtopName}`, rightCol, yPos);
  
  yPos += 6;
  doc.text(`Hinges: ${hardwareOptions.hingeType}`, leftCol, yPos);
  doc.text(`Drawer Runners: ${hardwareOptions.drawerType}`, rightCol, yPos);
  
  // Cabinet Schedule Table
  yPos += 15;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Cabinet Schedule', 14, yPos);
  
  yPos += 5;
  
  const cabinetData = quoteBOM.cabinets.map(cab => [
    cab.cabinetNumber || '-',
    cab.cabinetName,
    `${cab.parts.length} parts`,
    money(cab.subtotals.materials),
    money(cab.subtotals.hardware),
    money(cab.totalCost)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Ref', 'Cabinet', 'Parts', 'Materials', 'Hardware', 'Total']],
    body: cabinetData,
    theme: 'striped',
    headStyles: { 
      fillColor: [59, 130, 246],
      fontSize: 9,
      fontStyle: 'bold'
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 55 },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  // Get Y position after table
  yPos = (doc as any).lastAutoTable.finalY + 15;
  
  // Check if we need a new page for the summary
  if (yPos > doc.internal.pageSize.getHeight() - 100) {
    doc.addPage();
    yPos = 20;
  }
  
  // Material Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Material Summary', 14, yPos);
  
  yPos += 5;
  
  const sheetData = quoteBOM.consolidatedSheets.map(sheet => {
    const orderedArea = sheet.sheetsRequired * sheet.sheetArea;
    const sheetUse = orderedArea > 0
      ? Math.min(1, Math.max(0, sheet.totalPartArea / orderedArea)) * 100
      : 0;
    return [
      sheet.materialName,
      `${sheet.sheetsRequired} sheets`,
      `${(sheet.sheetLength / 1000).toFixed(1)}m x ${(sheet.sheetWidth / 1000).toFixed(1)}m`,
      `${sheetUse.toFixed(0)}%`,
      money(sheet.totalMaterialCost),
    ];
  });
  
  if (sheetData.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Material', 'Qty', 'Sheet Size', 'Sheet Use', 'Cost']],
      body: sheetData,
      theme: 'striped',
      headStyles: { 
        fillColor: [34, 197, 94],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // Hardware Summary
  if (quoteBOM.consolidatedHardware.length > 0) {
    if (yPos > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Hardware Summary', 14, yPos);
    
    yPos += 5;
    
    const hardwareData = quoteBOM.consolidatedHardware.map(hw => [
      hw.name,
      hw.quantity.toString(),
      money(hw.unitCost),
      money(hw.totalCost)
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Item', 'Qty', 'Unit Price', 'Total']],
      body: hardwareData,
      theme: 'striped',
      headStyles: { 
        fillColor: [168, 85, 247],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // Edge Tape Summary
  if (quoteBOM.consolidatedEdgeTape.length > 0) {
    if (yPos > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Edge Tape Summary', 14, yPos);
    
    yPos += 5;
    
    const edgeData = quoteBOM.consolidatedEdgeTape.map(edge => [
      edge.edgeType,
      `${edge.linearMeters.toFixed(2)} m`,
      money(edge.costPerMeter),
      money(edge.totalCost)
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Edge Type', 'Length', 'Per Meter', 'Total']],
      body: edgeData,
      theme: 'striped',
      headStyles: { 
        fillColor: [249, 115, 22],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Appliances (Stage 1) — appears only when at least one catalog appliance
  // is included in the order. Placeholder rows carry an asterisk + footnote.
  if (quoteBOM.applianceItems && quoteBOM.applianceItems.length > 0) {
    if (yPos > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Appliances', 14, yPos);
    yPos += 5;

    const applianceRows = quoteBOM.applianceItems.map(a => [
      a.itemCode || '-',
      `${a.name}${a.isPlaceholderPrice ? ' *' : ''}`,
      a.category,
      a.quantity.toString(),
      money(a.unitPrice),
      money(a.lineTotal),
    ]);
    autoTable(doc, {
      startY: yPos,
      head: [['Code', 'Appliance', 'Category', 'Qty', 'Unit', 'Total']],
      body: applianceRows,
      theme: 'striped',
      headStyles: { fillColor: [217, 119, 6], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
    if (quoteBOM.grandTotal.hasPlaceholderAppliancePrices) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(180, 83, 9);
      doc.text('* Appliance prices marked with an asterisk are placeholders and will be confirmed before order.', 14, yPos);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      yPos += 8;
    } else {
      yPos += 4;
    }
  }
  
  // Pricing Summary Box
  if (yPos > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage();
    yPos = 20;
  }
  
  const summaryBoxHeight = 75;
  doc.setDrawColor(59, 130, 246);
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(pageWidth - 100, yPos, 86, summaryBoxHeight, 3, 3, 'FD');
  
  let summaryY = yPos + 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Quote Summary', pageWidth - 57, summaryY, { align: 'center' });
  
  summaryY += 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const summaryItems = [
    ['Materials:', money(quoteBOM.grandTotal.materials)],
    ['Hardware:', money(quoteBOM.grandTotal.hardware)],
    ['Edge Tape:', money(quoteBOM.grandTotal.edging)],
    ['Labor:', money(quoteBOM.grandTotal.labor + quoteBOM.grandTotal.handling + quoteBOM.grandTotal.machining + quoteBOM.grandTotal.assembly)],
  ];
  
  summaryItems.forEach(([label, value]) => {
    doc.text(label, pageWidth - 95, summaryY);
    doc.text(value, pageWidth - 19, summaryY, { align: 'right' });
    summaryY += 6;
  });
  
  summaryY += 2;
  doc.setDrawColor(150);
  doc.line(pageWidth - 95, summaryY - 3, pageWidth - 19, summaryY - 3);
  
  doc.text('Subtotal:', pageWidth - 95, summaryY);
  doc.text(money(quoteBOM.grandTotal.subtotalExGst), pageWidth - 19, summaryY, { align: 'right' });
  
  summaryY += 6;
  doc.text('GST (10%):', pageWidth - 95, summaryY);
  doc.text(money(quoteBOM.grandTotal.gst), pageWidth - 19, summaryY, { align: 'right' });
  
  summaryY += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(59, 130, 246);
  doc.text('TOTAL:', pageWidth - 95, summaryY);
  doc.text(money(quoteBOM.grandTotal.total), pageWidth - 19, summaryY, { align: 'right' });

  summaryY += 7;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Est. build time: ${quoteBOM.buildHours.total.toFixed(1)} h`, pageWidth - 95, summaryY);

  // Footer
  doc.setTextColor(150);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.text('This quote is valid for 30 days. Prices are subject to change.', pageWidth / 2, footerY, { align: 'center' });
  
  // Cut List (production document) — its own page
  {
    doc.addPage();
    let cy = 20;
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Cut List', 14, cy);
    cy += 5;

    const cutMap = new Map<string, { name: string; size: string; finish: string; qty: number }>();
    quoteBOM.cabinets.forEach(c => c.parts.forEach(p => {
      const L = Math.round(p.length), W = Math.round(p.width);
      const key = `${p.name}|${L}x${W}`;
      const ex = cutMap.get(key);
      if (ex) ex.qty += p.quantity;
      else cutMap.set(key, {
        name: p.name,
        size: `${L} x ${W}`,
        finish: (p as { materialRole?: string }).materialRole === 'exterior' ? 'Exterior' : 'Carcase',
        qty: p.quantity,
      });
    }));
    const cutRows = [...cutMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(r => [r.name, r.size, r.finish, String(r.qty)]);
    const totalPanels = cutRows.reduce((s, r) => s + Number(r[3]), 0);
    const totalSheets = quoteBOM.consolidatedSheets.reduce((s, sh) => s + sh.sheetsRequired, 0);

    autoTable(doc, {
      startY: cy,
      head: [['Panel', 'Size (mm)', 'Finish', `Qty (${totalPanels} panels / ${totalSheets} sheets)`]],
      body: cutRows,
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  // Save PDF
  const filename = `${projectSettings.jobName || 'kitchen-quote'}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

interface TradeQuoteJobData {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

interface TradeQuotePayload {
  job: TradeQuoteJobData;
  rooms: Array<{
    id: string;
    name: string;
    description?: string;
    materialDefaults?: RoomMaterialDefaults;
    hardwareDefaults?: RoomHardwareDefaults;
    toeKickHeight?: number;
    cabinets: Array<{
      cabinetNumber?: string;
      productName: string;
      category: string;
      dimensions: { width: number; height: number; depth: number };
      materials?: Partial<CabinetMaterials>;
      hardware?: Partial<CabinetHardware>;
      accessories?: Partial<CabinetAccessories>;
      construction?: CabinetConstruction;
      estimatedTotal?: number;
    }>;
  }>;
  totals?: {
    subtotal?: number;
    tax?: number;
    total?: number;
  };
  notes?: string;
}

export function generateTradeQuotePDF(payload: TradeQuotePayload): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('TRADE QUOTE', pageWidth / 2, 16, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Job: ${payload.job.name}`, 14, 28);
  doc.text(`Status: ${payload.job.status}`, 14, 34);
  doc.text(`Rooms: ${payload.rooms.length}`, 14, 40);

  const rows: string[][] = [];
  payload.rooms.forEach((room) => {
    room.cabinets.forEach((cabinet) => {
      rows.push([
        room.name,
        cabinet.cabinetNumber || '-',
        cabinet.productName,
        `${cabinet.dimensions.width}x${cabinet.dimensions.depth}x${cabinet.dimensions.height}`,
        money(cabinet.estimatedTotal || 0),
      ]);
    });
  });

  autoTable(doc, {
    startY: 46,
    head: [['Room', 'Cab #', 'Cabinet', 'Dimensions (mm)', 'Quoted total (inc GST)']],
    body: rows.length ? rows : [['-', '-', 'No cabinets configured', '-', money(0)]],
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  let finalY = (doc as any).lastAutoTable?.finalY ?? 120;

  // The price-only schedule was not enough to manufacture or review a job.
  // Add the selections that define what the cabinet actually is, resolving
  // per-cabinet overrides over the room defaults.
  payload.rooms.forEach((room) => {
    if (finalY > doc.internal.pageSize.getHeight() - 65) {
      doc.addPage();
      finalY = 18;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${room.name} - selections`, 14, finalY + 8);

    const detailRows = room.cabinets.map((cabinet) => {
      const materials = { ...(room.materialDefaults || {}), ...(cabinet.materials || {}) };
      const hardware = { ...(room.hardwareDefaults || {}), ...(cabinet.hardware || {}) };
      const construction = cabinet.construction || {};
      const kickHeight = construction.toeKickHeight ?? room.toeKickHeight ?? 135;
      const endPanels = [construction.endPanelLeft ? 'left' : '', construction.endPanelRight ? 'right' : '']
        .filter(Boolean)
        .join(' + ') || 'none';
      const selections = [
        `Door/exterior: ${materials.exteriorFinish || 'room default'}`,
        `Carcase: ${materials.carcaseFinish || 'room default'}`,
        `Door style: ${materials.doorStyle || 'room default'}`,
        `Edge: ${materials.edgeBanding || 'room default'}`,
        `Handle: ${hardware.handleType || 'room default'}${hardware.handleColor ? ` (${hardware.handleColor})` : ''}`,
        `Hinges: ${hardware.hingeType || 'room default'}`,
        `Drawers: ${hardware.drawerType || 'room default'}`,
        `Soft close: ${hardware.softClose === false ? 'no' : 'yes'}`,
        `Kick: ${kickHeight} mm`,
        `End panels: ${endPanels}`,
      ].join('  |  ');
      return [cabinet.cabinetNumber || '-', selections];
    });

    autoTable(doc, {
      startY: finalY + 11,
      head: [['Cab #', 'Materials, hardware and construction']],
      body: detailRows.length ? detailRows : [['-', 'No cabinets configured']],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.2, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      margin: { left: 14, right: 14 },
    });
    finalY = (doc as any).lastAutoTable?.finalY ?? finalY + 30;
  });

  const { subtotal, tax, total } = normalizePricingTotals(payload.totals);

  if (finalY > doc.internal.pageSize.getHeight() - 55) {
    doc.addPage();
    finalY = 18;
  }
  let y = finalY + 12;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Totals', 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text(`Subtotal: ${money(subtotal)}`, 14, y);
  y += 6;
  doc.text(`GST: ${money(tax)}`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Grand Total: ${money(total)}`, 14, y);

  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Exclusions / Notes', 14, y);
  y += 6;
  doc.text(payload.notes || 'Quote excludes installation, delivery, and site variations unless noted.', 14, y, { maxWidth: pageWidth - 28 });

  doc.save(`trade-quote-${payload.job.id}.pdf`);
}
