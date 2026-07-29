import { z } from 'zod';

export const createExpenseSchema = z.object({
  category: z.string().min(1, 'category is required'),
  description: z.string().min(1).max(500),
  expenseDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'expenseDate must be a valid date'),
  amount: z.coerce.number().positive('amount must be greater than 0'),
  currency: z.string().length(3).toUpperCase(),
});

export const updateExpenseSchema = z.object({
  category: z.string().min(1).optional(),
  description: z.string().min(1).max(500).optional(),
  expenseDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'expenseDate must be a valid date')
    .optional(),
  amount: z.coerce.number().positive().optional(),
  currency: z.string().length(3).toUpperCase().optional(),
});

export const listExpensesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'REIMBURSED']).optional(),
  category: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  search: z.string().optional(),
  employeeId: z.string().uuid().optional(), // manager-only: filter by a specific employee
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
