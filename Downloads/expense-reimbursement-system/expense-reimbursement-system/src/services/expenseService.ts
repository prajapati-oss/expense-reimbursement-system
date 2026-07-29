import {
  createExpense,
  findExpenseById,
  softDeleteExpense,
  updateExpense,
  searchExpenses,
  ExpenseFilter,
  toPublicExpense,
} from '../repositories/expenseRepository';
import { findOrCreateCategory, findCategoryById } from '../repositories/categoryRepository';
import { findUserById, listEmployeesForManager } from '../repositories/userRepository';
import { convert, getExchangeRate } from './currencyService';
import { writeAuditLog, listAuditLogs } from '../repositories/auditRepository';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'USD';

interface Actor {
  id: string;
  role: 'EMPLOYEE' | 'MANAGER';
}

function assertOwnedByActorOrManages(expenseEmployeeId: string, actor: Actor) {
  if (actor.role === 'MANAGER') {
    const team = listEmployeesForManager(actor.id).map((e) => e.id);
    if (expenseEmployeeId !== actor.id && !team.includes(expenseEmployeeId)) {
      throw new ForbiddenError('You can only view expenses for yourself or your direct reports');
    }
    return;
  }
  if (expenseEmployeeId !== actor.id) {
    throw new ForbiddenError('You can only access your own expenses');
  }
}

export function recordExpense(
  actor: Actor,
  input: { category: string; description: string; expenseDate: string; amount: number; currency: string }
) {
  const employee = findUserById(actor.id)!;
  const category = findOrCreateCategory(input.category.trim());

  const exchangeRateToBase = getExchangeRate(input.currency, BASE_CURRENCY);
  const amountBaseCurrency = convert(input.amount, input.currency, BASE_CURRENCY);

  const expense = createExpense({
    employeeId: actor.id,
    categoryId: category.id,
    description: input.description,
    expenseDate: new Date(input.expenseDate).toISOString(),
    amount: input.amount,
    currency: input.currency,
    exchangeRateToBase,
    baseCurrency: BASE_CURRENCY,
    amountBaseCurrency,
  });

  writeAuditLog({
    entityType: 'Expense',
    entityId: expense.id,
    action: 'CREATE',
    performedBy: actor.id,
    newState: toPublicExpense({ ...expense, category_name: category.name }),
  });

  return toPublicExpense({ ...expense, category_name: category.name });
}

export function getExpense(actor: Actor, id: string) {
  const expense = findExpenseById(id);
  if (!expense) throw new NotFoundError('Expense not found');
  assertOwnedByActorOrManages(expense.employee_id, actor);
  const category = findCategoryById(expense.category_id);
  return toPublicExpense({ ...expense, category_name: category?.name });
}

export function editExpense(
  actor: Actor,
  id: string,
  input: Partial<{ category: string; description: string; expenseDate: string; amount: number; currency: string }>
) {
  const expense = findExpenseById(id);
  if (!expense) throw new NotFoundError('Expense not found');
  if (expense.employee_id !== actor.id) {
    throw new ForbiddenError('You can only edit your own expenses');
  }
  if (expense.status !== 'DRAFT') {
    throw new BadRequestError(
      `Only DRAFT expenses can be edited. This expense is ${expense.status.toLowerCase()} and is locked once submitted for reimbursement.`
    );
  }

  const previousState = toPublicExpense(expense);
  const fields: Record<string, unknown> = {};

  let categoryName: string | undefined;
  if (input.category) {
    const category = findOrCreateCategory(input.category.trim());
    fields.category_id = category.id;
    categoryName = category.name;
  }
  if (input.description) fields.description = input.description;
  if (input.expenseDate) fields.expense_date = new Date(input.expenseDate).toISOString();

  const newAmount = input.amount ?? expense.amount;
  const newCurrency = input.currency ?? expense.currency;
  if (input.amount !== undefined || input.currency !== undefined) {
    fields.amount = newAmount;
    fields.currency = newCurrency;
    fields.exchange_rate_to_base = getExchangeRate(newCurrency, BASE_CURRENCY);
    fields.amount_base_currency = convert(newAmount, newCurrency, BASE_CURRENCY);
  }

  updateExpense(id, fields);
  const updated = findExpenseById(id)!;
  const category = categoryName ? { name: categoryName } : findCategoryById(updated.category_id);

  writeAuditLog({
    entityType: 'Expense',
    entityId: id,
    action: 'UPDATE',
    performedBy: actor.id,
    previousState,
    newState: toPublicExpense({ ...updated, category_name: category?.name }),
  });

  return toPublicExpense({ ...updated, category_name: category?.name });
}

export function attachReceipt(actor: Actor, id: string, receiptUrl: string) {
  const expense = findExpenseById(id);
  if (!expense) throw new NotFoundError('Expense not found');
  if (expense.employee_id !== actor.id) throw new ForbiddenError('You can only modify your own expenses');
  if (expense.status !== 'DRAFT') {
    throw new BadRequestError('Receipts can only be attached to DRAFT expenses');
  }
  const previousState = toPublicExpense(expense);
  updateExpense(id, { receipt_url: receiptUrl });
  const updated = findExpenseById(id)!;
  writeAuditLog({
    entityType: 'Expense',
    entityId: id,
    action: 'ATTACH_RECEIPT',
    performedBy: actor.id,
    previousState,
    newState: toPublicExpense(updated),
  });
  return toPublicExpense(updated);
}

export function deleteExpense(actor: Actor, id: string) {
  const expense = findExpenseById(id);
  if (!expense) throw new NotFoundError('Expense not found');
  if (expense.employee_id !== actor.id) throw new ForbiddenError('You can only delete your own expenses');
  if (expense.status !== 'DRAFT') {
    throw new BadRequestError('Only DRAFT expenses can be deleted. Submitted or reimbursed expenses must be preserved for audit purposes.');
  }
  softDeleteExpense(id);
  writeAuditLog({
    entityType: 'Expense',
    entityId: id,
    action: 'DELETE',
    performedBy: actor.id,
    previousState: toPublicExpense(expense),
  });
}

export function listExpenses(
  actor: Actor,
  query: {
    status?: string;
    category?: string;
    fromDate?: string;
    toDate?: string;
    currency?: string;
    search?: string;
    employeeId?: string;
    page?: number;
    limit?: number;
  }
) {
  const filter: ExpenseFilter = {
    status: query.status,
    fromDate: query.fromDate,
    toDate: query.toDate,
    currency: query.currency,
    search: query.search,
    page: query.page,
    limit: query.limit,
  };

  if (query.category) {
    const category = findOrCreateCategory(query.category);
    filter.categoryId = category.id;
  }

  if (actor.role === 'EMPLOYEE') {
    filter.employeeId = actor.id;
  } else {
    // MANAGER: default to team + self, unless a specific employeeId is requested (must be on their team)
    if (query.employeeId) {
      const team = listEmployeesForManager(actor.id).map((e) => e.id);
      if (query.employeeId !== actor.id && !team.includes(query.employeeId)) {
        throw new ForbiddenError('You can only filter by employees who report to you');
      }
      filter.employeeId = query.employeeId;
    } else {
      const team = listEmployeesForManager(actor.id).map((e) => e.id);
      filter.employeeIds = [actor.id, ...team];
    }
  }

  const { rows, total } = searchExpenses(filter);
  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 20;

  return {
    data: rows.map((r) => toPublicExpense(r)),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export function getExpenseHistory(actor: Actor, id: string) {
  const expense = findExpenseById(id);
  if (!expense) throw new NotFoundError('Expense not found');
  assertOwnedByActorOrManages(expense.employee_id, actor);
  return listAuditLogs('Expense', id);
}
