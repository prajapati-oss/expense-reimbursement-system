-- Expense Reimbursement Platform - Data Model (SQLite dialect)
-- See docs/ARCHITECTURE.md for the ERD and design rationale.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'MANAGER')),
  department     TEXT NOT NULL,
  currency       TEXT NOT NULL,               -- employee's preferred entry currency, ISO 4217
  manager_id     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id                        TEXT PRIMARY KEY,
  employee_id               TEXT NOT NULL REFERENCES users(id),
  category_id               TEXT NOT NULL REFERENCES categories(id),
  description               TEXT NOT NULL,
  expense_date              TEXT NOT NULL,
  amount                    REAL NOT NULL CHECK (amount > 0),
  currency                  TEXT NOT NULL,
  exchange_rate_to_base     REAL NOT NULL,
  base_currency             TEXT NOT NULL,
  amount_base_currency      REAL NOT NULL,
  receipt_url               TEXT,
  status                    TEXT NOT NULL DEFAULT 'DRAFT'
                               CHECK (status IN ('DRAFT', 'SUBMITTED', 'REIMBURSED')),
  reimbursement_request_id  TEXT REFERENCES reimbursement_requests(id),
  deleted_at                TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_employee ON expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_request ON expenses(reimbursement_request_id);

CREATE TABLE IF NOT EXISTS reimbursement_requests (
  id                          TEXT PRIMARY KEY,
  employee_id                 TEXT NOT NULL REFERENCES users(id),
  status                      TEXT NOT NULL DEFAULT 'PENDING'
                                 CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  total_amount_base_currency  REAL NOT NULL,
  base_currency                TEXT NOT NULL,
  manager_comment              TEXT,
  reviewed_by                  TEXT REFERENCES users(id),
  reviewed_at                  TEXT,
  submitted_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_employee ON reimbursement_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON reimbursement_requests(status);

-- Append-only audit trail for every meaningful state change.
CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL,   -- 'Expense' | 'ReimbursementRequest' | 'User'
  entity_id       TEXT NOT NULL,
  action          TEXT NOT NULL,   -- 'CREATE' | 'UPDATE' | 'DELETE' | 'SUBMIT' | 'APPROVE' | 'REJECT' | ...
  performed_by    TEXT REFERENCES users(id),
  previous_state  TEXT,            -- JSON snapshot
  new_state       TEXT,            -- JSON snapshot
  metadata        TEXT,            -- JSON, free-form (e.g. { "reason": "..." })
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_performed_by ON audit_logs(performed_by);
