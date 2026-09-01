import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    'SELECT * FROM doctors WHERE branch_id = $1 AND active = true ORDER BY name',
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

export default router;
