import { Router } from 'express';
import { pool, query } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// Dependency order — parents before children. Restore inserts in this order;
// backup just reads all of them.
const TABLE_ORDER = [
  'organizations', 'branches', 'users', 'patients', 'doctors', 'departments',
  'tests', 'test_parameters', 'reference_ranges', 'packages', 'package_tests',
  'orders', 'order_items', 'specimens', 'specimen_events', 'results', 'result_versions',
  'reports', 'invoices', 'payments', 'audit_logs',
];

router.get('/backup', requireRole('super_admin'), async (_req, res) => {
  const tables: Record<string, any[]> = {};
  for (const table of TABLE_ORDER) {
    const { rows } = await query(`SELECT * FROM ${table}`);
    tables[table] = rows;
  }

  const filename = `lms-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), tables }));
});

router.post('/restore', requireRole('super_admin'), async (req, res) => {
  const { tables } = req.body || {};
  if (!tables || typeof tables !== 'object') {
    return res.status(400).json({ error: 'Invalid backup file — expected a "tables" object.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE TABLE ${TABLE_ORDER.join(', ')} RESTART IDENTITY CASCADE`);

    const counts: Record<string, number> = {};
    for (const table of TABLE_ORDER) {
      const rows: any[] = tables[table] || [];
      counts[table] = rows.length;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
        const values = cols.map((c) => row[c]);
        await client.query(
          `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`,
          values
        );
      }
    }

    await client.query('COMMIT');
    res.json({ restored: true, tableCounts: counts });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
