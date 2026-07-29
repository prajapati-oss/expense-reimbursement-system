import { randomUUID } from 'crypto';
import { db } from '../db/client';

export interface AuditEntry {
  entityType: 'Expense' | 'ReimbursementRequest' | 'User';
  entityId: string;
  action: string;
  performedBy?: string | null;
  previousState?: unknown;
  newState?: unknown;
  metadata?: unknown;
}

export function writeAuditLog(entry: AuditEntry): void {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, entity_type, entity_id, action, performed_by, previous_state, new_state, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    randomUUID(),
    entry.entityType,
    entry.entityId,
    entry.action,
    entry.performedBy ?? null,
    entry.previousState !== undefined ? JSON.stringify(entry.previousState) : null,
    entry.newState !== undefined ? JSON.stringify(entry.newState) : null,
    entry.metadata !== undefined ? JSON.stringify(entry.metadata) : null
  );
}

export function listAuditLogs(entityType: string, entityId: string) {
  const rows = db
    .prepare(
      `SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC`
    )
    .all(entityType, entityId);
  return rows.map((r: any) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    performedBy: r.performed_by,
    previousState: r.previous_state ? JSON.parse(r.previous_state) : null,
    newState: r.new_state ? JSON.parse(r.new_state) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    createdAt: r.created_at,
  }));
}
