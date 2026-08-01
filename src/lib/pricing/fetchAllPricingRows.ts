import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;
const MAX_PAGES = 25;

/**
 * Supabase/PostgREST caps a response at 1,000 rows. Pricing catalogues exceed
 * that limit, so every authoritative pricing read must page until exhausted.
 */
export async function fetchAllPricingRows<T>(
  table: string,
  equals: Record<string, unknown> = {},
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    let query = (supabase as any)
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    for (const [column, value] of Object.entries(equals)) {
      query = query.eq(column, value);
    }

    const { data, error } = await query;
    if (error) throw error;

    const pageRows = (data ?? []) as T[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return rows;
  }

  throw new Error(`Pricing table "${table}" exceeded the ${MAX_PAGES * PAGE_SIZE} row audit limit`);
}
