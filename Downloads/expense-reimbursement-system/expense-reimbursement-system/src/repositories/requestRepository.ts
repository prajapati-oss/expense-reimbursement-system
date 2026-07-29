import { randomUUID } from 'crypto';
import { db } from '../db/client';

export interface RequestRow {
  id: string;
  employee_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  total_amount_base_currency: number;
  base_currency: string;
  manager_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export function toPublicRequest(r: RequestRow) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    status: r.status,
    totalAmountBaseCurrency: r.total_amount_base_currency,
    baseCurrency: r.base_currency,
    managerComment: r.manager_comment,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createRequest(input: {
  employeeId: string;
  totalAmountBaseCurrency: number;
  baseCurrency: string;
}): RequestRow {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO reimbursement_requests (id, employee_id, status, total_amount_base_currency, base_currency, submitted_at, created_at, updated_at)
     VALUES (?, ?, 'PENDING', ?, ?, datetime('now'), datetime('now'), datetime('now'))`
  ).run(id, input.employeeId, input.totalAmountBaseCurrency, input.baseCurrency);
  return findRequestById(id)!;
}

export function findRequestById(id: string): RequestRow | undefined {
  return db.prepare(`SELECT * FROM reimbursement_requests WHERE id = ?`).get(id) as
    | RequestRow
    | undefined;
}

export function updateRequestStatus(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reviewedBy: string,
  comment?: string | null
): void {
  db.prepare(
    `UPDATE reimbursement_requests
     SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), manager_comment = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, reviewedBy, comment ?? null, id);
}

export interface RequestFilter {
  employeeId?: string;
  employeeIds?: string[];
  status?: string;
  page?: number;
  limit?: number;
}

export function searchRequests(filter: RequestFilter): { rows: RequestRow[]; total: number } {
  const clauses: string[] = [];
  const params: any[] = [];

  if (filter.employeeId) {
    clauses.push('employee_id = ?');
    params.push(filter.employeeId);
  }
  if (filter.employeeIds && filter.employeeIds.length > 0) {
    clauses.push(`employee_id IN (${filter.employeeIds.map(() => '?').join(',')})`);
    params.push(...filter.employeeIds);
  }
  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM reimbursement_requests ${where}`).get(...params) as {
      cnt: number;
    }
  ).cnt;

  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 20;
  const offset = (page - 1) * limit;

  const rows = db
    .prepare(
      `SELECT * FROM reimbursement_requests ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as RequestRow[];

  return { rows, total };
}
