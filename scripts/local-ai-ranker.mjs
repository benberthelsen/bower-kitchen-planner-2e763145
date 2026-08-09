const MAX_CANDIDATES = 6;
const DEFAULT_MODEL = 'gpt-5.6-terra';

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanStringList(value, maxItems = 24, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string')
    .slice(0, maxItems)
    .map(item => item.trim().slice(0, maxLength))
    .filter(Boolean);
}

/**
 * Accept compact, already-approved candidate summaries only. Full KitchenSpec
 * geometry and compiled items are deliberately not part of this contract.
 */
export function sanitizeLocalAiRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('invalid_local_ai_request');
  const mode = input.mode === 'refine' ? 'refine' : 'generate';
  const rawCandidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (rawCandidates.length === 0 || rawCandidates.length > MAX_CANDIDATES) {
    throw new Error('local_ai_requires_approved_candidates');
  }

  const seen = new Set();
  const candidates = rawCandidates.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('invalid_local_ai_candidate');
    const candidateId = cleanText(candidate.candidateId, 180);
    if (!candidateId || seen.has(candidateId)) throw new Error('invalid_local_ai_candidate_id');
    seen.add(candidateId);
    return {
      candidateId,
      existingName: cleanText(candidate.existingName, 90) || `Kitchen option ${index + 1}`,
      existingRationale: cleanText(candidate.existingRationale, 500),
      layoutFamily: cleanText(candidate.layoutFamily, 40),
      emphasis: cleanText(candidate.emphasis, 40),
      engineScore: Math.max(0, Math.min(100, cleanNumber(candidate.engineScore, 100 - index))),
      cabinetRoles: cleanStringList(candidate.cabinetRoles),
      upperPlans: cleanStringList(candidate.upperPlans, 12, 100),
      islandFeatures: cleanStringList(candidate.islandFeatures, 8, 60),
      warnings: cleanStringList(candidate.warnings, 12, 180),
      priceBand: {
        lowAud: Math.max(0, cleanNumber(candidate.priceBand?.lowAud)),
        highAud: Math.max(0, cleanNumber(candidate.priceBand?.highAud)),
      },
    };
  });

  return {
    mode,
    instruction: cleanText(input.instruction, 800),
    style: {
      familyId: cleanText(input.style?.familyId, 80),
      styleWords: cleanText(input.style?.styleWords, 180),
    },
    room: {
      shape: cleanText(input.room?.shape, 40),
      widthMm: Math.max(0, cleanNumber(input.room?.widthMm)),
      depthMm: Math.max(0, cleanNumber(input.room?.depthMm)),
      selectedWalls: cleanStringList(input.room?.selectedWalls, 4, 20),
    },
    currentCandidateId: cleanText(input.currentCandidateId, 180),
    candidates,
  };
}

function scoreForInstruction(candidate, instruction) {
  let score = candidate.engineScore;
  const words = instruction.toLowerCase();
  const roles = candidate.cabinetRoles.join(' ').toLowerCase();
  const islands = candidate.islandFeatures.join(' ').toLowerCase();
  const emphasis = candidate.emphasis.toLowerCase();
  if (/storage|pantry|drawer/.test(words)) {
    if (emphasis === 'storage') score += 24;
    if (/pantry|drawer/.test(roles)) score += 6;
  }
  if (/island|seat|entertain|social/.test(words)) {
    if (emphasis === 'social') score += 24;
    if (islands) score += 6;
  }
  if (/workflow|prep|cook|sink/.test(words) && emphasis === 'workflow') score += 14;
  if (/budget|cheaper|cost|price/.test(words)) score -= candidate.priceBand.lowAud / 10_000;
  return score;
}

/** Explicitly-labelled workflow simulator used when no local API key exists. */
export function deterministicLocalChoices(request) {
  return [...request.candidates]
    .sort((a, b) => scoreForInstruction(b, request.instruction) - scoreForInstruction(a, request.instruction))
    .slice(0, 3)
    .map((candidate, index) => ({
      candidateId: candidate.candidateId,
      name: candidate.existingName,
      rationale: candidate.existingRationale
        || `${candidate.layoutFamily || 'Kitchen'} option ${index + 1}, checked by the Bower planning engine.`,
    }));
}

export function validateRankedChoices(raw, request) {
  const allowed = new Set(request.candidates.map(candidate => candidate.candidateId));
  const seen = new Set();
  const choices = Array.isArray(raw?.choices) ? raw.choices : [];
  const valid = [];
  for (const choice of choices) {
    const candidateId = cleanText(choice?.candidateId, 180);
    if (!allowed.has(candidateId) || seen.has(candidateId)) continue;
    seen.add(candidateId);
    const source = request.candidates.find(candidate => candidate.candidateId === candidateId);
    valid.push({
      candidateId,
      name: cleanText(choice?.name, 90) || source.existingName,
      rationale: cleanText(choice?.rationale, 500) || source.existingRationale,
    });
    if (valid.length === 3) break;
  }
  if (valid.length === 0) throw new Error('local_ai_returned_no_approved_ids');
  return valid;
}

export async function rankWithOpenAi(request, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error('local_ai_key_missing');
  const model = options.model || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are Bower Cabinets\' kitchen-design ranking assistant.',
              'The deterministic planning engine has already created and approved every candidate.',
              'Rank, name and explain only the candidateId values supplied.',
              'Never invent an ID, cabinet, product, dimension, layout or geometry.',
              'Return JSON only: {"choices":[{"candidateId":"allowed id","name":"short homeowner name","rationale":"one concise reason"}]}.',
              'Return up to three materially distinct choices, strongest first. A refinement instruction should influence ranking only.',
            ].join(' '),
          },
          { role: 'user', content: JSON.stringify(request) },
        ],
      }),
    });
    if (!response.ok) {
      const detail = cleanText(await response.text(), 240);
      throw new Error(`local_ai_provider_${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('local_ai_provider_empty_response');
    return {
      choices: validateRankedChoices(JSON.parse(content), request),
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleLocalAiRequest(raw, options = {}) {
  const request = sanitizeLocalAiRequest(raw);
  if (!options.apiKey) {
    return {
      choices: deterministicLocalChoices(request),
      provider: 'simulator',
      modelId: 'bower-local-workflow-simulator-v1',
    };
  }
  const ranked = await rankWithOpenAi(request, options);
  return { ...ranked, provider: 'openai', modelId: ranked.model };
}
