import { Router } from 'express';
import { query, pool } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';
import { generateInvoiceNumber } from '../helpers/numbering';

const router = Router();
router.use(requireAuth);

router.post('/orders/:orderId/invoice', requireRole('receptionist', 'accountant', 'lab_manager', 'super_admin'), async (req, res) => {
  const orderRes = await query('SELECT * FROM orders WHERE id = $1', [req.params.orderId]);
  const order = orderRes.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const existing = await query('SELECT * FROM invoices WHERE order_id = $1', [req.params.orderId]);
  if (existing.rows[0]) return res.json(existing.rows[0]);

  const invoiceNumber = generateInvoiceNumber();
  const { rows } = await query(
    `INSERT INTO invoices (order_id, invoice_number, subtotal, discount, tax, total, status)
     VALUES ($1,$2,$3,$4,$5,$6,'unpaid') RETURNING *`,
    [order.id, invoiceNumber, order.subtotal, order.discount, order.tax, order.total]
  );
  res.status(201).json(rows[0]);
});

router.get('/invoices/:id', async (req, res) => {
  const invoiceRes = await query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  if (!invoiceRes.rows[0]) return res.status(404).json({ error: 'Not found' });
  const payments = await query('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at', [req.params.id]);
  res.json({ ...invoiceRes.rows[0], payments: payments.rows });
});

router.post('/invoices/:id/payments', requireRole('receptionist', 'accountant', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const { amount, method, transaction_reference } = req.body;
  if (!amount || !method) return res.status(400).json({ error: 'amount and method are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invRes = await client.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    const invoice = invRes.rows[0];
    if (!invoice) throw new Error('Invoice not found');

    const { rows: paymentRows } = await client.query(
      `INSERT INTO payments (invoice_id, amount, method, transaction_reference, received_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [invoice.id, amount, method, transaction_reference || null, req.user!.id]
    );

    const paidRes = await client.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = $1', [invoice.id]);
    const totalPaid = Number(paidRes.rows[0].paid);
    const invoiceStatus = totalPaid >= Number(invoice.total) ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'unpaid';
    await client.query('UPDATE invoices SET status = $1 WHERE id = $2', [invoiceStatus, invoice.id]);

    const orderStatus = invoiceStatus === 'paid' ? 'paid' : invoiceStatus === 'partially_paid' ? 'partially_paid' : undefined;
    await client.query(
      `UPDATE orders SET paid = $1, due = total - $1 ${orderStatus ? ", status = '" + orderStatus + "'" : ''} WHERE id = $2`,
      [totalPaid, invoice.order_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ payment: paymentRows[0], invoice_status: invoiceStatus });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
