# Cogito Backend Refactoring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Cogito backend to fix critical bugs, enforce clean architecture, eliminate hardcoded values, add type safety, add resilience patterns (retry, circuit breaker, timeouts), harden security, and prepare for Phase 0 launch.

**Architecture:** The existing 5-layer pattern (Router → Handler → Service → Repository → Port) is correct in intent but violated in practice. This plan enforces the pattern consistently, fixes race conditions, extracts business logic from handlers into services, creates type-safe enums, adds missing infrastructure (scheduler, email, CI), and introduces resilience patterns (retry with backoff, circuit breaker, request timeouts, structured logging, error reporting).

**Tech Stack:** Bun · Elysia · oRPC · Drizzle ORM · PostgreSQL · Better Auth · Zod · BullMQ (new) · Resend (new) · Google Workspace API (new) · Sentry (new)

---

## Concerns Addressed

### Critical Bugs

- 🔴 Knowledge Bank threshold is 500, PRD requires 35
- 🔴 Hardcoded port 3001 in production entry point
- 🔴 Wallet race condition (read-then-write without row locking)

### Architecture Violations

- 🟡 Every handler calls repo directly, bypassing service layer
- 🟡 Booking module has no repo layer (1208-line god service with inline SQL)
- 🟡 Wallet router contains direct DB queries
- 🟡 Wallet handler bypasses its own service's validation

### Type Safety

- 🟡 ~20+ string literal comparisons without enums/const objects
- 🟡 ~15+ magic numbers without named constants

### Missing Infrastructure

- 🟡 No booking expiry scheduler
- 🟡 No email provider for critical notifications
- 🟡 No Google Meet provider (only manual/pending fallback)
- 🟡 No CI/CD pipeline
- 🟡 No rate limiting
- 🟡 No admin override endpoints
- 🟡 No refund/correction flow

### Security

- 🟡 No rate limiting on auth or payment endpoints
- 🟡 Wallet operations not atomic (race condition)
- 🟡 Xendit provider hardcodes EWALLET/OVO channel only
- 🔴 No timeouts on external API calls (Xendit can hang indefinitely)
- 🔴 Stub checkout endpoint is unauthenticated (anyone can mark payments PAID)
- 🔴 Webhook handler swallows all errors as 401 (makes debugging impossible)
- 🟡 No CSRF protection on state-changing requests
- 🟡 No security headers (CSP, X-Frame-Options, etc.)
- 🟡 No request body size limits
- 🟡 No webhook replay protection (timestamp/nonce validation)
- 🟡 No booking idempotency (client retries create duplicates)

### Resilience & Reliability

- 🔴 Zero retry logic anywhere in the codebase
- 🔴 No circuit breaker for external services (Xendit, future Google Meet)
- 🔴 No timeouts on any fetch call, DB query, or transaction
- 🟡 DB connection pool uses defaults (no max, timeout, SSL config)
- 🟡 No DB connection retry at startup (server crashes if DB is temporarily unavailable)
- 🟡 No booking optimistic locking (concurrent state transitions unprotected)
- 🟡 Notification dispatch is synchronous inside booking transactions (blocks the flow)
- 🟡 No dead-letter queue for failed webhook processing

### Observability

- 🔴 No error reporting (no Sentry, Datadog, or APM)
- 🟡 No structured logging (console.error only)
- 🟡 No request ID / trace ID for correlation
- 🟡 No unhandled rejection handler
- 🟡 Health check only pings DB (no external dependency checks)

### Maintainability

- 🟡 Dead code in wallet.service.ts (unused validation functions)
- 🟡 No centralized constants/enums file
- 🟡 No request timing or metrics
- 🟡 Missing error factories (internalServerError, serviceUnavailable, rateLimited)

---

## File Structure (New & Modified)

### New Files

```
packages/api/src/
  shared/
    constants.ts                    → REPLACE existing (expand with all enums/constants)
    ports/
      scheduler.port.ts             → NEW: job scheduler interface
      email.port.ts                 → NEW: email provider interface
  lib/
    retry.ts                        → NEW: retryWithBackoff + fetchWithTimeout
    circuit-breaker.ts              → NEW: CircuitBreaker class
    request-id.ts                  → NEW: request ID generation
    logger.ts                      → NEW: structured JSON logger
    security-headers.ts            → NEW: security headers middleware
    webhook-idempotency.ts         → NEW: in-memory webhook dedup
    idempotency.ts                 → NEW: booking idempotency utility
    db-health.ts                   → NEW: deep health check utility
    metrics.ts                     → NEW: request timing metrics
  modules/
    wallet/
      wallet.handler.ts             → DELETE (logic moved to service)
      wallet.service.ts             → REWRITE (absorb handler logic, add atomic ops)
    booking/
      booking.repo.ts               → NEW: extract all Drizzle queries
    admin-booking/
      admin-booking.handler.ts      → NEW: admin override endpoints
      admin-booking.service.ts      → NEW: override business logic
      admin-booking.repo.ts         → NEW: admin booking queries
      admin-booking.router.ts       → NEW: admin booking routes
      admin-booking.types.ts        → NEW: admin booking input schemas
    refund/
      refund.handler.ts             → NEW: refund/correction orchestration
      refund.service.ts             → NEW: refund business logic
      refund.repo.ts                → NEW: refund data access
      refund.router.ts              → NEW: refund routes
      refund.types.ts               → NEW: refund input schemas
    meeting/
      google-meeting.provider.ts    → NEW: Google Calendar/Meet integration
    email/
      email.service.ts              → NEW: email orchestration
      resend-email.provider.ts      → NEW: Resend implementation
      stub-email.provider.ts        → NEW: dev email provider
    notification/
      notification.handler.ts      → NEW: handler for client endpoints
      notification.router.ts        → NEW: router for notification endpoints
    scheduler/
      scheduler.service.ts          → NEW: BullMQ job scheduler
      jobs/
        expire-bookings.job.ts      → NEW: booking expiry job
        release-holds.job.ts        → NEW: hold release job
        send-emails.job.ts          → NEW: email dispatch job
  tests/
    integration/
      wallet-concurrency.test.ts    → NEW: race condition tests
      admin-override.test.ts        → NEW: admin override tests
      refund.test.ts               → NEW: refund flow tests
      booking-idempotency.test.ts   → NEW: idempotency tests
      webhook-hardening.test.ts     → NEW: webhook security tests
    unit/
      retry.test.ts                → NEW: retry utility tests
      circuit-breaker.test.ts       → NEW: circuit breaker tests
      webhook-idempotency.test.ts   → NEW: webhook dedup tests

packages/env/src/
  server.ts                         → MODIFY (add PORT, SCHEDULER, EMAIL, SENTRY vars)

packages/db/src/schema/
  booking.ts                        → MODIFY (add version column)

packages/db/src/migrations/
  0001_add_missing_indexes.sql      → NEW
  0002_booking_version.sql          → NEW

apps/server/src/
  index.ts                          → MODIFY (use env.PORT, DB retry, unhandled rejection)
  routes.ts                         → MODIFY (add rate limiting, security headers, request ID, body limit)
  scheduler.ts                      → NEW: initialize BullMQ scheduler
```

### Modified Files

```
packages/api/src/shared/constants.ts               → EXPAND with all enums
packages/api/src/modules/wallet/wallet.repo.ts      → ADD atomic update methods
packages/api/src/modules/wallet/wallet.handler.ts   → SIMPLIFY (delegate to service)
packages/api/src/modules/wallet/wallet.service.ts   → EXPAND (absorb handler logic)
packages/api/src/modules/wallet/wallet.router.ts    → REMOVE inline DB query
packages/api/src/modules/booking/booking.service.ts → EXTRACT queries to repo
packages/api/src/services.ts                        → ADD new services to registry
packages/api/src/routers.ts                         → ADD new routers
packages/api/src/context.ts                          → NO CHANGE (services injected)
packages/api/src/procedures.ts                      → ADD rateLimit middleware
packages/auth/src/index.ts                          → CONFIGURABLE session maxAge
packages/env/src/server.ts                          → ADD new env vars
apps/server/src/index.ts                            → USE env.PORT, env vars
apps/server/src/seed.ts                             → USE constants
.github/workflows/ci.yml                            → NEW: CI pipeline
```

---

## Task Breakdown

### Phase 1: Critical Fixes (P0)

These are bugs and security issues that must be fixed before any feature work.

---

### Task 1: Fix Knowledge Bank Threshold

**Files:**

- Modify: `packages/api/src/modules/wallet/wallet.handler.ts`
- Modify: `packages/api/src/shared/constants.ts`
- Modify: `packages/api/src/tests/integration/knowledge-bank.test.ts`

- [ ] **Step 1: Add KNOWLEDGE_BANK_THRESHOLD constant**

In `packages/api/src/shared/constants.ts`, add:

```ts
export const KNOWLEDGE_BANK_THRESHOLD = 35;
```

- [ ] **Step 2: Update wallet handler to use the constant**

In `packages/api/src/modules/wallet/wallet.handler.ts`, replace line 233:

```ts
// Before:
const threshold = 500;

// After:
import { KNOWLEDGE_BANK_THRESHOLD } from "../../shared/constants";
// ...
const threshold = KNOWLEDGE_BANK_THRESHOLD;
```

- [ ] **Step 3: Update the test to use the correct threshold**

In `packages/api/src/tests/integration/knowledge-bank.test.ts`, change line 29:

```ts
// Before:
expect(result.threshold).toBe(500);

// After:
import { KNOWLEDGE_BANK_THRESHOLD } from "../../shared/constants";
// ...
expect(result.threshold).toBe(KNOWLEDGE_BANK_THRESHOLD);
```

And change line 15 description:

```ts
// Before:
test("TC-32: eligible when >=500 total, no ledger entry on check", async () => {

// After:
test("TC-32: eligible when >=35 total, no ledger entry on check", async () => {
```

- [ ] **Step 4: Run the test to verify**

```bash
bun test:api -- --test-name-pattern "Knowledge Bank"
```

Expected: All tests pass with threshold = 35.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/constants.ts packages/api/src/modules/wallet/wallet.handler.ts packages/api/src/tests/integration/knowledge-bank.test.ts
git commit -m "fix: set Knowledge Bank threshold to 35 per PRD (was 500)"
```

---

### Task 2: Fix Hardcoded Port and URL in Server Entry Point

**Files:**

- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Add PORT to env validation**

In `packages/env/src/server.ts`, add `PORT` to the server env schema:

```ts
PORT: z.coerce.number().default(3001),
```

- [ ] **Step 2: Update server entry point to use env**

In `apps/server/src/index.ts`, replace:

```ts
// Before:
const server = app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001");
});

// After:
import { env } from "@cogito-app/env/server";

const port = env.PORT;
const server = app.listen(port, () => {
  console.log(`Server is running on ${env.BETTER_AUTH_URL}`);
});
```

- [ ] **Step 3: Update .env.example**

In `apps/server/.env.example`, add:

```env
# Server
PORT=3001
```

- [ ] **Step 4: Verify server starts**

```bash
bun run dev:server
```

Expected: Server logs use the env-configured URL.

- [ ] **Step 5: Commit**

```bash
git add packages/env/src/server.ts apps/server/src/index.ts apps/server/.env.example
git commit -m "fix: use env.PORT and env.BETTER_AUTH_URL instead of hardcoded values"
```

---

### Task 3: Fix Wallet Race Condition with Atomic Updates

**Files:**

- Modify: `packages/api/src/modules/wallet/wallet.repo.ts`
- Modify: `packages/api/src/modules/wallet/wallet.service.ts`
- Modify: `packages/api/src/modules/wallet/wallet.handler.ts`
- Create: `packages/api/src/tests/integration/wallet-concurrency.test.ts`

This is the most critical fix. The current pattern reads the wallet, calculates new balances in JS, then writes — creating a race condition under concurrent requests. We will switch to atomic SQL arithmetic (`SET available_balance = available_balance - $1`) and use the wallet balance invariant constraint for validation.

- [ ] **Step 1: Add atomic update methods to wallet repo**

In `packages/api/src/modules/wallet/wallet.repo.ts`, add these methods inside `createWalletRepo`:

```ts
async function atomicHold(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      heldBalance: sql`${wallet.heldBalance} + ${amount}`,
      availableBalance: sql`${wallet.availableBalance} - ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

async function atomicRelease(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      heldBalance: sql`GREATEST(${wallet.heldBalance} - ${amount}, 0)`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

async function atomicDeduct(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      heldBalance: sql`GREATEST(${wallet.heldBalance} - ${amount}, 0)`,
      totalBalance: sql`${wallet.totalBalance} - ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

async function atomicCredit(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      totalBalance: sql`${wallet.totalBalance} + ${amount}`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

async function atomicCompensateCredit(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      totalBalance: sql`${wallet.totalBalance} + ${amount}`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

async function atomicCompensateDeduct(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      totalBalance: sql`${wallet.totalBalance} - ${amount}`,
      availableBalance: sql`${wallet.availableBalance} - ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}
```

Add `sql` to the import from `drizzle-orm` at the top of the file. Add all these methods to the returned object.

- [ ] **Step 2: Rewrite wallet service to contain all business logic**

Replace `packages/api/src/modules/wallet/wallet.service.ts` entirely. The service becomes the single place for wallet business logic:

```ts
import { notFound, badRequest } from "../../lib/errors";
import { KNOWLEDGE_BANK_THRESHOLD } from "../../shared/constants";
import type { DbOrTx } from "../../lib/tx";
import type { WalletRepo } from "./wallet.repo";
import type {
  WalletPort,
  WalletSnapshot,
  HoldParams,
  ReleaseParams,
  DeductParams,
  CreditParams,
  CompensateParams,
  LedgerQueryOptions,
} from "../../shared/ports/wallet.port";

export type WalletService = ReturnType<typeof createWalletService>;

export function createWalletService(repo: WalletRepo): WalletPort {
  async function getById(
    conn: DbOrTx,
    walletId: string,
  ): Promise<WalletSnapshot | null> {
    return repo.getById(conn, walletId);
  }

  async function getByUserId(
    conn: DbOrTx,
    userId: string,
  ): Promise<WalletSnapshot | null> {
    return repo.getByUserId(conn, userId);
  }

  async function getOrCreate(userId: string): Promise<WalletSnapshot> {
    return repo.getOrCreate(userId);
  }

  async function hold(
    conn: DbOrTx,
    params: HoldParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    if (w.availableBalance < params.amount) {
      throw badRequest("Insufficient available balance");
    }
    const updated = await repo.atomicHold(conn, params.walletId, params.amount);
    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "hold",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: updated.totalBalance,
      balanceAfterTotal: updated.totalBalance,
      balanceAfterHeld: updated.heldBalance,
      bookingId: params.bookingId,
    });
    return updated;
  }

  async function release(
    conn: DbOrTx,
    params: ReleaseParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated = await repo.atomicRelease(
      conn,
      params.walletId,
      params.amount,
    );
    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "release",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: updated.totalBalance,
      balanceAfterTotal: updated.totalBalance,
      balanceAfterHeld: updated.heldBalance,
      bookingId: params.bookingId,
    });
    return updated;
  }

  async function deduct(
    conn: DbOrTx,
    params: DeductParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated = await repo.atomicDeduct(
      conn,
      params.walletId,
      params.amount,
    );
    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "deduct",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: updated.totalBalance,
      balanceAfterTotal: updated.totalBalance,
      balanceAfterHeld: updated.heldBalance,
      bookingId: params.bookingId,
    });
    return updated;
  }

  async function credit(
    conn: DbOrTx,
    params: CreditParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated = await repo.atomicCredit(
      conn,
      params.walletId,
      params.amount,
    );
    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "credit",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: updated.totalBalance,
      balanceAfterTotal: updated.totalBalance,
      balanceAfterHeld: updated.heldBalance,
      bookingId: params.bookingId,
    });
    return updated;
  }

  async function compensate(
    conn: DbOrTx,
    params: CompensateParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated =
      params.type === "compensate_credit"
        ? await repo.atomicCompensateCredit(
            conn,
            params.walletId,
            params.amount,
          )
        : await repo.atomicCompensateDeduct(
            conn,
            params.walletId,
            params.amount,
          );
    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: params.type,
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: updated.totalBalance,
      balanceAfterTotal: updated.totalBalance,
      balanceAfterHeld: updated.heldBalance,
      bookingId: params.bookingId,
    });
    return updated;
  }

  async function listLedger(walletId: string, opts?: LedgerQueryOptions) {
    return repo.listLedger(repo, walletId, opts);
  }

  async function knowledgeBankEligible(userId: string) {
    const w = await repo.getByUserId(repo, userId);
    if (!w) {
      return {
        eligible: false,
        balance: 0,
        threshold: KNOWLEDGE_BANK_THRESHOLD,
      };
    }
    return {
      eligible: w.availableBalance >= KNOWLEDGE_BANK_THRESHOLD,
      balance: w.availableBalance,
      threshold: KNOWLEDGE_BANK_THRESHOLD,
    };
  }

  return {
    hold,
    release,
    deduct,
    credit,
    compensate,
    getById,
    getByUserId,
    getOrCreate,
    listLedger,
    knowledgeBankEligible,
  };
}
```

- [ ] **Step 3: Delete wallet.handler.ts**

The handler is now dead code. All logic lives in the service. Delete `packages/api/src/modules/wallet/wallet.handler.ts`.

- [ ] **Step 4: Update services.ts to wire wallet service correctly**

In `packages/api/src/services.ts`, change the wallet wiring:

```ts
// Before:
import { createWalletHandler } from "./modules/wallet/wallet.handler";
// ...
const wallet = createWalletHandler(createWalletRepo(db), db);

// After:
import { createWalletService } from "./modules/wallet/wallet.service";
import { createWalletRepo } from "./modules/wallet/wallet.repo";
// ...
const walletRepo = createWalletRepo(db);
const wallet = createWalletService(walletRepo);
```

Update the `ServiceRegistry` type to use `WalletService` instead of `WalletHandler`.

- [ ] **Step 5: Fix listLedger and knowledgeBankEligible to accept DbOrTx**

The `listLedger` and `knowledgeBankEligible` methods currently use the `db` singleton. Change them to accept `conn: DbOrTx` as the first parameter for consistency, and update callers in `wallet.router.ts`.

In `wallet.service.ts`, change `listLedger`:

```ts
async function listLedger(
  conn: DbOrTx,
  walletId: string,
  opts?: LedgerQueryOptions,
) {
  return repo.listLedger(conn, walletId, opts);
}
```

And `knowledgeBankEligible`:

```ts
async function knowledgeBankEligible(conn: DbOrTx, userId: string) {
  const w = await repo.getByUserId(conn, userId);
  // ...
}
```

Update `WalletPort` interface in `shared/ports/wallet.port.ts` to match the new signatures.

- [ ] **Step 6: Write concurrency test**

Create `packages/api/src/tests/integration/wallet-concurrency.test.ts`:

```ts
import { describe, expect, test, beforeAll } from "bun:test";
import { db } from "@cogito-app/db";
import { resetDatabase } from "../helpers/test-client";
import { createTestUser, createTestWallet } from "../helpers/factories";
import { services } from "../../services";

describe("Wallet concurrency", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("concurrent holds do not overdraw wallet", async () => {
    const user = await createTestUser("concurrent-hold@cogito.test");
    const wallet = await createTestWallet(user.id, 200);

    const holdPromises = Array.from({ length: 5 }, (_, i) =>
      services.wallet.hold(db, {
        walletId: wallet.id,
        amount: 30,
        eventKey: `test.concurrent_hold_${i}`,
        actorType: "student",
        reason: "Concurrent hold test",
      }),
    );

    const results = await Promise.allSettled(holdPromises);
    const succeeded = results.filter((r) => r.status === "fulfilled");

    expect(succeeded.length).toBeLessThanOrEqual(Math.floor(200 / 30));
  });

  test("concurrent credit operations all succeed", async () => {
    const user = await createTestUser("concurrent-credit@cogito.test");
    const wallet = await createTestWallet(user.id, 0);

    const creditPromises = Array.from({ length: 10 }, (_, i) =>
      services.wallet.credit(db, {
        walletId: wallet.id,
        amount: 10,
        eventKey: `test.concurrent_credit_${i}`,
        actorType: "system",
        reason: "Concurrent credit test",
      }),
    );

    await Promise.all(creditPromises);
    const final = await services.wallet.getById(db, wallet.id);
    expect(final!.totalBalance).toBe(100);
  });
});
```

- [ ] **Step 7: Run wallet tests**

```bash
bun test:api -- --test-name-pattern "Wallet"
```

Expected: All wallet tests pass, including new concurrency tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix: atomic wallet operations, remove handler layer, add concurrency tests"
```

---

### Task 4: Create Centralized Constants and Type-Safe Enums

**Files:**

- Modify: `packages/api/src/shared/constants.ts`
- Modify: `packages/api/src/modules/payment/payment.service.ts`
- Modify: `packages/api/src/modules/booking/booking.service.ts`
- Modify: `packages/api/src/modules/tutor/tutor.service.ts`
- Modify: `packages/api/src/modules/achievement/achievement.service.ts`
- Modify: `packages/api/src/modules/notification/notification.service.ts`
- Modify: `packages/api/src/modules/pricing/pricing.service.ts`
- Modify: `packages/api/src/modules/room/room.service.ts`
- Modify: `packages/api/src/procedures.ts`
- Modify: `packages/api/src/modules/admin/admin.service.ts`
- Modify: `packages/api/src/modules/admin/admin.handler.ts`

- [ ] **Step 1: Expand constants.ts with all enums and magic numbers**

Replace `packages/api/src/shared/constants.ts` entirely:

```ts
// Invite
export const INVITE_EXPIRY_DAYS = 7;

// Knowledge Bank
export const KNOWLEDGE_BANK_THRESHOLD = 35;

// Booking
export const RESPONSE_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
export const LATE_CANCEL_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
export const MIN_GROUP_HEADCOUNT = 2;
export const MIN_SERIES_SESSIONS = 2;
export const MAX_SERIES_SESSIONS = 4;
export const DEFAULT_SOLO_PRICE = 42; // floor price for 1 student online
export const SESSION_DURATION_MINUTES = 90;

// Pagination
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const ADMIN_DEFAULT_PAGE_LIMIT = 50;

// Pricing
export const COGITO_TAKE_RATE = 0.2;
export const TUTOR_PAYOUT_RATE_IDR = 7000;
export const EXTRA_TAKE_DIVISOR = 5;

// Online floor prices (per student per group size)
export const ONLINE_FLOOR_PRICES: Record<number, number> = {
  1: 42,
  2: 35,
  3: 28,
  4: 24,
  5: 21,
  6: 19,
};

// Offline floor prices (per student per group size)
export const OFFLINE_FLOOR_PRICES: Record<number, number> = {
  1: 50,
  2: 45,
  3: 40,
  4: 35,
  5: 30,
  6: 27,
};

// --- Type-safe enums ---

export const USER_ROLE = {
  STUDENT: "student",
  TUTOR: "tutor",
  ADMIN: "admin",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  SETTLED: "SETTLED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const BOOKING_TYPE = {
  SOLO: "solo",
  GROUP: "group",
  SERIES: "series",
} as const;
export type BookingType = (typeof BOOKING_TYPE)[keyof typeof BOOKING_TYPE];

export const MODALITY = {
  ONLINE: "online",
  OFFLINE: "offline",
  BOTH: "both",
} as const;
export type Modality = (typeof MODALITY)[keyof typeof MODALITY];

export const ONBOARDING_STATUS = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED_UNPUBLISHED: "approved_unpublished",
  PUBLISHED: "published",
  SUSPENDED: "suspended",
} as const;
export type OnboardingStatus =
  (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];

export const INVITE_STATUS = {
  INVITED: "invited",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const;
export type InviteStatus = (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];

export const ACHIEVEMENT_STATUS = {
  DRAFT: "draft",
  PENDING: "pending",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  ARCHIVED: "archived",
} as const;
export type AchievementStatus =
  (typeof ACHIEVEMENT_STATUS)[keyof typeof ACHIEVEMENT_STATUS];

export const CONFIRMATION_STATE = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  DECLINED: "declined",
  RECONFIRMED: "reconfirmed",
  WITHDRAWN_PRE_H2: "withdrawn_pre_h2",
  WITHDRAWN_POST_H2: "withdrawn_post_h2",
  NO_SHOW: "no_show",
} as const;
export type ConfirmationState =
  (typeof CONFIRMATION_STATE)[keyof typeof CONFIRMATION_STATE];

export const NOTIFICATION_CATEGORY = {
  BOOKING: "booking",
  PAYMENT: "payment",
  REFUND: "refund",
  SCHEDULE: "schedule",
  ACHIEVEMENT: "achievement",
  SYSTEM: "system",
  OVERRIDE: "override",
} as const;
export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];

export const NOTIFICATION_SEVERITY = {
  INFO: "info",
  ACTION: "action",
  CRITICAL: "critical",
} as const;
export type NotificationSeverity =
  (typeof NOTIFICATION_SEVERITY)[keyof typeof NOTIFICATION_SEVERITY];

export const ROOM_BOOKING_STATUS = {
  REQUESTED: "requested",
  CONFIRMED: "confirmed",
  RELOCATED: "relocated",
  CANCELLED: "cancelled",
} as const;
export type RoomBookingStatus =
  (typeof ROOM_BOOKING_STATUS)[keyof typeof ROOM_BOOKING_STATUS];

export const PAYMENT_PROVIDER_NAME = {
  STUB: "stub",
  XENDIT: "xendit",
} as const;
export type PaymentProviderName =
  (typeof PAYMENT_PROVIDER_NAME)[keyof typeof PAYMENT_PROVIDER_NAME];

export const MEETING_PROVIDER = {
  GOOGLE_MEET: "google_meet",
  MANUAL: "manual",
  PENDING: "pending",
} as const;
export type MeetingProvider =
  (typeof MEETING_PROVIDER)[keyof typeof MEETING_PROVIDER];

export const ACTOR_TYPE = {
  ADMIN: "admin",
  TUTOR: "tutor",
  STUDENT: "student",
  SYSTEM: "system",
} as const;
export type ActorType = (typeof ACTOR_TYPE)[keyof typeof ACTOR_TYPE];

export const ENTRY_TYPE = {
  CREDIT: "credit",
  HOLD: "hold",
  RELEASE: "release",
  DEDUCT: "deduct",
  COMPENSATE_CREDIT: "compensate_credit",
  COMPENSATE_DEDUCT: "compensate_deduct",
} as const;
export type EntryType = (typeof ENTRY_TYPE)[keyof typeof ENTRY_TYPE];

export const ATTENDANCE_STATE = {
  PRESENT: "present",
  LATE: "late",
  ABSENT: "absent",
  UNKNOWN: "unknown",
} as const;
export type AttendanceState =
  (typeof ATTENDANCE_STATE)[keyof typeof ATTENDANCE_STATE];
```

- [ ] **Step 2: Replace all string literal comparisons with constants**

In each module file, replace hardcoded strings with imports from constants. For example in `procedures.ts`:

```ts
// Before:
if (user.role !== "admin") {

// After:
import { USER_ROLE } from "./shared/constants";
if (user.role !== USER_ROLE.ADMIN) {
```

In `payment.service.ts`:

```ts
// Before:
if (record.status === "PAID") return { status: "PAID" };

// After:
import { PAYMENT_STATUS } from "../../shared/constants";
if (record.status === PAYMENT_STATUS.PAID)
  return { status: PAYMENT_STATUS.PAID };
```

In `booking.service.ts`:

```ts
import {
  MODALITY,
  BOOKING_TYPE,
  CONFIRMATION_STATE,
  RESPONSE_WINDOW_MS,
  LATE_CANCEL_THRESHOLD_MS,
  MIN_GROUP_HEADCOUNT,
  MIN_SERIES_SESSIONS,
  MAX_SERIES_SESSIONS,
  DEFAULT_SOLO_PRICE,
} from "./booking-state.types"; // re-export from constants

// Before:
const deadlineAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
// After:
const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);
```

Apply this pattern to all modules listed above.

- [ ] **Step 3: Run full test suite**

```bash
bun run test:api
```

Expected: All existing tests pass with the new constant references.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: centralized constants and type-safe enums, replace all string literals"
```

---

### Task 5: Extract Booking Repository Layer

**Files:**

- Create: `packages/api/src/modules/booking/booking.repo.ts`
- Modify: `packages/api/src/modules/booking/booking.service.ts`
- Modify: `packages/api/src/services.ts`

This task extracts all Drizzle ORM queries from `booking.service.ts` into a dedicated `booking.repo.ts`, following the same pattern used by other modules. The 1208-line service file becomes significantly smaller.

- [ ] **Step 1: Create booking.repo.ts**

Create `packages/api/src/modules/booking/booking.repo.ts` with factory pattern. Extract every `db.query.*`, `tx.insert(*)`, `tx.update(*)`, `tx.delete(*)` call from `booking.service.ts` into named repo methods. Group by entity: `findBookingById`, `findBookingWithParticipants`, `insertBooking`, `updateBookingState`, `insertParticipant`, `updateParticipantState`, `insertStateHistory`, `insertRescheduleProposal`, `findAvailabilitySlot`, `updateAvailabilitySlot`, `findTutorProfile`, etc.

Each method takes `conn: DbOrTx` as first parameter and returns typed results.

- [ ] **Step 2: Refactor booking.service.ts to use repo**

Replace all inline Drizzle calls in `booking.service.ts` with `repo.xxx(conn, ...)` calls. The service keeps all orchestration logic (state machine transitions, pricing calculations, notification dispatches) but delegates data access to the repo.

- [ ] **Step 3: Wire booking repo in services.ts**

```ts
import { createBookingRepo } from "./modules/booking/booking.repo";
// ...
const bookingRepo = createBookingRepo(db);
const booking = createBookingService({
  db,
  repo: bookingRepo,
  wallet,
  pricing,
  audit,
  notification,
  meeting,
});
```

- [ ] **Step 4: Run booking tests**

```bash
bun test:api -- --test-name-pattern "booking"
```

Expected: All booking integration tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract booking repository from service (1208→smaller service)"
```

---

### Task 6: Enforce Handler → Service → Repo Pattern Across All Modules

**Files:**

- Modify: `packages/api/src/modules/auth/auth.handler.ts` → move orchestration to auth.service.ts
- Modify: `packages/api/src/modules/auth/auth.service.ts`
- Modify: `packages/api/src/modules/admin/admin.handler.ts` → move orchestration to admin.service.ts
- Modify: `packages/api/src/modules/admin/admin.service.ts`
- Modify: `packages/api/src/modules/admin-tutor/admin-tutor.handler.ts`
- Modify: `packages/api/src/modules/admin-tutor/admin-tutor.service.ts`
- Modify: `packages/api/src/modules/tutor/tutor.handler.ts`
- Modify: `packages/api/src/modules/tutor/tutor.service.ts`
- Modify: `packages/api/src/modules/invite/invite.handler.ts`
- Modify: `packages/api/src/modules/invite/invite.service.ts`
- Modify: `packages/api/src/modules/achievement/achievement.handler.ts`
- Modify: `packages/api/src/modules/achievement/achievement.service.ts`
- Modify: `packages/api/src/modules/wallet/wallet.router.ts`
- Modify: `packages/api/src/services.ts`

The principle: **Handlers only receive input, call service methods, and return output.** Services orchestrate repos and ports. Repos only do SQL.

For each module:

1. Move all `db.transaction()` calls from handlers to services
2. Move all `repo.xxx()` calls from handlers to services
3. Move all `auditPort.record()` calls from handlers to services
4. Handlers become thin: input → service method → output

For `wallet.router.ts`: Move the `listPackages` direct DB query to a new `listPackages()` method on the wallet service, which calls a new `listActivePackages()` on the wallet repo.

- [ ] **Step 1: Refactor auth module**

Move the upsert-vs-create decision and wallet lazy creation from `auth.handler.ts` to `auth.service.ts`. The handler should only call `authService.me(userId)`, `authService.getProfile(userId)`, `authService.updateProfile(userId, input)`.

- [ ] **Step 2: Refactor admin module**

Move `db.transaction` block, admin count check, and audit recording from `admin.handler.ts` to `admin.service.ts`. Handler calls `adminService.setRole(adminId, input)`.

- [ ] **Step 3: Refactor admin-tutor module**

Move invite creation logic, token generation, expiry calculation, and profile review transactions to `admin-tutor.service.ts`.

- [ ] **Step 4: Refactor tutor module**

Move availability overlap detection, transaction with audit, and profile update orchestration to `tutor.service.ts`.

- [ ] **Step 5: Refactor invite module**

Move the claim transaction (invite status update, profile creation, role change, audit) to `invite.service.ts`.

- [ ] **Step 6: Refactor achievement module**

Move admin review transaction to `achievement.service.ts`.

- [ ] **Step 7: Fix wallet router inline query**

Add `listActivePackages()` to `wallet.service.ts` and `wallet.repo.ts`:

```ts
// wallet.repo.ts
async function listActivePackages(conn: DbOrTx) {
  return conn.select().from(markPackage).where(eq(markPackage.isActive, true));
}
```

```ts
// wallet.service.ts
async function listActivePackages() {
  return repo.listActivePackages(db);
}
```

```ts
// wallet.router.ts — remove direct db imports
listPackages: protectedProcedure
  .route({ method: "POST", path: "/wallet/packages", tags: ["Wallet"], summary: "List mark packages" })
  .handler(async ({ context }) => {
    return context.services.wallet.listActivePackages();
  }),
```

- [ ] **Step 8: Run full test suite**

```bash
bun run test:api
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: enforce handler→service→repo pattern across all modules"
```

---

### Phase 2: Infrastructure & Missing Features (P1)

---

### Task 7: Add Rate Limiting Middleware

**Files:**

- Create: `packages/api/src/lib/rate-limit.ts`
- Modify: `packages/api/src/procedures.ts`
- Modify: `apps/server/src/routes.ts`

- [ ] **Step 1: Create rate limit utility**

Create `packages/api/src/lib/rate-limit.ts` using an in-memory sliding window store (sufficient for Phase 0 single-process deployment):

```ts
const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}) {
  return (identifier: string): { allowed: boolean; retryAfterMs: number } => {
    const key = `${options.keyPrefix ?? ""}:${identifier}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (entry.count >= options.maxRequests) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  };
}
```

- [ ] **Step 2: Apply rate limiting to auth and payment endpoints**

In `apps/server/src/routes.ts`, add rate limiting middleware before the `/rpc*` handler for sensitive paths. Apply 10 req/min for auth, 5 req/min for payment creation.

- [ ] **Step 3: Test rate limiting**

Write a test that sends more requests than the limit and expects `429` responses.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add in-memory rate limiting for auth and payment endpoints"
```

---

### Task 8: Add Booking Expiry Scheduler (BullMQ)

**Files:**

- Modify: `packages/env/src/server.ts`
- Create: `packages/api/src/modules/scheduler/scheduler.service.ts`
- Create: `packages/api/src/modules/scheduler/jobs/expire-bookings.job.ts`
- Create: `packages/api/src/modules/scheduler/jobs/release-holds.job.ts`
- Create: `apps/server/src/scheduler.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Add scheduler env vars**

In `packages/env/src/server.ts`, add:

```ts
REDIS_URL: z.string().url().optional(),
SCHEDULER_ENABLED: z.coerce.boolean().default(false),
```

- [ ] **Step 2: Install BullMQ**

```bash
bun add bullmq
```

- [ ] **Step 3: Create scheduler service**

Create `packages/api/src/modules/scheduler/scheduler.service.ts`:

```ts
import { Queue, Worker } from "bullmq";

const QUEUE_NAME = "cogito-jobs";

export function createSchedulerService(redisUrl?: string) {
  if (!redisUrl) return null;

  const queue = new Queue(QUEUE_NAME, { connection: redisUrl });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "expire-bookings":
          // Call booking service expireBookings()
          break;
        case "release-expired-holds":
          // Call wallet release for expired holds
          break;
        case "send-notification-email":
          // Call email service
          break;
      }
    },
    { connection: redisUrl },
  );

  return { queue, worker };
}
```

- [ ] **Step 4: Create job definitions**

Create `packages/api/src/modules/scheduler/jobs/expire-bookings.job.ts`:

```ts
import type { Queue } from "bullmq";
import { RESPONSE_WINDOW_MS } from "../../../shared/constants";

export async function scheduleBookingExpiryCheck(queue: Queue) {
  await queue.add(
    "expire-bookings",
    {},
    {
      repeat: { every: 5 * 60 * 1000 }, // every 5 minutes
    },
  );
}
```

- [ ] **Step 5: Initialize scheduler in server**

Create `apps/server/src/scheduler.ts` and import in `index.ts`. Only start if `SCHEDULER_ENABLED` is true and `REDIS_URL` is set.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BullMQ scheduler for booking expiry and hold release"
```

---

### Task 9: Add Email Provider (Resend)

**Files:**

- Create: `packages/api/src/shared/ports/email.port.ts`
- Create: `packages/api/src/modules/email/email.service.ts`
- Create: `packages/api/src/modules/email/resend-email.provider.ts`
- Create: `packages/api/src/modules/email/stub-email.provider.ts`
- Modify: `packages/env/src/server.ts`
- Modify: `packages/api/src/modules/notification/notification.service.ts`
- Modify: `packages/api/src/services.ts`

- [ ] **Step 1: Add email env vars**

In `packages/env/src/server.ts`, add:

```ts
RESEND_API_KEY: z.string().optional(),
EMAIL_FROM: z.string().default("noreply@cogitoacademy.id"),
```

- [ ] **Step 2: Create email port**

Create `packages/api/src/shared/ports/email.port.ts`:

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  category: "booking" | "payment" | "refund" | "schedule" | "override";
}

export interface EmailPort {
  send(
    message: EmailMessage,
  ): Promise<{ messageId: string } | { skipped: true }>;
}
```

- [ ] **Step 3: Create stub provider (dev)**

Logs email to console instead of sending.

- [ ] **Step 4: Create Resend provider (production)**

Uses the Resend API to send emails. Falls back to stub if `RESEND_API_KEY` is not set.

- [ ] **Step 5: Integrate email into notification service**

When a notification has severity `"action"` or `"critical"`, also dispatch an email via the email port. Write the dispatch record to `notification_dispatch` table.

- [ ] **Step 6: Wire in services.ts**

```ts
const email = env.RESEND_API_KEY
  ? createResendEmailProvider(env.RESEND_API_KEY!, env.EMAIL_FROM!)
  : createStubEmailProvider();

const notification = createNotificationService(db, email);
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add email provider (Resend) with notification dispatch"
```

---

### Task 10: Add Admin Override Endpoints

**Files:**

- Create: `packages/api/src/modules/admin-booking/admin-booking.types.ts`
- Create: `packages/api/src/modules/admin-booking/admin-booking.service.ts`
- Create: `packages/api/src/modules/admin-booking/admin-booking.handler.ts`
- Create: `packages/api/src/modules/admin-booking/admin-booking.repo.ts`
- Create: `packages/api/src/modules/admin-booking/admin-booking.router.ts`
- Modify: `packages/api/src/routers.ts`
- Modify: `packages/api/src/services.ts`

- [ ] **Step 1: Define admin override types**

Create Zod schemas for:

- `applyOverrideInput`: `{ bookingId, category, reason, affectedParticipants, marksAction, userNote, internalNote }`
- `listOverridesInput`: `{ bookingId?, limit?, cursor? }`
- `getBookingStateHistoryInput`: `{ bookingId }`
- `adminRefundInput`: `{ paymentId, reason }`

- [ ] **Step 2: Create admin booking repo**

Methods: `findBookingById`, `listBookingsByState`, `getStateHistory`, `insertOverrideRecord`, `updateBookingWithOverride`.

- [ ] **Step 3: Create admin booking service**

Business logic:

- `applyOverride()`: Validate booking exists, validate override category (from PRD's 6 allowed cases), record before/after state in audit log, transition booking state, adjust wallet (hold release / compensate credit / compensate deduct).
- `listBookings()`: Paginated booking list sorted by urgency (time-to-session, state, marks at stake).
- `getBookingStateHistory()`: Return full state history for a booking.
- `adminRefund()`: Create compensating ledger entry for payment errors.

- [ ] **Step 4: Create handler, router, wire into services.ts**

All admin override endpoints use `adminProcedure`. Follow the Handler → Service → Repo pattern correctly this time.

- [ ] **Step 5: Write integration test**

Create `packages/api/src/tests/integration/admin-override.test.ts` testing:

- Override tutor no-show (releases held Marks)
- Override medical emergency (compensate credit)
- Attempt override without reason (should fail)
- Attempt override on terminal state without admin role (should fail)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add admin override endpoints with audit trail"
```

---

### Task 11: Add Refund / Correction Flow

**Files:**

- Create: `packages/api/src/modules/refund/refund.types.ts`
- Create: `packages/api/src/modules/refund/refund.service.ts`
- Create: `packages/api/src/modules/refund/refund.handler.ts`
- Create: `packages/api/src/modules/refund/refund.repo.ts`
- Create: `packages/api/src/modules/refund/refund.router.ts`
- Modify: `packages/api/src/services.ts`
- Modify: `packages/api/src/routers.ts`

- [ ] **Step 1: Define refund types**

Zod schemas for:

- `createCorrectionInput`: `{ walletId, amount, type: "compensate_credit" | "compensate_deduct", reason, bookingId? }`
- `listCorrectionsInput`: `{ walletId, limit?, cursor? }`

- [ ] **Step 2: Create refund repo**

Methods: `findPaymentByReference`, `insertRefundRecord`, `updatePaymentStatus`.

- [ ] **Step 3: Create refund service**

Business logic:

- `createCorrection()`: Admin-only. Creates a compensating ledger entry. Requires `actorType: "admin"`. Records before/after state in audit log.
- `listCorrections()`: Returns compensating entries for a wallet.

- [ ] **Step 4: Create handler, router, wire into services.ts**

All refund endpoints use `adminProcedure`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin refund/correction flow with audit trail"
```

---

### Task 12: Fix Seed Script Hardcodes

**Files:**

- Modify: `apps/server/src/seed.ts`
- Modify: `apps/server/src/seed-invite.ts`
- Modify: `apps/server/src/reset-seed-student.ts`
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Replace hardcoded constants in seed.ts**

Import `INVITE_EXPIRY_DAYS` from `@cogito-app/api/shared/constants`. Replace hardcoded role strings with `USER_ROLE` constants. Replace hardcoded `365 * 24 * 60 * 60 * 1000` with `INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000`.

- [ ] **Step 2: Replace hardcoded URL in seed-invite.ts**

Import `INVITE_EXPIRY_DAYS` from constants. Replace `"http://localhost:5173"` with `env.CORS_ORIGIN` (which is the frontend URL).

- [ ] **Step 3: Replace hardcoded session maxAge in auth**

In `packages/auth/src/index.ts`, make `maxAge` configurable via env:

```ts
session: {
  cookieCache: {
    enabled: true,
    maxAge: env.SESSION_COOKIE_CACHE_MAX_AGE ?? 60,
  },
},
```

Add `SESSION_COOKIE_CACHE_MAX_AGE` to `packages/env/src/server.ts` as optional number.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: replace hardcoded values in seed scripts and auth config"
```

---

### Task 13: Add CI/CD Pipeline

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create GitHub Actions workflow**

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run check-types

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build

  test:
    runs-on: ubuntu-latest
    needs: [build]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: password
          POSTGRES_DB: cogito-test
        ports:
          - 6767:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:6767/cogito-test
      - run: bun run test:coverage
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:6767/cogito-test
          BETTER_AUTH_SECRET: test-secret-at-least-32-characters-long
          BETTER_AUTH_URL: http://localhost:3001
          CORS_ORIGIN: http://localhost:3000
          PAYMENT_PROVIDER: stub
          PAYMENT_WEBHOOK_SECRET: test-webhook-secret-at-least-32-characters

  e2e:
    runs-on: ubuntu-latest
    needs: [test]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: password
          POSTGRES_DB: cogito-e2e
        ports:
          - 6767:5432
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run db:migrate
      - run: bun run seed
      - run: bun run test:e2e
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "ci: add GitHub Actions CI pipeline"
```

---

### Phase 4: Resilience, Security & Observability (P1-P2)

---

### Task 14: Resilience Utilities — Retry, Circuit Breaker, Timeouts

**Files:**

- Create: `packages/api/src/lib/retry.ts`
- Create: `packages/api/src/lib/circuit-breaker.ts`
- Modify: `packages/api/src/modules/payment/xendit-payment.provider.ts`
- Modify: `packages/api/src/modules/payment/payment.service.ts`
- Create: `packages/api/src/tests/unit/retry.test.ts`
- Create: `packages/api/src/tests/unit/circuit-breaker.test.ts`

This task adds the core resilience building blocks that all external API calls will use.

- [ ] **Step 1: Create retry utility**

Create `packages/api/src/lib/retry.ts`:

```ts
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  retryable: (error: unknown) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterMs: 200,
  retryable: (error: unknown) => {
    if (error instanceof TypeError && error.message.includes("fetch"))
      return true;
    if (error instanceof Response) return error.status >= 500;
    return false;
  },
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!opts.retryable(error)) throw error;
      if (attempt === opts.maxAttempts) throw error;

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1) +
          Math.random() * opts.jitterMs,
        opts.maxDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

- [ ] **Step 2: Create circuit breaker utility**

Create `packages/api/src/lib/circuit-breaker.ts`:

```ts
export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  monitor?: (state: CircuitState, error?: unknown) => void;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime < this.options.resetTimeoutMs) {
        throw new Error("Circuit breaker is open");
      }
      this.state = "half-open";
      this.halfOpenAttempts = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = "closed";
    this.halfOpenAttempts = 0;
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.options.monitor?.(this.state, error);

    if (this.state === "half-open") {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
        this.state = "open";
      }
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = "open";
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
```

- [ ] **Step 3: Add timeout wrapper for fetch calls**

Add to `packages/api/src/lib/retry.ts`:

```ts
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 4: Apply retry + circuit breaker + timeout to Xendit provider**

Modify `packages/api/src/modules/payment/xendit-payment.provider.ts`:

```ts
import { retryWithBackoff } from "../../lib/retry";
import { fetchWithTimeout } from "../../lib/retry";
import { CircuitBreaker } from "../../lib/circuit-breaker";

// Create a circuit breaker per provider instance
const xenditCircuit = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 1,
  monitor: (state, error) => {
    console.error(`Xendit circuit breaker: ${state}`, error);
  },
});

// In createIntent, replace the raw fetch call:
async createIntent(params) {
  return xenditCircuit.execute(() =>
    retryWithBackoff(
      () => fetchWithTimeout(url, requestInit, 15_000).then(handleResponse),
      { maxAttempts: 3, baseDelayMs: 500, retryable: isRetryableFetchError },
    ),
  );
}

// In verifyWebhook, no retry (webhook is idempotent by design, but don't retry on failure):
// Keep as-is but add timeout.
```

- [ ] **Step 5: Write tests for retry and circuit breaker**

Create `packages/api/src/tests/unit/retry.test.ts` — test exponential backoff timing, max attempts, retryable vs non-retryable errors.

Create `packages/api/src/tests/unit/circuit-breaker.test.ts` — test closed→open transition, half-open recovery, reset timeout, monitor callback.

- [ ] **Step 6: Run tests**

```bash
bun test:api -- --test-name-pattern "retry|circuit"
```

Expected: All retry and circuit breaker tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add retry with backoff, circuit breaker, and fetch timeout utilities"
```

---

### Task 15: Security Hardening — Headers, Body Limits, Webhook, Stub Auth

**Files:**

- Create: `packages/api/src/lib/security-headers.ts`
- Modify: `apps/server/src/routes.ts`
- Modify: `apps/server/src/webhooks/payments.ts`
- Create: `packages/api/src/lib/webhook-idempotency.ts`
- Create: `packages/api/src/tests/unit/webhook-idempotency.test.ts`

- [ ] **Step 1: Add security headers middleware**

Create `packages/api/src/lib/security-headers.ts`:

```ts
import type { Context } from "elysia";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
};

export function securityHeaders(context: Context): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    context.set.headers[key] = value;
  }
}
```

- [ ] **Step 2: Add security headers and body size limit to Elysia**

In `apps/server/src/routes.ts`, add before the CORS middleware:

```ts
.onRequest(({ set }) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    set.headers[key] = value;
  }
})
```

Add a body size limit of 1MB for non-webhook routes:

```ts
.onRequest(({ request, set }) => {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
    set.status = 413;
    return "Payload too large";
  }
})
```

- [ ] **Step 3: Secure the stub checkout endpoint**

In `apps/server/src/webhooks/payments.ts`, protect the stub checkout GET endpoint:

```ts
app.get("/webhooks/payments/stub/checkout", async ({ query, set, request }) => {
  // Stub provider is only available in development/test
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    set.status = 404;
    return { error: "Not found" };
  }
  // ... existing logic
});
```

- [ ] **Step 4: Fix webhook error handling — differentiate auth vs processing errors**

Replace the catch-all `catch` block in the POST webhook handler:

```ts
app.post(
  "/webhooks/payments/:provider",
  async ({ request, body, params, set }) => {
    const provider = params.provider as string;
    const signature =
      provider === "xendit"
        ? (request.headers.get("x-callback-token") ?? "")
        : (request.headers.get("x-webhook-signature") ?? "");
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);

    let payload;
    try {
      payload = await services.payment.provider.verifyWebhook(
        rawBody,
        signature,
      );
    } catch (error) {
      // Signature verification failed — return 401
      set.status = 401;
      return { error: "Invalid webhook signature" };
    }

    try {
      await services.payment.confirmFromWebhook({
        provider: params.provider as string,
        providerReference: payload.providerReference,
        providerEventId: payload.providerEventId,
        status: payload.status,
        receiptUrl: payload.receiptUrl,
        failureReason: payload.failureReason,
      });
      set.status = 200;
      return { ok: true };
    } catch (error) {
      // Processing failed — return 500 so provider retries
      console.error("Webhook processing failed:", error);
      set.status = 500;
      return { error: "Webhook processing failed" };
    }
  },
  { parse: "text" },
);
```

- [ ] **Step 5: Add webhook idempotency utility**

Create `packages/api/src/lib/webhook-idempotency.ts`:

```ts
import { db } from "@cogito-app/db";
import { sql } from "drizzle-orm";

const processedWebhooks = new Map<
  string,
  { result: unknown; timestamp: number }
>();
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

let lastCleanup = Date.now();

export function isWebhookProcessed(idempotencyKey: string): boolean {
  cleanup();
  return processedWebhooks.has(idempotencyKey);
}

export function markWebhookProcessed(
  idempotencyKey: string,
  result: unknown,
): void {
  processedWebhooks.set(idempotencyKey, { result, timestamp: Date.now() });
}

export function getWebhookResult(idempotencyKey: string): unknown | undefined {
  cleanup();
  return processedWebhooks.get(idempotencyKey)?.result;
}

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  for (const [key, entry] of processedWebhooks) {
    if (now - entry.timestamp > MAX_AGE) {
      processedWebhooks.delete(key);
    }
  }
  lastCleanup = now;
}
```

- [ ] **Step 6: Write test for webhook idempotency**

Create `packages/api/src/tests/unit/webhook-idempotency.test.ts` — test `isWebhookProcessed`, `markWebhookProcessed`, `getWebhookResult`, and cleanup of expired entries.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: security headers, body limits, webhook error handling, stub auth guard, webhook idempotency"
```

---

### Task 16: Error Handling Overhaul — Structured Logging, Request IDs, Error Reporting

**Files:**

- Create: `packages/api/src/lib/request-id.ts`
- Create: `packages/api/src/lib/logger.ts`
- Modify: `packages/api/src/lib/errors.ts`
- Modify: `apps/server/src/routes.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/env/src/server.ts`

- [ ] **Step 1: Add additional error factories**

In `packages/api/src/lib/errors.ts`, add:

```ts
export function internalServerError(
  message = "Internal server error",
): ORPCError<"INTERNAL_SERVER_ERROR", undefined> {
  return new ORPCError("INTERNAL_SERVER_ERROR", { message });
}

export function serviceUnavailable(
  message = "Service unavailable",
): ORPCError<"SERVICE_UNAVAILABLE", undefined> {
  return new ORPCError("SERVICE_UNAVAILABLE", { message });
}

export function rateLimited(
  message = "Too many requests",
  retryAfterMs?: number,
): ORPCError<"TOO_MANY_REQUESTS", { retryAfterMs?: number }> {
  return new ORPCError("TOO_MANY_REQUESTS", {
    message,
    data: retryAfterMs ? { retryAfterMs } : undefined,
  });
}

export function timeout(
  message = "Request timed out",
): ORPCError<"TIMEOUT", undefined> {
  return new ORPCError("TIMEOUT", { message });
}
```

- [ ] **Step 2: Create request ID middleware**

Create `packages/api/src/lib/request-id.ts`:

```ts
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}
```

- [ ] **Step 3: Create structured logger**

Create `packages/api/src/lib/logger.ts`:

```ts
export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  service: string;
  requestId?: string;
  userId?: string;
  action?: string;
  durationMs?: number;
  error?: { message: string; code?: string; stack?: string };
  [key: string]: unknown;
}

let serviceName = "cogito-app-server";

export function initStructuredLogger(service: string) {
  serviceName = service;
}

export function log(entry: Partial<LogEntry>): void {
  const fullEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: entry.level ?? "info",
    service: serviceName,
    ...entry,
  };

  const serialized = JSON.stringify(fullEntry);

  switch (fullEntry.level) {
    case "error":
      console.error(serialized);
      break;
    case "warn":
      console.warn(serialized);
      break;
    default:
      console.log(serialized);
  }
}
```

- [ ] **Step 4: Add request ID middleware to Elysia**

In `apps/server/src/routes.ts`, add request ID generation and structured logging:

```ts
import { generateRequestId } from "@cogito-app/api/lib/request-id";
import { log } from "@cogito-app/api/lib/logger";

.derive(({ request }) => {
  const requestId = request.headers.get("x-request-id") ?? generateRequestId();
  const startTime = performance.now();
  return { requestId, startTime };
})
.onAfterHandle(({ requestId, startTime, set }) => {
  const durationMs = performance.now() - startTime;
  set.headers["x-request-id"] = requestId;
  log({
    level: "info",
    requestId,
    action: "request_completed",
    durationMs: Math.round(durationMs),
  });
})
.onError(({ error, requestId }) => {
  log({
    level: "error",
    requestId,
    action: "request_error",
    error: {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
})
```

- [ ] **Step 5: Add unhandled rejection handler**

In `apps/server/src/index.ts`, add before the server listen:

```ts
process.on("unhandledRejection", (reason) => {
  log({
    level: "error",
    action: "unhandled_rejection",
    error: { message: String(reason) },
  });
});
```

- [ ] **Step 6: Add Sentry env vars (optional)**

In `packages/env/src/server.ts`, add:

```ts
SENTRY_DSN: z.string().url().optional(),
SENTRY_ENVIRONMENT: z.string().default("development"),
```

Sentry integration is optional for Phase 0 — the structured logger provides the foundation. When Sentry is needed, initialize it in `index.ts` with `Sentry.init({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT })`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: structured logging, request IDs, error factories, unhandled rejection handler"
```

---

### Task 17: Database Resilience — Connection Pool, Startup Retry, Health Depth

**Files:**

- Modify: `packages/db/src/index.ts`
- Modify: `apps/server/src/routes.ts`
- Create: `packages/api/src/lib/db-health.ts`

- [ ] **Step 1: Configure DB connection pool**

In `packages/db/src/index.ts`, replace the current `createDb()` with explicit pool config:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { env } from "@cogito-app/env/server";

export function createPool() {
  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    maxUses: 7_500,
    allowExitOnIdle: false,
    ssl:
      env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });
}

export function createDb() {
  const pool = createPool();
  pool.on("error", (err) => {
    console.error("Unexpected PG pool error:", err);
  });
  return drizzle(pool, { schema });
}

export const db = createDb();
```

Install `pg` if not already:

```bash
bun add pg
```

- [ ] **Step 2: Add DB startup retry**

In `apps/server/src/index.ts`, add retry logic for DB connection:

```ts
async function waitForDb(maxAttempts = 10, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { db } = await import("@cogito-app/db");
      await db.execute(sql`SELECT 1`);
      log({
        level: "info",
        action: "db_connected",
        message: `Database connected on attempt ${attempt}`,
      });
      return;
    } catch (error) {
      log({
        level: "warn",
        action: "db_retry",
        message: `Database not ready, attempt ${attempt}/${maxAttempts}`,
        error: { message: String(error) },
      });
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Before creating the server:
await waitForDb();
```

- [ ] **Step 3: Create deep health check**

Create `packages/api/src/lib/db-health.ts`:

```ts
import { db } from "@cogito-app/db";
import { sql } from "drizzle-orm";

export async function healthCheck() {
  const checks: Record<string, "ok" | "degraded" | "error"> = {};

  try {
    const start = performance.now();
    await db.execute(sql`SELECT 1`);
    const durationMs = performance.now() - start;
    checks.database = durationMs < 1000 ? "ok" : "degraded";
  } catch {
    checks.database = "error";
  }

  const overall = Object.values(checks).every((v) => v === "ok")
    ? "ok"
    : Object.values(checks).some((v) => v === "error")
      ? "error"
      : "degraded";

  return { status: overall, checks, timestamp: new Date().toISOString() };
}
```

Update the `/health` route in `routes.ts` to use the deep health check.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: DB connection pool config, startup retry, deep health check"
```

---

### Task 18: Booking Idempotency & Optimistic Locking

**Files:**

- Create: `packages/api/src/lib/idempotency.ts`
- Modify: `packages/db/src/schema/booking.ts` (add version column)
- Create: `packages/db/src/migrations/0002_booking_version.sql`
- Modify: `packages/api/src/modules/booking/booking.repo.ts` (or booking.service.ts if repo not yet extracted)
- Create: `packages/api/src/tests/integration/booking-idempotency.test.ts`

- [ ] **Step 1: Add idempotency utility**

Create `packages/api/src/lib/idempotency.ts`:

```ts
import { db } from "@cogito-app/db";
import { sql } from "drizzle-orm";

const idempotencyStore = new Map<
  string,
  { result: unknown; timestamp: number }
>();
const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export function isProcessed(key: string): boolean {
  const entry = idempotencyStore.get(key);
  if (!entry) return false;
  if (Date.now() - entry.timestamp > MAX_AGE) {
    idempotencyStore.delete(key);
    return false;
  }
  return true;
}

export function markProcessed(key: string, result: unknown): void {
  idempotencyStore.set(key, { result, timestamp: Date.now() });
}

export function getResult(key: string): unknown | undefined {
  return idempotencyStore.get(key)?.result;
}

export function generateIdempotencyKey(
  prefix: string,
  ...parts: string[]
): string {
  return `${prefix}:${parts.join(":")}`;
}
```

- [ ] **Step 2: Add version column to booking table**

Create `packages/db/src/migrations/0002_booking_version.sql`:

```sql
ALTER TABLE "booking" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
```

Update the `booking` table schema in `packages/db/src/schema/booking.ts` to include:

```ts
version: integer("version").default(1).notNull(),
```

- [ ] **Step 3: Add optimistic locking to booking repo**

In the booking repo, add version checking to all update operations:

```ts
async function updateBooking(
  conn: DbOrTx,
  bookingId: string,
  data: Partial<BookingUpdate>,
  expectedVersion: number,
) {
  const [updated] = await conn
    .update(booking)
    .set({ ...data, version: sql`${booking.version} + 1` })
    .where(and(eq(booking.id, bookingId), eq(booking.version, expectedVersion)))
    .returning();

  if (!updated) {
    throw conflict("Booking was modified by another request. Please retry.");
  }
  return updated;
}
```

- [ ] **Step 4: Add idempotency to booking creation**

In the booking service, check idempotency before creating:

```ts
import { isProcessed, markProcessed, generateIdempotencyKey } from "../../lib/idempotency";

async createSolo(input: CreateSoloInput, idempotencyKey?: string) {
  if (idempotencyKey) {
    const key = generateIdempotencyKey("solo", input.tutorId, input.availabilitySlotId, idempotencyKey);
    if (isProcessed(key)) {
      return getResult(key);
    }
    const result = await this._createSoloInternal(input);
    markProcessed(key, result);
    return result;
  }
  return this._createSoloInternal(input);
}
```

- [ ] **Step 5: Write idempotency tests**

Create `packages/api/src/tests/integration/booking-idempotency.test.ts`:

- Test that same idempotency key returns same result
- Test that different keys create different bookings
- Test that concurrent requests with same key only create one booking

- [ ] **Step 6: Generate and apply migration**

```bash
bun run db:generate
bun run db:migrate
```

- [ ] **Step 7: Run booking tests**

```bash
bun test:api -- --test-name-pattern "booking"
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: booking idempotency, optimistic locking with version column"
```

---

### Task 19: Notification Delivery & Async Processing

**Files:**

- Modify: `packages/api/src/modules/notification/notification.service.ts`
- Modify: `packages/api/src/modules/notification/notification.types.ts`
- Modify: `packages/db/src/schema/notification.ts` (add dispatch tracking)
- Create: `packages/api/src/modules/notification/notification.handler.ts`
- Create: `packages/api/src/modules/notification/notification.router.ts`
- Modify: `packages/api/src/services.ts`
- Modify: `packages/api/src/routers.ts`

This task makes notification writes asynchronous (fire-and-forget from the caller's perspective) and tracks dispatch status in the database.

- [ ] **Step 1: Add notification router and handler**

Currently, `notification.service.ts` implements `InAppNotificationPort` directly but has no router for client-facing endpoints. Create:

`packages/api/src/modules/notification/notification.handler.ts` — thin handler that calls notification service methods.

`packages/api/src/modules/notification/notification.router.ts` — 4 procedures: `list`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, all `protectedProcedure`.

Wire into `routers.ts` and `services.ts`.

- [ ] **Step 2: Make notification writes non-blocking**

Currently, `notification.write()` is called inside booking transactions. Move it to a fire-and-forget pattern:

```ts
async write(params: NotificationWriteParams): Promise<void> {
  // Write the notification record in a separate micro-transaction
  // so that a notification write failure never blocks the booking operation.
  await this.writeInternal(params).catch((error) => {
    log({
      level: "error",
      action: "notification_write_failed",
      error: { message: String(error) },
      userId: params.userId,
      category: params.category,
      eventKey: params.eventKey,
    });
  });
}

private async writeInternal(params: NotificationWriteParams): Promise<void> {
  // ... existing insert logic
}
```

This ensures that if the notification DB write fails, it's logged but doesn't roll back the booking transaction.

- [ ] **Step 3: Track notification dispatch status**

The `notification_dispatch` table already exists but the service never writes to it. Add dispatch tracking:

```ts
async write(params: NotificationWriteParams): Promise<void> {
  const notification = await this.writeInternal(params);

  // If severity is action or critical, queue an email dispatch record
  if (params.severity === "action" || params.severity === "critical") {
    await this.queueEmailDispatch(notification.id, params);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: notification router, async writes, dispatch tracking"
```

---

### Task 20: Webhook Hardening — Async Processing, Replay Protection, Logging

**Files:**

- Modify: `apps/server/src/webhooks/payments.ts`
- Modify: `packages/api/src/modules/payment/payment.service.ts`
- Create: `packages/api/src/tests/integration/webhook-hardening.test.ts`

- [ ] **Step 1: Add webhook logging**

Before processing, log the incoming webhook:

```ts
app.post(
  "/webhooks/payments/:provider",
  async ({ request, body, params, set }) => {
    const provider = params.provider as string;
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);

    log({
      level: "info",
      action: "webhook_received",
      provider,
      contentLength: request.headers.get("content-length"),
      hasSignature: !!request.headers.get(
        provider === "xendit" ? "x-callback-token" : "x-webhook-signature",
      ),
    });

    // ... existing processing
  },
);
```

- [ ] **Step 2: Add webhook timestamp validation**

Xendit includes a `x-timestamp` header. Add replay protection:

```ts
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000; // 5 minutes

function validateWebhookTimestamp(request: Request): void {
  const timestamp =
    request.headers.get("x-timestamp") ?? request.headers.get("date");
  if (!timestamp) return; // Skip if not provided

  const webhookTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - webhookTime) > MAX_WEBHOOK_AGE_MS) {
    throw new Error("Webhook timestamp too old or too far in the future");
  }
}
```

- [ ] **Step 3: Process webhooks in a separate micro-transaction**

Ensure `confirmFromWebhook` uses its own transaction so that webhook processing failures don't leak connections:

```ts
try {
  await services.payment.confirmFromWebhook({
    provider: params.provider as string,
    providerReference: payload.providerReference,
    // ...
  });
  set.status = 200;
  return { ok: true };
} catch (error) {
  // Return 500 so the provider retries
  log({
    level: "error",
    action: "webhook_processing_failed",
    provider: params.provider,
    error: { message: String(error) },
  });
  set.status = 500;
  return { error: "Webhook processing failed" };
}
```

- [ ] **Step 4: Write webhook hardening tests**

Test that:

- Webhook with invalid signature returns 401
- Webhook with valid signature but DB error returns 500 (not 401)
- Stub checkout returns 404 in production mode
- Timestamp too old is rejected

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: webhook hardening — proper error handling, timestamp validation, logging"
```

---

### Task 21: Add Request Timing and Observability Hooks

**Files:**

- Modify: `apps/server/src/routes.ts`
- Create: `packages/api/src/lib/metrics.ts`

- [ ] **Step 1: Create metrics utility**

Simple in-memory request counter and timing histogram for Phase 0. No external dependencies.

```ts
const requestCounts = new Map<string, number>();
const requestDurations = new Map<string, number[]>();

export function recordRequest(path: string, durationMs: number) {
  requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
  const durations = requestDurations.get(path) ?? [];
  durations.push(durationMs);
  if (durations.length > 1000) durations.shift();
  requestDurations.set(path, durations);
}

export function getMetrics() {
  return Object.fromEntries(
    [...requestCounts.entries()].map(([path, count]) => ({
      path,
      count,
      avgMs:
        (requestDurations.get(path) ?? []).reduce((a, b) => a + b, 0) / count,
    })),
  );
}
```

- [ ] **Step 2: Add timing middleware to Elysia**

In `routes.ts`, add an `onAfterHandle` hook that records request duration:

```ts
.onAfterHandle(({ request, path }) => {
  const start = performance.now();
  return () => {
    recordRequest(path, performance.now() - start);
  };
})
```

- [ ] **Step 3: Add `/metrics` endpoint**

```ts
.get("/metrics", () => Response.json(getMetrics()))
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add request timing metrics endpoint"
```

---

### Task 22: Add Missing Database Indexes

**Files:**

- Create: `packages/db/src/migrations/0001_add_missing_indexes.sql`
- Modify: `packages/db/src/schema/booking.ts` (add index definitions)

- [ ] **Step 1: Add indexes to schema**

In `packages/db/src/schema/booking.ts`, add:

```ts
// Composite index for participant lookups
export const bookingParticipantUserStateIdx = index(
  "booking_participant_userId_state_idx",
).on(bookingParticipant.userId, bookingParticipant.confirmationState);

// Index for ledger time-range queries
export const ledgerCreatedAtIdx = index("ledger_createdAt_idx").on(
  ledgerEntry.createdAt,
);
```

- [ ] **Step 2: Generate migration**

```bash
bun run db:generate
```

- [ ] **Step 3: Apply migration**

```bash
bun run db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add missing database indexes for participant and ledger queries"
```

---

### Task 23: Configure Xendit for Multiple Payment Methods

**Files:**

- Modify: `packages/api/src/modules/payment/xendit-payment.provider.ts`

- [ ] **Step 1: Make payment method configurable**

Replace hardcoded `EWALLET` / `ID_OVO` with a `paymentMethods` parameter in the Xendit provider factory. Add support for `EWALLET` (OVO, DANA, LinkAja), `QR_CODE` (QRIS), and `BANK_TRANSFER` (virtual accounts).

For Phase 0, default to `EWALLET` with `ID_OVO` but make it configurable via env or parameter.

- [ ] **Step 2: Add env var for default payment method**

In `packages/env/src/server.ts`:

```ts
XENDIT_DEFAULT_PAYMENT_METHOD: z.enum(["ewallet_ovo", "qris", "va_bca"]).default("ewallet_ovo"),
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: configurable Xendit payment methods (ewallet, qris, va)"
```

---

### Task 24: Remove Dead Code and Clean Up

**Files:**

- Delete: `packages/api/src/modules/wallet/wallet.handler.ts` (already removed in Task 3)
- Modify: `packages/api/src/modules/pricing/pricing.service.ts` (use constants from shared/constants.ts)
- Modify: `packages/api/src/services.ts` (remove wallet handler import)

- [ ] **Step 1: Move pricing constants to shared/constants.ts**

The `ONLINE_FLOOR_PRICES`, `OFFLINE_FLOOR_PRICES`, `COGITO_TAKE_RATE`, and `TUTOR_PAYOUT_RATE_IDR` constants are already in `shared/constants.ts` from Task 4. Update `pricing.service.ts` to import from there and remove the local duplicates.

- [ ] **Step 2: Remove unused wallet.service.ts validation functions**

The old `validateHold` and `validateDeduct` in `wallet.service.ts` are superseded by the new service in Task 3. Confirm they're not imported anywhere, then remove.

- [ ] **Step 3: Clean up imports in services.ts**

Remove `createWalletHandler` import. Ensure all imports reference the new `createWalletService`.

- [ ] **Step 4: Run full test suite**

```bash
bun run test:api
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead code, deduplicate pricing constants"
```

---

### Task 25: Add Google Meet Provider Stub

**Files:**

- Modify: `packages/api/src/modules/meeting/fallback.provider.ts`
- Create: `packages/api/src/modules/meeting/google-meeting.provider.ts`
- Modify: `packages/env/src/server.ts`
- Modify: `packages/api/src/services.ts`

- [ ] **Step 1: Add Google env vars**

In `packages/env/src/server.ts`:

```ts
GOOGLE_CLIENT_EMAIL: z.string().email().optional(),
GOOGLE_PRIVATE_KEY: z.string().optional(),
GOOGLE_CALENDAR_ID: z.string().optional(),
GOOGLE_MEET_ENABLED: z.coerce.boolean().default(false),
```

- [ ] **Step 2: Create Google Meet provider**

Uses `googleapis` npm package to create a Calendar event with Meet conference. Falls back to `manual` if creation fails.

```ts
import { google } from "googleapis";
// ...
export function createGoogleMeetingProvider(
  config: GoogleMeetingConfig,
): MeetingPort {
  return {
    async createEvent(bookingId: string) {
      try {
        const calendar = google.calendar({ version: "v3", auth: jwtClient });
        const event = await calendar.events.insert({
          calendarId: config.calendarId,
          conferenceDataVersion: 1,
          requestBody: {
            summary: `Cogito Session - ${bookingId}`,
            conferenceData: { createRequest: { requestId: bookingId } },
            // ... start/end, attendees
          },
        });
        return {
          id: generateId(),
          bookingId,
          provider: "google_meet",
          externalEventId: event.data.id,
          meetingUrl: event.data.hangoutLink ?? null,
          status: "created",
          errorReason: null,
        };
      } catch (error) {
        // Fall back to manual
        return fallbackProvider.createEvent(bookingId);
      }
    },
  };
}
```

- [ ] **Step 3: Install googleapis**

```bash
bun add googleapis
```

- [ ] **Step 4: Wire in services.ts**

Conditionally use Google Meet provider when `GOOGLE_MEET_ENABLED` is true, otherwise use fallback.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Google Meet meeting provider with fallback"
```

---

## Summary: Task Dependency Graph

```
Task 1 (KB threshold)          → independent, P0
Task 2 (hardcoded port)       → independent, P0
Task 3 (wallet atomic)         → independent, P0
Task 4 (constants/enums)      → independent, P0 (but blocks Task 5, 6)
Task 5 (booking repo)          → depends on Task 4 (uses constants)
Task 6 (handler→service)      → depends on Task 3, 4, 5
Task 7 (rate limiting)         → independent, P1
Task 8 (scheduler)             → independent, P1
Task 9 (email)                 → independent, P1
Task 10 (admin override)       → depends on Task 6 (needs clean service layer)
Task 11 (refund)               → depends on Task 6 (needs clean service layer)
Task 12 (seed hardcodes)       → depends on Task 4 (uses constants)
Task 13 (CI/CD)               → independent, P1
Task 14 (metrics)              → independent, P2
Task 15 (indexes)              → independent, P2
Task 16 (Xendit)              → depends on Task 19 (retry/circuit breaker)
Task 17 (dead code)            → depends on Task 3, 6
Task 18 (Google Meet)          → depends on Task 19 (retry/circuit breaker)
Task 19 (retry/circuit breaker/timeouts) → independent, P1-P2
Task 20 (security hardening)  → independent, P1-P2
Task 21 (error handling/logging/req IDs) → independent, P1-P2
Task 22 (DB resilience)        → independent, P1-P2
Task 23 (booking idempotency/locking) → depends on Task 5 (booking repo)
Task 24 (notification async)  → independent, P1-P2
Task 25 (webhook hardening)   → depends on Task 19 (retry) and Task 21 (logging)
```

## Recommended Execution Order

### Phase 0 — Critical Bugs (do first)

1. **Task 1** — Fix Knowledge Bank threshold (5 min, critical bug)
2. **Task 2** — Fix hardcoded port (10 min, critical bug)
3. **Task 3** — Fix wallet race condition (1 hour, critical security)

### Phase 1 — Architecture (do second)

4. **Task 4** — Centralized constants and enums (1 hour, type safety)
5. **Task 12** — Fix seed hardcodes (30 min, uses Task 4 constants)
6. **Task 5** — Extract booking repo (2 hours, major refactor)
7. **Task 6** — Enforce handler→service→repo (3-4 hours, major refactor)
8. **Task 17** — Remove dead code (30 min, cleanup)

### Phase 2 — Infrastructure & Features

9. **Task 19** — Retry, circuit breaker, timeouts (1.5 hours, resilience)
10. **Task 20** — Security hardening (1.5 hours, security)
11. **Task 21** — Error handling, logging, request IDs (1.5 hours, observability)
12. **Task 22** — DB resilience (1 hour, reliability)
13. **Task 7** — Rate limiting (1 hour, security)
14. **Task 8** — Scheduler (2 hours, infrastructure)
15. **Task 9** — Email provider (2 hours, infrastructure)
16. **Task 25** — Webhook hardening (1 hour, depends on Task 19, 21)
17. **Task 23** — Booking idempotency & locking (1.5 hours, depends on Task 5)
18. **Task 10** — Admin override (3 hours, feature)
19. **Task 11** — Refund flow (2 hours, feature)
20. **Task 24** — Notification async (1.5 hours, reliability)
21. **Task 13** — CI/CD (1 hour, infrastructure)

### Phase 3 — Polish & Scaling

22. **Task 14** — Metrics (1 hour, observability)
23. **Task 15** — Database indexes (30 min, performance)
24. **Task 16** — Xendit multi-method (1 hour, depends on Task 19)
25. **Task 18** — Google Meet provider (2 hours, depends on Task 19)
