import { Router } from 'express';
import { query } from '../db/pool';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE recipient_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id]
  );
  res.json(rows);
});

router.get('/unread-count', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM notifications WHERE recipient_user_id = $1 AND is_read = false`,
    [req.user!.id]
  );
  res.json({ count: rows[0].count });
});

router.patch('/:id/read', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND recipient_user_id = $2 RETURNING *`,
    [req.params.id, req.user!.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.patch('/read-all', async (req: AuthedRequest, res) => {
  await query(`UPDATE notifications SET is_read = true WHERE recipient_user_id = $1 AND is_read = false`, [
    req.user!.id,
  ]);
  res.json({ ok: true });
});

export default router;
