import { PoolClient } from 'pg';
import { query as poolQuery } from '../db/pool';

interface AuditEntry {
  userId?: string | null;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: any;
  newValues?: any;
}

// Accepts either a transaction client (when called inside a BEGIN/COMMIT block)
// or falls back to the shared pool for standalone calls like login.
export async function logAudit(entry: AuditEntry, client?: PoolClient) {
  const runner = client ? client.query.bind(client) : poolQuery;
  try {
    await runner(
      `INSERT INTO audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        entry.userId || null,
        entry.branchId || null,
        entry.action,
        entry.entityType,
        entry.entityId || null,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null,
      ]
    );
  } catch (e) {
    // Audit logging must never break the primary operation.
    console.error('Audit log write failed:', e);
  }
}
