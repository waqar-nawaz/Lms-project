import { PoolClient } from 'pg';

interface NotifyRoleParams {
  branchId: string;
  roles: string[];
  type: 'critical_result' | 'specimen_rejected' | 'general';
  message: string;
  entityType?: string;
  entityId?: string;
}

// Fans a single notification out to every active user in the branch holding
// any of the given roles (e.g. all pathologists get a critical-result alert).
export async function notifyRoles(client: PoolClient, params: NotifyRoleParams) {
  const usersRes = await client.query(
    `SELECT id FROM users WHERE branch_id = $1 AND role = ANY($2::text[]) AND active = true`,
    [params.branchId, params.roles]
  );
  for (const u of usersRes.rows) {
    await client.query(
      `INSERT INTO notifications (branch_id, recipient_user_id, type, message, entity_type, entity_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [params.branchId, u.id, params.type, params.message, params.entityType || null, params.entityId || null]
    );
  }
}
