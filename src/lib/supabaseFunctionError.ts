type FunctionErrorLike = {
  context?: unknown;
  message?: unknown;
};

/**
 * Supabase wraps non-2xx Edge Function responses in FunctionsHttpError and
 * keeps the useful JSON body on `context`. Preserve that server message for
 * admins instead of reducing every failure to "Failed".
 */
export async function getSupabaseFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const candidate = error as FunctionErrorLike | null;
  const context = candidate && typeof candidate === 'object' ? candidate.context : null;

  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown };
      const serverMessage = typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
          ? payload.message
          : '';
      if (serverMessage.trim()) return serverMessage.trim();
    } catch {
      try {
        const body = await context.clone().text();
        if (body.trim()) return body.trim().slice(0, 240);
      } catch {
        // Fall through to the ordinary Error message/fallback.
      }
    }
  }

  return typeof candidate?.message === 'string' && candidate.message.trim()
    ? candidate.message.trim()
    : fallback;
}
