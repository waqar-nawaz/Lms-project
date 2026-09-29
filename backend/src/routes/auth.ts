import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/pool';
import { signToken, requireAuth, requireRole, AuthedRequest } from '../middleware/auth';
import { logAudit } from '../helpers/audit';
import { sendMessage } from '../helpers/messaging';

const router = Router();

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Super admins can work inside any active branch of their organisation. Every
// route scopes data by the branch in the JWT, so switching = re-issuing the token.
router.post('/switch-branch', requireAuth, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  const { branchId } = req.body;
  if (!branchId) return res.status(400).json({ error: 'branchId is required' });

  const homeRes = await query(
    `SELECT u.*, b.organization_id FROM users u JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1 AND u.active = true`,
    [req.user!.id]
  );
  const user = homeRes.rows[0];
  if (!user) return res.status(401).json({ error: 'User not found' });

  const target = await query(
    'SELECT id, name FROM branches WHERE id = $1 AND organization_id = $2 AND active = true',
    [branchId, user.organization_id]
  );
  if (!target.rows[0]) return res.status(404).json({ error: 'Branch not found or inactive' });

  await logAudit({
    userId: user.id, branchId, action: 'switch_branch', entityType: 'session',
    oldValues: { branchId: req.user!.branchId }, newValues: { branchId },
  });

  const token = signToken({ id: user.id, role: user.role, branchId, name: user.name });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, branchId },
  });
});

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
