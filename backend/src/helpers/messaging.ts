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

// Gateway-agnostic outbound messaging. No SMS/email provider is configured yet —
// every message is recorded in message_log so the flow is fully testable and
// staff can see what *would* have been sent. To go live, plug a real provider
// (Twilio, SendGrid, etc.) in below and flip the status to 'sent' on success.
export async function sendMessage(params: SendParams): Promise<void> {
  let status: 'queued' | 'sent' | 'failed' = 'queued';

  // --- Real gateway integration point ---
  // if (params.channel === 'sms' && process.env.TWILIO_SID) { ... status = 'sent' | 'failed' }
  // if (params.channel === 'email' && process.env.SENDGRID_API_KEY) { ... status = 'sent' | 'failed' }

  try {
    await query(
      `INSERT INTO message_log (branch_id, channel, recipient, subject, body, status, entity_type, entity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [params.branchId || null, params.channel, params.recipient, params.subject || null, params.body,
        status, params.entityType || null, params.entityId || null]
    );
  } catch (e) {
    console.error('Failed to write message_log entry:', e);
  }
}
