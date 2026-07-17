/**
 * send-email — Resend-based transactional email edge function.
 *
 * POST /functions/v1/send-email
 * Body: { type: EmailType, payload: Record<string, unknown> }
 *
 * Email types:
 *   new_lead          — admin alert when wizard submits an enquiry
 *   quote_confirmed   — homeowner confirmation after quote is sent
 *   job_status_change — trade user notified when admin approves / requests changes
 *
 * Auth: authenticated (any logged-in user) OR service-role key.
 * The function validates the JWT so it can be called from the frontend directly
 * or from other edge functions / pg_cron via service role.
 *
 * Required env vars (set in Supabase dashboard → Project Settings → Edge Functions):
 *   RESEND_API_KEY    — your Resend API key (re_...)
 *   ADMIN_EMAIL       — email address to receive new-lead alerts
 *   FROM_EMAIL        — sender address (must be verified domain in Resend)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { gate, jsonResponse } from '../_shared/roomScan/security.ts';

const RESEND_URL = 'https://api.resend.com/emails';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EmailType = 'new_lead' | 'quote_confirmed' | 'job_status_change';

interface EmailRequest {
  type: EmailType;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function env(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

async function sendViaResend(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = env('RESEND_API_KEY');
  const from = Deno.env.get('FROM_EMAIL') ?? 'Bower Kitchens <no-reply@bowerkitchens.com.au>';

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function tplNewLead(payload: Record<string, unknown>): { subject: string; html: string } {
  const name = String(payload.contact_name ?? 'Unknown');
  const email = String(payload.contact_email ?? '—');
  const phone = String(payload.contact_phone ?? '—');
  const address = String(payload.address ?? '—');
  const rooms = String(payload.room_count ?? '1');
  const shape = String(payload.room_shape ?? '—');
  const adminUrl = String(payload.admin_url ?? 'https://planner.bowercabinets.com/admin/leads');

  return {
    subject: `New Kitchen Enquiry — ${name}`,
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <div style="background:#1e293b;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#f59e0b;margin:0;font-size:20px">New Kitchen Enquiry</h1>
  </div>
  <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none">
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:6px 0;font-weight:600;width:120px">Name</td><td style="padding:6px 0">${name}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600">Email</td><td style="padding:6px 0"><a href="mailto:${email}" style="color:#2563eb">${email}</a></td></tr>
      <tr><td style="padding:6px 0;font-weight:600">Phone</td><td style="padding:6px 0">${phone}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600">Address</td><td style="padding:6px 0">${address}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600">Rooms</td><td style="padding:6px 0">${rooms}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600">Shape</td><td style="padding:6px 0">${shape}</td></tr>
    </table>
    <a href="${adminUrl}" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      View in Admin →
    </a>
  </div>
</div>`,
  };
}

function tplQuoteConfirmed(payload: Record<string, unknown>): { subject: string; html: string } {
  const name = String(payload.homeowner_name ?? 'there');
  const quoteRef = String(payload.quote_ref ?? '—');
  const total = String(payload.total_display ?? '—');
  const trackUrl = String(payload.track_url ?? '#');

  return {
    subject: `Your Kitchen Quote — ${quoteRef}`,
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <div style="background:#1e293b;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#f59e0b;margin:0;font-size:20px">Your Quote is Ready</h1>
  </div>
  <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none">
    <p style="margin-top:0">Hi ${name},</p>
    <p>Thank you for your kitchen enquiry. We've reviewed your requirements and prepared a quote for you.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fff;border:1px solid #e2e8f0;border-radius:6px">
      <tr style="background:#f1f5f9">
        <td style="padding:12px 16px;font-weight:600">Quote Reference</td>
        <td style="padding:12px 16px">${quoteRef}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-weight:600">Estimated Total</td>
        <td style="padding:12px 16px;font-size:18px;font-weight:700;color:#f59e0b">${total}</td>
      </tr>
    </table>
    <p>This is an indicative estimate. A final quote will be confirmed after a site visit.</p>
    <a href="${trackUrl}" style="display:inline-block;background:#1e293b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      Track Your Enquiry →
    </a>
    <p style="margin-top:24px;font-size:13px;color:#64748b">
      Questions? Reply to this email or call us on 1300 XXX XXX.
    </p>
  </div>
</div>`,
  };
}

function tplJobStatusChange(payload: Record<string, unknown>): { subject: string; html: string } {
  const name = String(payload.trade_name ?? 'there');
  const jobTitle = String(payload.job_title ?? 'your job');
  const newStatus = String(payload.new_status ?? '—');
  const note = payload.change_note ? `<p style="background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0"><strong>Admin note:</strong> ${String(payload.change_note)}</p>` : '';
  const jobUrl = String(payload.job_url ?? '#');

  const isApproved = newStatus === 'approved';
  const statusLabel = isApproved ? '✅ Approved' : '🔄 Changes Requested';
  const statusMsg = isApproved
    ? 'Great news — your job has been approved and is proceeding to production.'
    : 'The admin has reviewed your job and requested some changes before we can proceed.';

  return {
    subject: `Job Update: ${jobTitle} — ${statusLabel}`,
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <div style="background:#1e293b;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#f59e0b;margin:0;font-size:20px">Job Status Update</h1>
  </div>
  <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none">
    <p style="margin-top:0">Hi ${name},</p>
    <p>${statusMsg}</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fff;border:1px solid #e2e8f0;border-radius:6px">
      <tr style="background:#f1f5f9">
        <td style="padding:12px 16px;font-weight:600">Job</td>
        <td style="padding:12px 16px">${jobTitle}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-weight:600">New Status</td>
        <td style="padding:12px 16px;font-weight:700">${statusLabel}</td>
      </tr>
    </table>
    ${note}
    <a href="${jobUrl}" style="display:inline-block;background:${isApproved ? '#16a34a' : '#d97706'};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      View Job →
    </a>
  </div>
</div>`,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const gated = gate(req);
  if (gated) return gated;

  try {
    // Authorization (pre-live audit P1.3): recipients used to come straight
    // from the request payload while ANY logged-in user could call this —
    // letting a trade customer send Bower-branded email to arbitrary
    // addresses. Now:
    //   - service role (other edge functions / pg_cron): any template;
    //   - Bower staff JWT: quote_confirmed and job_status_change;
    //   - everyone else: rejected. new_lead is server-initiated only.
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const supabaseUrl = env('SUPABASE_URL');
    const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');

    let isService = false;
    let isStaff = false;
    if (token === serviceRoleKey) {
      isService = true;
    } else if (token) {
      const service = createClient(supabaseUrl, serviceRoleKey);
      const { data: userData } = await service.auth.getUser(token);
      const userId = userData?.user?.id;
      if (userId) {
        const { data: staff } = await service.rpc('is_bower_staff', { p_user: userId });
        isStaff = staff === true;
      }
    }

    if (!isService && !isStaff) {
      return jsonResponse(req, 403, { error: 'not_authorized' });
    }

    const body: EmailRequest = await req.json();
    const { type, payload } = body;

    let to: string | string[];
    let subject: string;
    let html: string;

    switch (type) {
      case 'new_lead': {
        // Fixed recipient — never from the payload.
        if (!isService) return jsonResponse(req, 403, { error: 'not_authorized' });
        to = env('ADMIN_EMAIL');
        ({ subject, html } = tplNewLead(payload));
        break;
      }
      case 'quote_confirmed': {
        const email = String(payload.homeowner_email ?? '');
        if (!email) throw new Error('payload.homeowner_email is required');
        to = email;
        ({ subject, html } = tplQuoteConfirmed(payload));
        break;
      }
      case 'job_status_change': {
        const email = String(payload.trade_email ?? '');
        if (!email) throw new Error('payload.trade_email is required');
        to = email;
        ({ subject, html } = tplJobStatusChange(payload));
        break;
      }
      default:
        throw new Error(`Unknown email type: ${type}`);
    }

    await sendViaResend({ to, subject, html });

    return jsonResponse(req, 200, { ok: true });
  } catch (err) {
    console.error('[send-email]', err);
    // Generic public error — never echo internals to the caller.
    return jsonResponse(req, 500, { error: 'email_failed' });
  }
});
