import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// --- Departments ---
router.get('/departments', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    'SELECT * FROM departments WHERE branch_id = $1 AND active = true ORDER BY name',
    [req.user!.branchId]
  );
  res.json(rows);
});

router.post('/departments', requireRole('super_admin', 'lab_manager'), async (req: AuthedRequest, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  const { rows } = await query(
    'INSERT INTO departments (branch_id, name, code) VALUES ($1,$2,$3) RETURNING *',
    [req.user!.branchId, name, code]
  );
  res.status(201).json(rows[0]);
});

router.put('/departments/:id', requireRole('super_admin', 'lab_manager'), async (req, res) => {
  const { name, code, active } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  const { rows } = await query(
    'UPDATE departments SET name=$1, code=$2, active=$3 WHERE id=$4 RETURNING *',
    [name, code, active ?? true, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.get('/departments/all', requireRole('super_admin', 'lab_manager'), async (req: AuthedRequest, res) => {
  const { rows } = await query('SELECT * FROM departments WHERE branch_id = $1 ORDER BY name', [req.user!.branchId]);
  res.json(rows);
});

// --- Tests (with parameters) ---
router.get('/tests', async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, d.name AS department_name,
       COALESCE(json_agg(jsonb_build_object(
         'id', p.id, 'code', p.code, 'name', p.name, 'result_type', p.result_type,
         'unit', p.unit, 'decimal_places', p.decimal_places, 'display_order', p.display_order
       ) ORDER BY p.display_order) FILTER (WHERE p.id IS NOT NULL), '[]') AS parameters
     FROM tests t
     JOIN departments d ON d.id = t.department_id
     LEFT JOIN test_parameters p ON p.test_id = t.id AND p.active = true
     WHERE t.active = true
     GROUP BY t.id, d.name
     ORDER BY t.name`
  );
  res.json(rows);
});

router.post('/tests', requireRole('super_admin', 'lab_manager'), async (req, res) => {  const { department_id, code, name, short_name, specimen_type, method, tat_minutes, price, parameters } = req.body;
  if (!department_id || !code || !name || !specimen_type) {
    return res.status(400).json({ error: 'department_id, code, name, specimen_type are required' });
  }
  const { rows } = await query(
    `INSERT INTO tests (department_id, code, name, short_name, specimen_type, method, tat_minutes, price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [department_id, code, name, short_name, specimen_type, method, tat_minutes || null, price || 0]
  );
  const test = rows[0];

  if (Array.isArray(parameters)) {
    for (let i = 0; i < parameters.length; i++) {
      const p = parameters[i];
      const { rows: paramRows } = await query(
        `INSERT INTO test_parameters (test_id, code, name, result_type, unit, decimal_places, display_order, required, formula)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [test.id, p.code, p.name, p.result_type || 'numeric', p.unit || null,
          p.decimal_places ?? 2, i, p.required ?? true, p.formula || null]
      );
      if (p.reference_ranges) {
        for (const r of p.reference_ranges) {
          await query(
            `INSERT INTO reference_ranges (parameter_id, gender, age_min, age_max, age_unit, low, high, critical_low, critical_high)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [paramRows[0].id, r.gender || 'any', r.age_min ?? null, r.age_max ?? null, r.age_unit || 'years',
              r.low ?? null, r.high ?? null, r.critical_low ?? null, r.critical_high ?? null]
          );
        }
      }
    }
  }

  res.status(201).json(test);
});

router.put('/tests/:id', requireRole('super_admin', 'lab_manager'), async (req, res) => {
  const { department_id, name, short_name, specimen_type, method, tat_minutes, price, active } = req.body;
  if (!department_id || !name || !specimen_type) {
    return res.status(400).json({ error: 'department_id, name, and specimen_type are required' });
  }
  const { rows } = await query(
    `UPDATE tests SET department_id=$1, name=$2, short_name=$3, specimen_type=$4, method=$5,
       tat_minutes=$6, price=$7, active=$8
     WHERE id=$9 RETURNING *`,
    [department_id, name, short_name || null, specimen_type, method || null,
      tat_minutes || null, price || 0, active ?? true, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// --- Packages (bundles of tests, e.g. "Full Body Checkup") ---
router.get('/packages', async (_req, res) => {
  const { rows } = await query(
    `SELECT pk.*, COALESCE(json_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price', t.price))
       FILTER (WHERE t.id IS NOT NULL), '[]') AS tests
     FROM packages pk
     LEFT JOIN package_tests pt ON pt.package_id = pk.id
     LEFT JOIN tests t ON t.id = pt.test_id
     WHERE pk.active = true
     GROUP BY pk.id
     ORDER BY pk.name`
  );
  res.json(rows);
});

router.post('/packages', requireRole('super_admin', 'lab_manager'), async (req, res) => {
  const { name, price, test_ids } = req.body;
  if (!name || !Array.isArray(test_ids) || !test_ids.length) {
    return res.status(400).json({ error: 'name and at least one test are required' });
  }
  const { rows } = await query(
    `INSERT INTO packages (code, name, price) VALUES ($1,$2,$3) RETURNING *`,
    [name.toUpperCase().replace(/\s+/g, '_').slice(0, 20) + '_' + Date.now().toString(36), name, price || 0]
  );
  const pkg = rows[0];
  for (const testId of test_ids) {
    await query('INSERT INTO package_tests (package_id, test_id) VALUES ($1,$2)', [pkg.id, testId]);
  }
  res.status(201).json(pkg);
});

router.put('/packages/:id', requireRole('super_admin', 'lab_manager'), async (req, res) => {
  const { name, price, test_ids, active } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await query(
    'UPDATE packages SET name=$1, price=$2, active=$3 WHERE id=$4 RETURNING *',
    [name, price || 0, active ?? true, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (Array.isArray(test_ids)) {
    await query('DELETE FROM package_tests WHERE package_id = $1', [req.params.id]);
    for (const testId of test_ids) {
      await query('INSERT INTO package_tests (package_id, test_id) VALUES ($1,$2)', [req.params.id, testId]);
    }
  }
  res.json(rows[0]);
});

export default router;
