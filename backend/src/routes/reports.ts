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
const PUBLIC_APP_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

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

    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const NAVY = '#0f2942';
    const BLUE = '#145374';
    const GRAY_TEXT = '#5a6b7d';
    const LIGHT_BG = '#f4f6f8';
    const BORDER = '#e0e5ea';
    const RED = '#c0392b';
    const ORANGE = '#b8790a';
    const GREEN = '#1b7a41';
    const PAGE_W = 595.28;
    const MARGIN = 40;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    function flagColor(flag: string | null): string {
      if (!flag) return GRAY_TEXT;
      if (flag === 'critical_low' || flag === 'critical_high') return RED;
      if (flag === 'low' || flag === 'high' || flag === 'abnormal' || flag === 'positive') return ORANGE;
      if (flag === 'normal' || flag === 'negative') return GREEN;
      return GRAY_TEXT;
    }

    function flagLabel(flag: string | null): string {
      if (!flag) return '-';
      return flag.replace(/_/g, ' ').toUpperCase();
    }

    // ---- Header band ----
    doc.rect(0, 0, PAGE_W, 90).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('LabTrack Diagnostics', MARGIN, 28);
    doc.fontSize(10).font('Helvetica').fillColor('#c9d6e3').text('Laboratory Report', MARGIN, 54);
    doc.fontSize(9).fillColor('#c9d6e3').text(`Report No: ${reportNumber}`, MARGIN, 70);
    doc.fontSize(9).fillColor('#c9d6e3').text(`Version ${version}`, PAGE_W - MARGIN - 100, 70, { width: 100, align: 'right' });

    let y = 110;

    // ---- Patient / order info card ----
    const cardH = 90;
    doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 6).fill(LIGHT_BG);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10);
    const colW = CONTENT_W / 2;
    let iy = y + 14;
    doc.text('PATIENT', MARGIN + 16, iy);
    doc.text('ORDER DETAILS', MARGIN + colW, iy);
    iy += 16;

    doc.font('Helvetica').fontSize(9.5).fillColor('#1c2733');
    doc.text(`${order.first_name} ${order.last_name || ''}`, MARGIN + 16, iy, { width: colW - 30 });
    doc.text(`Order No: ${order.order_number}`, MARGIN + colW, iy, { width: colW - 30 });
    iy += 15;
    doc.fillColor(GRAY_TEXT);
    doc.text(`MRN: ${order.mrn}`, MARGIN + 16, iy, { width: colW - 30 });
    doc.text(`Date: ${new Date().toLocaleString()}`, MARGIN + colW, iy, { width: colW - 30 });
    iy += 15;
    doc.text(
      `DOB: ${order.dob ? new Date(order.dob).toLocaleDateString() : '-'}   Gender: ${order.gender || '-'}`,
      MARGIN + 16,
      iy,
      { width: colW - 30 }
    );
    doc.text(`Referring Doctor: ${order.doctor_name || '-'}`, MARGIN + colW, iy, { width: colW - 30 });

    y += cardH + 24;

    // ---- Results table ----
    const cols = [
      { key: 'test', label: 'TEST', x: MARGIN, w: 175 },
      { key: 'result', label: 'RESULT', x: MARGIN + 175, w: 65 },
      { key: 'unit', label: 'UNIT', x: MARGIN + 240, w: 65 },
      { key: 'ref', label: 'REFERENCE RANGE', x: MARGIN + 305, w: 110 },
      { key: 'flag', label: 'FLAG', x: MARGIN + 415, w: CONTENT_W - 415 },
    ];

    function drawTableHeader() {
      doc.rect(MARGIN, y, CONTENT_W, 24).fill(NAVY);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      cols.forEach((c) => doc.text(c.label, c.x + 8, y + 8, { width: c.w - 12 }));
      y += 24;
    }

    drawTableHeader();

    resultsRes.rows.forEach((r, idx) => {
      const testLabel = `${r.test_name}: ${r.parameter_name}`;
      const ref = r.low !== null && r.high !== null ? `${r.low} - ${r.high}` : '-';
      const testH = doc.font('Helvetica').fontSize(9).heightOfString(testLabel, { width: cols[0].w - 16 });
      const rowH = Math.max(testH, 14) + 14;

      if (y + rowH > 780) {
        doc.addPage();
        y = MARGIN;
        drawTableHeader();
      }

      if (idx % 2 === 0) {
        doc.rect(MARGIN, y, CONTENT_W, rowH).fill(LIGHT_BG);
      }

      const textY = y + 7;
      doc.font('Helvetica').fontSize(9).fillColor('#1c2733');
      doc.text(testLabel, cols[0].x + 8, textY, { width: cols[0].w - 16 });
      doc.text(String(r.value ?? '-'), cols[1].x + 8, textY, { width: cols[1].w - 12 });
      doc.text(r.unit || '-', cols[2].x + 8, textY, { width: cols[2].w - 12 });
      doc.fillColor(GRAY_TEXT).text(ref, cols[3].x + 8, textY, { width: cols[3].w - 12 });
      doc.font('Helvetica-Bold').fillColor(flagColor(r.flag)).text(flagLabel(r.flag), cols[4].x + 8, textY, { width: cols[4].w - 12 });

      y += rowH;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    });

    y += 24;
    if (y > 740) {
      doc.addPage();
      y = MARGIN;
    }

    // ---- Verification footer ----
    const verifyUrl = `${PUBLIC_APP_URL}/verify/${token}`;
    doc.roundedRect(MARGIN, y, CONTENT_W, 46, 6).fill(LIGHT_BG);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text('VERIFY THIS REPORT', MARGIN + 16, y + 10);
    doc.font('Helvetica').fontSize(8.5).fillColor(BLUE).text(verifyUrl, MARGIN + 16, y + 24, { width: CONTENT_W - 32 });

    y += 46 + 16;
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY_TEXT).text(
      'This is a computer-generated report and does not require a signature unless otherwise stated.',
      MARGIN,
      y,
      { width: CONTENT_W, align: 'center' }
    );

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
