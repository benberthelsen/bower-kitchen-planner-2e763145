import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BenchtopMaterialRecord } from '@/lib/pricing';
import { Check, TriangleAlert } from 'lucide-react';

const PATHWAY_LABELS: Record<string, string> = {
  stock_preformed: 'Stock pre-formed tops',
  stock_sheet_fabricated: 'Sheet material + Bower fabrication',
  supplier_custom: 'Supplier custom order',
  made_to_order: 'Made-to-order press/postformed tops',
};

function baseRate(option: BenchtopMaterialRecord): string {
  if (option.pricing_method === 'per_sheet') return `$${(option.price_per_sheet ?? 0).toFixed(2)} / sheet`;
  if (option.pricing_method === 'per_lm') return `$${(option.price_per_lm ?? 0).toFixed(2)} / LM`;
  return `$${(option.trade_supply_per_sqm ?? 0).toFixed(2)} / m²`;
}

function operationSummary(option: BenchtopMaterialRecord): string[] {
  const lines: string[] = [];
  if ((option.cnc_setup_cost ?? 0) > 0) lines.push(`CNC setup $${option.cnc_setup_cost!.toFixed(2)}`);
  if ((option.cnc_cut_per_lm ?? 0) > 0) lines.push(`CNC $${option.cnc_cut_per_lm!.toFixed(2)}/LM`);
  if ((option.sanding_polishing_per_lm ?? 0) > 0) lines.push(`sand/polish $${option.sanding_polishing_per_lm!.toFixed(2)}/LM`);
  if ((option.join_cost ?? 0) > 0) lines.push(`joins $${option.join_cost!.toFixed(2)}`);
  if ((option.sink_cutout_cost ?? 0) > 0) lines.push(`sink cut-out $${option.sink_cutout_cost!.toFixed(2)}`);
  if ((option.cooktop_cutout_cost ?? 0) > 0) lines.push(`cooktop cut-out $${option.cooktop_cutout_cost!.toFixed(2)}`);
  return lines;
}

export function BenchtopMatrixDialog({
  open,
  onOpenChange,
  options,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: BenchtopMaterialRecord[];
  selectedId?: string;
  onSelect: (option: BenchtopMaterialRecord) => void;
}) {
  const grouped = options.reduce<Record<string, BenchtopMaterialRecord[]>>((result, option) => {
    const key = option.supply_pathway ?? 'supplier_custom';
    (result[key] ??= []).push(option);
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select and price the benchtop</DialogTitle>
          <DialogDescription>
            The selected row drives the planner estimate, quote, dashboard and ordering list. Base supplier cost and fabrication charges are calculated separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {Object.entries(grouped).map(([pathway, pathwayOptions]) => (
            <section key={pathway} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{PATHWAY_LABELS[pathway] ?? pathway}</h3>
                <span className="text-xs text-muted-foreground">{pathwayOptions.length} option{pathwayOptions.length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {pathwayOptions.map((option) => {
                  const selected = option.id === selectedId;
                  const operations = operationSummary(option);
                  const incomplete = option.price_status !== 'confirmed';
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`rounded-lg border p-4 text-left transition hover:border-primary ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                      onClick={() => onSelect(option)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{option.brand} — {option.range_tier || 'Standard'}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {option.stock_length_mm} × {option.stock_depth_mm} mm
                            {option.thickness_mm ? ` × ${option.thickness_mm} mm` : ''}
                            {option.profile_type ? ` · ${option.profile_type.split('_').join(' ')}` : ''}
                          </p>
                        </div>
                        {selected ? <Badge><Check className="mr-1 h-3 w-3" />Selected</Badge> : option.is_default ? <Badge variant="outline">Default</Badge> : null}
                      </div>
                      <p className="mt-3 font-mono text-sm font-semibold">{baseRate(option)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {operations.length ? operations.join(' · ') : 'No fabrication/order charges entered'}
                      </p>
                      {incomplete && (
                        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
                          <TriangleAlert className="h-3.5 w-3.5" /> Supplier/base price only — fabrication rates need confirmation
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {options.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No active benchtop pricing rows are available.</p>}
        </div>

        <div className="flex justify-end border-t pt-4"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );
}
