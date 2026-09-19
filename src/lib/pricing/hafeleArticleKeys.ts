/**
 * Häfele article numbers appear in two shapes - dotted on catalogue rows ("944.02.002") and plain on Häfele's own
 * pages ("94402002"). Pure (no Supabase import), so the pricing engine bundle can use it; hafeleTradePrices.ts
 * re-exports it for the planner UI.
 */
export function articleKeys(code: string | null | undefined): string[] {
  const raw = String(code ?? '').trim();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const keys = new Set<string>([raw, raw.toUpperCase()]);
  if (digits.length === 8) {
    keys.add(digits);
    keys.add(`${digits.slice(0, 3)}.${digits.slice(3, 5)}.${digits.slice(5)}`);
  }
  return [...keys];
}
