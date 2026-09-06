import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/orders-summary', async (req, res) => {
  const { from, to, test_id, doctor_id } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: any[] = [];

  if (from) {
    params.push(from);
    conditions.push(`o.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`o.created_at <= $${params.length}`);
  }
  if (doctor_id) {
    params.push(doctor_id);
    conditions.push(`o.doctor_id = $${params.length}`);
  }
  if (test_id) {
    params.push(test_id);
    conditions.push(`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.test_id = $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const cte = `
    WITH filtered_orders AS (
      SELECT o.id, o.doctor_id, o.total, o.created_at
      FROM orders o
      ${where}
    )
  `;

  const [totals, byDoctor, byTest] = await Promise.all([
    query(
      `${cte} SELECT count(*)::int AS total_orders, COALESCE(SUM(total),0) AS total_revenue FROM filtered_orders`,
      params
    ),
    query(
      `${cte}
       SELECT COALESCE(d.name, 'No doctor assigned') AS doctor_name, count(*)::int AS count
       FROM filtered_orders fo
       LEFT JOIN doctors d ON d.id = fo.doctor_id
       GROUP BY d.name
       ORDER BY count DESC`,
      params
    ),
    query(
      `${cte}
       SELECT t.name AS test_name, t.code AS test_code, count(*)::int AS count
       FROM filtered_orders fo
       JOIN order_items oi ON oi.order_id = fo.id
       JOIN tests t ON t.id = oi.test_id
       GROUP BY t.name, t.code
       ORDER BY count DESC`,
      params
    ),
  ]);

  res.json({
    totalOrders: totals.rows[0].total_orders,
    totalRevenue: Number(totals.rows[0].total_revenue),
    byDoctor: byDoctor.rows,
    byTest: byTest.rows,
  });
});

export default router;
