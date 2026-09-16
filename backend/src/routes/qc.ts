import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/materials', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT qm.*, tp.name AS parameter_name, tp.unit, t.name AS test_name
     FROM qc_materials qm
     JOIN test_parameters tp ON tp.id = qm.parameter_id
     JOIN tests t ON t.id = tp.test_id
     WHERE qm.branch_id = $1 AND qm.active = true
     ORDER BY t.name, qm.level`,
    [req.user!.branchId]
  );
  res.json(rows);
});

router.post('/materials', requireRole('quality_officer', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const { parameter_id, name, level, target_mean, target_sd } = req.body;
  if (!parameter_id || !name || target_mean === undefined || target_sd === undefined) {
    return res.status(400).json({ error: 'parameter_id, name, target_mean, and target_sd are required' });
  }
  const { rows } = await query(
    `INSERT INTO qc_materials (branch_id, parameter_id, name, level, target_mean, target_sd)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.branchId, parameter_id, name, level || null, target_mean, target_sd]
  );
  res.status(201).json(rows[0]);
});

// Evaluate Westgard multi-rule violations using the material's last ~12 QC points
// (including the new one being submitted).
function evaluateWestgard(values: number[], mean: number, sd: number): string | null {
  if (!sd || sd === 0) return null;
  const z = values.map((v) => (v - mean) / sd);
  const last = z[z.length - 1];

  if (Math.abs(last) > 3) return '1_3s: single point beyond 3 SD (reject run)';
  if (Math.abs(last) > 2) {
    // 2_2s: this point and the previous point both beyond 2 SD on the same side
    if (z.length >= 2 && Math.abs(z[z.length - 2]) > 2 && Math.sign(z[z.length - 2]) === Math.sign(last)) {
      return '2_2s: two consecutive points beyond 2 SD on the same side (reject run)';
    }
  }
  if (z.length >= 2) {
    const prev = z[z.length - 2];
    if (Math.sign(last) !== Math.sign(prev) && Math.abs(last - prev) > 4) {
      return 'R_4s: range between consecutive points exceeds 4 SD (reject run)';
    }
  }
  if (z.length >= 4) {
    const lastFour = z.slice(-4);
    if (lastFour.every((v) => v > 1) || lastFour.every((v) => v < -1)) {
      return '4_1s: four consecutive points beyond 1 SD on the same side (warning — trend)';
    }
  }
  if (z.length >= 10) {
    const lastTen = z.slice(-10);
    if (lastTen.every((v) => v > 0) || lastTen.every((v) => v < 0)) {
      return '10x: ten consecutive points on the same side of the mean (warning — bias)';
    }
  }
  return null;
}

router.post('/materials/:id/results', requireRole('lab_technician', 'quality_officer', 'lab_manager', 'super_admin'), async (req: AuthedRequest, res) => {
  const { value } = req.body;
  if (value === undefined || isNaN(Number(value))) return res.status(400).json({ error: 'value is required' });

  const matRes = await query('SELECT * FROM qc_materials WHERE id = $1', [req.params.id]);
  const material = matRes.rows[0];
  if (!material) return res.status(404).json({ error: 'QC material not found' });

  const priorRes = await query(
    `SELECT value FROM qc_results WHERE qc_material_id = $1 ORDER BY performed_at ASC LIMIT 11`,
    [req.params.id]
  );
  const values = [...priorRes.rows.map((r) => Number(r.value)), Number(value)];
  const zScore = (Number(value) - Number(material.target_mean)) / Number(material.target_sd);
  const violation = evaluateWestgard(values, Number(material.target_mean), Number(material.target_sd));

  const { rows } = await query(
    `INSERT INTO qc_results (qc_material_id, value, z_score, westgard_violation, performed_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, value, zScore, violation, req.user!.id]
  );
  res.status(201).json(rows[0]);
});

router.get('/materials/:id/results', async (req, res) => {
  const { rows } = await query(
    `SELECT qr.*, u.name AS performed_by_name FROM qc_results qr
     LEFT JOIN users u ON u.id = qr.performed_by
     WHERE qc_material_id = $1 ORDER BY performed_at ASC LIMIT 60`,
    [req.params.id]
  );
  res.json(rows);
});

export default router;
