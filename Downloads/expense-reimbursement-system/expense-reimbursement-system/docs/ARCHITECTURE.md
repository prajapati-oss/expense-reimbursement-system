# Architecture Overview

## Layered structure

```
Route (Express Router)
  -> Middleware (authenticate, authorize, validate, upload)
  -> Controller (parse req -> call service -> shape res; no business logic)
  -> Service (business rules, authorization checks beyond role, workflow, audit logging)
  -> Repository (parameterized SQL, one file per entity, no business logic)
  -> node:sqlite
```

Each layer only talks to the one directly below it. Controllers never touch the database
directly; services never touch `req`/`res`. This keeps the business logic (e.g. "only DRAFT
expenses can be edited", "an expense can't be submitted twice") testable independent of HTTP, and
keeps the SQL centralized and reviewable in one place per entity.

## Data model / ERD

```
User (EMPLOYEE | MANAGER)
  ├─ 1:N ─ Expense               (employee_id)
  ├─ 1:N ─ ReimbursementRequest   (employee_id — the submitter)
  ├─ 1:N ─ ReimbursementRequest   (reviewed_by — the deciding manager)
  ├─ self 1:N ─ User               (manager_id — employees report to a manager)
  └─ 1:N ─ AuditLog                (performed_by)

Category
  └─ 1:N ─ Expense                (category_id)

Expense
  ├─ N:1 ─ User (employee)
  ├─ N:1 ─ Category
  └─ N:1 ─ ReimbursementRequest    (reimbursement_request_id, nullable until submitted)

ReimbursementRequest
  ├─ N:1 ─ User (employee, the submitter)
  ├─ N:1 ─ User (reviewedBy, nullable until decided)
  └─ 1:N ─ Expense                 (the bundled expenses)

AuditLog (append-only)
  ├─ entity_type + entity_id       (polymorphic reference to Expense / ReimbursementRequest / User)
  ├─ action                         (CREATE, UPDATE, DELETE, SUBMIT, APPROVE, REJECTED, ATTACH_RECEIPT, ...)
  └─ previous_state / new_state    (JSON snapshots)
```

Full DDL: [`src/db/schema.sql`](../src/db/schema.sql).

### Key design choices baked into the schema

- **Exchange rate snapshotting.** `Expense.exchange_rate_to_base` and `amount_base_currency` are
  computed and stored once, at creation (and re-computed if the employee edits amount/currency
  while still in `DRAFT`). This means historical expenses and approved totals never silently
  change if the mock/live FX table is updated later — a real-world requirement for financial
  auditability.
- **Duplicate reimbursement prevention** is enforced at two levels: the `Expense.status` state
  machine (`DRAFT → SUBMITTED → REIMBURSED`, only `DRAFT` is submittable) and an explicit check in
  `requestService.submitRequest` that rejects any expense not currently `DRAFT` with `409
  Conflict`. There's deliberately no unique constraint solely on "one open request per expense" at
  the DB level beyond the status check, because the status machine already makes a second
  submission impossible without an explicit status transition.
- **Soft deletes on Expense** (`deleted_at`) instead of hard deletes, so the audit trail is never
  broken by a delete — the row (and its full history in `AuditLog`) survives, just filtered out of
  normal queries.
- **Append-only AuditLog.** Every service-layer mutation writes an entry with a JSON snapshot of
  previous/new state. This is what satisfies "auditable history of expenses, requests and
  approvals" as a first-class concern rather than something bolted on with a generic "updated_at"
  column.
- **Rejection releases the expense's FK back to `DRAFT`** so it becomes editable and
  resubmittable, rather than staying permanently tied to a dead request. The original association
  is still fully recoverable via `AuditLog` (the request's `CREATE` entry stores the original
  `expenseIds` in `metadata`), so nothing is lost for compliance purposes — see
  `docs/ASSUMPTIONS_AND_DECISIONS.md`.

## Why not an ORM (Prisma/TypeORM/Sequelize)?

This was a pragmatic call for this submission, not a claim that raw SQL is generally preferable:

- Prisma's `generate` step downloads a native query-engine binary at install time. In a sandboxed
  or restricted-network environment (like the one this was built in, and plausibly some CI/review
  environments) that download can be blocked, which breaks `npm install` entirely.
- Node 22 ships `node:sqlite` built in — no native compilation, no download, works identically on
  any machine with a recent Node version.
- The trade-off: no auto-migrations, no generated types from schema, and hand-written SQL is more
  verbose and more error-prone than an ORM for larger schemas. For a schema this size (5 tables)
  it's a wash in practice, and it makes the actual SQL fully visible and reviewable per query,
  which is arguably good for an assignment meant to demonstrate data-model reasoning.
- The SQL schema is intentionally portable (see README "Switching to PostgreSQL") so this decision
  isn't a dead end for production use.

## Authentication & authorization

- Stateless JWT (`Authorization: Bearer <token>`), signed with `JWT_SECRET`, containing `sub`
  (user id), `role`, `email`.
- Two roles: `EMPLOYEE` and `MANAGER`. Role gating happens at the route level
  (`authorize('EMPLOYEE')` / `authorize('MANAGER')`); finer-grained ownership checks (e.g. "this
  expense belongs to you" or "this employee reports to you") happen in the service layer, because
  they require a DB lookup that doesn't belong in route middleware.
- A manager can only see/act on their **direct reports** (`User.manager_id`), not an entire
  department transitively. See assumptions doc for the reasoning and what a real multi-level org
  chart would need.

## Multi-currency handling

- Every user has a `currency` (their preferred entry currency). Every expense is entered in
  whatever currency the employee chooses (defaults to nothing enforced — the field is required
  per-expense so a US employee could still log a EUR conference fee).
- A single company-wide `BASE_CURRENCY` (env var, default `USD`) is the reporting currency.
  `currencyService.ts` is a small, isolated module exposing `getExchangeRate()` / `convert()`
  backed by a static rate table — swapping in a real FX API (e.g. exchangerate.host) means editing
  one file, nothing upstream changes.
- All manager-facing aggregates (departmental summary, approved reimbursement totals) sum
  `amountBaseCurrency`, never raw `amount`, so a report is never a nonsensical sum of USD + INR +
  EUR figures.

## Error handling

Centralized `errorHandler` middleware (`src/middleware/errorHandler.ts`) catches:
- `ZodError` → `400` with field-level validation details
- Typed `ApiError` subclasses (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`,
  `NotFoundError`, `ConflictError`) thrown anywhere in services/controllers → mapped to the right
  HTTP status
- Anything else → logged server-side, `500` with a generic message (no stack traces leaked to
  clients)

`express-async-errors` is used so `async` route handlers that throw don't need manual
`try/catch` + `next(err)` boilerplate in every controller.

## Receipts

Stored on local disk (`uploads/`), served statically at `/uploads/<filename>`, validated for MIME
type and capped at 5MB. In production this would move to object storage (S3/GCS) with
presigned upload/download URLs instead of local disk + static serving — see assumptions doc.
