import type { IncomingMessage, ServerResponse } from 'node:http';

/** Dev-only local AI ranker endpoint used by the Vite middleware. */
export function handleLocalAiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> | boolean;
