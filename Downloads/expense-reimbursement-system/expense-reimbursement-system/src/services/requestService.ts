import {
  createRequest,
  findRequestById,
  updateRequestStatus,
  searchRequests,
  toPublicRequest,
  RequestFilter,
} from '../repositories/requestRepository';
import { findExpenseById, updateExpense, listExpensesByRequestId, toPublicExpense } from '../repositories/expenseRepository';
import { findCategoryById } from '../repositories/categoryRepository';
import { findUserById, listEmployeesForManager } from '../repositories/userRepository';
import { writeAuditLog, listAuditLogs } from '../repositories/auditRepository';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '../utils/errors';

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'USD';

interface Actor {
  id: string;
  role: 'EMPLOYEE' | 'MANAGER';
}

/** Employee submits a set of their own DRAFT expenses as a single reimbursement request. */
export function submitRequest(actor: Actor, expenseIds: string[]) {
  const uniqueIds = Array.from(new Set(expenseIds));
  if (uniqueIds.length !== expenseIds.length) {
    throw new BadRequestError('Duplicate expense IDs found in the same request');
  }

  const expenses = uniqueIds.map((id) => {
    const expense = findExpenseById(id);
    if (!expense) throw new NotFoundError(`Expense ${id} not found`);
    if (expense.employee_id !== actor.id) {
      throw new ForbiddenError(`Expense ${id} does not belong to you`);
    }
    if (expense.status !== 'DRAFT') {
      // This is the core duplicate-reimbursement guard: an expense already
      // attached to a request (SUBMITTED) or already paid (REIMBURSED)
      // cannot be submitted again.
      throw new ConflictError(
        `Expense ${id} is already ${expense.status.toLowerCase()} and cannot be submitted again`
      );
    }
    return expense;
  });

  const totalAmountBaseCurrency = Math.round(
    expenses.reduce((sum, e) => sum + e.amount_base_currency, 0) * 100
  ) / 100;

  const request = createRequest({
    employeeId: actor.id,
    totalAmountBaseCurrency,
    baseCurrency: BASE_CURRENCY,
  });

  for (const expense of expenses) {
    updateExpense(expense.id, {
      status: 'SUBMITTED',
      reimbursement_request_id: request.id,
    });
    writeAuditLog({
      entityType: 'Expense',
      entityId: expense.id,
      action: 'SUBMIT',
      performedBy: actor.id,
      previousState: { status: 'DRAFT' },
      newState: { status: 'SUBMITTED', reimbursementRequestId: request.id },
    });
  }

  writeAuditLog({
    entityType: 'ReimbursementRequest',
    entityId: request.id,
    action: 'CREATE',
    performedBy: actor.id,
    newState: toPublicRequest(request),
    metadata: { expenseIds: uniqueIds },
  });

  return getRequestDetail(actor, request.id);
}

function assertManagerOwnsEmployee(managerId: string, employeeId: string) {
  const team = listEmployeesForManager(managerId).map((e) => e.id);
  if (!team.includes(employeeId)) {
    throw new ForbiddenError('You can only review requests submitted by your direct reports');
  }
}

export function reviewRequest(
  actor: Actor,
  requestId: string,
  decision: 'APPROVED' | 'REJECTED',
  comment?: string
) {
  const request = findRequestById(requestId);
  if (!request) throw new NotFoundError('Reimbursement request not found');
  if (request.status !== 'PENDING') {
    throw new ConflictError(`This request has already been ${request.status.toLowerCase()}`);
  }
  assertManagerOwnsEmployee(actor.id, request.employee_id);

  const previousState = toPublicRequest(request);
  updateRequestStatus(requestId, decision, actor.id, comment);

  const expenses = listExpensesByRequestId(requestId);
  if (decision === 'APPROVED') {
    for (const expense of expenses) {
      updateExpense(expense.id, { status: 'REIMBURSED' });
    }
  } else {
    // Rejected: expenses revert to DRAFT so the employee can edit/resubmit them.
    for (const expense of expenses) {
      updateExpense(expense.id, { status: 'DRAFT', reimbursement_request_id: null });
    }
  }

  const updated = findRequestById(requestId)!;
  writeAuditLog({
    entityType: 'ReimbursementRequest',
    entityId: requestId,
    action: decision,
    performedBy: actor.id,
    previousState,
    newState: toPublicRequest(updated),
    metadata: { comment: comment ?? null },
  });

  return getRequestDetail(actor, requestId);
}

export function getRequestDetail(actor: Actor, requestId: string) {
  const request = findRequestById(requestId);
  if (!request) throw new NotFoundError('Reimbursement request not found');

  if (actor.role === 'EMPLOYEE' && request.employee_id !== actor.id) {
    throw new ForbiddenError('You can only view your own reimbursement requests');
  }
  if (actor.role === 'MANAGER' && request.employee_id !== actor.id) {
    assertManagerOwnsEmployee(actor.id, request.employee_id);
  }

  const expenses = listExpensesByRequestId(requestId).map((e) =>
    toPublicExpense({ ...e, category_name: findCategoryById(e.category_id)?.name })
  );
  const employee = findUserById(request.employee_id);

  return {
    ...toPublicRequest(request),
    employee: employee ? { id: employee.id, name: employee.name, department: employee.department } : null,
    expenses,
  };
}

export function listRequests(
  actor: Actor,
  query: { status?: string; employeeId?: string; page?: number; limit?: number }
) {
  const filter: RequestFilter = { status: query.status, page: query.page, limit: query.limit };

  if (actor.role === 'EMPLOYEE') {
    filter.employeeId = actor.id;
  } else {
    if (query.employeeId) {
      if (query.employeeId !== actor.id) assertManagerOwnsEmployee(actor.id, query.employeeId);
      filter.employeeId = query.employeeId;
    } else {
      const team = listEmployeesForManager(actor.id).map((e) => e.id);
      filter.employeeIds = [actor.id, ...team];
    }
  }

  const { rows, total } = searchRequests(filter);
  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 20;

  return {
    data: rows.map((r) => toPublicRequest(r)),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export function getRequestHistory(actor: Actor, requestId: string) {
  // Reuses the same access checks as getRequestDetail
  getRequestDetail(actor, requestId);
  return listAuditLogs('ReimbursementRequest', requestId);
}
