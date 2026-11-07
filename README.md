# LedgerLine

Safe money movement: double-entry ledger, idempotent requests, concurrency-safe transfers,
role-based access and an append-only audit trail.

## Run (Windows CMD)

1. Start PostgreSQL; make sure database `ledgerline_db` and its application user exist.
2. Backend:
   ```
   cd /d "%USERPROFILE%\Desktop\LedgerLine\backend\ledgerline"
   set "DB_PASSWORD=YOUR_DATABASE_PASSWORD"
   set "DB_USER=ledgerline_user"
   set "SEED_PASSWORD=ChangeMe123!"
   mvnw.cmd spring-boot:run
   ```
   (If you only copied `src` and `pom.xml` over your existing project, keep your own `mvnw.cmd`.)
   Flyway creates the schema; demo users `admin`, `alice`, `bob`, `auditor` are seeded on first start.
   Health: http://localhost:8080/api/health
3. Frontend (second window):
   ```
   cd /d "%USERPROFILE%\Desktop\LedgerLine\frontend"
   npm install
   npm run dev
   ```
   App: http://localhost:5173/

## Tests
`mvnw.cmd test` — needs Docker (Testcontainers starts a throwaway PostgreSQL).
Covers idempotent replay, overdraft rejection, ownership, auditor read-only,
50 concurrent withdrawals (exactly 10 succeed, never overdrawn), money conservation, append-only tables.

## API (HTTP Basic auth; amounts in cents)
| Method | Path | Roles |
|---|---|---|
| GET | /api/health | public |
| GET | /api/me | any |
| POST | /api/accounts `{ownerUsername,name}` | ADMIN |
| GET | /api/accounts | holder: own; admin/auditor: all |
| GET | /api/accounts/{id}/statement | owner, admin, auditor |
| POST | /api/accounts/{id}/deposit `{amount}` | ADMIN, owner |
| POST | /api/accounts/{id}/withdraw `{amount}` | ADMIN, owner |
| POST | /api/transfers `{fromAccountId,toAccountId,amount}` | ADMIN, owner of source |
| GET | /api/audit, /api/admin/conservation | ADMIN, AUDITOR |

Money-moving POSTs require an `Idempotency-Key` header. Re-sending the same key + body returns the
original result (`replayed:true`); same key with a different body returns 409.

Example:
```
curl -u alice:ChangeMe123! -X POST http://localhost:8080/api/transfers ^
  -H "Content-Type: application/json" -H "Idempotency-Key: t-001" ^
  -d "{\"fromAccountId\":2,\"toAccountId\":3,\"amount\":2500}"
```

## How the guarantees work
- **Double entry:** every transaction writes two entries (-x, +x); deposits/withdrawals use a system `CASH` account, so everything nets to zero.
- **No negative balances:** checked in the service under row locks, and enforced again by a DB CHECK constraint.
- **Idempotency:** unique `(user, key)` row claimed inside the same DB transaction.
- **Concurrency:** `SELECT ... FOR UPDATE` on both accounts, locked in id order (no deadlocks).
- **Append-only:** DB triggers reject UPDATE/DELETE on `ledger_entry`, `ledger_txn`, `audit_log`.
- **Access control:** Spring Security roles + per-account ownership checks.

## Status
Written but not executed in the authoring sandbox (no network for Maven/npm). Run the steps above and the test suite on your machine.
