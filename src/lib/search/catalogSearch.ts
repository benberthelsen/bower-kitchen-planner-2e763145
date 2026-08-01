const PHRASE_ALIASES: Array<[RegExp, string]> = [
  [/\b(?:panle|pannel|gable|applied panel|side panel)\b/g, 'end panel'],
  [/\b(?:couner|coner)\b/g, 'corner'],
  [/\b(?:cabnet|cabnets|cupboard|unit)\b/g, 'cabinet'],
  [/\b(?:draw|draws)\b/g, 'drawer'],
  [/\b(?:overhead|over head|upper)\b/g, 'wall'],
  [/\b(?:plinth|toe kick|toekick)\b/g, 'kick'],
  [/\b(?:range hood|rangehood|rhange hoo(?:d)?|rhnge hoo(?:d)?|rhage hoo(?:d)?|vent hood|extractor)\b/g, 'rangehood'],
  [/\b(?:slide out|slideout)\b/g, 'pullout'],
  [/\b(?:rubbish|trash|waste)\b/g, 'bin'],
  [/\b(?:larder)\b/g, 'pantry'],
  [/\b(?:worktop|counter top|countertop)\b/g, 'benchtop'],
  [/\b(?:runner|runners|slide|slides)\b/g, 'drawer runner'],
  [/\b(?:adhesive|silicone)\b/g, 'glue'],
  [/\b(?:fastener|fasteners)\b/g, 'fixing'],
];

export function normaliseCatalogSearch(value: unknown): string {
  let text = String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (const [pattern, replacement] of PHRASE_ALIASES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length];
}

function tokenMatches(queryToken: string, candidateToken: string): boolean {
  if (candidateToken === queryToken || candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) {
    return true;
  }
  const allowed = queryToken.length >= 8 ? 2 : queryToken.length >= 4 ? 1 : 0;
  return allowed > 0 && Math.abs(queryToken.length - candidateToken.length) <= allowed
    && editDistance(queryToken, candidateToken) <= allowed;
}

/**
 * Forgiving trade-catalog search. Every query word must find a reasonable
 * candidate token, but spelling slips and common cabinet trade names are
 * normalised before matching.
 */
export function matchesCatalogSearch(query: string, fields: unknown[]): boolean {
  const normalisedQuery = normaliseCatalogSearch(query);
  if (!normalisedQuery) return true;
  const queryTokens = normalisedQuery.split(' ');
  const candidate = normaliseCatalogSearch(fields.filter(Boolean).join(' '));
  const candidateTokens = candidate.split(' ').filter(Boolean);
  return queryTokens.every(queryToken =>
    candidateTokens.some(candidateToken => tokenMatches(queryToken, candidateToken))
  );
}
