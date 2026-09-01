import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';
import { generateReportNumber } from '../helpers/numbering';
import { calculateAge, pickReferenceRange } from '../helpers/resultLogic';

const router = Router();
const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'reports');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Public verification endpoint — no auth, minimal info only
router.get('/verify/:token', async (req, res) => {
  const hash = hashToken(req.params.token);
  const { rows } = await query(
    `SELECT report_number, status, finalized_at FROM reports WHERE verification_token_hash = $1`,
    [hash]
  );
  if (!rows[0]) return res.status(404).json({ verified: false });
  res.json({
    verified: true,
    report_number: rows[0].report_number,
    status: rows[0].status,
    finalized_at: rows[0].finalized_at,
  });
});

router.use(requireAuth);

router.get('/orders/:orderId', async (req, res) => {
  const { rows } = await query('SELECT * FROM reports WHERE order_id = $1 ORDER BY version DESC', [req.params.orderId]);
  res.json(rows);
});

router.post(
  '/orders/:orderId/generate',
  requireRole('pathologist', 'lab_manager', 'super_admin'),
  async (req: AuthedRequest, res) => {
    const orderId = req.params.orderId;

    const orderRes = await query(
      `SELECT o.*, p.first_name, p.last_name, p.mrn, p.dob, p.gender, doc.name AS doctor_name
       FROM orders o JOIN patients p ON p.id = o.patient_id
       LEFT JOIN doctors doc ON doc.id = o.doctor_id WHERE o.id = $1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const resultsRes = await query(
      `SELECT DISTINCT ON (r.id) r.id AS result_id, t.name AS test_name, tp.id AS parameter_id,
         tp.name AS parameter_name, r.value, r.unit, r.flag
       FROM results r
       JOIN order_items oi ON oi.id = r.order_item_id
       JOIN tests t ON t.id = oi.test_id
       JOIN test_parameters tp ON tp.id = r.parameter_id
       WHERE oi.order_id = $1 AND r.result_status = 'verified'
       ORDER BY r.id, t.name, tp.name`,
      [orderId]
    );
    if (!resultsRes.rows.length) {
      return res.status(400).json({ error: 'No verified results to report yet' });
    }

    const age = calculateAge(order.dob);
    for (const row of resultsRes.rows) {
      const rangesRes = await query('SELECT * FROM reference_ranges WHERE parameter_id = $1', [row.parameter_id]);
      const range = pickReferenceRange(rangesRes.rows, order.gender, age);
      row.low = range?.low ?? null;
      row.high = range?.high ?? null;
    }

    const existingCount = await query('SELECT count(*) FROM reports WHERE order_id = $1', [orderId]);
    const version = Number(existingCount.rows[0].count) + 1;
    const reportNumber = generateReportNumber();
    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(token);
    const filename = `${reportNumber}.pdf`;
    const filePath = path.join(STORAGE_DIR, filename);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(16).text('Laboratory Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Report No: ${reportNumber}    Version: ${version}`);
    doc.text(`Order No: ${order.order_number}    Date: ${new Date().toLocaleString()}`);
    doc.moveDown(0.5);
    doc.text(`Patient: ${order.first_name} ${order.last_name || ''}    MRN: ${order.mrn}`);
    doc.text(`DOB: ${order.dob ? new Date(order.dob).toLocaleDateString() : '-'}    Gender: ${order.gender || '-'}`);
    doc.text(`Referring Doctor: ${order.doctor_name || '-'}`);
    doc.moveDown();

    doc.fontSize(11).text('Test', 50, doc.y, { continued: true, width: 150 });
    doc.text('Result', 200, doc.y, { continued: true, width: 100 });
    doc.text('Unit', 300, doc.y, { continued: true, width: 80 });
    doc.text('Reference', 380, doc.y, { continued: true, width: 90 });
    doc.text('Flag', 470, doc.y);
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
    doc.moveDown(0.5);

    for (const r of resultsRes.rows) {
      const ref = r.low !== null && r.high !== null ? `${r.low} - ${r.high}` : '-';
      doc.fontSize(10).text(`${r.test_name}: ${r.parameter_name}`, 50, doc.y, { continued: true, width: 150 });
      doc.text(String(r.value ?? '-'), 200, doc.y, { continued: true, width: 100 });
      doc.text(r.unit || '-', 300, doc.y, { continued: true, width: 80 });
      doc.text(ref, 380, doc.y, { continued: true, width: 90 });
      doc.text((r.flag || '-').toUpperCase(), 470, doc.y);
    }

    doc.moveDown(2);
    doc.fontSize(9).text(`Verify this report at: /verify/${token}`, { align: 'left' });
    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    const { rows } = await query(
      `INSERT INTO reports (order_id, report_number, version, status, file_path, verification_token_hash, finalized_by, finalized_at)
       VALUES ($1,$2,$3,'final',$4,$5,$6, now()) RETURNING *`,
      [orderId, reportNumber, version, filePath, tokenHash, req.user!.id]
    );

    res.status(201).json({ ...rows[0], verification_token: token });
  }
);

router.get('/:id/download', async (req, res) => {
  const { rows } = await query('SELECT * FROM reports WHERE id = $1', [req.params.id]);
  const report = rows[0];
  if (!report || !fs.existsSync(report.file_path)) return res.status(404).json({ error: 'Not found' });
  res.download(report.file_path, `${report.report_number}.pdf`);
});

export default router;
