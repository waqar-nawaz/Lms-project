import { Router } from 'express';
import { query, pool } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/items', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM inventory_items WHERE branch_id = $1 AND active = true ORDER BY name`,
    [req.user!.branchId]
  );
  res.json(rows);
});

router.post('/items', requireRole('inventory_manager', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const { name, category, unit, reorder_level, current_stock, expiry_date } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await query(
    `INSERT INTO inventory_items (branch_id, name, category, unit, reorder_level, current_stock, expiry_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user!.branchId, name, category || null, unit || null, reorder_level || 0, current_stock || 0, expiry_date || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/items/:id', requireRole('inventory_manager', 'lab_manager', 'super_admin'), async (req, res) => {
  const { name, category, unit, reorder_level, expiry_date, active } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await query(
    `UPDATE inventory_items SET name=$1, category=$2, unit=$3, reorder_level=$4, expiry_date=$5, active=$6
     WHERE id=$7 RETURNING *`,
    [name, category || null, unit || null, reorder_level || 0, expiry_date || null, active ?? true, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// Restock / consume / adjust stock — always via a transaction row so history is preserved.
router.post('/items/:id/transactions', requireRole('inventory_manager', 'lab_manager', 'super_admin', 'lab_technician'), async (req: AuthedRequest, res) => {
  const { type, quantity, notes } = req.body;
  if (!['restock', 'consume', 'adjustment'].includes(type)) {
    return res.status(400).json({ error: 'type must be restock, consume, or adjustment' });
  }
  if (quantity === undefined || isNaN(Number(quantity))) {
    return res.status(400).json({ error: 'quantity is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemRes = await client.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
    if (!itemRes.rows[0]) throw new Error('Item not found');

    const delta = type === 'consume' ? -Math.abs(Number(quantity)) : Number(quantity);
    const newStock = Number(itemRes.rows[0].current_stock) + delta;
    if (newStock < 0) throw new Error('Insufficient stock for this transaction');

    await client.query('UPDATE inventory_items SET current_stock = $1 WHERE id = $2', [newStock, req.params.id]);
    const { rows } = await client.query(
      `INSERT INTO inventory_transactions (item_id, type, quantity, notes, performed_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, type, delta, notes || null, req.user!.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ transaction: rows[0], newStock });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get('/items/:id/transactions', async (req, res) => {
  const { rows } = await query(
    `SELECT it.*, u.name AS performed_by_name FROM inventory_transactions it
     LEFT JOIN users u ON u.id = it.performed_by
     WHERE item_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json(rows);
});

// Items at or below their reorder level, or expiring within 30 days
router.get('/alerts', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM inventory_items
     WHERE branch_id = $1 AND active = true
       AND (current_stock <= reorder_level OR (expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'))
     ORDER BY expiry_date NULLS LAST`,
    [req.user!.branchId]
  );
  res.json(rows);
});

export default router;
