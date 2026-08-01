import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Package,
  Search,
  Star,
  Wrench,
} from 'lucide-react';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useHardwareDefaults, type HardwareSku } from '@/hooks/useHardwareDefaults';
import { useCatalog } from '@/hooks/useCatalog';
import { matchesCatalogSearch } from '@/lib/search/catalogSearch';
import { cn } from '@/lib/utils';

const FAVORITES_KEY = 'trade.hardware.favoriteSkus';

function hardwareCategory(item: HardwareSku): string {
  const text = `${item.type} ${item.name}`.toLowerCase();
  if (/hinge|mounting plate/.test(text)) return 'Hinges';
  if (/runner|drawer system|slide/.test(text)) return 'Drawer systems';
  if (/handle|pull|knob/.test(text)) return 'Handles';
  if (/bin|waste|rubbish/.test(text)) return 'Bins';
  if (/screw|fixing|bracket|connector|dowel|cam |bolt/.test(text)) return 'Fixings';
  if (/glue|adhesive|silicone|sealant/.test(text)) return 'Glues & sealants';
  if (/leg|foot|kick|plinth/.test(text)) return 'Legs & kicks';
  if (/shelf|pin|support/.test(text)) return 'Shelving';
  return 'Other hardware';
}

const CATEGORY_ORDER = [
  'All',
  'Hinges',
  'Drawer systems',
  'Handles',
  'Bins',
  'Fixings',
  'Glues & sealants',
  'Legs & kicks',
  'Shelving',
  'Other hardware',
  'Appliances',
];

export default function HardwareStore() {
  const navigate = useNavigate();
  const { hardware, selectedSku, selectSku, loading } = useHardwareDefaults();
  const { catalog, applianceCatalogLoading } = useCatalog('trade');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [favoriteSkus, setFavoriteSkus] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  });

  const appliances = useMemo(
    () => catalog.filter(item => item.applianceProduct),
    [catalog],
  );

  const groupedHardware = useMemo(() => {
    const groups: Record<string, HardwareSku[]> = {};
    for (const item of hardware) {
      const group = hardwareCategory(item);
      if (category !== 'All' && category !== group) continue;
      if (!matchesCatalogSearch(query, [item.name, item.sku, item.type, group])) continue;
      (groups[group] ??= []).push(item);
    }
    return groups;
  }, [hardware, category, query]);

  const filteredAppliances = useMemo(() => {
    if (category !== 'All' && category !== 'Appliances') return [];
    return appliances.filter(item => matchesCatalogSearch(query, [
      item.name,
      item.sku,
      item.applianceProduct?.brand,
      item.applianceProduct?.category,
      item.applianceProduct?.subcategory,
      item.applianceProduct?.description,
      'appliance',
    ]));
  }, [appliances, category, query]);

  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of hardware) {
      const group = hardwareCategory(item);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    counts.set('Appliances', appliances.length);
    return CATEGORY_ORDER.filter(item => item === 'All' || (counts.get(item) ?? 0) > 0)
      .map(item => ({
        name: item,
        count: item === 'All' ? hardware.length + appliances.length : counts.get(item) ?? 0,
      }));
  }, [hardware, appliances.length]);

  const favoriteHardware = useMemo(
    () => hardware.filter(item => favoriteSkus.has(item.sku)),
    [hardware, favoriteSkus],
  );

  const toggleFavorite = (sku: string) => {
    setFavoriteSkus(previous => {
      const next = new Set(previous);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const renderHardware = (item: HardwareSku) => {
    const selected = selectedSku === item.sku;
    const favorite = favoriteSkus.has(item.sku);
    return (
      <div
        key={item.id}
        className={cn(
          'rounded-lg border bg-white p-3 transition-colors',
          selected ? 'border-trade-amber ring-2 ring-trade-amber/20' : 'border-trade-border hover:border-trade-amber/50',
        )}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => selectSku(item.sku)}
          >
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm text-trade-navy">{item.name}</p>
              {selected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
            </div>
            <p className="mt-1 text-xs text-trade-muted">SKU: {item.sku}</p>
          </button>
          <button
            type="button"
            onClick={() => toggleFavorite(item.sku)}
            className={cn('rounded p-1', favorite ? 'text-trade-amber' : 'text-trade-muted hover:text-trade-amber')}
            aria-label={favorite ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
          >
            <Star className={cn('h-4 w-4', favorite && 'fill-current')} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Badge variant="secondary">{item.type || hardwareCategory(item)}</Badge>
          <span className="text-sm font-medium text-trade-navy">${item.unitCost.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  const resultCount = Object.values(groupedHardware).reduce((sum, rows) => sum + rows.length, 0)
    + filteredAppliances.length;

  return (
    <TradeLayout>
      <div className="mx-auto max-w-7xl p-4 lg:p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/trade/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-trade-navy">Trade Supply Store</h1>
            <p className="text-sm text-trade-muted">Search hardware, bins, fixings, glues and Bower-supplied appliances.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/trade/catalog')}>
            Full cabinet catalog <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="mb-5 rounded-xl border border-trade-border bg-trade-surface-elevated p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-trade-muted" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search by name, use, trade name or SKU..."
              className="pl-9"
            />
          </div>
          <p className="mt-2 text-xs text-trade-muted">Forgiving search understands common spelling mistakes and alternate trade names.</p>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {availableCategories.map(item => (
              <button
                type="button"
                key={item.name}
                onClick={() => setCategory(item.name)}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium',
                  category === item.name
                    ? 'border-trade-navy bg-trade-navy text-white'
                    : 'border-trade-border bg-white text-trade-navy hover:border-trade-amber',
                )}
              >
                {item.name} <span className="opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        {(loading || applianceCatalogLoading) && (
          <p className="text-sm text-muted-foreground">Loading trade supply catalog...</p>
        )}

        {!loading && !query && category === 'All' && favoriteHardware.length > 0 && (
          <section className="mb-6 rounded-xl border border-trade-amber/40 bg-trade-amber/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Star className="h-4 w-4 fill-current text-trade-amber" />
              <h2 className="font-semibold text-trade-navy">My favourites</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {favoriteHardware.map(renderHardware)}
            </div>
          </section>
        )}

        {!loading && resultCount === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-trade-muted">
            No matching products. Try a use such as "end panel", "bin", "runner" or "fixing".
          </div>
        )}

        <div className="space-y-6">
          {CATEGORY_ORDER.filter(group => groupedHardware[group]?.length).map(group => (
            <section key={group}>
              <div className="mb-3 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-trade-amber" />
                <h2 className="font-semibold text-trade-navy">{group}</h2>
                <Badge variant="secondary">{groupedHardware[group].length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groupedHardware[group].map(renderHardware)}
              </div>
            </section>
          ))}

          {filteredAppliances.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-trade-amber" />
                <h2 className="font-semibold text-trade-navy">Appliances</h2>
                <Badge variant="secondary">{filteredAppliances.length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredAppliances.map(item => (
                  <div key={item.id} className="rounded-lg border border-trade-border bg-white p-3">
                    <p className="font-medium text-sm text-trade-navy">{item.name}</p>
                    <p className="mt-1 text-xs text-trade-muted">SKU: {item.sku}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="secondary">{item.applianceProduct?.category ?? 'Appliance'}</Badge>
                      <span className="text-sm font-medium text-trade-navy">${item.price.toFixed(2)}</span>
                    </div>
                    <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => navigate('/trade/catalog')}>
                      Open in product catalog
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Package className="mr-2 inline h-4 w-4" />
          Default quoting SKU: <span className="font-medium text-foreground">{selectedSku || 'Not selected yet'}</span>
        </div>
      </div>
    </TradeLayout>
  );
}
