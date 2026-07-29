import { Request, Response } from 'express';
import * as reportService from '../services/reportService';

function actor(req: Request) {
  return { id: req.user!.sub, role: req.user!.role as 'EMPLOYEE' | 'MANAGER' };
}

export function departmentSummary(req: Request, res: Response) {
  const { fromDate, toDate } = req.query as { fromDate?: string; toDate?: string };
  const result = reportService.departmentSummary(actor(req), { fromDate, toDate });
  res.status(200).json(result);
}

export function approvedReimbursements(req: Request, res: Response) {
  const { page, limit } = req.query as { page?: string; limit?: string };
  const result = reportService.approvedReimbursements(actor(req), {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  res.status(200).json(result);
}
