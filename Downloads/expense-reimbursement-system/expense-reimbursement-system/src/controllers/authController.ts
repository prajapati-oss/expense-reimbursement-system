import { Request, Response } from 'express';
import * as authService from '../services/authService';

export async function register(req: Request, res: Response) {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.status(200).json(result);
}

export async function me(req: Request, res: Response) {
  const user = authService.getProfile(req.user!.sub);
  res.status(200).json(user);
}
