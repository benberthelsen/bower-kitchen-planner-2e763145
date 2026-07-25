import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { gate, jsonResponse, readJsonBody } from '../_shared/roomScan/security.ts';
import { parseSyntheticTestContext } from '../_shared/syntheticTest.ts';

const allowedStatuses = new Set(['planned', 'running', 'completed', 'failed', 'paused']);
const allowedDevices = new Set(['mobile', 'desktop', 'tablet']);

serve(async (req) => {
  const gated = gate(req);
  if (gated) return gated;

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;

  let syntheticTest;
  try {
    syntheticTest = parseSyntheticTestContext(req, body);
  } catch {
    return jsonResponse(req, 403, { error: 'invalid_synthetic_test' });
  }
  if (!syntheticTest || typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonResponse(req, 400, { error: 'invalid_request' });
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const request = body as Record<string, unknown>;
  const action = request.action;

  if (action === 'health') {
    const { error } = await service.from('synthetic_usability_sessions').select('id').limit(1);
    return jsonResponse(req, error ? 503 : 200, {
      ok: !error,
      testMode: true,
      databaseSink: !error,
      mailtrapConfigured: Boolean(Deno.env.get('MAILTRAP_API_TOKEN') && Deno.env.get('MAILTRAP_INBOX_ID')),
    });
  }

  if (action === 'upsert-session') {
    const session = request.session;
    if (typeof session !== 'object' || session === null || Array.isArray(session)) {
      return jsonResponse(req, 400, { error: 'invalid_session' });
    }
    const row = session as Record<string, unknown>;
    if (!allowedDevices.has(String(row.device)) || !allowedStatuses.has(String(row.status))) {
      return jsonResponse(req, 400, { error: 'invalid_session' });
    }

    const { data, error } = await service
      .from('synthetic_usability_sessions')
      .upsert({
        ...row,
        test_run_id: syntheticTest.testRunId,
        persona_id: syntheticTest.personaId,
        is_synthetic_test: true,
      }, { onConflict: 'test_run_id,persona_id' })
      .select('id,status')
      .single();
    if (error) return jsonResponse(req, 500, { error: 'session_write_failed' });
    return jsonResponse(req, 200, { ok: true, session: data });
  }

  if (action === 'summary') {
    const [{ data: sessions, error: sessionError }, { data: emails, error: emailError }] = await Promise.all([
      service
        .from('synthetic_usability_sessions')
        .select('persona_id,status,ai_session_id,proposal_ids,job_id,email_sink_id,price_band')
        .eq('test_run_id', syntheticTest.testRunId)
        .order('persona_id'),
      service
        .from('synthetic_email_sink')
        .select('id,persona_id,transport,transport_status,created_at')
        .eq('test_run_id', syntheticTest.testRunId)
        .order('persona_id'),
    ]);
    if (sessionError || emailError) return jsonResponse(req, 500, { error: 'summary_failed' });
    return jsonResponse(req, 200, { ok: true, sessions, emails });
  }

  return jsonResponse(req, 400, { error: 'invalid_action' });
});

