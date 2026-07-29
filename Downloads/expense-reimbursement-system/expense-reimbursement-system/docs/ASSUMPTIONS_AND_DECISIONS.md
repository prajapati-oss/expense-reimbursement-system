# Assumptions, Design Decisions, and Improvements

## Assumptions

1. **Two roles, flat manager relationship.** Every `EMPLOYEE` has exactly one `MANAGER`
   (`User.manager_id`). A manager only sees/approves for their *direct* reports, not a
   transitive org chart (no "manager of managers" rollups). This matches the assignment's
   description ("Employees... Managers...") without over-building an HR hierarchy that wasn't
   asked for.
2. **One reimbursement request = one employee's expenses.** Requests aren't shared across
   employees. This matches "Employees submit expenses for reimbursement" as an individual action.
3. **Categories are a soft/open list**, not a hard enum. The seed script creates a sensible
   default set (Travel, Meals & Entertainment, Accommodation, etc.), but `POST /expenses` will
   create a new category on the fly if the name doesn't exist yet. I judged this closer to how
   real finance teams work (new spend categories come up) than a hardcoded enum that would need a
   migration to change. Trade-off: no server-side prevention of near-duplicate category names
   ("Travel" vs "travel " with a trailing space would currently create two rows — worth a
   normalization pass, noted below under Improvements).
4. **Multi-currency = one base currency for reporting.** The exercise says "employer and employee
   may be located in different countries" — I interpreted this as "employees enter expenses in
   their own currency, the company reports in one currency," rather than allowing every manager to
   have their own base currency. A single `BASE_CURRENCY` env var models a single legal
   entity/company. Supporting multiple base currencies per department/entity is a plausible real
   requirement but wasn't specified, so I didn't build it — see Improvements.
5. **Exchange rates are mocked**, via a static in-memory table (`src/services/currencyService.ts`)
   rather than calling a live FX API, so the whole project runs offline with zero external
   dependencies or API keys. The rate is still snapshotted per-expense at creation time exactly as
   a production system would with a live rate, so swapping in a real provider is a one-file change
   with no consumer-facing changes.
6. **A "reimbursement request" is auto-totaled and read-only once created**, aside from its
   status. The assignment doesn't mention editing a request after submission (only editing
   *expenses*, which are locked once part of a pending request) — so requests support submit,
   approve, reject, and view, not arbitrary editing.
7. **Receipts are a single file per expense**, stored on local disk under `uploads/`, validated by
   MIME type (PNG/JPEG/WEBP/PDF) and size (5MB cap). No OCR/parsing of receipt contents.
8. **Soft delete, not hard delete**, for expenses — "maintain an auditable history" reads as
   incompatible with permanently destroying rows a user has already created, so `DELETE
   /expenses/:id` sets `deleted_at` and hides the row from normal queries rather than removing it.
9. **JWT auth with two hardcoded roles** was chosen over session cookies or SSO/OAuth as the
   simplest thing that satisfies "employees" and "managers" as distinct actors, appropriate for
   an assignment-scoped API rather than a production auth system.

## Design decisions & trade-offs

| Decision | Why | Trade-off accepted |
|---|---|---|
| `node:sqlite` + hand-written repositories instead of an ORM | Zero native-binary installs, works in restricted-network environments, fully portable SQL for a later Postgres migration | More boilerplate per query; no auto-generated migrations or types from schema |
| Business rules live in the **service** layer, not the DB | Keeps rules (e.g. "only DRAFT is editable") in one readable place, testable without hitting the DB directly | Some invariants (e.g. "an expense belongs to exactly one open request") are enforced by application logic + status field rather than a DB constraint — acceptable here since all writes go through the service layer, no direct DB access is exposed |
| JSON snapshots in `AuditLog` rather than an event-sourced model | Simple, queryable per-entity history (`GET /expenses/:id/history`) without rebuilding state from an event stream | Reconstructing "what did the whole system look like at time T" across entities isn't directly supported — only per-entity history is |
| Rejecting a request **unlinks** its expenses (`reimbursement_request_id = null`) rather than leaving them permanently tied to a rejected request | Lets the employee actually act on rejection — edit and resubmit — which is clearly the intent of a reject workflow | The live foreign key no longer shows "this expense was once part of request X" — but that fact is fully preserved in `AuditLog.metadata.expenseIds` on the request's `CREATE` entry, so no audit data is lost, just not join-able as a live relation |
| Pagination everywhere (`page`/`limit`, capped at 100) | Prevents unbounded result sets on `GET /expenses` and `GET /reimbursement-requests` as data grows | Slightly more response envelope (`{ data, pagination }`) than a bare array |
| Manager-only reports scoped to **their own team**, not global | Matches "Managers should... view departmental summaries" as a manager acting within their own scope, and avoids building a separate "admin" role that wasn't requested | A VP wanting a cross-department rollup isn't supported without a further "admin"/multi-level role — see Improvements |

## Improvements I'd make with more time

- **Automated test suite.** This submission was verified with an extensive manual curl walkthrough
  (see `docs/API.md`) covering the happy path, RBAC denials, duplicate-submission and locked-edit
  guards, rejection-and-resubmit, and multi-currency conversion — but there's no `jest`/`vitest`
  suite. I'd add unit tests for the service layer (mocking repositories) and integration tests
  that spin up an in-memory SQLite DB per test file.
- **Real exchange-rate provider** with caching + a scheduled refresh, instead of the static table,
  plus a documented fallback if the provider is unreachable.
- **Admin/finance role** for true cross-department reporting, separate from line managers.
- **Multi-level approval chains** (e.g. amounts above a threshold need a second approver) — the
  current model is single-manager approve/reject, which covers the assignment's spec but not
  larger-org policies.
- **Object storage for receipts** (S3-compatible) with presigned upload URLs instead of local disk
  + `express.static`, and virus scanning on upload.
- **Category normalization** (case-insensitive, trimmed matching) to stop near-duplicate
  categories from accumulating.
- **Idempotency keys** on `POST /expenses` and `POST /reimbursement-requests` to make retried
  client requests safe (currently a network retry from the client could create two similar
  expenses — status-based duplicate prevention only covers the *submission* step, not the
  *creation* step).
- **Rate limiting** on `/api/auth/login` to slow down credential-stuffing attempts.
- **Structured logging + request IDs** (e.g. pino with a correlation ID per request) instead of
  `morgan`'s access log, to make production debugging and audit correlation easier.
- **OpenAPI/Swagger spec** generated from the Zod schemas, so `docs/API.md` doesn't need to be
  hand-maintained in parallel with the validators.
- **Soft-deleted-row cleanup policy** (e.g. a retention window before permanent purge) once legal/
  compliance requirements for how long deleted data must be kept are known.
