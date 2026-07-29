import { z } from 'zod';

export const createRequestSchema = z.object({
  expenseIds: z.array(z.string().uuid()).min(1, 'At least one expense must be included'),
});

export const reviewRequestSchema = z.object({
  comment: z.string().max(1000).optional(),
});

export const listRequestsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  employeeId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
