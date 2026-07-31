import type { ApplianceProductRecord } from '@/lib/pricing/types';

export type RangehoodPresentation = 'canopy' | 'concealed';

const CANOPY_PATTERN = /\b(canopy|chimney|wall[\s-]?mounted)\b/i;
const CONCEALED_PATTERN =
  /\b(undermount|under[\s-]?mount|slide[\s-]?out|built[\s-]?in|integrated|concealed|insert)\b/i;

/**
 * Resolve the joinery treatment from supplier wording.
 *
 * Canopy/chimney models remain exposed. Undermount, slide-out and other
 * built-in models sit inside a matching wall cabinet. Unknown legacy rows
 * retain the historical canopy fallback rather than silently changing an
 * existing design.
 */
export function rangehoodPresentationFromText(...values: Array<string | null | undefined>): RangehoodPresentation {
  const text = values.filter(Boolean).join(' ');
  if (CANOPY_PATTERN.test(text)) return 'canopy';
  if (CONCEALED_PATTERN.test(text)) return 'concealed';
  return 'canopy';
}

export function isConcealedRangehoodProduct(
  product: Pick<ApplianceProductRecord, 'name' | 'subcategory' | 'description' | 'installation'>,
): boolean {
  return rangehoodPresentationFromText(
    product.name,
    product.subcategory,
    product.installation,
    product.description,
  ) === 'concealed';
}
