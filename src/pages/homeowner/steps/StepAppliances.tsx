/**
 * Step 3 — "Appliances": the homeowner's product catalog.
 *
 * Reads live products from the `appliance_products` table via
 * `useApplianceCatalog` (anon-readable), groups them by plain-English
 * category, and lets the customer pick one product per category — or skip
 * ("I'll supply my own"). Chosen IDs are stored on wizard state and drive
 *
 *  - 3D rendering (dishwasher/fridge/rangehood get GLB snapshots),
 *  - the pricing appliance section on Review,
 *  - the enquiry payload that lands with Bower.
 *
 * The step is entirely optional — nothing here blocks progression.
 */
import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApplianceCatalog } from '@/hooks/useApplianceCatalog';
import type { ApplianceProductRecord } from '@/lib/pricing/types';
import {
  APPLIANCE_CATEGORY_ORDER,
  APPLIANCE_CATEGORY_LABELS,
  applianceDisplayPrice,
  groupAppliancesByCategory,
  type ApplianceCategory,
} from '../applianceSelection';

interface Props {
  chosen: Record<string, string>;
  onChange: (chosen: Record<string, string>) => void;
}

function money(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return 'Price to be confirmed';
  return `$${Math.round(n).toLocaleString()} AUD`;
}

function dimensionLabel(p: ApplianceProductRecord): string | null {
  const w = p.width_mm, h = p.height_mm, d = p.depth_mm;
  const parts: string[] = [];
  if (w) parts.push(`${w}W`);
  if (h) parts.push(`${h}H`);
  if (d) parts.push(`${d}D`);
  return parts.length ? `${parts.join(' × ')} mm` : null;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

function ProductCard({
  product,
  active,
  onToggle,
}: {
  product: ApplianceProductRecord;
  active: boolean;
  onToggle: () => void;
}) {
  const price = applianceDisplayPrice(product);
  const dims = dimensionLabel(product);
  const label = product.brand ? `${product.brand} — ${product.name}` : product.name;
  const iOS = isIOS();
  return (
    <div
      className={cn(
        'group relative rounded-2xl border-2 bg-white overflow-hidden transition-all flex flex-col min-h-[44px]',
        active
          ? 'border-slate-900 shadow-sm ring-2 ring-slate-900 ring-offset-1'
          : 'border-slate-200 hover:border-slate-400',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className="text-left w-full flex flex-col flex-1"
      >
        <div className="aspect-[4/3] bg-slate-50 flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt=""
              loading="lazy"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-slate-300 text-xs">No photo</div>
          )}
        </div>
        <div className="p-3 space-y-1 flex-1">
          <p className="text-sm font-semibold text-slate-900 leading-tight">{label}</p>
          {product.finish && (
            <p className="text-[11px] text-slate-500">{product.finish}</p>
          )}
          {dims && <p className="text-[11px] text-slate-400">{dims}</p>}
          <p className={cn('text-xs font-medium', price > 0 ? 'text-slate-800' : 'text-slate-400')}>
            {money(price)}
          </p>
          {product.price_is_placeholder && price > 0 && (
            <p className="text-[10px] text-amber-600">Indicative — confirmed in final quote</p>
          )}
        </div>
      </button>
      {iOS && (
        product.model_ios_url ? (
          <a
            href={product.model_ios_url}
            rel="ar"
            className="block text-center text-[11px] font-medium text-slate-700 border-t border-slate-200 py-1.5 hover:bg-slate-50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quick Look wraps an image — required by Safari to trigger AR. */}
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" className="hidden" />
            View in your room (AR)
          </a>
        ) : (
          <div className="text-center text-[11px] text-slate-400 border-t border-slate-100 py-1.5">
            AR preview coming soon
          </div>
        )
      )}
      {active && (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-slate-900 text-white text-[10px] font-semibold px-2 py-0.5">
          <Check className="w-3 h-3" /> Chosen
        </span>
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  products,
  chosenId,
  onSelect,
}: {
  category: ApplianceCategory;
  products: ApplianceProductRecord[];
  chosenId: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  const { plural, singular } = APPLIANCE_CATEGORY_LABELS[category];
  const noneActive = chosenId === '__none__';
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{plural}</h3>
        <p className="text-xs text-slate-500 mt-0.5">Pick one — or skip and supply your own.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {products.map(p => (
          <ProductCard
            key={p.id}
            product={p}
            active={chosenId === p.id}
            onToggle={() => onSelect(chosenId === p.id ? undefined : p.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => onSelect(noneActive ? undefined : '__none__')}
          aria-pressed={noneActive}
          className={cn(
            'rounded-2xl border-2 border-dashed p-4 text-center text-xs font-medium transition-all min-h-[140px] flex flex-col items-center justify-center gap-1',
            noneActive
              ? 'border-slate-900 bg-slate-50 text-slate-900'
              : 'border-slate-200 text-slate-500 hover:border-slate-400',
          )}
        >
          <span>I'll supply my own</span>
          <span className="text-[10px] text-slate-400 font-normal">Leave the opening — no {singular} added to your order</span>
        </button>
      </div>
    </section>
  );
}

export default function StepAppliances({ chosen, onChange }: Props) {
  const { byCategory, isLoading, error } = useApplianceCatalog({ activeOnly: true });
  const grouped = React.useMemo(() => {
    // Prefer the hook's category grouping, then re-normalise into wizard keys.
    const all = Object.values(byCategory).flat();
    return groupAppliancesByCategory(all);
  }, [byCategory]);

  const setChoice = (cat: ApplianceCategory, id: string | undefined) => {
    const next = { ...chosen };
    if (id === undefined) delete next[cat];
    else next[cat] = id;
    onChange(next);
  };

  const visibleCategories = APPLIANCE_CATEGORY_ORDER.filter(c => (grouped[c]?.length ?? 0) > 0);
  const chosenCount = Object.values(chosen).filter(v => v && v !== '__none__').length;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Choose your appliances</h2>
        <p className="text-sm text-slate-500">
          Pick the pieces you'd like Bower to supply with your kitchen — sinks, taps, ovens,
          cooktops, and everything else. Skip anything you'll bring yourself.
        </p>
        {chosenCount > 0 && (
          <p className="mt-2 text-xs text-emerald-700 font-medium">
            {chosenCount} product{chosenCount === 1 ? '' : 's'} chosen — priced on the review step.
          </p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading products…
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">We couldn't load the appliance range right now.</p>
          <p>You can skip this step and pick appliances later with your consultant. If this keeps happening please let us know — details are in the browser console.</p>
        </div>
      )}

      {!isLoading && !error && visibleCategories.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
          Dishwashers, fridges and rangehoods appear as your chosen product in the 3D preview.
          Sinks, taps, cooktops, ovens and microwaves are shown as their cabinet openings for
          now — they're always priced and listed on your quote.
        </div>
      )}

      {!isLoading && !error && visibleCategories.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          Our appliance range isn't loaded yet. Skip this step — you can still ask about specific
          products on the next step.
        </div>
      )}

      {visibleCategories.map(cat => (
        <CategoryBlock
          key={cat}
          category={cat}
          products={grouped[cat]}
          chosenId={chosen[cat]}
          onSelect={id => setChoice(cat, id)}
        />
      ))}

      <p className="text-[11px] text-slate-400 text-center pt-2">
        Appliance prices are indicative and will be confirmed in your final quote.
      </p>
    </div>
  );
}
