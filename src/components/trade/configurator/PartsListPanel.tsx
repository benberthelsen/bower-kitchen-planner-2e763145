import React, { useMemo } from 'react';
import { ConfiguredCabinet } from '@/contexts/TradeRoomContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { List, Package, Ruler, DollarSign } from 'lucide-react';
import { useCatalogItem } from '@/hooks/useCatalog';
import { useMaterialsCatalog } from '@/hooks/useMaterialsCatalog';
import { useClientMarkup } from '@/hooks/useClientMarkup';

interface PartsListPanelProps {
  cabinet: ConfiguredCabinet;
  className?: string;
}

interface Part {
  name: string;
  material: string;
  dimensions: string;
  quantity: number;
  unitPrice: number;
}

export function PartsListPanel({ cabinet, className = '' }: PartsListPanelProps) {
  // Pull the real render config (door/drawer counts, corner flags) so the parts
  // list matches what is actually built, instead of guessing from the name.
  const catalogItem = useCatalogItem(cabinet.definitionId);
  const rc = catalogItem?.renderConfig;
  const { materials, edges, laborPerCabinet, hinges, drawerRunners, handles, legs, shelfPins } = useMaterialsCatalog();
  const { commercial } = useClientMarkup();
  const markups = commercial.categoryMarkups || {};
  const hingeName = hinges.find((h) => h.id === cabinet.hardware.hingeType)?.name
    || (cabinet.hardware.hingeType || 'Hinge').replace(/-/g, ' ');
  const runnerName = drawerRunners.find((d) => d.id === cabinet.hardware.drawerType)?.name
    || (cabinet.hardware.drawerType || 'Runner').replace(/-/g, ' ');

  const parts = useMemo((): Part[] => {
    const { width, height, depth } = cabinet.dimensions;
    // Carcase is 16mm (verified vs Microvellum). Carcase height excludes the toe kick.
    const T = 16;
    const isBaseOrTall = cabinet.category === 'Base' || cabinet.category === 'Tall';
    const kick = isBaseOrTall ? 135 : 0;
    const carcassH = Math.max(height - kick, 0);
    const interior = Math.max(width - T * 2, 0);

    // ---- Feed-driven pricing (raw supplier cost, ex GST, pre-markup).
    // Board parts cost area(m2) x the chosen material's area_cost; hardware
    // costs come from hardware_pricing.unit_cost. Markup + GST are applied by
    // the quote engine, not here. Everything below is updatable via the feed.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const findMat = (sel?: string) => (sel
      ? materials.find((m) => m.id === sel || m.itemCode === sel || (m.name || '').toLowerCase() === sel.toLowerCase())
      : undefined);
    const defaultBoard = materials.find((m) => (m.areaCost ?? 0) > 0);
    const carcaseMat = findMat(cabinet.materials.carcaseFinish) ?? defaultBoard;
    const doorMat = findMat(cabinet.materials.exteriorFinish) ?? carcaseMat ?? defaultBoard;
    const carcaseAreaCost = carcaseMat?.areaCost ?? 0;
    const doorAreaCost = doorMat?.areaCost ?? carcaseAreaCost;
    const carcaseName = carcaseMat?.name || (cabinet.materials.carcaseFinish || 'Carcase').replace(/-/g, ' ');
    const doorName = doorMat?.name || (cabinet.materials.exteriorFinish || 'Door').replace(/-/g, ' ');
    const hingeUnit = (hinges.find((h) => h.id === cabinet.hardware.hingeType) ?? hinges[0])?.unitCost ?? 0;
    const runnerUnit = (drawerRunners.find((d) => d.id === cabinet.hardware.drawerType) ?? drawerRunners[0])?.unitCost ?? 0;
    const handleUnit = (handles.find((h) => h.id === cabinet.hardware.handleType))?.unitCost ?? 0;
    const legUnit = legs[0]?.unitCost ?? 0;
    const pinUnit = shelfPins[0]?.unitCost ?? 0;
    // Edge banding rate ($/m): supply + application from the feed. Pick the first
    // edge with a real per-metre cost (many catalogue rows are mould/0-rate).
    const edgeRow = edges?.find((e) => (e.lengthCost ?? 0) > 0) ?? edges?.[0];
    const edgeRate = (edgeRow?.lengthCost ?? 0) + (edgeRow?.applicationCost ?? 0);
    // Client markup applied per cost category → turns raw cost into sell price.
    const catMarkup = (name: string) => {
      if (/edge tape/i.test(name)) return markups.edge ?? 0;
      if (/labour/i.test(name)) return markups.labor ?? 0;
      if (/hinge|runner|handle|leg|shelf pin|drawer box/i.test(name)) return markups.hardware ?? 0;
      return markups.material ?? 0;
    };
    // Cost each part from the feed, append edge tape + labour, then apply markup.
    const priceParts = (list: Part[]): Part[] => {
      const full = [...list];
      if ((cabinet.category === 'Base' || cabinet.category === 'Tall') && legUnit > 0) {
        full.push({ name: 'Adjustable Leg', material: legs[0]?.name || 'Leg', dimensions: '-', quantity: width > 800 ? 6 : 4, unitPrice: 0 });
      }
      if (shelfCount > 0 && pinUnit > 0) {
        full.push({ name: 'Shelf Pin', material: shelfPins[0]?.name || 'Shelf Pin', dimensions: '-', quantity: shelfCount * 4, unitPrice: 0 });
      }
      const costed = full.filter((p) => p.quantity > 0).map((p) => {
        const dim = /^(\d+)\s*[×x]\s*(\d+)\s*[×x]\s*\d+mm$/.exec(p.dimensions.trim());
        if (dim) {
          const areaM2 = (parseInt(dim[1], 10) / 1000) * (parseInt(dim[2], 10) / 1000);
          const isDoor = /door|drawer front/i.test(p.name);
          return { ...p, unitPrice: round2(areaM2 * (isDoor ? doorAreaCost : carcaseAreaCost)) };
        }
        if (/^Hinge/i.test(p.name)) return { ...p, unitPrice: round2(hingeUnit) };
        if (/Drawer Runner/i.test(p.name)) return { ...p, unitPrice: round2(runnerUnit) };
        if (/Drawer Box/i.test(p.name)) return { ...p, unitPrice: 0 };
        if (/Leg/i.test(p.name)) return { ...p, unitPrice: round2(legUnit) };
        if (/Shelf Pin/i.test(p.name)) return { ...p, unitPrice: round2(pinUnit) };
        if (/^Handle/i.test(p.name)) return { ...p, unitPrice: round2(handleUnit) };
        return p;
      });
      // Edge tape — perimeter of all door / drawer fronts × the edge rate.
      const frontEdgeM = costed
        .filter((p) => /door|drawer front/i.test(p.name))
        .reduce((s, p) => {
          const d = /^(\d+)\s*[×x]\s*(\d+)/.exec(p.dimensions.trim());
          return d ? s + p.quantity * 2 * (parseInt(d[1], 10) + parseInt(d[2], 10)) / 1000 : s;
        }, 0);
      if (edgeRate > 0 && frontEdgeM > 0) {
        costed.push({ name: 'Edge Tape', material: edgeRow?.name || 'Edge banding', dimensions: `${frontEdgeM.toFixed(1)} m`, quantity: 1, unitPrice: round2(frontEdgeM * edgeRate) });
      }
      // Assembly labour (per cabinet) from the labour rates.
      if (laborPerCabinet > 0) {
        costed.push({ name: 'Labour (assembly)', material: 'Shop labour', dimensions: '-', quantity: 1, unitPrice: round2(laborPerCabinet) });
      }
      // Apply the client markup per category → sell price.
      return costed.map((p) => ({ ...p, unitPrice: round2(p.unitPrice * (1 + catMarkup(p.name))) }));
    };

    const name = cabinet.productName.toLowerCase();
    const isCorner = /corner/.test(name) && !/diagonal|blind|open|angle/.test(name);
    const doorCount = rc ? (rc.doorCount || (isCorner ? 2 : 0)) : (isCorner ? 2 : width > 600 ? 2 : 1);
    const drawerCount = rc ? rc.drawerCount || 0 : name.includes('drawer') ? 3 : 0;
    const shelfCount = cabinet.accessories?.shelfCount ?? 0;

    // ---- L-shape corner: its own construction (square bottom, two backs,
    // long + short top rails). Mirrors the Microvellum corner breakdown:
    // bottom = footprint − 2×board each axis; back = wall − 2×board; rails along
    // each wall front (the second is shortened by the return arm).
    if (isCorner) {
      const W1 = width;
      const W2 = cabinet.construction?.secondWidth ?? width;
      // Independent arm (leg) depths — MV: Cabinet Depth Left/Right.
      const armL = cabinet.construction?.cabinetDepthLeft ?? depth;
      const armR = cabinet.construction?.cabinetDepthRight ?? depth;
      // Exact Microvellum corner breakdown, validated against the Corner Check round-trip
      // DXF (Width 900 / arm 575 → bottom 858², backs 874 & 858, rails 858 & 309, doors 305):
      // footprint inner = wall − 26 (one gable); bottom & back-2 & long-rail = wall − 42 (two);
      // short rail = Wall2 − arm − 16; door = wall − opposite arm − 20.
      const bottomX = Math.max(W1 - 42, 0);
      const bottomY = Math.max(W2 - 42, 0);
      const back1 = Math.max(W1 - 26, 0);
      const back2 = Math.max(W2 - 42, 0);
      const longRail = Math.max(W1 - 42, 0);
      const shortRail = Math.max(W2 - armR - 16, 0);
      const door1 = Math.max(W1 - armR - 20, 0);
      const door2 = Math.max(W2 - armL - 20, 0);
      const shelfSide1 = Math.max(W1 - 44, 0);
      const shelfSide2 = Math.max(W2 - 44, 0);
      const cornerParts: Part[] = [
        { name: 'Left Gable', material: carcaseName, dimensions: `${carcassH} × ${armL} × ${T}mm`, quantity: 1, unitPrice: 45.0 },
        { name: 'Right Gable', material: carcaseName, dimensions: `${carcassH} × ${armR} × ${T}mm`, quantity: 1, unitPrice: 45.0 },
        { name: 'Bottom Panel', material: carcaseName, dimensions: `${bottomX} × ${bottomY} × ${T}mm`, quantity: 1, unitPrice: 52.0 },
        { name: 'Back Panel — Wall 1', material: carcaseName, dimensions: `${back1} × ${carcassH} × ${T}mm`, quantity: 1, unitPrice: 20.0 },
        { name: 'Back Panel — Wall 2', material: carcaseName, dimensions: `${back2} × ${carcassH} × ${T}mm`, quantity: 1, unitPrice: 20.0 },
        { name: 'Top Rail (long)', material: carcaseName, dimensions: `${longRail} × 100 × ${T}mm`, quantity: 1, unitPrice: 12.0 },
        { name: 'Top Rail (short)', material: carcaseName, dimensions: `${shortRail} × 100 × ${T}mm`, quantity: 1, unitPrice: 10.0 },
        { name: 'Door Front', material: doorName, dimensions: `${carcassH - 2} × ${door1} × ${T}mm`, quantity: 1, unitPrice: 65.0 },
        { name: 'Door Front', material: doorName, dimensions: `${carcassH - 2} × ${door2} × ${T}mm`, quantity: 1, unitPrice: 65.0 },
      ];
      if (shelfCount > 0) {
        cornerParts.push({ name: 'Corner Shelf', material: carcaseName, dimensions: `${shelfSide1} × ${shelfSide2} × ${T}mm`, quantity: shelfCount, unitPrice: 28.0 });
      }
      if (cabinet.hardware.handleType && cabinet.hardware.handleType !== 'none') {
        cornerParts.push({ name: `Handle - ${cabinet.hardware.handleType}`, material: (cabinet.hardware.handleColor || '').replace(/-/g, ' ') || '—', dimensions: '-', quantity: 2, unitPrice: 12.0 });
      }
      cornerParts.push({ name: 'Hinge', material: `${hingeName}${cabinet.hardware.softClose ? ' · soft-close' : ''}`, dimensions: '-', quantity: 4, unitPrice: cabinet.hardware.softClose ? 8.5 : 4.0 });
      if (cabinet.category === 'Base') {
        cornerParts.push({ name: 'Kickboard (Wall 1)', material: carcaseName, dimensions: `${W1} × 135 × ${T}mm`, quantity: 1, unitPrice: 18.0 });
        cornerParts.push({ name: 'Kickboard (Wall 2)', material: carcaseName, dimensions: `${Math.max(W2 - armR, 0)} × 135 × ${T}mm`, quantity: 1, unitPrice: 14.0 });
      }
      return priceParts(cornerParts);
    }

    const partsList: Part[] = [
      { name: 'Left Gable', material: carcaseName, dimensions: `${carcassH} × ${depth} × ${T}mm`, quantity: 1, unitPrice: 45.0 },
      { name: 'Right Gable', material: carcaseName, dimensions: `${carcassH} × ${depth} × ${T}mm`, quantity: 1, unitPrice: 45.0 },
      { name: 'Bottom Panel', material: carcaseName, dimensions: `${interior} × ${depth - T} × ${T}mm`, quantity: 1, unitPrice: 38.0 },
      // Back is 16mm HMR (same board as the carcase), not 3mm HDF.
      { name: 'Back Panel', material: carcaseName, dimensions: `${interior} × ${carcassH} × ${T}mm`, quantity: 1, unitPrice: 18.0 },
    ];

    // Top: a full panel for Wall/Tall, or two 100mm rails for Base cabinets (MV-style).
    if (cabinet.category === 'Wall' || cabinet.category === 'Tall') {
      partsList.push({ name: 'Top Panel', material: carcaseName, dimensions: `${interior} × ${depth - T} × ${T}mm`, quantity: 1, unitPrice: 38.0 });
    } else {
      partsList.push({ name: 'Top Rail', material: carcaseName, dimensions: `${interior} × 100 × ${T}mm`, quantity: 2, unitPrice: 12.0 });
    }

    if (shelfCount > 0) {
      partsList.push({ name: 'Adjustable Shelf', material: carcaseName, dimensions: `${interior - 2} × ${depth - 36} × ${T}mm`, quantity: shelfCount, unitPrice: 22.0 });
    }

    if (doorCount > 0) {
      const doorW = Math.floor((width - 2 - (doorCount - 1) * 2) / doorCount); // 1mm side reveal, 2mm gaps
      partsList.push({ name: 'Door Front', material: doorName, dimensions: `${carcassH - 2} × ${doorW} × ${T}mm`, quantity: doorCount, unitPrice: 65.0 });
    }

    if (drawerCount > 0) {
      const frontH = Math.floor((carcassH - 2 - (drawerCount - 1) * 2) / drawerCount);
      partsList.push({ name: 'Drawer Front', material: doorName, dimensions: `${frontH} × ${width - 2} × ${T}mm`, quantity: drawerCount, unitPrice: 55.0 });
      partsList.push({ name: 'Drawer Box', material: 'Drawer System', dimensions: `${depth - 80}mm deep`, quantity: drawerCount, unitPrice: 85.0 });
      partsList.push({
        name: 'Drawer Runner',
        material: `${runnerName}${cabinet.hardware.softClose ? ' · soft-close' : ''}`,
        dimensions: `${depth}mm`,
        quantity: drawerCount,
        unitPrice: cabinet.hardware.softClose ? 38.0 : 28.0,
      });
    }

    // Handles
    if (cabinet.hardware.handleType && cabinet.hardware.handleType !== 'none') {
      partsList.push({
        name: `Handle - ${cabinet.hardware.handleType}`,
        material: (cabinet.hardware.handleColor || '').replace(/-/g, ' ') || '—',
        dimensions: '-',
        quantity: doorCount + drawerCount,
        unitPrice: 12.0,
      });
    }

    // Hinges (doors only) — reflect soft-close selection
    if (doorCount > 0) {
      partsList.push({
        name: 'Hinge',
        material: `${hingeName}${cabinet.hardware.softClose ? ' · soft-close' : ''}`,
        dimensions: '-',
        quantity: doorCount * 2,
        unitPrice: cabinet.hardware.softClose ? 8.5 : 4.0,
      });
    }

    // Kickboard for base cabinets (135mm, 16mm board)
    if (cabinet.category === 'Base') {
      partsList.push({ name: 'Kickboard', material: carcaseName, dimensions: `${width} × 135 × ${T}mm`, quantity: 1, unitPrice: 25.0 });
    }

    return priceParts(partsList);
  }, [cabinet, rc, hingeName, runnerName, materials, edges, laborPerCabinet, hinges, drawerRunners, handles, legs, shelfPins, markups.material, markups.hardware, markups.labor, markups.edge]);

  const subtotal = useMemo(() => {
    return parts.reduce((sum, part) => sum + part.unitPrice * part.quantity, 0);
  }, [parts]);

  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  return (
    <div className={`flex flex-col h-full bg-background border-l ${className}`}>
      <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
        <List className="w-5 h-5 text-trade-navy" />
        <h3 className="font-semibold text-trade-navy">Parts List</h3>
        <span className="ml-auto text-sm text-muted-foreground">{parts.length} items</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {parts.map((part, index) => (
            <div key={`${part.name}-${index}`} className="p-3 bg-muted/30 rounded-lg space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{part.name}</span>
                </div>
                <span className="text-xs bg-trade-navy/10 text-trade-navy px-2 py-0.5 rounded">×{part.quantity}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{part.material}</span>
                {part.dimensions !== '-' && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Ruler className="w-3 h-3" />
                      {part.dimensions}
                    </span>
                  </>
                )}
              </div>
              <div className="flex justify-end text-sm font-medium">${(part.unitPrice * part.quantity).toFixed(2)}</div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-4 space-y-2 bg-muted/30">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">GST (10%)</span>
          <span>${gst.toFixed(2)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-semibold">
          <span className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-trade-amber" />
            Total
          </span>
          <span className="text-lg text-trade-navy">${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
