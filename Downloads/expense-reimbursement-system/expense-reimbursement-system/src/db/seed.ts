import dotenv from 'dotenv';
dotenv.config();

import { runMigrations } from './client';
import { findOrCreateCategory } from '../repositories/categoryRepository';
import { findUserByEmail, createUser } from '../repositories/userRepository';
import { hashPassword } from '../utils/password';

const DEFAULT_CATEGORIES = [
  'Travel',
  'Meals & Entertainment',
  'Accommodation',
  'Office Supplies',
  'Software & Subscriptions',
  'Client Entertainment',
  'Training & Education',
  'Other',
];

async function main() {
  runMigrations();

  for (const name of DEFAULT_CATEGORIES) {
    findOrCreateCategory(name);
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} categories.`);

  const managerEmail = 'manager@acme.test';
  let manager = findUserByEmail(managerEmail);
  if (!manager) {
    manager = createUser({
      name: 'Morgan Reyes',
      email: managerEmail,
      passwordHash: await hashPassword('Password123!'),
      role: 'MANAGER',
      department: 'Engineering',
      currency: 'USD',
    });
    console.log(`Created manager: ${managerEmail} / Password123!`);
  }

  const employeeUS = 'alex@acme.test';
  if (!findUserByEmail(employeeUS)) {
    createUser({
      name: 'Alex Chen',
      email: employeeUS,
      passwordHash: await hashPassword('Password123!'),
      role: 'EMPLOYEE',
      department: 'Engineering',
      currency: 'USD',
      managerId: manager.id,
    });
    console.log(`Created employee: ${employeeUS} / Password123! (currency USD, reports to Morgan)`);
  }

  const employeeIN = 'priya@acme.test';
  if (!findUserByEmail(employeeIN)) {
    createUser({
      name: 'Priya Sharma',
      email: employeeIN,
      passwordHash: await hashPassword('Password123!'),
      role: 'EMPLOYEE',
      department: 'Engineering',
      currency: 'INR',
      managerId: manager.id,
    });
    console.log(`Created employee: ${employeeIN} / Password123! (currency INR, reports to Morgan - multi-currency demo)`);
  }

  console.log('\nSeed complete. Base currency for reports is USD by default (see .env BASE_CURRENCY).');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
