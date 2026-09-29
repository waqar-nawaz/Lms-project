import { Router } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import { query } from '../db/pool';
import { sendMessage } from '../helpers/messaging';

const router = Router();

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// Public lookup: patient identifies themself with phone OR CNIC/identity number, plus date of birth
// as a second factor. No JWT required — this is intentionally outside requireAuth.
router.get('/lookup', async (req, res) => {
  const { identifier, dob } = req.query as Record<string, string | undefined>;
  if (!identifier || !dob) {
    return res.status(400).json({ error: 'Phone/CNIC and date of birth are required' });
  }

  const patients = await query(
    `SELECT id, first_name, last_name, mrn FROM patients WHERE (phone = $1 OR identity_number = $1) AND dob = $2`,
    [identifier, dob]
  );

  if (!patients.rows.length) {
    return res.status(404).json({ error: 'No matching patient found. Please check your details or contact the lab.' });
  }

  const patientIds = patients.rows.map((p) => p.id);

  const reports = await query(
    `SELECT r.id, r.report_number, r.version, r.finalized_at, o.order_number,
       COALESCE(json_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL), '[]') AS tests
     FROM reports r
     JOIN orders o ON o.id = r.order_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN tests t ON t.id = oi.test_id
     WHERE o.patient_id = ANY($1::uuid[]) AND r.status = 'final'
     GROUP BY r.id, o.order_number
     ORDER BY r.finalized_at DESC`,
    [patientIds]
  );

  res.json({ patient: patients.rows[0], reports: reports.rows });
});

// --- OTP-based verification (stronger alternative to DOB, phone numbers only) ---
// The OTP is sent via the configured SMS gateway (see helpers/messaging.ts).
// With no gateway configured it is only recorded in message_log (dev mode).
router.post('/request-otp', async (req, res) => {
  const { identifier } = req.body;
  const generic = { ok: true, message: 'If that number is registered, an OTP has been sent.' };
  if (!identifier) return res.status(400).json({ error: 'Phone number is required' });

  const patientRes = await query('SELECT id, branch_id FROM patients WHERE phone = $1 LIMIT 1', [identifier]);
  if (!patientRes.rows.length) return res.json(generic);

  // Throttle: max 3 codes per number per 10 minutes (stops SMS bombing / cost abuse).
  // Same generic response so callers can't tell whether the number exists.
  const recent = await query(
    `SELECT COUNT(*)::int AS n FROM patient_otps WHERE identifier = $1 AND created_at > now() - interval '10 minutes'`,
    [identifier]
  );
  if (recent.rows[0].n >= 3) return res.json(generic);

  const otp = String(crypto.randomInt(100000, 1000000));
  await query(
    `INSERT INTO patient_otps (identifier, otp_hash, expires_at) VALUES ($1,$2, now() + interval '5 minutes')`,
    [identifier, hashOtp(otp)]
  );

  await sendMessage({
    branchId: patientRes.rows[0].branch_id,
    channel: 'sms',
    recipient: identifier,
    body: `Your LabTrack verification code is ${otp}. It expires in 5 minutes.`,
    entityType: 'patient_otp',
  });

  res.json(generic);
});

router.post('/verify-otp', async (req, res) => {
  const { identifier, otp } = req.body;
  if (!identifier || !otp) return res.status(400).json({ error: 'Phone number and OTP are required' });

  // Look at the latest active code for this number first, so wrong guesses can be counted.
  const otpRes = await query(
    `SELECT * FROM patient_otps WHERE identifier = $1 AND used = false AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [identifier]
  );
  const active = otpRes.rows[0];
  if (!active) return res.status(400).json({ error: 'Invalid or expired code.' });

  if (active.attempts >= 5) {
    await query('UPDATE patient_otps SET used = true WHERE id = $1', [active.id]);
    return res.status(429).json({ error: 'Too many wrong attempts. Please request a new code.' });
  }

  const provided = Buffer.from(hashOtp(String(otp)));
  const expected = Buffer.from(active.otp_hash);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    await query('UPDATE patient_otps SET attempts = attempts + 1 WHERE id = $1', [active.id]);
    return res.status(400).json({ error: 'Invalid or expired code.' });
  }
  otpRes.rows[0] = active;

  await query('UPDATE patient_otps SET used = true WHERE id = $1', [otpRes.rows[0].id]);

  const patients = await query(
    `SELECT id, first_name, last_name, mrn, dob FROM patients WHERE phone = $1`,
    [identifier]
  );
  if (!patients.rows.length) return res.status(404).json({ error: 'No matching patient found.' });

  const patientIds = patients.rows.map((p) => p.id);
  const reports = await query(
    `SELECT r.id, r.report_number, r.version, r.finalized_at, o.order_number,
       COALESCE(json_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL), '[]') AS tests
     FROM reports r
     JOIN orders o ON o.id = r.order_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN tests t ON t.id = oi.test_id
     WHERE o.patient_id = ANY($1::uuid[]) AND r.status = 'final'
     GROUP BY r.id, o.order_number
     ORDER BY r.finalized_at DESC`,
    [patientIds]
  );

  // dob travels back so the frontend can transparently use the existing
  // identifier+dob-checked download endpoint without asking the patient to type it.
  res.json({
    patient: patients.rows[0],
    dob: patients.rows[0].dob,
    reports: reports.rows,
  });
});

// Public download — re-checks identifier + dob match the report's owning patient before streaming the file.
router.get('/reports/:id/download', async (req, res) => {  const { identifier, dob } = req.query as Record<string, string | undefined>;
  if (!identifier || !dob) {
    return res.status(400).json({ error: 'Phone/CNIC and date of birth are required' });
  }

  const { rows } = await query(
    `SELECT r.file_path, r.report_number
     FROM reports r
     JOIN orders o ON o.id = r.order_id
     JOIN patients p ON p.id = o.patient_id
     WHERE r.id = $1 AND (p.phone = $2 OR p.identity_number = $2) AND p.dob = $3 AND r.status = 'final'`,
    [req.params.id, identifier, dob]
  );

  const report = rows[0];
  if (!report || !fs.existsSync(report.file_path)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.download(report.file_path, `${report.report_number}.pdf`);
});

export default router;
