import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool';
import { signToken } from '../middleware/auth';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const { rows } = await query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  const token = signToken({ id: user.id, role: user.role, branchId: user.branch_id, name: user.name });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branch_id },
  });
});

export default router;
