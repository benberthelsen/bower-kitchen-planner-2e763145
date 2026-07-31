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
import { Check, ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApplianceCatalog } from '@/hooks/useApplianceCatalog';
import type { ApplianceProductRecord } from '@/lib/pricing/types';
import {
  APPLIANCE_CATEGORY_ORDER,
  APPLIANCE_CATEGORY_LABELS,
  applianceDisplayPrice,
  filterApplianceProducts,
  groupAppliancesByCategory,
  filterCatalogToCooking,
  type ApplianceCategory,
  type CookingAnswers,
} from '../applianceSelection';

interface Props {
  chosen: Record<string, string>;
  /** What the customer said on the Cooking step. Used to narrow the catalog —
   *  this step used to show everything, including a dishwasher to someone who
   *  had just said they didn't want one. */
  cooking?: CookingAnswers;
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
  recommended,
  onToggle,
}: {
  product: ApplianceProductRecord;
  active: boolean;
  recommended?: boolean;
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
          {product.item_code && (
            <p className="text-[11px] font-medium text-slate-500">
              {product.brand ? `${product.brand} code` : 'Product code'} {product.item_code}
            </p>
          )}
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
      {recommended && !active && (
        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm">
          Recommended
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
  const [expanded, setExpanded] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const recommendedIds = new Set(products.slice(0, 3).map(product => product.id));
  const matchingProducts = React.useMemo(
    () => filterApplianceProducts(products, query),
    [products, query],
  );
  const visibleProducts = expanded
    ? matchingProducts
    : products.filter(product => recommendedIds.has(product.id) || product.id === chosenId);
  const resultsId = `appliance-results-${category}`;
  const toggleExpanded = () => {
    setExpanded(value => {
      if (value) setQuery('');
      return !value;
    });
  };
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{plural}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {expanded
              ? `${matchingProducts.length} of ${products.length} available`
              : `${Math.min(3, products.length)} recommended · ${products.length} available`}
          </p>
        </div>
        {products.length > 3 && (
          <button
            type="button"
            onClick={toggleExpanded}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            aria-expanded={expanded}
            aria-controls={resultsId}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {expanded ? 'Show 3 picks' : `View all ${products.length}`}
          </button>
        )}
      </div>

      {expanded && products.length > 3 && (
        <div className="space-y-2">
          <label htmlFor={`appliance-search-${category}`} className="sr-only">
            Search {plural.toLowerCase()}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id={`appliance-search-${category}`}
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={`Search ${plural.toLowerCase()} by name, code, size or finish`}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={`Clear ${plural.toLowerCase()} search`}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {category === 'sink' && (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Common sink searches">
              {['Single bowl', 'Double bowl', '1 3/4 bowl', 'With drainer', 'Undermount'].map(filter => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setQuery(current => current === filter ? '' : filter)}
                  aria-pressed={query === filter}
                  className={cn(
                    'min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium',
                    query === filter
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div id={resultsId} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visibleProducts.map(p => (
          <ProductCard
            key={p.id}
            product={p}
            active={chosenId === p.id}
            recommended={recommendedIds.has(p.id)}
            onToggle={() => onSelect(chosenId === p.id ? undefined : p.id)}
          />
        ))}
        {expanded && visibleProducts.length === 0 && (
          <div className="col-span-2 sm:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">No {plural.toLowerCase()} match “{query}”</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-2 min-h-11 rounded-lg px-3 text-xs font-semibold text-slate-700 underline underline-offset-2"
            >
              Clear search
            </button>
          </div>
        )}
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
      {products.length > 3 && (
        <button
          type="button"
          onClick={toggleExpanded}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          aria-expanded={expanded}
          aria-controls={resultsId}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? 'Back to recommended' : `View all ${products.length} ${plural.toLowerCase()}`}
        </button>
      )}
    </section>
  );
}

export default function StepAppliances({ chosen, cooking, onChange }: Props) {
  const { byCategory, isLoading, error } = useApplianceCatalog({ activeOnly: true });
  const [showAll, setShowAll] = React.useState(false);
  const allGrouped = React.useMemo(() => {
    // Prefer the hook's category grouping, then re-normalise into wizard keys.
    const all = Object.values(byCategory).flat();
    return groupAppliancesByCategory(all);
  }, [byCategory]);
  const { filtered, hiddenCount } = React.useMemo(
    () => filterCatalogToCooking(allGrouped, cooking),
    [allGrouped, cooking],
  );
  const grouped = showAll ? allGrouped : filtered;

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
        <h2 className="text-lg font-semibold text-slate-900 mb-1 outline-none">Choose your appliances</h2>
        <p className="text-sm text-slate-500">
          Start with a short list matched to how you cook. Choose what you'd like Bower to
          supply, bring your own, or leave the decision for your consultation.
        </p>
        {chosenCount > 0 && (
          <p className="mt-2 text-xs text-emerald-700 font-medium">
            {chosenCount} product{chosenCount === 1 ? '' : 's'} chosen — priced on the review step.
          </p>
        )}
        {/* The customer already answered these questions a step ago. Narrowing
            the list respects that — but never silently: say what was hidden and
            give them one tap to see the whole range. */}
        {!isLoading && !error && (hiddenCount > 0 || showAll) && (
          <p className="mt-2 text-xs text-slate-500">
            {showAll
              ? 'Showing the full range.'
              : `Matched to your answers on the last step — ${hiddenCount} other product${hiddenCount === 1 ? '' : 's'} hidden.`}
            {' '}
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="underline underline-offset-2 font-medium text-slate-700"
            >
              {showAll ? 'Match to my answers' : 'Show everything'}
            </button>
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
          Your chosen sink, tap, cooktop, oven, dishwasher, fridge and rangehood appear as the
          actual product in the 3D preview. A microwave — and a rangehood in a layout with no
          wall cabinets above the cooktop — is priced and listed on your quote, with placement
          confirmed with your consultant.

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
