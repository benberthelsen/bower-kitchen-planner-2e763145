/**
 * ai-health — temporary diagnostic for the ai-designer provider path.
 * Calls OpenAI /v1/models with the configured OPENAI_API_KEY and reports ONLY
 * status codes and whether the designer's default model is available.
 * Never returns key material or full provider bodies. Remove after diagnosis.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async () => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.6-terra';
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, reason: 'no_api_key_configured' }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  const out: Record<string, unknown> = { keyPrefix: apiKey.slice(0, 7) + '…', model };
  try {
    const models = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    out.modelsStatus = models.status;
    if (models.ok) {
      const list = await models.json();
      out.modelCount = list.data?.length ?? 0;
      out.hasDefaultModel = !!list.data?.some((m: { id: string }) => m.id === model);
    } else {
      const text = await models.text();
      out.errorSnippet = text.slice(0, 200);
    }
    // Probe with the EXACT parameter shape ai-designer sends (tools +
    // tool_choice required + parallel_tool_calls false + 8000 token cap).
    const chat = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_completion_tokens: 8000,
        tools: [{
          type: 'function',
          function: {
            name: 'probe_tool',
            description: 'Echo a message',
            parameters: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message'],
            },
          },
        }],
        tool_choice: 'required',
        parallel_tool_calls: false,
        messages: [
          { role: 'system', content: 'You are a probe. Call probe_tool once.' },
          { role: 'user', content: 'Call the tool with message OK' },
        ],
      }),
    });
    out.chatStatus = chat.status;
    if (!chat.ok) out.chatErrorSnippet = (await chat.text()).slice(0, 400);
  } catch (err) {
    out.fetchError = String(err).slice(0, 200);
  }
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
});
