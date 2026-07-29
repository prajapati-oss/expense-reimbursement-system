import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import authRoutes from './routes/authRoutes';
import expenseRoutes from './routes/expenseRoutes';
import requestRoutes from './routes/requestRoutes';
import reportRoutes from './routes/reportRoutes';
import categoryRoutes from './routes/categoryRoutes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Serve uploaded receipts statically (behind auth would require a signed-URL
  // scheme in production; kept simple/static here - see README assumptions).
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/reimbursement-requests', requestRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/categories', categoryRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
