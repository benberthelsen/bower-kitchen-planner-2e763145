import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ExtendedCatalogItem } from '@/hooks/useCatalog';

/**
 * Per-user catalog favourites + usage tracking + "most used" quick picks.
 *
 * Favourites and usage counts are stored per signed-in user (localStorage,
 * keyed by user id) so each user builds their own quick-selection list.
 * The default seed list reflects the workhorse cabinets that industry sizing
 * guides and kitchen planners (KraftMaid, Kitchen Cabinet Kings, IKEA, etc.)
 * consistently list as the most-placed units in a typical kitchen:
 * standard base door cabinets, drawer banks, the sink base, the corner
 * solution, wall doors, the pantry and the appliance housings.
 */

const FAVORITES_LEGACY_KEY = 'catalog-favorites';

// Ranked default picks. Each entry: preferred exact ids (static catalog),
// then a name/id pattern fallback (DB catalogs use UUID ids, so match names).
const DEFAULT_QUICK_PICKS: Array<{ ids: string[]; pattern: RegExp }> = [
  { ids: ['base_2_door'], pattern: /base[ _]?2[ _]?door(?![ _]?\d)/i },
  { ids: ['base_3_drawer'], pattern: /base[ _]?3[ _]?drawer/i },
  { ids: ['sink_base_2_door'], pattern: /sink[ _]?base|base.*sink/i },
  { ids: ['base_corner_pie_cut_2_door'], pattern: /pie[ _]?cut/i },
  { ids: ['base_1_door'], pattern: /base[ _]?1[ _]?door(?![ _]?\d)/i },
  { ids: ['wall_2_door'], pattern: /(wall|upper)[ _]?2[ _]?door/i },
  { ids: ['wall_1_door'], pattern: /(wall|upper)[ _]?1[ _]?door/i },
  { ids: ['tall_2_door_pantry'], pattern: /pantry/i },
  { ids: ['tall_oven'], pattern: /tall[ _]?oven|oven tower/i },
  { ids: ['dishwasher_opening'], pattern: /dishwasher/i },
  { ids: ['tall_fridge'], pattern: /fridge(?![ _]?(top|side))/i },
  { ids: ['wall_rangehood'], pattern: /rangehood|range hood/i },
];

export const QUICK_PICKS_MAX = 12;

// ---- tiny localStorage store with cross-component reactivity ---------------

const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();

function readJson<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const raw = localStorage.getItem(key);
    const val = raw ? (JSON.parse(raw) as T) : fallback;
    cache.set(key, val);
    return val;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full/unavailable — keep in-memory value */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---- favourites -------------------------------------------------------------

export function useCatalogFavorites() {
  const { user } = useAuth();
  const uid = user?.id ?? 'anon';
  const key = `catalog-favorites:${uid}`;

  const favoritesArr = useSyncExternalStore(
    subscribe,
    () => {
      let arr = readJson<string[]>(key, []);
      // One-time migration from the old shared (non-per-user) key.
      if (arr.length === 0) {
        const legacy = readJson<string[] | null>(FAVORITES_LEGACY_KEY, null);
        if (legacy && legacy.length > 0) {
          arr = legacy;
          writeJson(key, arr);
        }
      }
      return JSON.stringify(arr);
    },
  );

  const favorites = useMemo(() => new Set<string>(JSON.parse(favoritesArr) as string[]), [favoritesArr]);

  const toggleFavorite = useCallback(
    (id: string) => {
      const next = new Set(readJson<string[]>(key, []));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeJson(key, [...next]);
    },
    [key],
  );

  return { favorites, toggleFavorite };
}

// ---- usage counts -----------------------------------------------------------

export function useCatalogUsage() {
  const { user } = useAuth();
  const uid = user?.id ?? 'anon';
  const key = `catalog-usage:${uid}`;

  const usageJson = useSyncExternalStore(subscribe, () => JSON.stringify(readJson<Record<string, number>>(key, {})));
  const usage = useMemo(() => JSON.parse(usageJson) as Record<string, number>, [usageJson]);

  const recordUsage = useCallback(
    (id: string) => {
      const counts = { ...readJson<Record<string, number>>(key, {}) };
      counts[id] = (counts[id] ?? 0) + 1;
      writeJson(key, counts);
    },
    [key],
  );

  return { usage, recordUsage };
}

// ---- quick picks ------------------------------------------------------------

function matchDefaultPick(catalog: ExtendedCatalogItem[], pick: { ids: string[]; pattern: RegExp }) {
  for (const id of pick.ids) {
    const exact = catalog.find((c) => c.id === id || c.microvellumLinkId === id);
    if (exact) return exact;
  }
  return catalog.find((c) => pick.pattern.test(`${c.id} ${c.name}`));
}

/**
 * Ordered quick-selection list for a catalog:
 * 1. the user's own favourites (their custom list),
 * 2. their most-used products (by placement count),
 * 3. industry-standard defaults to fill up to QUICK_PICKS_MAX.
 */
export function useQuickPicks(catalog: ExtendedCatalogItem[]) {
  const { favorites, toggleFavorite } = useCatalogFavorites();
  const { usage, recordUsage } = useCatalogUsage();

  const quickPicks = useMemo(() => {
    if (!catalog.length) return [] as ExtendedCatalogItem[];
    const seen = new Set<string>();
    const out: ExtendedCatalogItem[] = [];
    const push = (item?: ExtendedCatalogItem) => {
      if (item && !seen.has(item.id) && out.length < QUICK_PICKS_MAX) {
        seen.add(item.id);
        out.push(item);
      }
    };

    // 1. Favourites — the user's own list, in catalog order.
    catalog.filter((c) => favorites.has(c.id)).forEach(push);

    // 2. Most used by this user (needs at least 2 placements to count).
    const byId = new Map(catalog.map((c) => [c.id, c]));
    Object.entries(usage)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .forEach(([id]) => push(byId.get(id)));

    // 3. Industry defaults fill the rest.
    for (const pick of DEFAULT_QUICK_PICKS) push(matchDefaultPick(catalog, pick));

    return out;
  }, [catalog, favorites, usage]);

  return { quickPicks, favorites, toggleFavorite, recordUsage };
}
