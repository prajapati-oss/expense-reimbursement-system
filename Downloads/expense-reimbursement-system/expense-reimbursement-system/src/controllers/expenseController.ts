import { Request, Response } from 'express';
import * as expenseService from '../services/expenseService';
import { BadRequestError } from '../utils/errors';

function actor(req: Request) {
  return { id: req.user!.sub, role: req.user!.role };
}

export function create(req: Request, res: Response) {
  const expense = expenseService.recordExpense(actor(req), req.body);
  res.status(201).json(expense);
}

export function list(req: Request, res: Response) {
  const result = expenseService.listExpenses(actor(req), req.query as any);
  res.status(200).json(result);
}

export function getOne(req: Request, res: Response) {
  const expense = expenseService.getExpense(actor(req), req.params.id);
  res.status(200).json(expense);
}

export function update(req: Request, res: Response) {
  const expense = expenseService.editExpense(actor(req), req.params.id, req.body);
  res.status(200).json(expense);
}

export function remove(req: Request, res: Response) {
  expenseService.deleteExpense(actor(req), req.params.id);
  res.status(204).send();
}

export function uploadReceipt(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError('No receipt file was provided (field name must be "receipt")');
  const receiptUrl = `/uploads/${req.file.filename}`;
  const expense = expenseService.attachReceipt(actor(req), req.params.id, receiptUrl);
  res.status(200).json(expense);
}

export function history(req: Request, res: Response) {
  const logs = expenseService.getExpenseHistory(actor(req), req.params.id);
  res.status(200).json(logs);
}
