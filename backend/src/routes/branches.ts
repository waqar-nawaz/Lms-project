import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth, requireRole, blockPortalRoles, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth, blockPortalRoles);

router.get('/', requireRole('super_admin'), async (req: AuthedRequest, res) => {
  const orgRes = await query('SELECT organization_id FROM branches WHERE id = $1', [req.user!.branchId]);
  const orgId = orgRes.rows[0]?.organization_id;
  const { rows } = await query(
    `SELECT b.*, (SELECT count(*) FROM users u WHERE u.branch_id = b.id)::int AS user_count,
       (SELECT count(*) FROM patients p WHERE p.branch_id = b.id)::int AS patient_count
     FROM branches b WHERE b.organization_id = $1 ORDER BY b.name`,
    [orgId]
  );
  res.json(rows);
});

router.post('/', requireRole('super_admin'), async (req: AuthedRequest, res) => {
  const { name, code, address, phone } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });

  const orgRes = await query('SELECT organization_id FROM branches WHERE id = $1', [req.user!.branchId]);
  const orgId = orgRes.rows[0]?.organization_id;

  const { rows } = await query(
    `INSERT INTO branches (organization_id, name, code, address, phone) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [orgId, name, code, address || null, phone || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const { name, code, address, phone, active } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  const { rows } = await query(
    `UPDATE branches SET name=$1, code=$2, address=$3, phone=$4, active=$5 WHERE id=$6 RETURNING *`,
    [name, code, address || null, phone || null, active ?? true, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

export default router;
