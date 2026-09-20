import { Router } from 'express';
import fs from 'fs';
import { query } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('doctor'));

async function getDoctorId(userId: string): Promise<string | null> {
  const { rows } = await query('SELECT id FROM doctors WHERE user_id = $1', [userId]);
  return rows[0]?.id || null;
}

router.get('/orders', async (req: AuthedRequest, res) => {
  const doctorId = await getDoctorId(req.user!.id);
  if (!doctorId) return res.status(403).json({ error: 'This account is not linked to a doctor record' });

  const { rows } = await query(
    `SELECT o.id, o.order_number, o.status, o.created_at, p.first_name, p.last_name, p.mrn
     FROM orders o JOIN patients p ON p.id = o.patient_id
     WHERE o.doctor_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
    [doctorId]
  );
  res.json(rows);
});

router.get('/orders/:id', async (req: AuthedRequest, res) => {
  const doctorId = await getDoctorId(req.user!.id);
  if (!doctorId) return res.status(403).json({ error: 'This account is not linked to a doctor record' });

  const orderRes = await query(
    `SELECT o.*, p.first_name, p.last_name, p.mrn, p.dob, p.gender
     FROM orders o JOIN patients p ON p.id = o.patient_id
     WHERE o.id = $1 AND o.doctor_id = $2`,
    [req.params.id, doctorId]
  );
  if (!orderRes.rows[0]) return res.status(404).json({ error: 'Not found' });

  const reports = await query(
    `SELECT id, report_number, version, status, finalized_at FROM reports WHERE order_id = $1 AND status = 'final' ORDER BY version DESC`,
    [req.params.id]
  );

  res.json({ ...orderRes.rows[0], reports: reports.rows });
});

router.get('/reports/:id/download', async (req: AuthedRequest, res) => {
  const doctorId = await getDoctorId(req.user!.id);
  if (!doctorId) return res.status(403).json({ error: 'This account is not linked to a doctor record' });

  const { rows } = await query(
    `SELECT r.file_path, r.report_number FROM reports r
     JOIN orders o ON o.id = r.order_id
     WHERE r.id = $1 AND o.doctor_id = $2 AND r.status = 'final'`,
    [req.params.id, doctorId]
  );
  const report = rows[0];
  if (!report || !fs.existsSync(report.file_path)) return res.status(404).json({ error: 'Not found' });
  res.download(report.file_path, `${report.report_number}.pdf`);
});

export default router;
