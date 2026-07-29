import { randomUUID } from 'crypto';
import { db } from '../db/client';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'EMPLOYEE' | 'MANAGER';
  department: string;
  currency: string;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export function toPublicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department,
    currency: u.currency,
    managerId: u.manager_id,
    createdAt: u.created_at,
  };
}

export function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: 'EMPLOYEE' | 'MANAGER';
  department: string;
  currency: string;
  managerId?: string | null;
}): UserRow {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, department, currency, manager_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    input.name,
    input.email.toLowerCase(),
    input.passwordHash,
    input.role,
    input.department,
    input.currency,
    input.managerId ?? null
  );
  return findUserById(id)!;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as
    | UserRow
    | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

export function listEmployeesForManager(managerId: string): UserRow[] {
  return db.prepare(`SELECT * FROM users WHERE manager_id = ?`).all(managerId) as unknown as UserRow[];
}

export function listUsersByDepartment(department: string): UserRow[] {
  return db.prepare(`SELECT * FROM users WHERE department = ?`).all(department) as unknown as UserRow[];
}
