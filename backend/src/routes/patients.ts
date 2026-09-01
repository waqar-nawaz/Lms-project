import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// Search / list patients — by name, phone, MRN, or identity number
router.get('/', async (req: AuthedRequest, res) => {
  const { q } = req.query;
  const branchId = req.user!.branchId;
  if (q) {
    const like = `%${q}%`;
    const { rows } = await query(
      `SELECT * FROM patients WHERE branch_id = $1 AND active = true AND
       (mrn ILIKE $2 OR first_name ILIKE $2 OR last_name ILIKE $2 OR phone ILIKE $2 OR identity_number ILIKE $2)
       ORDER BY created_at DESC LIMIT 50`,
      [branchId, like]
    );
    return res.json(rows);
  }
  const { rows } = await query(
    'SELECT * FROM patients WHERE branch_id = $1 AND active = true ORDER BY created_at DESC LIMIT 50',
    [branchId]
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// Full patient history: orders, reports, payments
router.get('/:id/history', async (req, res) => {
  const patientId = req.params.id;
  const orders = await query(
    `SELECT o.*, COALESCE(json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]') AS tests
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN tests t ON t.id = oi.test_id
     WHERE o.patient_id = $1 GROUP BY o.id ORDER BY o.created_at DESC`,
    [patientId]
  );
  const reports = await query(
    `SELECT r.* FROM reports r JOIN orders o ON o.id = r.order_id WHERE o.patient_id = $1 ORDER BY r.created_at DESC`,
    [patientId]
  );
  const payments = await query(
    `SELECT p.* FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN orders o ON o.id = i.order_id
     WHERE o.patient_id = $1 ORDER BY p.paid_at DESC`,
    [patientId]
  );
  res.json({ orders: orders.rows, reports: reports.rows, payments: payments.rows });
});

router.post('/', async (req: AuthedRequest, res) => {
  const branchId = req.user!.branchId;
  const {
    mrn, first_name, middle_name, last_name, dob, gender,
    identity_number, phone, email, address, city,
    emergency_contact, blood_group, notes,
  } = req.body;

  if (!mrn || !first_name) return res.status(400).json({ error: 'mrn and first_name are required' });

  // Duplicate detection by phone or identity number
  let duplicates: any[] = [];
  if (phone || identity_number) {
    const { rows } = await query(
      `SELECT id, mrn, first_name, last_name, phone, identity_number FROM patients
       WHERE branch_id = $1 AND ((phone = $2 AND $2 IS NOT NULL) OR (identity_number = $3 AND $3 IS NOT NULL))`,
      [branchId, phone || null, identity_number || null]
    );
    duplicates = rows;
  }

  const { rows } = await query(
    `INSERT INTO patients (branch_id, mrn, first_name, middle_name, last_name, dob, gender,
      identity_number, phone, email, address, city, emergency_contact, blood_group, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [branchId, mrn, first_name, middle_name, last_name, dob, gender,
      identity_number, phone, email, address, city, emergency_contact, blood_group, notes]
  );

  res.status(201).json({ patient: rows[0], possible_duplicates: duplicates });
});

router.put('/:id', async (req, res) => {
  const fields = [
    'first_name', 'middle_name', 'last_name', 'dob', 'gender', 'identity_number',
    'phone', 'email', 'address', 'city', 'emergency_contact', 'blood_group', 'notes',
  ];
  const updates: string[] = [];
  const values: any[] = [];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) {
      values.push(req.body[f]);
      updates.push(`${f} = $${values.length}`);
    }
  });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE patients SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

export default router;
