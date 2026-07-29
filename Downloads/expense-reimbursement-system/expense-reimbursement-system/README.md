# Expense Reimbursement Platform

A backend service for recording expenses, attaching receipts, and running them through a
manager approval workflow, with multi-currency support and a full audit trail.

This README covers setup. See also:
- [`docs/API.md`](docs/API.md) — full API reference
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, data model, ERD
- [`docs/ASSUMPTIONS_AND_DECISIONS.md`](docs/ASSUMPTIONS_AND_DECISIONS.md) — assumptions, trade-offs, and what I'd do next with more time

## Tech stack

- **Node.js 22 + TypeScript + Express**
- **`node:sqlite`** (Node's built-in SQLite driver) as the persistence layer, accessed through a
  small hand-written repository layer (raw parameterized SQL, no ORM)
- **JWT** for authentication, **bcrypt** for password hashing
- **Zod** for request validation
- **Multer** for receipt file uploads

> **Why not Prisma/Postgres?** See "Why not an ORM" in `docs/ARCHITECTURE.md`. Short version:
> this keeps `npm install && npm run dev` working with zero native binary downloads or external
> database setup, while keeping the SQL schema (`src/db/schema.sql`) fully Postgres-compatible if
> you want to point this at a real database later.

## Prerequisites

- Node.js **>= 22.5** (needed for `node:sqlite`). Check with `node -v`.
- No database server, Docker, or external services required — the app is fully self-contained.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env
# (defaults work out of the box; edit JWT_SECRET before any real deployment)

# 3. Seed the database with demo accounts + expense categories
npm run seed

# 4. Start the dev server (auto-reloads on file changes)
npm run dev
```

The API is now running at `http://localhost:4000`. Try:

```bash
curl http://localhost:4000/health
```

### Demo accounts (created by `npm run seed`)

| Email                | Password       | Role     | Currency | Notes                          |
|-----------------------|----------------|----------|----------|---------------------------------|
| manager@acme.test     | Password123!   | MANAGER  | USD      | Manages both employees below    |
| alex@acme.test        | Password123!   | EMPLOYEE | USD      | Reports to Morgan               |
| priya@acme.test       | Password123!   | EMPLOYEE | INR      | Reports to Morgan (multi-currency demo) |

Log in to get a JWT:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@acme.test","password":"Password123!"}'
```

Use the returned `token` as `Authorization: Bearer <token>` on subsequent requests.

### Production build

```bash
npm run build   # compiles TypeScript to dist/ and copies the SQL schema alongside it
npm start        # runs the compiled server from dist/
```

### Running tests / a full manual walkthrough

There's no automated test suite in this submission (see "Improvements" in
`docs/ASSUMPTIONS_AND_DECISIONS.md`), but `docs/API.md` includes a curl-based walkthrough of the
entire employee → manager workflow that you can paste directly into a terminal against a freshly
seeded database.

### Switching to PostgreSQL for production

The schema in `src/db/schema.sql` uses only portable SQL (no SQLite-specific types beyond `TEXT`
for timestamps). To run on Postgres:
1. Swap `src/db/client.ts` for a Postgres client (e.g. `pg` or `postgres.js`) and adjust the
   repository layer's parameter placeholders (`?` → `$1, $2, ...`).
2. Add `SERIAL`/`TIMESTAMPTZ` equivalents if you want native types instead of `TEXT` UUID/date
   columns (both work fine as `TEXT` on Postgres too — it's a style choice, not a blocker).
3. `CHECK` constraints and indexes translate as-is.

## Project layout

```
src/
  app.ts               Express app wiring (middleware, routes)
  index.ts              Entrypoint: runs migrations, starts the HTTP server
  db/
    schema.sql          Canonical data model (DDL)
    client.ts            node:sqlite connection + migration runner
    seed.ts               Demo data script
  repositories/          Raw SQL data access, one file per entity
  services/               Business logic (validation rules, workflow, authorization)
  controllers/            Thin HTTP layer: parse request -> call service -> shape response
  routes/                  Express routers, wired to middleware + controllers
  middleware/              auth (JWT + roles), validation (Zod), error handling, file upload
  validators/               Zod schemas per resource
  utils/                     JWT, password hashing, typed API errors
uploads/                 Uploaded receipt files (local disk storage)
docs/                     API.md, ARCHITECTURE.md, ASSUMPTIONS_AND_DECISIONS.md
```

## License

MIT — this is a take-home assignment submission.
