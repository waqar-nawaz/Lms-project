import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/pool';
import { signToken } from '../middleware/auth';
import { logAudit } from '../helpers/audit';
import { sendMessage } from '../helpers/messaging';

const router = Router();

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const { rows } = await query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await logAudit({ userId: user.id, branchId: user.branch_id, action: 'login', entityType: 'session' });

  const token = signToken({ id: user.id, role: user.role, branchId: user.branch_id, name: user.name });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branch_id },
  });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  // Always respond with the same generic message, whether or not the email
  // exists — this avoids leaking which addresses are registered.
  const genericResponse = { ok: true, message: 'If that email is registered, a reset link has been sent.' };

  const { rows } = await query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
  const user = rows[0];
  if (!user) return res.json(genericResponse);

  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`,
    [user.id, hashToken(token)]
  );

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password/${token}`;
  await sendMessage({
    branchId: user.branch_id,
    channel: 'email',
    recipient: user.email,
    subject: 'Password Reset — LabTrack',
    body: `A password reset was requested for your account. Use this link within 1 hour: ${resetUrl}`,
    entityType: 'password_reset',
    entityId: user.id,
  });

  res.json(genericResponse);
});

router.post('/reset-password/:token', async (req, res) => {
  const { password } = req.body;
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const tokenHash = hashToken(req.params.token);
  const { rows } = await query(
    `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used = false AND expires_at > now()`,
    [tokenHash]
  );
  const resetRow = rows[0];
  if (!resetRow) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });

  const passwordHash = await bcrypt.hash(password, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetRow.user_id]);
  await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetRow.id]);
  await logAudit({ userId: resetRow.user_id, action: 'password_reset', entityType: 'user', entityId: resetRow.user_id });

  res.json({ ok: true });
});

export default router;
