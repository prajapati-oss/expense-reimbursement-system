import { db } from '../db/client';
import { listEmployeesForManager } from '../repositories/userRepository';

interface Actor {
  id: string;
  role: 'EMPLOYEE' | 'MANAGER';
}

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'USD';

/**
 * Departmental summary: total approved reimbursements broken down by
 * department and by category, restricted to the requesting manager's
 * own department/team for this assignment's simplified authorization model
 * (see README "Assumptions" for the multi-manager/department scoping note).
 */
export function departmentSummary(actor: Actor, opts: { fromDate?: string; toDate?: string }) {
  const teamIds = [actor.id, ...listEmployeesForManager(actor.id).map((e) => e.id)];
  if (teamIds.length === 0) {
    return { baseCurrency: BASE_CURRENCY, totalApproved: 0, byCategory: [], byEmployee: [] };
  }

  const placeholders = teamIds.map(() => '?').join(',');
  const params: any[] = [...teamIds];
  let dateClause = '';
  if (opts.fromDate) {
    dateClause += ' AND e.expense_date >= ?';
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    dateClause += ' AND e.expense_date <= ?';
    params.push(opts.toDate);
  }

  const totalRow = db
    .prepare(
      `SELECT COALESCE(SUM(e.amount_base_currency), 0) as total
       FROM expenses e
       WHERE e.status = 'REIMBURSED' AND e.employee_id IN (${placeholders}) ${dateClause}`
    )
    .get(...params) as { total: number };

  const byCategory = db
    .prepare(
      `SELECT c.name as category, COALESCE(SUM(e.amount_base_currency), 0) as total, COUNT(*) as count
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.status = 'REIMBURSED' AND e.employee_id IN (${placeholders}) ${dateClause}
       GROUP BY c.name
       ORDER BY total DESC`
    )
    .all(...params);

  const byEmployee = db
    .prepare(
      `SELECT u.id as employeeId, u.name as employeeName, COALESCE(SUM(e.amount_base_currency), 0) as total, COUNT(*) as count
       FROM expenses e
       JOIN users u ON u.id = e.employee_id
       WHERE e.status = 'REIMBURSED' AND e.employee_id IN (${placeholders}) ${dateClause}
       GROUP BY u.id, u.name
       ORDER BY total DESC`
    )
    .all(...params);

  return {
    baseCurrency: BASE_CURRENCY,
    totalApproved: totalRow.total,
    byCategory,
    byEmployee,
  };
}

/** Approved reimbursements list for a manager's team, most recent first. */
export function approvedReimbursements(actor: Actor, opts: { page?: number; limit?: number }) {
  const teamIds = [actor.id, ...listEmployeesForManager(actor.id).map((e) => e.id)];
  if (teamIds.length === 0) {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
  const placeholders = teamIds.map(() => '?').join(',');

  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
  const offset = (page - 1) * limit;

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM reimbursement_requests WHERE status = 'APPROVED' AND employee_id IN (${placeholders})`
      )
      .get(...teamIds) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(
      `SELECT r.*, u.name as employee_name, u.department as department
       FROM reimbursement_requests r
       JOIN users u ON u.id = r.employee_id
       WHERE r.status = 'APPROVED' AND r.employee_id IN (${placeholders})
       ORDER BY r.reviewed_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...teamIds, limit, offset) as any[];

  return {
    data: rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      department: r.department,
      totalAmountBaseCurrency: r.total_amount_base_currency,
      baseCurrency: r.base_currency,
      reviewedAt: r.reviewed_at,
      managerComment: r.manager_comment,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
