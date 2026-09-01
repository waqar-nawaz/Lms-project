import { Router } from 'express';
import { query, pool } from '../db/pool';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { generateOrderNumber } from '../helpers/numbering';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res) => {
  const { status } = req.query;
  const params: any[] = [req.user!.branchId];
  let where = 'o.branch_id = $1';
  if (status) {
    params.push(status);
    where += ` AND o.status = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT o.*, p.first_name, p.last_name, p.mrn, doc.name AS doctor_name
     FROM orders o
     JOIN patients p ON p.id = o.patient_id
     LEFT JOIN doctors doc ON doc.id = o.doctor_id
     WHERE ${where}
     ORDER BY o.created_at DESC LIMIT 100`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const orderRes = await query(
    `SELECT o.*, p.first_name, p.last_name, p.mrn, p.dob, p.gender, doc.name AS doctor_name
     FROM orders o JOIN patients p ON p.id = o.patient_id
     LEFT JOIN doctors doc ON doc.id = o.doctor_id WHERE o.id = $1`,
    [req.params.id]
  );
  if (!orderRes.rows[0]) return res.status(404).json({ error: 'Not found' });

  const items = await query(
    `SELECT oi.*, t.name AS test_name, t.code AS test_code, t.specimen_type, t.department_id
     FROM order_items oi JOIN tests t ON t.id = oi.test_id WHERE oi.order_id = $1`,
    [req.params.id]
  );
  const specimens = await query('SELECT * FROM specimens WHERE order_id = $1', [req.params.id]);

  res.json({ ...orderRes.rows[0], items: items.rows, specimens: specimens.rows });
});

// Create order: { patient_id, doctor_id?, priority?, notes?, test_ids: [], discount?, tax? }
router.post('/', async (req: AuthedRequest, res) => {
  const { patient_id, doctor_id, priority, notes, test_ids, discount, tax, source } = req.body;
  if (!patient_id || !Array.isArray(test_ids) || test_ids.length === 0) {
    return res.status(400).json({ error: 'patient_id and non-empty test_ids are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const testsRes = await client.query(
      `SELECT id, price FROM tests WHERE id = ANY($1::uuid[]) AND active = true`,
      [test_ids]
    );
    if (testsRes.rows.length !== test_ids.length) {
      throw new Error('One or more tests not found or inactive');
    }
    const subtotal = testsRes.rows.reduce((sum: number, t: any) => sum + Number(t.price), 0);
    const discountAmt = Number(discount) || 0;
    const taxAmt = Number(tax) || 0;
    const total = subtotal - discountAmt + taxAmt;

    const orderNumber = generateOrderNumber();
    const orderRes = await client.query(
      `INSERT INTO orders (branch_id, patient_id, doctor_id, order_number, priority, status, source, notes,
         subtotal, discount, tax, total, paid, due, created_by)
       VALUES ($1,$2,$3,$4,$5,'registered',$6,$7,$8,$9,$10,$11,0,$11,$12) RETURNING *`,
      [req.user!.branchId, patient_id, doctor_id || null, orderNumber, priority || 'routine',
        source || 'walk_in', notes || null, subtotal, discountAmt, taxAmt, total, req.user!.id]
    );
    const order = orderRes.rows[0];

    for (const t of testsRes.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, test_id, price, discount, status) VALUES ($1,$2,$3,0,'pending')`,
        [order.id, t.id, t.price]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const valid = [
    'draft', 'registered', 'paid', 'partially_paid', 'awaiting_sample',
    'sample_collected', 'in_processing', 'partially_completed',
    'awaiting_verification', 'completed', 'cancelled', 'rejected',
  ];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { rows } = await query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

export default router;
