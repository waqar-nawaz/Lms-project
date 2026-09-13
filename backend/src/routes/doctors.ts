import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

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

export default router;
