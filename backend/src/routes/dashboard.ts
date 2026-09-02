import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/summary', async (_req, res) => {
  const [
    ordersToday,
    pendingCollection,
    pendingAccession,
    pendingVerification,
    revenueToday,
    totalDue,
    openCritical,
    recentOrders,
  ] = await Promise.all([
    query(`SELECT count(*) FROM orders WHERE created_at::date = CURRENT_DATE`),
    query(`SELECT count(*) FROM specimens WHERE status = 'awaiting_collection'`),
    query(`SELECT count(*) FROM specimens WHERE status = 'collected'`),
    query(
      `SELECT count(*) FROM results WHERE result_status != 'verified'`
    ),
    query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE paid_at::date = CURRENT_DATE`),
    query(`SELECT COALESCE(SUM(due),0) AS total FROM orders WHERE due > 0`),
    query(`SELECT count(*) FROM results WHERE flag IN ('critical_low','critical_high') AND result_status != 'verified'`),
    query(
      `SELECT o.id, o.order_number, o.status, o.total, o.due, o.created_at,
         p.first_name, p.last_name, p.mrn
       FROM orders o JOIN patients p ON p.id = o.patient_id
       ORDER BY o.created_at DESC LIMIT 10`
    ),
  ]);

  res.json({
    ordersToday: Number(ordersToday.rows[0].count),
    pendingCollection: Number(pendingCollection.rows[0].count),
    pendingAccession: Number(pendingAccession.rows[0].count),
    pendingVerification: Number(pendingVerification.rows[0].count),
    revenueToday: Number(revenueToday.rows[0].total),
    totalDue: Number(totalDue.rows[0].total),
    openCritical: Number(openCritical.rows[0].count),
    recentOrders: recentOrders.rows,
  });
});

export default router;
