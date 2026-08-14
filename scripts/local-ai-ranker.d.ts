/** Dev-only local AI ranker used by the Vite middleware. */
export function handleLocalAiRequest(
  raw: unknown,
  options?: { apiKey?: string; model?: string },
): Promise<unknown>;
