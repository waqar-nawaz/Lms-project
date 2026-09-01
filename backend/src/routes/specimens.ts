import { Router } from 'express';
import { query, pool } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';
import { generateBarcode } from '../helpers/numbering';

const router = Router();
router.use(requireAuth);

const REJECTION_REASONS = [
  'insufficient_volume', 'hemolyzed', 'clotted', 'wrong_container', 'leaking_container',
  'mislabelled', 'unlabelled', 'delayed_transport', 'contaminated', 'incorrect_specimen_type',
];

// Generate one specimen per distinct specimen_type in the order's test items
router.post('/orders/:orderId/generate', requireRole('receptionist', 'phlebotomist', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = await client.query(
      `SELECT DISTINCT t.specimen_type, t.department_id
       FROM order_items oi JOIN tests t ON t.id = oi.test_id WHERE oi.order_id = $1`,
      [req.params.orderId]
    );
    if (!items.rows.length) throw new Error('Order has no items');

    const orderRes = await client.query('SELECT patient_id FROM orders WHERE id = $1', [req.params.orderId]);
    if (!orderRes.rows[0]) throw new Error('Order not found');
    const patientId = orderRes.rows[0].patient_id;

    const created = [];
    for (const row of items.rows) {
      const barcode = generateBarcode();
      const { rows } = await client.query(
        `INSERT INTO specimens (order_id, patient_id, specimen_type, barcode, department_id, status)
         VALUES ($1,$2,$3,$4,$5,'awaiting_collection') RETURNING *`,
        [req.params.orderId, patientId, row.specimen_type, barcode, row.department_id]
      );
      created.push(rows[0]);
    }

    await client.query(`UPDATE orders SET status = 'awaiting_sample' WHERE id = $1`, [req.params.orderId]);
    await client.query('COMMIT');
    res.status(201).json(created);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get('/', async (req: AuthedRequest, res) => {
  const { status } = req.query;
  const params: any[] = [];
  let where = '1=1';
  if (status) {
    params.push(status);
    where = `s.status = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT s.*, o.order_number, p.first_name, p.last_name, p.mrn
     FROM specimens s JOIN orders o ON o.id = s.order_id JOIN patients p ON p.id = s.patient_id
     WHERE ${where} ORDER BY s.created_at DESC LIMIT 100`,
    params
  );
  res.json(rows);
});

router.get('/barcode/:barcode', async (req, res) => {
  const { rows } = await query('SELECT * FROM specimens WHERE barcode = $1', [req.params.barcode]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.patch('/:id/collect', requireRole('phlebotomist', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE specimens SET status = 'collected', collected_at = now(), collector_id = $1
       WHERE id = $2 AND status = 'awaiting_collection' RETURNING *`,
      [req.user!.id, req.params.id]
    );
    if (!rows[0]) throw new Error('Specimen not found or not awaiting collection');
    await client.query(
      `INSERT INTO specimen_events (specimen_id, event_type, status, performed_by) VALUES ($1,'collected','collected',$2)`,
      [req.params.id, req.user!.id]
    );
    const remaining = await client.query(
      `SELECT count(*) FROM specimens WHERE order_id = $1 AND status = 'awaiting_collection'`,
      [rows[0].order_id]
    );
    if (Number(remaining.rows[0].count) === 0) {
      await client.query(`UPDATE orders SET status = 'sample_collected' WHERE id = $1`, [rows[0].order_id]);
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Accessioning: lab receives the specimen and accepts it into the department
router.patch('/:id/receive', requireRole('lab_technician', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE specimens SET status = 'accepted', received_at = now()
       WHERE id = $1 AND status = 'collected' RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) throw new Error('Specimen not found or not in collected state');
    await client.query(
      `INSERT INTO specimen_events (specimen_id, event_type, status, performed_by) VALUES ($1,'accessioned','accepted',$2)`,
      [req.params.id, req.user!.id]
    );
    await client.query(`UPDATE orders SET status = 'in_processing' WHERE id = $1`, [rows[0].order_id]);
    await client.query(
      `UPDATE order_items SET status = 'in_processing'
       WHERE order_id = $1 AND test_id IN (SELECT id FROM tests WHERE specimen_type = $2)`,
      [rows[0].order_id, rows[0].specimen_type]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.patch('/:id/reject', requireRole('lab_technician', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const { reason } = req.body;
  if (!REJECTION_REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${REJECTION_REASONS.join(', ')}` });
  }
  const { rows } = await query(
    `UPDATE specimens SET status = 'rejected', rejection_reason = $1 WHERE id = $2 RETURNING *`,
    [reason, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await query(
    `INSERT INTO specimen_events (specimen_id, event_type, status, performed_by, notes) VALUES ($1,'rejected','rejected',$2,$3)`,
    [req.params.id, req.user!.id, reason]
  );
  res.json(rows[0]);
});

export default router;
