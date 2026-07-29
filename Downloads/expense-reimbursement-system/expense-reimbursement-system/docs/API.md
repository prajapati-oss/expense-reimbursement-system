# API Documentation

Base URL: `http://localhost:4000/api` (health check is at `/health`, not under `/api`).

All authenticated endpoints require:
```
Authorization: Bearer <jwt>
```

All request/response bodies are JSON unless noted (receipt upload is `multipart/form-data`).

Errors follow a consistent shape:
```json
{ "error": { "message": "Human-readable message", "details": [ /* optional, e.g. validation issues */ ] } }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation failure |
| 401 | Missing/invalid/expired token, or bad credentials |
| 403 | Authenticated but not allowed to perform this action |
| 404 | Resource not found (or not visible to this user) |
| 409 | Conflict — e.g. duplicate reimbursement submission, already-reviewed request |
| 500 | Unexpected server error |

---

## Auth

### `POST /api/auth/register`
Create a new account. Employees must supply `managerId` (must reference an existing user with
role `MANAGER`); managers do not need one.

```json
// request
{
  "name": "Alex Chen",
  "email": "alex@acme.test",
  "password": "Password123!",
  "role": "EMPLOYEE",
  "department": "Engineering",
  "currency": "USD",
  "managerId": "uuid-of-a-manager"
}
```
Returns `201` with `{ "user": {...}, "token": "..." }`.

### `POST /api/auth/login`
```json
{ "email": "alex@acme.test", "password": "Password123!" }
```
Returns `200` with `{ "user": {...}, "token": "..." }`.

### `GET /api/auth/me`
Returns the authenticated user's profile.

---

## Categories

### `GET /api/categories`
Returns all expense categories (seeded defaults: Travel, Meals & Entertainment, Accommodation,
Office Supplies, Software & Subscriptions, Client Entertainment, Training & Education, Other).
Categories are also auto-created on the fly if an expense references a new one, so this list is
informative rather than a hard whitelist — see `docs/ASSUMPTIONS_AND_DECISIONS.md`.

---

## Expenses

Expenses move through a simple lifecycle: `DRAFT → SUBMITTED → REIMBURSED`, or
`SUBMITTED → DRAFT` again if a manager rejects the request it was part of. Only `DRAFT` expenses
can be edited, deleted, or have a receipt attached — once submitted they're locked, and audit
trail history is always available regardless of state.

### `POST /api/expenses` — EMPLOYEE only
```json
{
  "category": "Travel",
  "description": "Flight to client site",
  "expenseDate": "2026-07-01",
  "amount": 450.50,
  "currency": "USD"
}
```
Amount/currency are as entered by the employee. The server snapshots the exchange rate to the
company base currency (`BASE_CURRENCY` env var, default `USD`) at creation time and stores
`amountBaseCurrency` alongside the original. Returns `201` with the created expense.

### `GET /api/expenses` — filtering & search
Query params (all optional, all combinable):

| Param | Description |
|-------|-------------|
| `status` | `DRAFT` \| `SUBMITTED` \| `REIMBURSED` |
| `category` | category name |
| `fromDate` / `toDate` | ISO date bounds on `expenseDate` |
| `currency` | original entry currency, e.g. `INR` |
| `search` | substring match against `description` |
| `employeeId` | **manager only** — scope to one direct report (defaults to the manager's whole team + self) |
| `page`, `limit` | pagination (default `page=1`, `limit=20`, max `100`) |

Employees always see only their own expenses. Managers see their own + their direct reports' by
default. Returns `{ "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }`.

### `GET /api/expenses/:id`
Returns one expense. Visible to its owner or their manager.

### `PATCH /api/expenses/:id` — EMPLOYEE, owner only, DRAFT only
Partial update — any subset of `category`, `description`, `expenseDate`, `amount`, `currency`.
Changing amount/currency re-snapshots the exchange rate.

### `DELETE /api/expenses/:id` — EMPLOYEE, owner only, DRAFT only
Soft delete (the row and its audit history are preserved, just hidden from normal views).
Returns `204`.

### `POST /api/expenses/:id/receipt` — EMPLOYEE, owner only, DRAFT only
`multipart/form-data` with a single field `receipt` (PNG/JPEG/WEBP/PDF, max 5MB). Returns the
updated expense with `receiptUrl` set (served statically at `/uploads/<file>`).

### `GET /api/expenses/:id/history`
Returns the full audit log for this expense (create, edits, submit, receipt attach, delete).

---

## Reimbursement Requests

A request bundles one or more of the employee's own `DRAFT` expenses. Submitting locks those
expenses (`SUBMITTED`) and prevents them from being included in any other request — this is the
duplicate-reimbursement guard. A manager then approves (→ expenses become `REIMBURSED`) or
rejects (→ expenses return to `DRAFT`, editable and resubmittable) the whole request.

### `POST /api/reimbursement-requests` — EMPLOYEE only
```json
{ "expenseIds": ["uuid-1", "uuid-2"] }
```
Validation:
- All IDs must exist, belong to the caller, and currently be `DRAFT` — otherwise `409 Conflict`
  (this is what stops the same expense being reimbursed twice).
- Duplicate IDs in the same array are rejected.

Returns `201` with the created request (status `PENDING`) including its nested expenses and a
`totalAmountBaseCurrency` computed by summing each expense's base-currency snapshot.

### `GET /api/reimbursement-requests`
Query params: `status`, `employeeId` (manager only), `page`, `limit`. Same visibility rules as
expenses (employee sees own; manager sees team + self by default).

### `GET /api/reimbursement-requests/:id`
Full detail including nested expense list and employee info.

### `POST /api/reimbursement-requests/:id/approve` — MANAGER only
Manager must directly manage the requesting employee. Request must currently be `PENDING`
(re-approving an already-decided request returns `409`).
```json
{ "comment": "Looks good, approved." }
```

### `POST /api/reimbursement-requests/:id/reject` — MANAGER only
Same shape as approve; sets status to `REJECTED` and reverts the attached expenses to `DRAFT`.

### `GET /api/reimbursement-requests/:id/history`
Full audit trail for the request (submission with the original expense IDs, and the eventual
approve/reject decision with the manager's comment).

---

## Reports (MANAGER only)

### `GET /api/reports/department-summary?fromDate=&toDate=`
Aggregates **approved/reimbursed** expenses across the manager's team (self + direct reports),
in the company base currency:
```json
{
  "baseCurrency": "USD",
  "totalApproved": 570.5,
  "byCategory": [ { "category": "Travel", "total": 450.5, "count": 1 }, ... ],
  "byEmployee": [ { "employeeId": "...", "employeeName": "Alex Chen", "total": 570.5, "count": 2 } ]
}
```

### `GET /api/reports/approved-reimbursements?page=&limit=`
Paginated list of approved reimbursement requests across the manager's team, most recently
reviewed first.

---

## End-to-end curl walkthrough

Run `npm run seed` first, then:

```bash
BASE=http://localhost:4000/api

# Log in
EMP=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alex@acme.test","password":"Password123!"}' | jq -r .token)
MGR=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"manager@acme.test","password":"Password123!"}' | jq -r .token)

# Employee records two expenses
E1=$(curl -s -X POST $BASE/expenses -H "Authorization: Bearer $EMP" -H 'Content-Type: application/json' \
  -d '{"category":"Travel","description":"Flight","expenseDate":"2026-07-01","amount":450.5,"currency":"USD"}' | jq -r .id)
E2=$(curl -s -X POST $BASE/expenses -H "Authorization: Bearer $EMP" -H 'Content-Type: application/json' \
  -d '{"category":"Meals & Entertainment","description":"Client dinner","expenseDate":"2026-07-02","amount":120,"currency":"USD"}' | jq -r .id)

# Submit them together
REQ=$(curl -s -X POST $BASE/reimbursement-requests -H "Authorization: Bearer $EMP" -H 'Content-Type: application/json' \
  -d "{\"expenseIds\":[\"$E1\",\"$E2\"]}" | jq -r .id)

# Manager approves
curl -s -X POST $BASE/reimbursement-requests/$REQ/approve -H "Authorization: Bearer $MGR" \
  -H 'Content-Type: application/json' -d '{"comment":"Approved"}'

# Manager checks the departmental summary
curl -s $BASE/reports/department-summary -H "Authorization: Bearer $MGR"
```
