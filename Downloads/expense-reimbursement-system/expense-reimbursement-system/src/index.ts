import dotenv from 'dotenv';
dotenv.config();

import { runMigrations } from './db/client';
import { createApp } from './app';

runMigrations();

const app = createApp();
const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Expense Reimbursement API listening on http://localhost:${port}`);
});
