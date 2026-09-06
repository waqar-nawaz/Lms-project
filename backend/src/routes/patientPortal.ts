import { Router } from 'express';
import fs from 'fs';
import { query } from '../db/pool';

const router = Router();

// Public lookup: patient identifies themself with phone OR CNIC/identity number, plus date of birth
// as a second factor. No JWT required — this is intentionally outside requireAuth.
router.get('/lookup', async (req, res) => {
  const { identifier, dob } = req.query as Record<string, string | undefined>;
  if (!identifier || !dob) {
    return res.status(400).json({ error: 'Phone/CNIC and date of birth are required' });
  }

  const patients = await query(
    `SELECT id, first_name, last_name, mrn FROM patients WHERE (phone = $1 OR identity_number = $1) AND dob = $2`,
    [identifier, dob]
  );

  if (!patients.rows.length) {
    return res.status(404).json({ error: 'No matching patient found. Please check your details or contact the lab.' });
  }

  const patientIds = patients.rows.map((p) => p.id);

  const reports = await query(
    `SELECT r.id, r.report_number, r.version, r.finalized_at, o.order_number,
       COALESCE(json_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL), '[]') AS tests
     FROM reports r
     JOIN orders o ON o.id = r.order_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN tests t ON t.id = oi.test_id
     WHERE o.patient_id = ANY($1::uuid[]) AND r.status = 'final'
     GROUP BY r.id, o.order_number
     ORDER BY r.finalized_at DESC`,
    [patientIds]
  );

  res.json({ patient: patients.rows[0], reports: reports.rows });
});

// Public download — re-checks identifier + dob match the report's owning patient before streaming the file.
router.get('/reports/:id/download', async (req, res) => {
  const { identifier, dob } = req.query as Record<string, string | undefined>;
  if (!identifier || !dob) {
    return res.status(400).json({ error: 'Phone/CNIC and date of birth are required' });
  }

  const { rows } = await query(
    `SELECT r.file_path, r.report_number
     FROM reports r
     JOIN orders o ON o.id = r.order_id
     JOIN patients p ON p.id = o.patient_id
     WHERE r.id = $1 AND (p.phone = $2 OR p.identity_number = $2) AND p.dob = $3 AND r.status = 'final'`,
    [req.params.id, identifier, dob]
  );

  const report = rows[0];
  if (!report || !fs.existsSync(report.file_path)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.download(report.file_path, `${report.report_number}.pdf`);
});

export default router;
