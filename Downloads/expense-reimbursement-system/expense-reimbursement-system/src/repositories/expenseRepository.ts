import { randomUUID } from 'crypto';
import { db } from '../db/client';

export interface ExpenseRow {
  id: string;
  employee_id: string;
  category_id: string;
  description: string;
  expense_date: string;
  amount: number;
  currency: string;
  exchange_rate_to_base: number;
  base_currency: string;
  amount_base_currency: number;
  receipt_url: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'REIMBURSED';
  reimbursement_request_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toPublicExpense(e: ExpenseRow & { category_name?: string }) {
  return {
    id: e.id,
    employeeId: e.employee_id,
    category: e.category_name ?? e.category_id,
    categoryId: e.category_id,
    description: e.description,
    expenseDate: e.expense_date,
    amount: e.amount,
    currency: e.currency,
    exchangeRateToBase: e.exchange_rate_to_base,
    baseCurrency: e.base_currency,
    amountBaseCurrency: e.amount_base_currency,
    receiptUrl: e.receipt_url,
    status: e.status,
    reimbursementRequestId: e.reimbursement_request_id,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

export function createExpense(input: {
  employeeId: string;
  categoryId: string;
  description: string;
  expenseDate: string;
  amount: number;
  currency: string;
  exchangeRateToBase: number;
  baseCurrency: string;
  amountBaseCurrency: number;
  receiptUrl?: string | null;
}): ExpenseRow {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO expenses (
      id, employee_id, category_id, description, expense_date, amount, currency,
      exchange_rate_to_base, base_currency, amount_base_currency, receipt_url, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', datetime('now'), datetime('now'))`
  ).run(
    id,
    input.employeeId,
    input.categoryId,
    input.description,
    input.expenseDate,
    input.amount,
    input.currency,
    input.exchangeRateToBase,
    input.baseCurrency,
    input.amountBaseCurrency,
    input.receiptUrl ?? null
  );
  return findExpenseById(id)!;
}

export function findExpenseById(id: string): ExpenseRow | undefined {
  return db
    .prepare(`SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as ExpenseRow | undefined;
}

export function updateExpense(id: string, fields: Record<string, unknown>): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]) as any[];
  db.prepare(`UPDATE expenses SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...values,
    id
  );
}

export function softDeleteExpense(id: string): void {
  db.prepare(`UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
    id
  );
}

export interface ExpenseFilter {
  employeeId?: string;      // restrict to one employee (e.g. current user)
  employeeIds?: string[];   // restrict to a set of employees (e.g. a manager's team)
  status?: string;
  categoryId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;          // matches description
  currency?: string;
  page?: number;
  limit?: number;
}

export function searchExpenses(filter: ExpenseFilter): { rows: (ExpenseRow & { category_name: string })[]; total: number } {
  const clauses: string[] = ['e.deleted_at IS NULL'];
  const params: any[] = [];

  if (filter.employeeId) {
    clauses.push('e.employee_id = ?');
    params.push(filter.employeeId);
  }
  if (filter.employeeIds && filter.employeeIds.length > 0) {
    clauses.push(`e.employee_id IN (${filter.employeeIds.map(() => '?').join(',')})`);
    params.push(...filter.employeeIds);
  }
  if (filter.status) {
    clauses.push('e.status = ?');
    params.push(filter.status);
  }
  if (filter.categoryId) {
    clauses.push('e.category_id = ?');
    params.push(filter.categoryId);
  }
  if (filter.fromDate) {
    clauses.push('e.expense_date >= ?');
    params.push(filter.fromDate);
  }
  if (filter.toDate) {
    clauses.push('e.expense_date <= ?');
    params.push(filter.toDate);
  }
  if (filter.currency) {
    clauses.push('e.currency = ?');
    params.push(filter.currency);
  }
  if (filter.search) {
    clauses.push('e.description LIKE ?');
    params.push(`%${filter.search}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM expenses e ${where}`).get(...params) as {
      cnt: number;
    }
  ).cnt;

  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 20;
  const offset = (page - 1) * limit;

  const rows = db
    .prepare(
      `SELECT e.*, c.name as category_name
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       ${where}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as (ExpenseRow & { category_name: string })[];

  return { rows, total };
}

/** Expenses currently attached to a given reimbursement request. */
export function listExpensesByRequestId(requestId: string): ExpenseRow[] {
  return db
    .prepare(`SELECT * FROM expenses WHERE reimbursement_request_id = ? AND deleted_at IS NULL`)
    .all(requestId) as unknown as ExpenseRow[];
}
