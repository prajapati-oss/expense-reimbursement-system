import { randomUUID } from 'crypto';
import { db } from '../db/client';

export interface CategoryRow {
  id: string;
  name: string;
}

export function listCategories(): CategoryRow[] {
  return db.prepare(`SELECT * FROM categories ORDER BY name ASC`).all() as unknown as CategoryRow[];
}

export function findCategoryById(id: string): CategoryRow | undefined {
  return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as CategoryRow | undefined;
}

export function findOrCreateCategory(name: string): CategoryRow {
  const existing = db
    .prepare(`SELECT * FROM categories WHERE name = ?`)
    .get(name) as CategoryRow | undefined;
  if (existing) return existing;
  const id = randomUUID();
  db.prepare(`INSERT INTO categories (id, name) VALUES (?, ?)`).run(id, name);
  return { id, name };
}
