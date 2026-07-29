import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

/**
 * Thin wrapper around Node's built-in `node:sqlite` module.
 *
 * We deliberately avoid a heavyweight ORM here so the project runs with
 * `npm install && npm run dev` and zero native-binary downloads (see
 * docs/ARCHITECTURE.md -> "Why not Prisma/TypeORM" for the trade-off
 * discussion and how to swap to Postgres for production).
 */

const dbUrl = process.env.DATABASE_URL || './data/dev.sqlite';
const resolvedPath = path.isAbsolute(dbUrl) ? dbUrl : path.join(process.cwd(), dbUrl);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new DatabaseSync(resolvedPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}
