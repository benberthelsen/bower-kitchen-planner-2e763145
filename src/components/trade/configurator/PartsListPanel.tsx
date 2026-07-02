import React, { useMemo } from 'react';
import { ConfiguredCabinet } from '@/contexts/TradeRoomContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { List, Package, Wrench, DollarSign, AlertTriangle } from 'lucide-react';
import { useCabinetBOM } from '@/hooks/useTradeRoomPricing';

interface PartsListPanelProps {
  cabinet: ConfiguredCabinet;
  className?: string;
}

const aud = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v || 0);

/**
 * Parts List — driven by the SAME BOM engine as the room quote
 * (useCabinetBOM → generateQuoteBOM). Part sizes come from the parts_pricing
 * formulas, materials from the cabinet's actual selections, hardware and
 * labor from the engine. The total here equals the planner's price for this
 * cabinet — no parallel pricing logic.
 */
export function PartsListPanel({ cabinet, className = '' }: PartsListPanelProps) {
  const { bom, quote, pricingData } = useCabinetBOM(cabinet);

  // Resolve display names + per-m² rates for the cabinet's two material roles.
  const roleInfo = useMemo(() => {
    const rows = pricingData?.materials ?? [];
    const find = (sel?: string) => {
      if (!sel) return undefined;
      const s = String(sel).toLowerCase();
      return rows.find((r) =>
        r.id === sel || r.item_code === sel || (r.name ?? '').toLowerCase().includes(s));
    };
    const carcase = find(cabinet.materials?.carcaseFinish);
    const exterior = find(cabinet.materials?.exteriorFinish);
    return {
      carcase: { name: carcase?.name ?? 'Carcase board', rate: carcase?.area_cost ?? 0 },
      exterior: { name: exterior?.name ?? 'Exterior board', rate: exterior?.area_cost ?? 0 },
    };
  }, [pricingData, cabinet.materials?.carcaseFinish, cabinet.materials?.exteriorFinish]);

  const unpricedRoles = useMemo(() => {
    const out: string[] = [];
    if (!roleInfo.exterior.rate) out.push(`${roleInfo.exterior.name} (exterior)`);
    if (!roleInfo.carcase.rate) out.push(`${roleInfo.carcase.name} (carcase)`);
    return out;
  }, [roleInfo]);

  if (!bom) {
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex items-center gap-2 p-4 border-b">
          <List className="w-4 h-4 text-trade-amber" />
          <h3 className="font-display font-semibold text-trade-navy">Parts List</h3>
        </div>
        <div className="p-4 text-sm text-muted-foreground">Calculating…</div>
      </div>
    );
  }

  const gst = Math.round(bom.totalCost * 10) / 100;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-trade-amber" />
          <h3 className="font-display font-semibold text-trade-navy">Parts List</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {bom.parts.reduce((n, p) => n + p.quantity, 0)} parts · {bom.hardware.length} hardware
        </span>
      </div>

      {unpricedRoles.length > 0 && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-300 p-2 text-[11px] text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            No captured price for {unpricedRoles.join(' and ')} — board cost is
            understated until the price book is imported.
          </span>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {/* Board parts — engine-sized from parts_pricing formulas */}
          {bom.parts.map((p, i) => {
            const role = p.materialRole === 'exterior' ? roleInfo.exterior : roleInfo.carcase;
            const unit = Math.round(p.area * role.rate * 100) / 100;
            return (
              <div key={`${p.name}-${i}`} className="rounded-lg border p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Package className="w-3.5 h-3.5 text-trade-muted shrink-0" />
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    {p.quantity > 1 && (
                      <span className="text-[10px] bg-muted rounded px-1">×{p.quantity}</span>
                    )}
                  </div>
                  <span className="text-sm tabular-nums shrink-0">
                    {role.rate > 0 ? aud(unit * p.quantity) : '—'}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{role.name}</span>
                  <span className="tabular-nums shrink-0">
                    {Math.round(p.length)} × {Math.round(p.width)} × {p.thickness}mm
                  </span>
                </div>
              </div>
            );
          })}

          {/* Hardware — engine-priced */}
          {bom.hardware.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 pt-2 text-xs font-medium text-trade-navy">
                <Wrench className="w-3.5 h-3.5" /> Hardware
              </div>
              {bom.hardware.map((h, i) => (
                <div
                  key={`${h.itemCode}-${i}`}
                  className="rounded-lg border p-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{h.name}</div>
                    <div className="text-[11px] text-muted-foreground">×{h.quantity}</div>
                  </div>
                  <span className="text-sm tabular-nums shrink-0">{aud(h.totalCost)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Cost summary — identical basis to the room quote */}
      <div className="border-t p-3 space-y-1 text-sm">
        {([
          ['Board (sheet-optimised)', bom.subtotals.materials],
          ['Edging', bom.subtotals.edging],
          ['Hardware', bom.subtotals.hardware],
          ['Handling & machining', bom.subtotals.handling + bom.subtotals.machining],
          ['Assembly', bom.subtotals.assembly],
          ['Labour', bom.subtotals.labor],
        ] as Array<[string, number]>).map(([label, v]) => (
          <div key={label} className="flex justify-between text-muted-foreground">
            <span>{label}</span>
            <span className="tabular-nums">{aud(v)}</span>
          </div>
        ))}
        <Separator className="my-1.5" />
        <div className="flex justify-between">
          <span>Cabinet cost (ex GST)</span>
          <span className="tabular-nums font-medium">{aud(bom.totalCost)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>GST (10%)</span>
          <span className="tabular-nums">{aud(gst)}</span>
        </div>
        <div className="flex justify-between items-center pt-1">
          <span className="flex items-center gap-1 font-display font-semibold text-trade-navy">
            <DollarSign className="w-4 h-4 text-trade-amber" /> Total
          </span>
          <span className="tabular-nums text-lg font-semibold text-trade-navy">
            {aud(bom.totalCost + gst)}
          </span>
        </div>
        {quote && quote.grandTotal.total > 0 && quote.grandTotal.cost !== quote.grandTotal.total && (
          <div className="text-[11px] text-muted-foreground pt-0.5">
            Sell incl. commercial layer: {aud(quote.grandTotal.total)} (room quote basis)
          </div>
        )}
      </div>
    </div>
  );
}
