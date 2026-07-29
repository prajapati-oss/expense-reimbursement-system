import { Request, Response } from 'express';
import { listCategories } from '../repositories/categoryRepository';

export function list(_req: Request, res: Response) {
  res.status(200).json(listCategories());
}
