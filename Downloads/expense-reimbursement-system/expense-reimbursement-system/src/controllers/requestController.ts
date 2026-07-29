import { Request, Response } from 'express';
import * as requestService from '../services/requestService';

function actor(req: Request) {
  return { id: req.user!.sub, role: req.user!.role };
}

export function submit(req: Request, res: Response) {
  const result = requestService.submitRequest(actor(req), req.body.expenseIds);
  res.status(201).json(result);
}

export function list(req: Request, res: Response) {
  const result = requestService.listRequests(actor(req), req.query as any);
  res.status(200).json(result);
}

export function getOne(req: Request, res: Response) {
  const result = requestService.getRequestDetail(actor(req), req.params.id);
  res.status(200).json(result);
}

export function approve(req: Request, res: Response) {
  const result = requestService.reviewRequest(actor(req), req.params.id, 'APPROVED', req.body.comment);
  res.status(200).json(result);
}

export function reject(req: Request, res: Response) {
  const result = requestService.reviewRequest(actor(req), req.params.id, 'REJECTED', req.body.comment);
  res.status(200).json(result);
}

export function history(req: Request, res: Response) {
  const logs = requestService.getRequestHistory(actor(req), req.params.id);
  res.status(200).json(logs);
}
