import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['EMPLOYEE', 'MANAGER']),
  department: z.string().min(1),
  currency: z.string().length(3, 'Currency must be an ISO 4217 code, e.g. USD').toUpperCase(),
  managerId: z.string().uuid().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
