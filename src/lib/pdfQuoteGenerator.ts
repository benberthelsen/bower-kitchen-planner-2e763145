import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QuoteBOM } from './pricing/types';
import { ProjectSettings, GlobalDimensions, HardwareOptions } from '@/types';

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
  
  const sheetData = quoteBOM.consolidatedSheets.map(sheet => [
    sheet.materialName,
    `${sheet.sheetsRequired} sheets`,
    `${(sheet.sheetLength / 1000).toFixed(1)}m x ${(sheet.sheetWidth / 1000).toFixed(1)}m`,
    `${((1 - sheet.wasteArea / (sheet.sheetsRequired * sheet.sheetArea)) * 100).toFixed(0)}%`,
    money(sheet.totalMaterialCost)
  ]);
  
  if (sheetData.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Material', 'Qty', 'Sheet Size', 'Yield', 'Cost']],
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
    ['Labor:', money(quoteBOM.grandTotal.machining + quoteBOM.grandTotal.assembly)],
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
  
  // Footer
  doc.setTextColor(150);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.text('This quote is valid for 30 days. Prices are subject to change.', pageWidth / 2, footerY, { align: 'center' });
  
  // Save PDF
  const filename = `${projectSettings.jobName || 'kitchen-quote'}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
