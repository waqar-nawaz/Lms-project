import { query } from '../db/pool';

interface SendParams {
  branchId?: string | null;
  channel: 'sms' | 'email';
  recipient: string;
  subject?: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

interface ProviderResult {
  provider: string;
  status: 'sent' | 'failed';
  error?: string;
}

// Normalise Pakistani-style local numbers (0300...) to E.164 (+92300...).
// Numbers already starting with + are left alone.
export function toE164(phone: string): string {
  const p = phone.replace(/[\s-]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  if (p.startsWith('0')) return (process.env.DEFAULT_COUNTRY_CODE || '+92') + p.slice(1);
  return p;
}

async function sendViaTwilio(to: string, body: string): Promise<ProviderResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const params = new URLSearchParams({ To: toE164(to), Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.set('From', process.env.TWILIO_FROM_NUMBER || '');
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  if (res.ok) return { provider: 'twilio', status: 'sent' };
  const text = await res.text();
  return { provider: 'twilio', status: 'failed', error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
}

async function sendViaSendGrid(to: string, subject: string, body: string): Promise<ProviderResult> {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME || 'LabTrack' },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });
  if (res.ok) return { provider: 'sendgrid', status: 'sent' };
  const text = await res.text();
  return { provider: 'sendgrid', status: 'failed', error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
}

// Outbound messaging. If provider credentials are set in the environment the
// message is really sent; otherwise it stays 'queued' in message_log (dev mode).
// Delivery failures never throw — callers (OTP, password reset) must not break
// or leak whether an account exists because a provider is down.
export async function sendMessage(params: SendParams): Promise<void> {
  let result: ProviderResult = { provider: 'none', status: 'failed' };
  let status: 'queued' | 'sent' | 'failed' = 'queued';
  let error: string | null = null;
  let provider: string | null = null;

  try {
    if (params.channel === 'sms' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        && (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)) {
      result = await sendViaTwilio(params.recipient, params.body);
    } else if (params.channel === 'email' && process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
      result = await sendViaSendGrid(params.recipient, params.subject || 'Notification', params.body);
    } else {
      result = { provider: 'none', status: 'failed' }; // no provider configured
    }
    if (result.provider !== 'none') {
      status = result.status;
      provider = result.provider;
      error = result.error || null;
    }
  } catch (e: any) {
    status = 'failed';
    provider = result.provider !== 'none' ? result.provider : params.channel === 'sms' ? 'twilio' : 'sendgrid';
    error = String(e?.message || e).slice(0, 300);
    console.error('Message delivery error:', error);
  }

  try {
    await query(
      `INSERT INTO message_log (branch_id, channel, recipient, subject, body, status, entity_type, entity_id, error, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [params.branchId || null, params.channel, params.recipient, params.subject || null, params.body,
        status, params.entityType || null, params.entityId || null, error, provider]
    );
  } catch (e) {
    console.error('Failed to write message_log entry:', e);
  }
}
