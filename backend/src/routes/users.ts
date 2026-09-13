import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';
import { logAudit } from '../helpers/audit';

const router = Router();
router.use(requireAuth);

const ROLES = [
  'super_admin', 'lab_manager', 'receptionist', 'phlebotomist',
  'lab_technician', 'pathologist', 'accountant', 'inventory_manager',
  'quality_officer', 'doctor', 'patient',
];

router.get('/', requireRole('super_admin'), async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT id, name, email, phone, role, active, last_login_at, created_at
     FROM users WHERE branch_id = $1 ORDER BY created_at DESC`,
    [req.user!.branchId]
  );
  res.json(rows);
});

router.post('/', requireRole('super_admin'), async (req: AuthedRequest, res) => {
  const { name, email, phone, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, and role are required' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return res.status(400).json({ error: 'A user with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (branch_id, name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, phone, role, active, created_at`,
    [req.user!.branchId, name, email, phone || null, passwordHash, role]
  );

  await logAudit({
    userId: req.user!.id,
    branchId: req.user!.branchId,
    action: 'create',
    entityType: 'user',
    entityId: rows[0].id,
    newValues: { name, email, role },
  });

  res.status(201).json(rows[0]);
});

router.put('/:id', requireRole('super_admin'), async (req: AuthedRequest, res) => {
  const { name, phone, role, active, password } = req.body;
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password && String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const before = await query('SELECT name, email, role, active FROM users WHERE id = $1', [req.params.id]);
  if (!before.rows[0]) return res.status(404).json({ error: 'Not found' });

  const updates: string[] = [];
  const values: any[] = [];
  if (name !== undefined) { values.push(name); updates.push(`name = $${values.length}`); }
  if (phone !== undefined) { values.push(phone); updates.push(`phone = $${values.length}`); }
  if (role !== undefined) { values.push(role); updates.push(`role = $${values.length}`); }
  if (active !== undefined) { values.push(active); updates.push(`active = $${values.length}`); }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    values.push(hash);
    updates.push(`password_hash = $${values.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}
     RETURNING id, name, email, phone, role, active, created_at`,
    values
  );

  await logAudit({
    userId: req.user!.id,
    branchId: req.user!.branchId,
    action: 'update',
    entityType: 'user',
    entityId: req.params.id,
    oldValues: before.rows[0],
    newValues: { name, phone, role, active },
  });

  res.json(rows[0]);
});

export default router;
