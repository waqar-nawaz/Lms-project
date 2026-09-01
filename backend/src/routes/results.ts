import { Router } from 'express';
import { query, pool } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';
import { calculateAge, pickReferenceRange, flagForNumeric, isCriticalFlag } from '../helpers/resultLogic';

const router = Router();
router.use(requireAuth);

// Worklist: all order items + parameters + existing results for an order
router.get('/orders/:orderId', async (req, res) => {
  const { rows } = await query(
    `SELECT oi.id AS order_item_id, t.name AS test_name, p.id AS parameter_id, p.name AS parameter_name,
       p.unit, p.result_type, p.decimal_places,
       r.id AS result_id, r.value, r.numeric_value, r.flag, r.result_status, r.entered_at, r.verified_at
     FROM order_items oi
     JOIN tests t ON t.id = oi.test_id
     JOIN test_parameters p ON p.test_id = t.id AND p.active = true
     LEFT JOIN results r ON r.order_item_id = oi.id AND r.parameter_id = p.id
     WHERE oi.order_id = $1
     ORDER BY t.name, p.display_order`,
    [req.params.orderId]
  );
  res.json(rows);
});

// Enter (or amend) a result
router.post('/', requireRole('lab_technician', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const { order_item_id, parameter_id, value, amendment_reason } = req.body;
  if (!order_item_id || !parameter_id || value === undefined) {
    return res.status(400).json({ error: 'order_item_id, parameter_id, value are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paramRes = await client.query('SELECT * FROM test_parameters WHERE id = $1', [parameter_id]);
    const parameter = paramRes.rows[0];
    if (!parameter) throw new Error('Parameter not found');

    const ctxRes = await client.query(
      `SELECT p.dob, p.gender FROM order_items oi JOIN orders o ON o.id = oi.order_id
       JOIN patients p ON p.id = o.patient_id WHERE oi.id = $1`,
      [order_item_id]
    );
    const ctx = ctxRes.rows[0];
    const age = calculateAge(ctx?.dob);

    const rangesRes = await client.query('SELECT * FROM reference_ranges WHERE parameter_id = $1', [parameter_id]);
    const range = pickReferenceRange(rangesRes.rows, ctx?.gender || null, age);

    let numericValue: number | null = null;
    let flag = 'pending';
    if (parameter.result_type === 'numeric') {
      numericValue = parseFloat(value);
      if (isNaN(numericValue)) throw new Error('Value must be numeric for this parameter');
      flag = flagForNumeric(numericValue, range);
    } else if (parameter.result_type === 'positive_negative') {
      flag = String(value).toLowerCase() === 'positive' ? 'positive' : 'negative';
    } else {
      flag = 'normal';
    }

    const existing = await client.query(
      'SELECT * FROM results WHERE order_item_id = $1 AND parameter_id = $2',
      [order_item_id, parameter_id]
    );

    let result;
    if (existing.rows[0]) {
      const prev = existing.rows[0];
      if (prev.result_status === 'verified' && !amendment_reason) {
        throw new Error('Result already verified — amendment_reason is required to change it');
      }
      const { rows } = await client.query(
        `UPDATE results SET value = $1, numeric_value = $2, unit = $3, flag = $4,
           result_status = 'entered', entered_by = $5, entered_at = now(),
           verified_by = NULL, verified_at = NULL
         WHERE id = $6 RETURNING *`,
        [String(value), numericValue, parameter.unit, flag, req.user!.id, prev.id]
      );
      result = rows[0];
      await client.query(
        `INSERT INTO result_versions (result_id, old_value, new_value, reason, changed_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [prev.id, prev.value, String(value), amendment_reason || 'initial correction', req.user!.id]
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO results (order_item_id, parameter_id, value, numeric_value, unit, flag, result_status, entered_by, entered_at)
         VALUES ($1,$2,$3,$4,$5,$6,'entered',$7, now()) RETURNING *`,
        [order_item_id, parameter_id, String(value), numericValue, parameter.unit, flag, req.user!.id]
      );
      result = rows[0];
    }

    await client.query('COMMIT');
    res.status(201).json({ result, critical: isCriticalFlag(flag) });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Verify a result (pathologist / medical reviewer)
router.patch('/:id/verify', requireRole('pathologist', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE results SET result_status = 'verified', verified_by = $1, verified_at = now()
       WHERE id = $2 RETURNING *`,
      [req.user!.id, req.params.id]
    );
    if (!rows[0]) throw new Error('Result not found');

    const orderItemRes = await client.query('SELECT order_id FROM order_items WHERE id = $1', [rows[0].order_item_id]);
    const orderId = orderItemRes.rows[0].order_id;

    const unverified = await client.query(
      `SELECT count(*) FROM results r JOIN order_items oi ON oi.id = r.order_item_id
       WHERE oi.order_id = $1 AND r.result_status != 'verified'`,
      [orderId]
    );
    if (Number(unverified.rows[0].count) === 0) {
      await client.query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [orderId]);
    } else {
      await client.query(`UPDATE orders SET status = 'awaiting_verification' WHERE id = $1`, [orderId]);
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

export default router;
