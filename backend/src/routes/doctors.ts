import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool';
import { requireAuth, requireRole, blockPortalRoles, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth, blockPortalRoles);

router.get('/', async (req: AuthedRequest, res) => {
  const showAll = req.query.all === 'true';
  const { rows } = await query(
    showAll
      ? 'SELECT * FROM doctors WHERE branch_id = $1 ORDER BY name'
      : 'SELECT * FROM doctors WHERE branch_id = $1 AND active = true ORDER BY name',
    [req.user!.branchId]
  );
  res.json(rows);
});

router.post('/', async (req: AuthedRequest, res) => {
  const { name, specialty, license_number, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await query(
    `INSERT INTO doctors (branch_id, name, specialty, license_number, phone, email)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.branchId, name, specialty, license_number, phone, email]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireRole('super_admin', 'lab_manager'), async (req, res) => {
  const { name, specialty, license_number, phone, email, active } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await query(
    `UPDATE doctors SET name=$1, specialty=$2, license_number=$3, phone=$4, email=$5, active=$6
     WHERE id=$7 RETURNING *`,
    [name, specialty || null, license_number || null, phone || null, email || null, active ?? true, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// Create a portal login for a doctor so they can view their own patients' reports.
router.post('/:id/create-login', requireRole('super_admin', 'lab_manager'), async (req: AuthedRequest, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const docRes = await query('SELECT * FROM doctors WHERE id = $1', [req.params.id]);
  const doctor = docRes.rows[0];
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  if (doctor.user_id) return res.status(400).json({ error: 'This doctor already has a portal login' });

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return res.status(400).json({ error: 'A user with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const userRes = await query(
    `INSERT INTO users (branch_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,'doctor') RETURNING id`,
    [req.user!.branchId, doctor.name, email, passwordHash]
  );
  await query('UPDATE doctors SET user_id = $1 WHERE id = $2', [userRes.rows[0].id, doctor.id]);

  res.status(201).json({ ok: true, email });
});

export default router;
