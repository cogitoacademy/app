# Backend Security & PRD Correctness — Implementation Plan (6 PRs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining critical backend issues found in the final codebase review: webhook/payment security, group-booking money correctness, late-cancel penalty, dead offline-room flow, email outbox, package re-purchase, file/image upload, and the follow-ups surfaced by the SDD-ledger scan (webhook IP spoofing, ticket SLA escalation, meeting-event lifecycle, stale override response, room email notifications).

**Architecture:** 6 independent PRs, each backend-only and independently testable, all targeting `main`. Follows the existing 4-layer pattern (Router → Handler → Service → Repository), consumer-driven ports, `DomainError` + `withDomainMap`, bounded zod, `DbOrTx`, and real-DB integration tests (Postgres `localhost:6767/cogito-test*`, Redis `localhost:6379`/`638x` for parallel worktrees).

**Tech Stack:** Bun 1.3.14, Elysia, oRPC, Drizzle + postgres.js, BullMQ, better-auth, Resend, Xendit, Cloudflare R2 (for uploads), bun:test, oxlint/oxfmt.

## Global Constraints

- Import from `@cogito-app/...` package paths; modules use `../../lib`, `../../shared`, `../../procedures`.
- 4-layer pattern; `DbOrTx` (`packages/api/src/lib/tx.ts`); `DomainError` + `withDomainMap`; bounded zod (`.max()`, `.refine()`).
- Redis keys: `cogito:{namespace}:{key}`; stateful libs accept optional `redis` with in-memory fallback.
- Conventional commits (`feat/fix/refactor/docs/test/chore/ci/deps`); commit after each green step.
- Verify: `bun run check-types`, `bun run lint`, `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` (currently 1562 tests / 0 fail — keep green).
- Local test DB is `postgresql://postgres:password@localhost:6767/cogito-test` (`.env` already points there). Redis at `localhost:6379`. Colima/docker up.
- Backend only. No frontend (`apps/web`, `packages/ui`).
- CI gates: packages/api ≥90% lines, overall ≥80% coverage.

---

## PR 1 — Security Hardening

**Goal:** Close the payment/webhook security holes: authless stub checkout, non-atomic webhook idempotency, spoofable rate-limit keys, and the seed-script prod guard.

### Task 1.1: Gate the stub payment checkout behind an explicit flag

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `STUB_WEBHOOK_ALLOWED` / `stubCheckoutEnabled` absent from `apps/server/src/webhooks/payments.ts` and `packages/env/src/server.ts`.

**Files:**
- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/src/webhooks/payments.ts:129-151`
- Create: `apps/server/src/webhooks/stub-checkout.test.ts`

**Interfaces:**
- Consumes: `env.PAYMENT_PROVIDER`, `env.NODE_ENV` (existing).
- Produces: env `STUB_WEBHOOK_ALLOWED` (boolean, default `false`); exported `stubCheckoutEnabled(): boolean`; the stub checkout route returns 404 unless the flag is set AND `PAYMENT_PROVIDER === "stub"` AND `NODE_ENV !== "production"`.

- [ ] **Step 1: Add the env flag**

Edit `packages/env/src/server.ts`, in the `optional` block near `PAYMENT_PROVIDER`:
```ts
STUB_WEBHOOK_ALLOWED: z.coerce.boolean().default(false),
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/webhooks/stub-checkout.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { stubCheckoutEnabled } from "./payments";

describe("stubCheckoutEnabled", () => {
  test("false when not production-only guarded and flag unset", () => {
    // The helper reads env; to keep it pure, give it explicit args instead:
    expect(stubCheckoutEnabled("development", "stub", false)).toBe(false);
  });
  test("true only when all three conditions hold", () => {
    expect(stubCheckoutEnabled("development", "stub", true)).toBe(true);
    expect(stubCheckoutEnabled("production", "stub", true)).toBe(false);
    expect(stubCheckoutEnabled("development", "xendit", true)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env apps/server/src/webhooks/stub-checkout.test.ts`
Expected: FAIL (`stubCheckoutEnabled is not a function`).

- [ ] **Step 4: Implement the guard**

Edit `apps/server/src/webhooks/payments.ts`. Prefer an explicit-args helper (testable without env mocks):
```ts
export function stubCheckoutEnabled(
  nodeEnv: string,
  provider: string,
  allowed: boolean,
): boolean {
  return nodeEnv !== "production" && provider === "stub" && allowed === true;
}
```
Replace the existing guard in the stub checkout handler:
```ts
if (
  !stubCheckoutEnabled(env.NODE_ENV, env.PAYMENT_PROVIDER, env.STUB_WEBHOOK_ALLOWED)
) {
  set.status = 404;
  return { error: "Not found" };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test --env-file apps/server/.env apps/server/src/webhooks/`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/env/src/server.ts apps/server/src/webhooks/payments.ts apps/server/src/webhooks/stub-checkout.test.ts
git commit -m "fix(webhooks): require STUB_WEBHOOK_ALLOWED flag for stub checkout route"
```

### Task 1.2: Make webhook idempotency atomic and keyed on verified payload

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `IdempotencyStore.claim`/`release` absent from `packages/api/src/lib/idempotency.ts` (only the `markProcessed` pre-check path exists).

**Files:**
- Modify: `packages/api/src/lib/idempotency.ts` (add `claim` + `release`)
- Modify: `apps/server/src/webhooks/payments.ts:40-65`
- Create: `packages/api/src/tests/unit/idempotency-claim.test.ts`

**Interfaces:**
- Consumes: `IdempotencyStore` class, `RedisClient` (`redis.ts`), `services.payment.provider.verifyWebhook`.
- Produces: `IdempotencyStore.claim(key: string, ttlSeconds?: number): Promise<boolean>` (atomic SET NX EX; true only for first caller) and `IdempotencyStore.release(key: string): Promise<void>`.

- [ ] **Step 1: Add the atomic claim to IdempotencyStore**

Edit `packages/api/src/lib/idempotency.ts`, inside the class:
```ts
async claim(key: string, ttlSeconds?: number): Promise<boolean> {
  const redisKey = `${this.prefix}:${key}`;
  const ttl = ttlSeconds ?? Math.ceil(this.maxAge / 1000);
  if (this.redis) {
    try {
      const ok = await this.redis.set(redisKey, "pending", {
        type: "NX",
        value: ttl,
      });
      if (ok === "OK" || ok === true) return true;
      const exists = await this.redis.exists(redisKey);
      return !exists;
    } catch {
      // fall through to in-memory
    }
  }
  this.maybeCleanup();
  if (this.store.has(key)) return false;
  this.evictOldest();
  this.store.set(key, { result: "pending", timestamp: Date.now() });
  return true;
}

async release(key: string): Promise<void> {
  const redisKey = `${this.prefix}:${key}`;
  if (this.redis) {
    try {
      await this.redis.del(redisKey);
      return;
    } catch {
      // fall through
    }
  }
  this.store.delete(key);
}
```
> Check `RedisClient.set` in `packages/api/src/lib/redis.ts` — it already maps `{ type: "EX"|"NX", value }` args (used by `markProcessed`). Confirm the return type: if the adapter returns void/undefined, treat any non-throw as success and rely on the in-memory branch for correctness in tests. Adjust the test to match the actual return semantics after reading the adapter (lines ~216-240).

- [ ] **Step 2: Write the failing test**

Create `packages/api/src/tests/unit/idempotency-claim.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { IdempotencyStore } from "../../lib/idempotency";

describe("IdempotencyStore.claim", () => {
  test("only the first caller wins; release allows re-claim", async () => {
    const store = new IdempotencyStore({ prefix: "test:idem" });
    const first = await store.claim("evt-1");
    const second = await store.claim("evt-1");
    expect(first).toBe(true);
    expect(second).toBe(false);
    await store.release("evt-1");
    expect(await store.claim("evt-1")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/idempotency-claim.test.ts`
Expected: FAIL (`claim is not a function`).

- [ ] **Step 4: Implement + rewire the webhook**

Edit `apps/server/src/webhooks/payments.ts`. Move the idempotency claim AFTER signature verification, keyed on the verified payload's `providerEventId`:
```ts
const payload = await services.payment.provider.verifyWebhook(rawBody, signature);
validateWebhookTimestamp(request);

const idempotencyKey = `${provider}:${payload.providerEventId || "no-event-id"}`;
if (!(await webhookIdempotency.claim(idempotencyKey))) {
  set.status = 200;
  return { ok: true, idempotent: true };
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
  await webhookIdempotency.markProcessed(idempotencyKey, { ok: true });
  set.status = 200;
  return { ok: true };
} catch (error) {
  await webhookIdempotency.release(idempotencyKey);
  // ... existing error mapping unchanged (signature/timestamp/500 branches)
}
```
Remove the old `isProcessed` pre-check block and the `x-event-id`-based key construction (`const idempotencyKey = ...` at the top of the handler).

- [ ] **Step 5: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/ packages/api/src/tests/integration/payment-flow.test.ts`
Run: `bun run check-types`
Expected: PASS (payment-flow webhook tests must stay green — verify the duplicate-webhook test still returns idempotent 200).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/lib/idempotency.ts apps/server/src/webhooks/payments.ts packages/api/src/tests/unit/idempotency-claim.test.ts
git commit -m "fix(webhooks): atomic idempotency claim keyed on verified payload event id"
```

### Task 1.3: Trusted-proxy-safe rate-limit keys + cover invite and booking creation

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `TRUST_PROXY` env var and `getClientIp` helper absent from `apps/server/src/routes.ts` / `packages/env/src/server.ts`.

**Files:**
- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/src/routes.ts:160-202`
- Modify: `packages/api/src/tests/unit/rate-limit.test.ts`

**Interfaces:**
- Consumes: `rateLimit()` from `@cogito-app/api/lib/rate-limit`.
- Produces: exported `getClientIp(request, trustProxy)` helper (first `x-forwarded-for` hop only when `TRUST_PROXY=true`, else `x-real-ip`/`unknown`); new `inviteRateLimit` (10/min) and `bookingRateLimit` (30/min).

- [ ] **Step 1: Add env flag + helper**

Add to `packages/env/src/server.ts`:
```ts
TRUST_PROXY: z.coerce.boolean().default(false),
```

In `apps/server/src/routes.ts`, add an exported helper (or put it in `packages/api/src/lib/request-id.ts` and import — prefer the lib to keep routes lean):
```ts
export function getClientIp(request: Request, trustProxy: boolean): string {
  if (trustProxy) {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown"
    );
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
```

- [ ] **Step 2: Write the failing test**

Add to `packages/api/src/tests/unit/rate-limit.test.ts`:
```ts
import { getClientIp } from "../../../../apps/server/src/routes";

describe("getClientIp", () => {
  test("ignores x-forwarded-for when not trusting proxy", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "6.6.6.6", "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(req, false)).toBe("10.0.0.1");
  });
  test("uses first x-forwarded-for hop when trusting proxy", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "6.6.6.6, 10.0.0.1" },
    });
    expect(getClientIp(req, true)).toBe("6.6.6.6");
  });
});
```
> If importing from `apps/server` into a `packages/api` test causes a path issue, place the test in `apps/server/src/` instead (e.g. `apps/server/src/rate-limit-ip.test.ts`) and run it with the server test pattern.

- [ ] **Step 3: Implement + wire the new limits**

In `routes.ts`, replace `const ip = ...` inside the `.onRequest` with `const ip = getClientIp(request, env.TRUST_PROXY);`, and add:
```ts
const inviteRateLimit = rateLimit({ windowMs: 60_000, maxRequests: 10, keyPrefix: "invite", redis });
const bookingRateLimit = rateLimit({ windowMs: 60_000, maxRequests: 30, keyPrefix: "booking", redis });
```
Add checks mirroring the auth check for:
- `path.startsWith("/rpc/invite.verify")` → `inviteRateLimit(ip)`
- `path.startsWith("/rpc/booking.")` → `bookingRateLimit(ip)`

- [ ] **Step 4: Run tests + typecheck**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/rate-limit.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/env/src/server.ts apps/server/src/routes.ts packages/api/src/tests/unit/rate-limit.test.ts
git commit -m "fix(server): trusted-proxy rate-limit keys; throttle invite and booking creation"
```

### Task 1.4: Guard the seed script against production

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `apps/server/src/seed.ts` has no `seedAllowed`/`seedAdminPassword` guards and no `SEED_ALLOWED_IN_PROD` handling.

**Files:**
- Modify: `apps/server/src/seed.ts`
- Create: `apps/server/src/seed.test.ts`

**Interfaces:**
- Produces: exported `seedAllowed(nodeEnv, allowFlag)` and `seedAdminPassword(value)` pure helpers; seed refuses production runs unless `SEED_ALLOWED_IN_PROD=true`; admin password from `SEED_ADMIN_PASSWORD` (min 12 chars).

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/seed.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { seedAllowed, seedAdminPassword } from "./seed";

describe("seed guards", () => {
  test("seedAllowed is false in production without explicit flag", () => {
    expect(seedAllowed("production", undefined)).toBe(false);
    expect(seedAllowed("production", "true")).toBe(true);
    expect(seedAllowed("development", undefined)).toBe(true);
  });
  test("seedAdminPassword rejects short or missing passwords", () => {
    expect(seedAdminPassword(undefined)).toBeNull();
    expect(seedAdminPassword("short")).toBeNull();
    expect(seedAdminPassword("a-strong-12-char-pw")).toBe("a-strong-12-char-pw");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env apps/server/src/seed.test.ts`
Expected: FAIL (`seedAllowed is not a function`).

- [ ] **Step 3: Implement the guard**

In `apps/server/src/seed.ts`, add the helpers and wire them at the top of `seed()`:
```ts
export function seedAllowed(nodeEnv: string, allowFlag: string | undefined): boolean {
  if (nodeEnv !== "production") return true;
  return allowFlag === "true";
}
export function seedAdminPassword(value: string | undefined): string | null {
  if (!value || value.length < 12) return null;
  return value;
}
```
At the top of `seed()`:
```ts
if (!seedAllowed(env.NODE_ENV, process.env.SEED_ALLOWED_IN_PROD)) {
  throw new Error("Refusing to seed in production unless SEED_ALLOWED_IN_PROD=true");
}
const adminPassword = seedAdminPassword(process.env.SEED_ADMIN_PASSWORD);
if (!adminPassword) {
  throw new Error("SEED_ADMIN_PASSWORD required (min 12 chars) in this environment");
}
```
Replace `"admin123"` with `adminPassword` in the admin `ensureUser` call. (If `seed-packages.ts` creates users too, guard it the same way or document that it only seeds packages.)

- [ ] **Step 4: Run tests + typecheck**

Run: `bun test --env-file apps/server/.env apps/server/src/seed.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/seed.ts apps/server/src/seed.test.ts
git commit -m "fix(seed): refuse production seeding without explicit flag and strong admin password"
```

---

## PR 2 — PRD Money Correctness

**Goal:** Fix group-booking over-charge, implement the late-cancel penalty (deduct instead of release), and repair the dead offline-room fulfillment loop.

### Task 2.1: Release proposer's excess hold as invitees confirm (group over-charge fix)

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `confirmInvite` (`booking.service.ts:1549`) still holds the proposer at the full target until the headcount branch; no excess-release path exists.

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts` (`confirmInvite`, ~1579-1620)
- Modify: `packages/api/src/tests/integration/booking-g4.test.ts`

**Interfaces:**
- Consumes: `wallet.release(tx, { walletId, amount, eventKey, sourceReference, bookingId, actorType, reason })`, `repo.updateParticipantState`, `repo.findParticipant`, `repo.updateBookingHoldAmount`.
- Produces: after every invitee confirmation, proposer `heldAmount` and booking `holdAmount` settle at `perStudent × currentConfirmedHeadcount` (no more 1.75× over-collection).

- [ ] **Step 1: Write the failing integration test**

Add to `packages/api/src/tests/integration/booking-g4.test.ts` (follow the file's existing seed helpers for tutor/students/wallets):
```ts
test("group of 4: proposer is charged only perStudent once all invitees confirm", async () => {
  // student A creates group (targetGroupSize 4) with invitees B, C, D
  // A's wallet heldBalance === 4 × perStudent after create (current behavior)
  // B, C, D confirm via confirmInvite
  // assert A's heldBalance === perStudent
  // assert booking.holdAmount === 4 × perStudent
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-g4.test.ts -t "charged only perStudent"`
Expected: FAIL (A still holds 4× perStudent).

- [ ] **Step 3: Implement the fix**

In `confirmInvite`, inside the existing transaction, after `updateBookingConfirmedHeadcount` and before the full-headcount transition block:
```ts
const proposerParticipant = await repo.findParticipant(tx, bookingId, b.proposerId);
if (proposerParticipant && proposerParticipant.heldAmount > pricePerStudent) {
  const proposerWallet = await wallet.getByUserId(tx, b.proposerId);
  if (proposerWallet) {
    const excess = proposerParticipant.heldAmount - pricePerStudent;
    await wallet.release(tx, {
      walletId: proposerWallet.id,
      amount: excess,
      eventKey: `booking.${bookingId}.proposer.release.${newHeadcount}`,
      sourceReference: bookingId,
      bookingId,
      actorType: ACTOR_TYPE.STUDENT,
      reason: "Group: proposer excess hold released as invitees confirm",
    });
    await repo.updateParticipantState(tx, proposerParticipant.id, {
      heldAmount: pricePerStudent,
    });
  }
}
await repo.updateBookingHoldAmount(tx, bookingId, pricePerStudent * newHeadcount);
```
> The eventKey includes `newHeadcount` so a re-confirm can't double-release. Only run the release when `newHeadcount <= b.targetGroupSize`.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-g4.test.ts packages/api/src/tests/integration/booking-group-series.test.ts`
Run: `bun run check-types`
Expected: PASS. Verify G4 repricing tests still hold (the reprice path already settles at the same invariant — this fix aligns the happy path with it).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts packages/api/src/tests/integration/booking-g4.test.ts
git commit -m "fix(booking): release proposer excess hold as group invitees confirm"
```

### Task 2.2: Late cancel / post-H2 withdrawal deducts held Marks (penalty)

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — no `late-cancel`/`Late cancellation penalty`/`late_cancelled` path in `cancel`/`withdraw`; post-H2 actions still release holds.

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts` (`cancel` ~624-709, `withdraw` ~1704-1740)
- Modify: `packages/api/src/tests/integration/booking-solo.test.ts`

**Interfaces:**
- Consumes: `wallet.deduct(tx, { walletId, amount, eventKey, sourceReference, bookingId, actorType, reason })`.
- Produces: post-H2 cancel/withdraw calls `wallet.deduct` (penalty) instead of `release`; pre-H2 unchanged (release); series `cancelAllSessions` only cancels `scheduled` sessions (never completed ones).

- [ ] **Step 1: Write the failing integration test**

Add to `packages/api/src/tests/integration/booking-solo.test.ts`:
```ts
test("TC-late: student cancels after H-2 → Marks deducted (penalty), not released", async () => {
  // create solo booking, backdate scheduledStartAt to now-3h (past H-2)
  // cancel → assert currentState === "late_cancelled"
  // assert wallet heldBalance === 0 AND totalBalance decreased by holdAmount
  // assert a ledger 'deduct' entry exists with the penalty eventKey
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-solo.test.ts -t "after H-2"`
Expected: FAIL (currently releases; totalBalance unchanged).

- [ ] **Step 3: Implement the fix**

In `cancel`, replace the unconditional `releaseAllParticipantHolds` with:
```ts
if (isLate) {
  const participants = await repo.findConfirmedParticipants(tx, bookingId);
  for (const p of participants) {
    if (p.heldAmount <= 0) continue;
    const w = await wallet.getByUserId(tx, p.userId);
    if (!w) throw new BookingNotFoundError(p.userId);
    // eslint-disable-next-line no-await-in-loop
    await wallet.deduct(tx, {
      walletId: w.id,
      amount: p.heldAmount,
      eventKey: `booking.${bookingId}.late-cancel.${p.userId}`,
      sourceReference: bookingId,
      bookingId,
      actorType: ACTOR_TYPE.STUDENT,
      reason: "Late cancellation penalty",
    });
    // eslint-disable-next-line no-await-in-loop
    await repo.updateParticipantState(tx, p.id, { heldAmount: 0 });
  }
} else {
  await releaseAllParticipantHolds(tx, bookingId, `Booking ${toState}: ${cancellationReason ?? "no reason"}`, ACTOR_TYPE.STUDENT);
}
```
In `withdraw`, in the `isLate` branch replace `wallet.release` with `wallet.deduct` (eventKey `booking.${bookingId}.withdraw-late.${userId}`, reason "Late withdrawal penalty") and set participant `heldAmount` to 0 in the subsequent `updateParticipantState`. Also guard `cancelAllSessions` (repo) to only update sessions whose `currentState === 'scheduled'` — never clobber `completed` sessions. If `cancelAllSessions` is a single SQL UPDATE in `booking.repo.ts`, add the state predicate there.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-solo.test.ts packages/api/src/tests/integration/booking-group-series.test.ts packages/api/src/tests/integration/scheduler-expiry.test.ts packages/api/src/tests/unit/booking.service.test.ts`
Run: `bun run check-types`
Expected: PASS. The G5 `cancelSession` unit tests use `release` on the session hold (per-session series cancel) — that path is unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts packages/api/src/modules/booking/booking.repo.ts packages/api/src/tests/integration/booking-solo.test.ts
git commit -m "fix(booking): deduct Marks on late cancel and post-H2 withdrawal (PRD penalty)"
```

### Task 2.3: Wire offline room assignment to transition booking to scheduled

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `transitionBookingToScheduled` absent from `packages/api/src/modules/room/`; `assignRoom` leaves the booking in `awaiting_admin_room_approval`.

**Files:**
- Modify: `packages/api/src/modules/room/room.service.ts` (`assignRoom`, ~38-70)
- Modify: `packages/api/src/modules/room/index.ts` (add `RoomBookingPort` consumer-driven port)
- Modify: `packages/api/src/services.ts` (pass booking service into room module)
- Modify: `packages/api/src/tests/integration/room-g14.test.ts`

**Interfaces:**
- Consumes: existing room repo methods; new booking-service method `transitionBookingToScheduled(tx, bookingId, actorId)`.
- Produces: `assignRoom` also transitions `awaiting_admin_room_approval → scheduled` so offline sessions can be completed (currently the loop is dead and `expireBookings` auto-cancels them).

- [ ] **Step 1: Write the failing integration test**

Update `packages/api/src/tests/integration/room-g14.test.ts` — the existing test at ~line 297 asserts the booking STAYS `awaiting_admin_room_approval` after assign; change that assertion and add:
```ts
test("assigning a room moves an offline booking to scheduled", async () => {
  // seed offline booking in awaiting_admin_room_approval (existing helpers)
  // admin assigns room
  // assert booking.currentState === "scheduled"
  // assert booking.scheduledEndAt unchanged
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/room-g14.test.ts -t "moves an offline booking to scheduled"`
Expected: FAIL.

- [ ] **Step 3: Implement**

1. In `booking.service.ts`, add a method exposed on `BookingService`:
```ts
async function transitionBookingToScheduled(
  tx: DbOrTx,
  bookingId: string,
  actorId: string,
): Promise<void> {
  const b = await repo.findBookingById(tx, bookingId);
  if (!b) throw new BookingNotFoundError(bookingId);
  if (b.currentState !== BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL) return;
  await transition(tx, bookingId, BOOKING_STATE.SCHEDULED, {
    actorId,
    actorType: ACTOR_TYPE.ADMIN,
    reason: "Room assigned",
  });
}
```
2. In `room/index.ts`, add the port and accept it in `createRoomModule`:
```ts
export interface RoomBookingPort {
  transitionBookingToScheduled(tx: DbOrTx, bookingId: string, actorId: string): Promise<void>;
}
```
3. In `room.service.ts`, accept `bookingPort?: RoomBookingPort` and, at the end of `assignRoom`'s transaction after `insertRoomBooking`:
```ts
if (bookingPort) {
  await bookingPort.transitionBookingToScheduled(tx, bookingId, "room-assign");
}
```
> `transition()` requires a real actorId (FK to user.id, nullable for system). If no admin user id is available in `assignRoom`, use the admin's user id from the handler (add it to `assignRoomInput` as `actorId` optional, defaulting to `null`-safe — but note system actor maps to null actorId per the N1 fix, which is fine).
4. In `services.ts`, pass `booking.service` into `createRoomModule({ db, bookingPort: booking.service })`.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/room-g14.test.ts packages/api/src/tests/integration/room-availability-g13.test.ts packages/api/src/tests/integration/booking-solo.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/room/ packages/api/src/modules/booking/booking.service.ts packages/api/src/services.ts packages/api/src/tests/integration/room-g14.test.ts
git commit -m "fix(room): transition offline bookings to scheduled when a room is assigned"
```

---

## PR 3 — Email Outbox + Package Re-purchase

**Goal:** Fix the email-outbox violation (emails sent inside open DB transactions with a dead scheduler job) and allow FAILED/EXPIRED package re-purchase.

### Task 3.1: Email outbox — queue dispatch rows, scheduler sends them

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** PARTIAL — dispatch rows ARE inserted with `status='queued'` (`notification.service.ts:147-152`), but `emailPort.send()` is still called inline inside the transaction (`:154-178`) and no `dispatchQueuedEmails` consumer/scheduler job exists yet.

**Files:**
- Modify: `packages/api/src/modules/notification/notification.service.ts` (`writeInternal`, ~101-180)
- Modify: `packages/api/src/modules/notification/notification.repo.ts` (add `listQueuedDispatches(limit)` + `incrementDispatchAttempts(id, error?)`)
- Modify: `packages/api/src/modules/scheduler/jobs/send-notification-email.job.ts` (job data shape)
- Modify: `apps/server/src/scheduler.ts` (`onSendNotificationEmail` — consume queued dispatches)
- Modify: `packages/api/src/tests/unit/notification.service.test.ts` + integration `notification-email-g17.test.ts`

**Interfaces:**
- Consumes: `notificationDispatch` table (has `status` queued/sent/failed/suppressed, `attempts`, `lastError`, `recipientEmail`, `notificationId`), `EmailPort.send`, `repo.findNotificationByEventKey`.
- Produces: `writeInternal` only inserts the dispatch row with `status='queued'` (never calls `emailPort.send` inline); a new `dispatchQueuedEmails(limit = 50): Promise<{ sent: number; failed: number }>` on the notification service consumes queued rows, calls `emailPort.send`, updates status.

- [ ] **Step 1: Add repo methods**

In `packages/api/src/modules/notification/notification.repo.ts`:
```ts
export async function listQueuedDispatches(conn: DbOrTx, limit = 50) {
  return conn
    .select()
    .from(notificationDispatch)
    .where(eq(notificationDispatch.status, "queued"))
    .orderBy(asc(notificationDispatch.createdAt))
    .limit(limit);
}

export async function incrementDispatchAttempts(
  conn: DbOrTx,
  id: string,
  lastError?: string | null,
) {
  await conn
    .update(notificationDispatch)
    .set({
      attempts: sql`${notificationDispatch.attempts} + 1`,
      lastError: lastError ?? null,
    })
    .where(eq(notificationDispatch.id, id));
}
```
Export both from the repo factory. (Check the drizzle import needs: `asc`, `sql` already imported; add if missing.)

- [ ] **Step 2: Write the failing unit test**

Add to `packages/api/src/tests/unit/notification.service.test.ts`:
```ts
test("writeInternal queues email dispatch without calling emailPort.send", async () => {
  const send = mock(async () => ({ messageId: "m1" }));
  // build service with emailPort { send }, repo mock that records insertDispatch
  // call write({ ..., emailRequired: true, severity: "action" })
  // assert repo.insertDispatch called with { status: "queued" }
  // assert send NOT called
});
```
> Follow the file's existing `createNotificationService` mock harness (repo with `insertDispatch`/`findUserEmail` mocks). The exact assertion depends on the harness shape — keep it behavior-focused: send must not be called during `write`.

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/notification.service.test.ts -t "queues email dispatch"`
Expected: FAIL (send is called inline today).

- [ ] **Step 4: Implement the outbox write path**

In `notification.service.ts`, replace the inline `emailPort.send(...)` block inside `writeInternal` with just the dispatch-row insert (keep the `emailRequired === true` + severity + category checks):
```ts
if (
  inserted &&
  params.emailRequired === true &&
  (params.severity === NOTIFICATION_SEVERITY.ACTION ||
    params.severity === NOTIFICATION_SEVERITY.CRITICAL)
) {
  const recipientEmail = await repo.findUserEmail(conn, params.userId);
  if (emailPort && recipientEmail && EMAIL_SUPPORTED_CATEGORIES.has(params.category)) {
    await repo.insertDispatch(conn, {
      notificationId: inserted.id,
      channel: "email",
      recipientEmail,
      status: "queued",
    });
  }
}
```

- [ ] **Step 5: Add the dispatch consumer**

In `notification.service.ts`, add and export:
```ts
async function dispatchQueuedEmails(limit = 50): Promise<{ sent: number; failed: number }> {
  const conn = db; // needs a DbType; see note below
  const rows = await repo.listQueuedDispatches(conn, limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (!emailPort) { failed++; continue; }
    try {
      const notif = await repo.findNotificationById(conn, row.notificationId);
      if (!notif) { await repo.updateDispatchStatus(conn, row.id, "suppressed"); continue; }
      const res = await emailPort.send({
        to: row.recipientEmail,
        subject: notif.title,
        html: notif.body,
        category: notif.category as "booking" | "payment" | "refund" | "schedule" | "override",
      });
      if ("skipped" in res && res.skipped) {
        await repo.updateDispatchStatus(conn, row.id, "suppressed");
      } else {
        await repo.updateDispatchStatus(conn, row.id, "sent");
        sent++;
      }
    } catch (error) {
      failed++;
      await repo.incrementDispatchAttempts(conn, row.id, String(error));
      log({ level: "error", action: "notification_email_dispatch_failed", error: { message: String(error) }, dispatchId: row.id });
    }
  }
  return { sent, failed };
}
```
> The notification service currently has no `db` — add `db: DbType` to `createNotificationService` deps (or pass a `conn` provider). Check `services.ts` wiring (`createNotificationModule({ db, email })`) — pass `db` through. NOTE: the repo only has `findNotificationByIdForUser(id, userId)` today — add a plain `findNotificationById(conn, id)` (select where id = notification.id) for the outbox consumer.

- [ ] **Step 6: Rewire the scheduler job**

Edit `apps/server/src/scheduler.ts` `onSendNotificationEmail` to call the consumer instead of the manual select/send:
```ts
onSendNotificationEmail: async () => {
  await services.notification.dispatchQueuedEmails(50);
},
```
Update `packages/api/src/modules/scheduler/jobs/send-notification-email.job.ts` data shape comment if needed (the job carries no data now). Update `SchedulerHandlers` type in `scheduler.service.ts` — `onSendNotificationEmail` can drop the `data` param (keep the signature compatible or change it and the switch case in `scheduler.service.ts` accordingly).

- [ ] **Step 7: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/notification.service.test.ts packages/api/src/tests/integration/notification-email-g17.test.ts packages/api/src/tests/unit/scheduler.service.test.ts`
Run: `bun run check-types`
Expected: PASS. The G17 integration test asserts dispatch rows — update it to assert `status='queued'` after `write` and `status='sent'` after `dispatchQueuedEmails`.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/modules/notification/ packages/api/src/modules/scheduler/ apps/server/src/scheduler.ts packages/api/src/tests/
git commit -m "fix(notification): outbox pattern — queue dispatch rows, scheduler sends emails"
```

### Task 3.2: Allow FAILED/EXPIRED package re-purchase

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `createIntent` still throws `PackageAlreadyPurchasedError` for FAILED/EXPIRED existing payments (`payment.service.ts:115`).

**Files:**
- Modify: `packages/api/src/modules/payment/payment.service.ts` (`createIntent`, ~99-116)
- Modify: `packages/api/src/tests/unit/payment.service.test.ts` + `packages/api/src/tests/integration/payment-flow.test.ts`

**Interfaces:**
- Consumes: `repo.findPaymentByProviderReference`, `repo.updatePaymentStatus` (check existence), `provider.createIntent`.
- Produces: when an existing payment for the same providerReference is `FAILED`/`EXPIRED`, reset it to `PENDING` and re-create the intent (fresh checkout) instead of throwing `PackageAlreadyPurchasedError`; `PENDING` is still reused; `PAID`/`SETTLED`/`REFUNDED` still throw.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/tests/unit/payment.service.test.ts`:
```ts
test("createIntent re-purchases after a FAILED payment (new checkout)", async () => {
  // repo returns an existing FAILED payment with providerReference
  // provider.createIntent mock returns { checkoutUrl: "https://x/2" }
  // expect no PackageAlreadyPurchasedError; expect providerReference unchanged;
  // expect repo.updatePaymentStatus called to reset PENDING (if that's the design)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/payment.service.test.ts -t "re-purchases after a FAILED"`
Expected: FAIL (currently throws).

- [ ] **Step 3: Implement**

In `createIntent`, change the `existing` branch:
```ts
if (existing) {
  if (existing.status === PAYMENT_STATUS.PENDING) {
    const existingIntent = await provider.createIntent({
      paymentId: existing.id,
      amountIdr: pkg.priceIdr,
      providerReference: existing.providerReference,
    });
    return { paymentId: existing.id, providerReference: existing.providerReference, checkoutUrl: existingIntent.checkoutUrl };
  }
  if (existing.status === PAYMENT_STATUS.FAILED || existing.status === PAYMENT_STATUS.EXPIRED) {
    // reset to PENDING so the webhook can credit; re-create the intent
    await repo.updatePaymentStatus(db, existing.id, PAYMENT_STATUS.PENDING);
    const freshIntent = await provider.createIntent({
      paymentId: existing.id,
      amountIdr: pkg.priceIdr,
      providerReference: existing.providerReference,
    });
    return { paymentId: existing.id, providerReference: existing.providerReference, checkoutUrl: freshIntent.checkoutUrl };
  }
  throw new PackageAlreadyPurchasedError(packageCode, userId);
}
```
> Verify `repo.updatePaymentStatus` exists (used by `confirmFromWebhook`/`adminRefund`). If the provider requires a unique `reference_id` per intent, keep the same providerReference (idempotent) — Xendit allows reusing reference_id for a new payment request. Document this.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/payment.service.test.ts packages/api/src/tests/integration/payment-flow.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/payment/payment.service.ts packages/api/src/tests/unit/payment.service.test.ts packages/api/src/tests/integration/payment-flow.test.ts
git commit -m "fix(payment): allow re-purchase after FAILED or EXPIRED payment"
```

---

## PR 4 — File / Image Upload (Cloudflare R2)

**Goal:** Add a secure file-upload capability so the PRD's "proof URL or file" achievement field and user/tutor avatars can be served, using Cloudflare R2 (matches the existing Cloudflare deployment). Backend-only; frontend wiring is tracked in FRONTEND-GAPS.

### Task 4.1: Upload storage abstraction + signed-URL upload endpoint

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `packages/api/src/lib/storage.ts` and `packages/api/src/modules/upload/` do not exist.

**Files:**
- Create: `packages/api/src/lib/storage.ts` (port + R2 implementation + in-memory/dev implementation)
- Create: `packages/api/src/lib/storage.test.ts`
- Modify: `packages/env/src/server.ts` (R2 env vars)
- Create: `packages/api/src/modules/upload/` (4-layer: `upload.types.ts`, `upload.errors.ts`, `upload.service.ts`, `upload.handler.ts`, `upload.router.ts`, `index.ts`) — or, if simpler, expose via `apps/server/src/routes.ts` + a service method; follow the module pattern if a router is needed.
- Modify: `packages/api/src/services.ts` (wire upload module)

**Interfaces:**
- Produces:
  - `StoragePort` with `put(key: string, body: Uint8Array, contentType: string): Promise<{ key: string; url: string }>` and `getSignedUploadUrl(key: string, contentType: string): Promise<{ url: string; method: "PUT" }>`.
  - Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (all optional; when absent, use a dev `LocalStorage` that writes to `./uploads/`).
  - `upload.createUploadUrl` (protectedProcedure): input `{ filename, contentType }` → validates content type allowlist + size → returns `{ uploadUrl, key, publicUrl }`.
  - `upload.getObject` or serve-through (`GET /uploads/*` serving from R2 with cache headers) — decide based on whether `R2_PUBLIC_URL` is set (public bucket) vs private bucket + signed GET.

- [ ] **Step 1: Add env vars**

In `packages/env/src/server.ts`:
```ts
R2_ACCOUNT_ID: z.string().optional(),
R2_ACCESS_KEY_ID: z.string().optional(),
R2_SECRET_ACCESS_KEY: z.string().optional(),
R2_BUCKET: z.string().optional(),
R2_PUBLIC_URL: z.string().url().optional(),
```

- [ ] **Step 2: Write the failing test**

Create `packages/api/src/lib/storage.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { createLocalStorage } from "./storage";

describe("createLocalStorage", () => {
  test("put stores bytes and returns a public URL", async () => {
    const s = createLocalStorage({ dir: "/tmp/cogito-uploads-test" });
    const { key, url } = await s.put("a/b.png", new TextEncoder().encode("hi"), "image/png");
    expect(key).toContain("a/b.png");
    expect(url).toContain("/uploads/");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/lib/storage.test.ts`
Expected: FAIL (`./storage` not found).

- [ ] **Step 4: Implement the storage lib**

Create `packages/api/src/lib/storage.ts`:
```ts
export interface StoragePort {
  put(key: string, body: Uint8Array, contentType: string): Promise<{ key: string; url: string }>;
  getSignedUploadUrl(key: string, contentType: string): Promise<{ url: string; method: "PUT" }>;
}

export function createLocalStorage(opts: { dir: string; baseUrl?: string }): StoragePort {
  // writes files under opts.dir, returns url = `${baseUrl ?? "/uploads"}/${key}`
  // getSignedUploadUrl returns a no-op PUT url (local dev: upload directly via put)
  // Use Bun.write + mkdir recursive; sanitize key (no .., no leading /)
}
```
For R2 (production), use the AWS S3-compatible API via `@aws-sdk/client-s3` (check if it's already a dependency; if not, add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` as dependencies) with `endpoint: https://${accountId}.r2.cloudflarestorage.com`:
```ts
export function createR2Storage(opts: {
  accountId: string; accessKeyId: string; secretAccessKey: string;
  bucket: string; publicUrl?: string;
}): StoragePort {
  // new S3Client({ region: "auto", endpoint, credentials })
  // put: PutObjectCommand → url = publicUrl ? `${publicUrl}/${key}` : key
  // getSignedUploadUrl: getSignedUrl(client, new PutObjectCommand({...}), { expiresIn: 300 })
}
```
Export a factory `createStorage(envLike): StoragePort` that picks R2 when all R2 vars are present, else local.

- [ ] **Step 5: Add the upload module (4-layer)**

- `upload.types.ts`:
```ts
export const ALLOWED_CONTENT_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const createUploadUrlInput = z.object({
  filename: z.string().min(1).max(255).refine((s) => !s.includes("..") && !s.startsWith("/"), "invalid filename"),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
});
```
- `upload.service.ts`: `createUploadUrl(userId, input)` → key = `${userId}/${crypto.randomUUID()}-${sanitizeFilename(input.filename)}`; calls `storage.getSignedUploadUrl(key, contentType)`; returns `{ uploadUrl, key, publicUrl, contentType, maxBytes: MAX_UPLOAD_BYTES }`.
- `upload.handler.ts` + `upload.router.ts` (`protectedProcedure`, path `/upload/create-url`).
- `index.ts` with `createUploadModule({ db?, storage })`.

Wire into `services.ts` (`const upload = createUploadModule({ storage: createStorage({...env}) })`; add `upload` to the handler registry + `routers.ts`).

- [ ] **Step 6: Add serve-through for local storage**

In `apps/server/src/routes.ts`, before the RPC handler, add a static route when `R2_PUBLIC_URL` is NOT set:
```ts
app.get("/uploads/*", async ({ params, set }) => {
  const key = params["*"] as string;
  const file = Bun.file(`${UPLOAD_DIR}/${key}`);
  if (!(await file.exists())) { set.status = 404; return { error: "Not found" }; }
  return new Response(file);
});
```
(`UPLOAD_DIR` from env or default `./uploads`.)

- [ ] **Step 7: Wire into achievement + user profile**

- `achievement.types.ts`/service: accept `imageUrl` already exists — the frontend will call `upload.createUploadUrl` then PUT the file, then submit the achievement with the returned `publicUrl`/key. No change needed beyond documenting the flow; optionally add a `key → publicUrl` helper in the upload service (`upload.resolvePublicUrl(key)`).
- `user.image`: no backend change needed (stored as URL string; the auth update-profile flow already accepts it — verify `updateProfileInput` includes `image`; if not, add `image: z.string().url().max(2048).optional()` to `auth.types.ts`).

- [ ] **Step 8: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/lib/storage.test.ts packages/api/src/tests/unit/upload.service.test.ts`
Run: `bun run check-types`
Run: `bunx oxfmt --write packages/api/src/lib/storage.ts packages/api/src/modules/upload/`
Expected: PASS; lint clean.

- [ ] **Step 9: Commit**

```bash
git add packages/env/src/server.ts packages/api/src/lib/storage.ts packages/api/src/modules/upload/ packages/api/src/services.ts packages/api/src/routers.ts apps/server/src/routes.ts
git commit -m "feat(upload): signed-URL uploads with Cloudflare R2 and local dev fallback"
```

---

## PR 5 — Correctness & Security Follow-ups

**Goal:** Close the findings from the 2026-08-14 audit: group deadline repricing (B3), Knowledge Bank total-balance eligibility (B4), payment/refund notifications (B6), group-series creation (B8), per-session post-H2 forfeit (B9), conditional Xendit env validation (M4), email HTML injection via reason (M5), and body-size/OpenAPI hardening (L1-L3).

### Task 5.1: Group deadline repricing (B3, HIGH, PRD FR-16/TC-18)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts` (`expireBookings`, ~2009-2048)
- Modify: `packages/api/src/tests/integration/scheduler-expiry.test.ts`
- Create: `packages/api/src/tests/integration/booking-reprice-deadline.test.ts`

**Interfaces:**
- Consumes: `repo.findBookingsExpiringByDeadline`, `wallet.release`, `wallet.hold` (existing), existing `transition` helper, repricing logic equivalent to the `repriceGroupForHeadcount` path (used on withdraw/reconfirm).
- Produces: at deadline, a group with `confirmedHeadcount >= 2` but `< targetGroupSize` reprices to its final per-student total, transitions to `AWAITING_RECONFIRMATION` with a new 12h deadline, and notifies all remaining participants (`emailRequired`); only a group with `confirmedHeadcount < 2` expires and releases all holds (existing behavior).

- [ ] **Step 1: Write the failing integration test**

Add to `packages/api/src/tests/integration/booking-reprice-deadline.test.ts` (reuse the seed helpers from `scheduler-expiry.test.ts` for a 3-of-5 group):
```ts
test("deadline with headcount >= 2 but < target reprices and moves to awaiting_reconfirmation", async () => {
  // create group booking targetGroupSize 5, 3 confirmed (incl. proposer)
  // backdate deadline_at to now-1h
  // run expireBookings
  // assert booking.currentState === AWAITING_RECONFIRMATION (NOT EXPIRED)
  // assert booking.deadline_at advanced by 12h
  // assert participant holds repriced to 3 × perStudent, holdAmount === 3 × perStudent
  // assert remaining participants got a notification with emailRequired
});

test("deadline with headcount < 2 still expires and releases all holds", async () => {
  // 1-of-5 group at deadline → EXPIRED, all holds released (existing behavior preserved)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-reprice-deadline.test.ts`
Expected: FAIL (booking currently transitions to EXPIRED and releases all holds regardless of headcount).

- [ ] **Step 3: Implement the headcount branch in `expireBookings`**

In `expireBookings`, inside the per-booking transaction, before the unconditional `releaseAllParticipantHolds`:
```ts
const confirmed = await repo.countConfirmedParticipants(tx, b.id);
if (
  b.currentState === BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION &&
  confirmed >= 2 &&
  confirmed < b.targetGroupSize
) {
  // reprice holds to final total (equivalent to the repriceGroupForHeadcount path:
  // hold perStudent for each remaining participant, settle holdAmount to confirmed × perStudent)
  await repriceGroupForHeadcount(tx, b.id, confirmed);

  const newDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await repo.updateBookingDeadline(tx, b.id, newDeadline);

  await transition(tx, b.id, BOOKING_STATE.AWAITING_RECONFIRMATION, {
    actorId: "system",
    actorType: ACTOR_TYPE.SYSTEM,
    reason: "Group deadline passed with partial headcount",
  });

  // notify all remaining confirmed participants (emailRequired)
  await notifyGroupReconfirmation(tx, b.id, confirmed);
  return; // skip the expire/release path below
}
// existing: headcount < 2 (or non-group states) → releaseAllParticipantHolds + EXPIRED
```
> Verify a `countConfirmedParticipants` repo method exists or add one. `repriceGroupForHeadcount` may need to be extracted from the existing withdraw/reconfirm repricing block (`~340-395`) so both paths share one implementation. Confirm the 12h reconfirmation window matches the value used by the existing `AWAITING_RECONFIRMATION` transition.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-reprice-deadline.test.ts packages/api/src/tests/integration/scheduler-expiry.test.ts packages/api/src/tests/integration/booking-g4.test.ts`
Run: `bun run check-types`
Expected: PASS. Verify G4 repricing tests still hold (shared repricing implementation).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts packages/api/src/modules/booking/booking.repo.ts packages/api/src/tests/integration/booking-reprice-deadline.test.ts packages/api/src/tests/integration/scheduler-expiry.test.ts
git commit -m "fix(booking): reprice partial groups to awaiting_reconfirmation at deadline (FR-16/TC-18)"
```

### Task 5.2: Knowledge Bank eligibility uses total balance (B4, MEDIUM, PRD DL-16/FR-12)

**Files:**
- Modify: `packages/api/src/modules/wallet/wallet.service.ts:421-434` (`knowledgeBankEligible`)
- Modify: `packages/api/src/tests/unit/wallet.service.test.ts` (and the handler test asserting the output shape)
- Note: the frontend client-side check on the balance page is tracked in `FRONTEND-GAPS` — no change in this PR, just note the pairing.

**Interfaces:**
- Consumes: `repo.getByUserId`, `KNOWLEDGE_BANK_THRESHOLD` (existing).
- Produces: `knowledgeBankEligible` returns `eligible: w.totalBalance >= KNOWLEDGE_BANK_THRESHOLD` and `balance: w.totalBalance`; handler output shape (`eligible`/`balance`/`threshold`) unchanged.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/tests/unit/wallet.service.test.ts`:
```ts
test("knowledgeBankEligible uses total balance, not available balance", async () => {
  // wallet with availableBalance = 30 (< 35) but totalBalance = 40 (>= 35)
  // expect knowledgeBankEligible(userId).eligible === true
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/wallet.service.test.ts -t "knowledgeBankEligible"`
Expected: FAIL (`eligible` is false today because it checks `availableBalance`).

- [ ] **Step 3: Implement the fix**

In `knowledgeBankEligible` (both the null-wallet early return and the main return):
```ts
eligible: w.totalBalance >= KNOWLEDGE_BANK_THRESHOLD,
balance: w.totalBalance,
```
Update the associated handler/unit tests that assert `eligible`/`balance` on the previous `availableBalance` semantics. Output shape unchanged.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/wallet.service.test.ts packages/api/src/tests/unit/wallet.handler.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/wallet/wallet.service.ts packages/api/src/tests/unit/wallet.service.test.ts packages/api/src/tests/unit/wallet.handler.test.ts
git commit -m "fix(wallet): Knowledge Bank eligibility based on total Marks balance (DL-16)"
```

### Task 5.3: Payment/refund notifications (B6, MEDIUM, PRD §Notification Matrix)

**Files:**
- Modify: `packages/api/src/modules/payment/index.ts` (add `NotificationPort` to `createPaymentModule` deps)
- Modify: `packages/api/src/modules/payment/payment.service.ts` (`confirmFromWebhook` credit path + admin refund path)
- Modify: `packages/api/src/modules/notification/notification.service.ts` (ensure `payment`/`refund` categories pass the email gate)
- Modify: `packages/api/src/tests/integration/payment-flow.test.ts`

**Interfaces:**
- Consumes: consumer-driven `NotificationPort` with `writeBestEffort({ db, userId, category, severity, title, body, eventKey, emailRequired })` — declared inline in the payment service, wired at `services.ts`.
- Produces: on webhook credit (`confirmFromWebhook`) a notification with `category: NOTIFICATION_CATEGORY.PAYMENT`, `emailRequired: true`, `eventKey: payment.{id}.credited`; on admin refund a notification with `category: NOTIFICATION_CATEGORY.REFUND` (emergency refunds included), `emailRequired: true`. Both satisfy the PRD notification matrix (in-app + email to the payer).

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/tests/integration/payment-flow.test.ts`:
```ts
test("webhook credit writes a payment notification (in-app + email) for the payer", async () => {
  // seed package checkout, call confirmFromWebhook
  // assert a notification row exists with category "payment" and emailRequired true
  // assert a dispatch row with status "queued" for the payer email
});
```
Add an analogous test for the admin refund path (`category === "refund"`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/payment-flow.test.ts -t "payment notification"`
Expected: FAIL (payment module writes no notifications today).

- [ ] **Step 3: Implement**

1. In `payment.service.ts`, declare and use a `NotificationPort` interface; in `confirmFromWebhook`, after a successful credit:
```ts
if (notificationPort) {
  await notificationPort.writeBestEffort({
    db,
    userId: payment.userId,
    category: NOTIFICATION_CATEGORY.PAYMENT,
    severity: NOTIFICATION_SEVERITY.ACTION,
    title: "Payment received",
    body: `Your payment of ${pkg.priceIdr} IDR was received.`,
    eventKey: `payment.${payment.id}.credited`,
    emailRequired: true,
  });
}
```
Mirror the same call with `category: NOTIFICATION_CATEGORY.REFUND` in the admin refund path (`eventKey: payment.{id}.refunded`).
2. In `payment/index.ts`, accept `notificationPort?: NotificationPort` in `createPaymentModule` deps and pass it to the service.
3. In `services.ts`, wire `notificationPort: notification.service`.
4. Verify `EMAIL_SUPPORTED_CATEGORIES` in `notification.service.ts` already includes `payment`/`refund`; if not, add them so the dispatch row is queued.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/payment-flow.test.ts packages/api/src/tests/unit/payment.service.test.ts packages/api/src/tests/unit/notification.service.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/payment/ packages/api/src/modules/notification/notification.service.ts packages/api/src/services.ts packages/api/src/tests/
git commit -m "fix(payment): write payment/refund notifications to satisfy the notification matrix"
```

### Task 5.4: Group-series creation flow (B8, MEDIUM, PRD FR-20 TC-24/25/27/28/30/32-34)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.types.ts` (group-series input schemas)
- Modify: `packages/api/src/modules/booking/booking.service.ts` (`createSeries`, ~1802-1881 — add the group branch)
- Modify: `packages/api/src/modules/booking/booking.repo.ts` (invitee lookup, per-session holds support)
- Modify: `packages/api/src/tests/integration/booking-group-series.test.ts`

**Interfaces:**
- Consumes: existing `confirmInvite`-family flows (full-series accept/decline), `wallet.hold`, `repo` participant/session methods, `notifyGroupSeriesDisclaimer` (G15) per TC-25.
- Produces: a `createGroupSeries` path — `targetGroupSize` 2-6, invitees selected from registered users, upfront per-participant holds for all sessions, full-series package accept/decline, disclaimer surfaced per TC-25, and group-series invite accept/decline. Solo `createSeries` (hardcoded `targetGroupSize: 1` at `booking.service.ts:1881`) is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/tests/integration/booking-group-series.test.ts`:
```ts
test("group series: proposer creates a 3-person series with upfront holds for all sessions", async () => {
  // create group series targetGroupSize 3, 4 sessions, invitees B + C
  // assert each session holds per-participant amount for proposer + invitees (upfront)
  // invitee B accepts the full-series package via confirmInvite-family flow
  // assert booking.confirmedHeadcount increments; assert disclaimer notification (G15) sent per TC-25
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-group-series.test.ts -t "group series"`
Expected: FAIL (`createSeries` rejects `targetGroupSize > 1` / hardcodes 1 today).

- [ ] **Step 3: Implement**

1. In `booking.types.ts`, add `createGroupSeriesInput` (extends series input with `targetGroupSize: z.number().int().min(2).max(6)`, `inviteeUserIds: z.array(z.string()).min(1).max(5)`).
2. In `booking.service.ts`, branch `createSeries` when `targetGroupSize > 1`: validate invitees are registered users, create the series booking + per-session holds for proposer and each invitee, and emit the G15 disclaimer notification per TC-25.
3. Reuse the `confirmInvite`-family flows for full-series package accept/decline (`confirmGroupSeriesInvite`/`declineGroupSeriesInvite`), gated on the series group type.
4. In `booking.repo.ts`, add any missing query methods (e.g. `findUsersByIds`, per-session participant insert).

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-group-series.test.ts packages/api/src/tests/integration/booking-g4.test.ts packages/api/src/tests/integration/scheduler-expiry.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.types.ts packages/api/src/modules/booking/booking.service.ts packages/api/src/modules/booking/booking.repo.ts packages/api/src/tests/integration/booking-group-series.test.ts
git commit -m "feat(booking): group-series creation with upfront per-session holds (FR-20)"
```

### Task 5.5: Per-session post-H2 forfeit (B9, LOW-MED, PRD series rules/TC-30)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts` (`cancelSession`, ~1108-1140)
- Modify: `packages/api/src/tests/integration/booking-g5.test.ts`

**Interfaces:**
- Consumes: `wallet.deduct`, existing participant/session repo methods.
- Produces: post-H2 `cancelSession` deducts the session's `heldAmount` (forfeit), marks the session cancelled/no-show, and notifies; pre-H2 unchanged (release).

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/tests/integration/booking-g5.test.ts`:
```ts
test("TC-30: cancelling a series session after H-2 forfeits the session hold", async () => {
  // create series, backdate session.scheduledStartAt to now-3h (past H-2)
  // cancelSession(userId, sessionId)
  // assert session cancelled and the participant's wallet totalBalance decreased by the session hold
  // assert a ledger 'deduct' entry with eventKey booking.{bookingId}.session.{sessionId}.forfeit
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-g5.test.ts -t "forfeits"`
Expected: FAIL (`cancelSession` throws `BookingCancellationDeadlinePassedError` today).

- [ ] **Step 3: Implement**

In `cancelSession`, replace the `BookingCancellationDeadlinePassedError` throw with a forfeit path:
```ts
if (isPastCancellationDeadline(session)) {
  const participant = await repo.findSessionParticipant(tx, session.bookingId, userId);
  if (participant && participant.heldAmount > 0) {
    const w = await wallet.getByUserId(tx, userId);
    if (!w) throw new BookingNotFoundError(userId);
    await wallet.deduct(tx, {
      walletId: w.id,
      amount: participant.heldAmount,
      eventKey: `booking.${session.bookingId}.session.${session.id}.forfeit`,
      sourceReference: session.bookingId,
      bookingId: session.bookingId,
      actorType: ACTOR_TYPE.STUDENT,
      reason: "Session cancelled after cancellation deadline (forfeit)",
    });
    await repo.updateParticipantState(tx, participant.id, { heldAmount: 0 });
  }
  await repo.cancelSession(tx, session.id, { forfeited: true });
  // notify the student (emailRequired) + log the forfeit
  return;
}
// pre-H2 unchanged: release + cancel
```
> Confirm whether G5 unit tests assert `BookingCancellationDeadlinePassedError` — update them to the new forfeit behavior. Keep the error type for any other caller or remove it if unused.

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-g5.test.ts packages/api/src/tests/integration/booking-group-series.test.ts packages/api/src/tests/unit/booking.service.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts packages/api/src/modules/booking/booking.repo.ts packages/api/src/tests/integration/booking-g5.test.ts
git commit -m "fix(booking): forfeit per-session hold when a series session is cancelled after H-2 (TC-30)"
```

### Task 5.6: Conditional Xendit env validation (M4, MEDIUM)

**Files:**
- Modify: `packages/env/src/server.ts:15-26` (`PAYMENT_PROVIDER` + Xendit vars)
- Modify: `packages/env/src/server.test.ts` (or the existing env schema test)
- Modify: `packages/api/src/modules/payment/index.ts:32-46` + `packages/api/src/services.ts` wiring (`payment` provider selection)

**Interfaces:**
- Consumes: `PAYMENT_PROVIDER`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`.
- Produces: env schema `superRefine` — when `PAYMENT_PROVIDER === "xendit"`, `XENDIT_SECRET_KEY` and `XENDIT_WEBHOOK_TOKEN` are required; the stub default remains valid only for `provider === "stub"`. Silent fallback to stub when keys are missing is removed (provider selection fails loudly at startup instead).

- [ ] **Step 1: Write the failing test**

Add to `packages/env/src/server.test.ts`:
```ts
test("PAYMENT_PROVIDER=xendit requires Xendit credentials", () => {
  const base = { ...validEnv, PAYMENT_PROVIDER: "xendit" };
  expect(() => serverEnvSchema.parse({ ...base })).toThrow();
  expect(() => serverEnvSchema.parse({
    ...base,
    XENDIT_SECRET_KEY: "sk", XENDIT_WEBHOOK_TOKEN: "wh",
  })).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/env/src/server.test.ts -t "PAYMENT_PROVIDER=xendit"`
Expected: FAIL (keys are optional today, so no throw).

- [ ] **Step 3: Implement**

In `packages/env/src/server.ts`, after the schema object:
```ts
.superRefine((val, ctx) => {
  if (val.PAYMENT_PROVIDER === "xendit") {
    if (!val.XENDIT_SECRET_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["XENDIT_SECRET_KEY"], message: "required when PAYMENT_PROVIDER=xendit" });
    }
    if (!val.XENDIT_WEBHOOK_TOKEN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["XENDIT_WEBHOOK_TOKEN"], message: "required when PAYMENT_PROVIDER=xendit" });
    }
  }
})
```
In `payment/index.ts`, remove the silent fallback: if `PAYMENT_PROVIDER === "xendit"` but `xenditConfig` is missing, throw a config error (the env gate makes this unreachable in practice, but assert it).

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/env/src/server.test.ts packages/api/src/tests/unit/payment.service.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/env/src/server.ts packages/env/src/server.test.ts packages/api/src/modules/payment/index.ts packages/api/src/services.ts
git commit -m "fix(env): require Xendit credentials when PAYMENT_PROVIDER=xendit; remove silent stub fallback"
```

### Task 5.7: Email HTML injection via reason (M5, MEDIUM)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.router.ts` (`cancellationReason` ~71-74, decline `reason` ~258-262) — bound inputs
- Modify: `packages/api/src/lib/email.ts` or `notification.service.ts` — add `escapeHtml` helper (or reuse a sanitizer)
- Modify: `packages/api/src/modules/booking/booking.service.ts:874` (decline email body) and audit all other notification bodies interpolating user input
- Modify: `packages/api/src/tests/unit/booking.service.test.ts` (or a notification email-composition test)

**Interfaces:**
- Consumes: bounded zod inputs, an `escapeHtml(str): string` helper (escapes `&<>"'`).
- Produces: `cancellationReason` and decline `reason` bounded (e.g. `.max(500)`); every user-supplied string interpolated into email `html` bodies is HTML-escaped before render.

- [ ] **Step 1: Write the failing test**

Add to the notification/booking email-composition tests:
```ts
test("user-supplied reason is HTML-escaped in the composed email body", async () => {
  const body = composeDeclineEmailBody(`<script>alert(1)</script>`);
  expect(body).not.toContain("<script>");
  expect(body).toContain("&lt;script&gt;");
});
test("decline reason and cancellationReason are length-bounded", async () => {
  // 501-char reason fails input validation
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/booking.service.test.ts -t "escaped"`
Expected: FAIL (raw `reason` is interpolated into the HTML body today).

- [ ] **Step 3: Implement**

1. In `booking.router.ts`, add `.max(500)` to `cancellationReason` (~72) and the decline `reason` (~260).
2. Add `escapeHtml` to the email/notification lib:
```ts
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```
3. Wrap the `reason`/`cancellationReason` interpolation in `booking.service.ts:874` (and any other notification body that interpolates user input found in the audit — check decline/cancel/reschedule/tutor-decline bodies).

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/booking.service.test.ts packages/api/src/tests/unit/notification.service.test.ts packages/api/src/tests/integration/booking-solo.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.router.ts packages/api/src/modules/booking/booking.service.ts packages/api/src/lib/email.ts packages/api/src/tests/
git commit -m "fix(notification): bound and HTML-escape user-supplied reason fields in email bodies"
```

### Task 5.8: Body-size + OpenAPI hardening (L1/L2/L3, LOW)

**Files:**
- Modify: `apps/server/src/routes.ts` (body-size check ~152-165; OpenAPI gate ~227-238)
- Modify: `packages/api/src/modules/booking/booking.router.ts:71-74` (bound `cancellationReason`)
- Modify: `apps/server/src/routes.test.ts` (or equivalent server route test)

**Interfaces:**
- Produces:
  - L1: webhook + rpc bodies are size-enforced at read time (stream the body and reject past the limit), not by trusting the `content-length` header alone (chunked bodies bypass it).
  - L2: `cancellationReason` (and the decline `reason`) bounded with `.max()`.
  - L3: `/openapi.json` and `/api-reference` require auth (or admin) in non-production, instead of gating on `NODE_ENV` only.

- [ ] **Step 1: Write the failing tests**

Add to `apps/server/src/routes.test.ts` (or a new body-limit test):
```ts
test("chunked request bodies over the limit are rejected at read time", async () => {
  // send a chunked POST /rpc/... or webhook body > limit (no content-length header)
  // assert 413 / body-rejected error
});
test("cancellationReason over 500 chars is rejected", async () => {
  // 501-char cancellationReason → input validation failure
});
test("openapi.json requires auth when NODE_ENV !== production", async () => {
  // GET /openapi.json without session in development → 401, not 200
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --env-file apps/server/.env apps/server/src/routes.test.ts`
Expected: FAIL (Content-Length-only check, unbounded `cancellationReason`, env-only gate).

- [ ] **Step 3: Implement**

1. L1: in the `.onRequest`/body-read path, replace the `content-length`-only check with a read-time size guard — read the body up to `MAX_BODY_BYTES` and reject (413) if it exceeds the limit, so chunked bodies are covered.
2. L2: add `.max(500)` to `cancellationReason` in `booking.router.ts:71-74` (decline `reason` is handled in Task 5.7).
3. L3: gate `/openapi.json` + `/api-reference` on an authenticated session (or admin role) when `NODE_ENV !== "production"`, keeping production's behavior (and optionally restricting to admin everywhere).

- [ ] **Step 4: Run tests**

Run: `bun test --env-file apps/server/.env apps/server/src/routes.test.ts apps/server/src/openapi.test.ts`
Run: `bun run check-types`
Expected: PASS (update `openapi.test.ts` if it asserts the unauthenticated dev access).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes.ts apps/server/src/routes.test.ts apps/server/src/openapi.test.ts packages/api/src/modules/booking/booking.router.ts
git commit -m "fix(server): read-time body-size enforcement and auth-gated OpenAPI endpoints"
```

---

## PR 6 — Follow-ups from SDD Ledger Scan (2026-08-14)

**Source:** concerns surfaced by scanning `.superpowers/sdd/BACKEND-HARDENING/progress.md` ("Outstanding deferred concerns") + Agent A's implementation report + the halted Agent B's partial state. All documented here BEFORE any out-of-scope change per the audit protocol.

### Task 6.1: Webhook IP allowlist trusts first `x-forwarded-for` hop (spoofable)

**PRD:** NFR authorization; security hardening.

**Concern P1-6:** `ipAllowed` (`apps/server/src/webhooks/payments.ts:19-22`) still reads the first `x-forwarded-for` hop unconditionally — the same spoofing issue Task 1.3 fixed for rate-limit keys (routes.ts now uses `getClientIp(request, env.TRUST_PROXY)` from `packages/api/src/lib/request-id.ts`). When the server is reachable directly, an attacker sets `x-forwarded-for: <allowed-ip>` to defeat `WEBHOOK_ALLOWED_IPS`.

**Fix:** change `ipAllowed(request, allowlist)` → `ipAllowed(request, allowlist, trustProxy)` and call it with `env.TRUST_PROXY` from the webhook handler. Use the existing `getClientIp` helper. Add a unit test: allowlist bypass fails when trustProxy=false and XFF header is spoofed; passes when the real IP (x-real-ip) is allowlisted.

**Files:** `apps/server/src/webhooks/payments.ts`, new `apps/server/src/webhooks/ip-allowlist.test.ts`.

### Task 6.2: Support-ticket SLA auto-escalation job

**PRD:** OQ-04, G1 spec ("Ticket auto-escalates if SLA deadline passes without response").

**Concern P1-1:** `support.createTicket` sets `slaDeadline` (12h) and the admin list sorts by SLA urgency, but no scheduler job scans tickets past `slaDeadline` — no escalation state, no WhatsApp escalation (WhatsApp itself is a separate out-of-scope integration, but the in-app escalation state + admin flag is in scope).

**Fix:** new BullMQ repeatable job `escalate-support-tickets` (e.g. every 15 min) that marks tickets past `slaDeadline` with status `in_progress` + an `escalated` flag (or a new `escalated` boolean column via migration) and writes an audit entry. Wire in `apps/server/src/scheduler.ts` + `scheduler.service.ts` handlers. Integration test: ticket past SLA → escalated flag set.

**Files:** `packages/api/src/modules/support/*` (service+repo), `packages/api/src/modules/scheduler/` (+ new job), `apps/server/src/scheduler.ts`, `packages/db/src/schema/support-ticket.ts` (migration if new column).

### Task 6.3: Meeting event lifecycle — update on reschedule, delete on cancel

**PRD:** FR-21, OQ-05, G12 spec items 2-3.

**Concern P1-2:** `MeetingPort` exposes only `createEvent` (`meeting.types.ts:16-22`); the Google event is never updated when `acceptReschedule` moves the booking and never cancelled when the booking is cancelled/declined/expired. The old event leaks.

**Fix:** add `updateEvent(bookingId, { startAt, endAt })` and `cancelEvent(bookingId)` to `MeetingPort` + google-meeting provider (events.update / events.delete via the existing OAuth + service-account paths); call `updateEvent` in `acceptReschedule` (after the schedule is committed) and `cancelEvent` in the booking terminal transitions (cancel/late-cancel/decline/expire paths, best-effort with circuit breaker). Manual links: no-op. Tests: provider update/delete mocks + booking integration test asserting provider called.

**Files:** `packages/api/src/modules/meeting/*`, `packages/api/src/modules/booking/booking.service.ts`, tests.

### Task 6.4: `applyOverride` returns stale holdAmount in response

**Concern P1-5 (from phase-1 review):** `admin-booking.applyOverride` response reflects the pre-update `holdAmount` after a Marks action changed it.

**Fix:** re-read the booking row after the override transaction and return the refreshed record (or explicitly return the projected holdAmount). Add regression test asserting the response holdAmount equals the post-override DB value.

**Files:** `packages/api/src/modules/admin-booking/admin-booking.service.ts`, tests.

### Task 6.5: Offline room confirmed/relocated/cancelled email notifications

**PRD:** Notification matrix row "Offline room confirmed / relocated / cancelled — in-app + email (tutor + confirmed students)".

**Concern P1-3 (part):** `room.assign/relocate/cancelBooking` write no notifications at all (room module has no notification port). In-app rows + email dispatch rows are both missing.

**Fix:** add a consumer-driven `NotificationPort` to the room module; write notifications (emailRequired) on assign (confirmed), relocate (relocated), cancel (cancelled) to tutor + confirmed students. Tests: room-flow tests assert notification rows created.

**Files:** `packages/api/src/modules/room/*` (index.ts port, room.service.ts calls), `packages/api/src/services.ts` (wire port — already wired for booking, extend for room), tests.

### Task 6.6: `.env.example` missing new security flags

**Concern P1-4 + v1.2 additions:** `WEBHOOK_ALLOWED_IPS`, `STUB_WEBHOOK_ALLOWED`, `TRUST_PROXY`, `SEED_ALLOWED_IN_PROD`, `SEED_ADMIN_PASSWORD`, `R2_*`, `UPLOAD_DIR` are not documented in `apps/server/.env.example`.

**Fix:** add all of the above to `.env.example` with comments (document `REDIS_URL` too if missing).

**Files:** `apps/server/.env.example`.

### Parked (documented, no dispatch)

- P1-3 part: signup "account created" email — tied to email verification (G2, deferred); parked.
- P1-7: CONTEXT.md anchor drift (`admin-booking.repo.ts:31-33` line numbers) — doc nit, fixed during plan-sync.
- P1-9: C2 rate-limit test is source-text based — test-quality nit; parked.
- C3 (Agent A): `evlog` + `bun test` hang — pre-existing; workaround = test pure helpers from `packages/api/src/lib/request-id.ts`; parked.
- C1 (Agent A): full-suite gate must use `--env-file apps/server/.env.test` (`.env` points at dev DB `cogito-app` which `resetDatabase()` blocks). All agents MUST use `.env.test`.

---

## Roadmap (execution order)

| Step | PR | Branch | Blocks | Concern addressed |
|---|---|---|---|---|
| 1 | PR 1 | `fix/backend-security` | — | Stub webhook fraud, webhook race, rate-limit bypass, seed guard |
| 2 | PR 2 | `fix/prd-money-correctness` | — | Group over-charge, late-cancel penalty, dead offline loop |
| 3 | PR 3 | `fix/email-outbox` | — | Email-in-tx violation, dead scheduler job, re-purchase |
| 4 | PR 4 | `feat/file-upload` | — | PRD "proof URL or file" gap |
| 5 | PR 5 | `fix/correctness-followups` | — | deadline repricing, KB total balance, payment notifications, group series, per-session forfeit, env validation, email injection, body/OpenAPI hardening |
| 6 | PR 6 | `fix/ledger-followups` | — | webhook IP allowlist spoof, ticket SLA escalation, meeting event lifecycle, stale override response, room email notifications, .env.example |

**Sequencing rationale:** all six are independent (no shared files beyond `services.ts`/`routes.ts` which merge cleanly). Merge in the listed order to keep review surface small. PR 2's Task 2.2 touches `cancelAllSessions` (repo) — if PR 4, PR 5 or PR 6 also touches `routes.ts`, the later PR rebases. PR 6 branches off the merged PR 1-5 state (recommended: each PR branches from the previous merged PR's HEAD so merges are fast-forward).

**Per-PR gates:** `bun run check-types`, `bun run lint`, full suite `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env.test packages/api/src/tests/ apps/server/src/openapi.test.ts` (0 fail), then open the PR against main. PR 5 and PR 6 use the same gates. NOTE: use `.env.test` (CI-matching), not `.env` — `.env` points at the dev DB (`cogito-app`) which `resetDatabase()` blocks.

---

### Version Notes

- v1.2 (2026-08-14): Execution began on `fix/backend-hardening-phase2`. PR 1 (Tasks 1.1–1.4), Task 5.6 (env part), Task 5.8 (routes parts), and Task 4.1 (env vars + `/uploads/*` route) IMPLEMENTED by Agent A (commits `3732169`..`4cf0fb5`); Tasks 2.1–2.3 IMPLEMENTED by Agent B (commits `a492fbe`..`fc3be8f`, g4 test fix `b34f045`) — Agent B halted before 5.1/5.4/5.5/5.7. Added PR 6 (Follow-ups from SDD Ledger Scan) with Tasks 6.1–6.6 from `.superpowers/sdd/BACKEND-HARDENING/progress.md` outstanding concerns + Agent A report concerns; parked items documented. Noted the `.env.test` gate requirement (C1). Remaining un-landed work: PR 2 remainder (5.1, 5.4, 5.5, 5.7), PR 3 (3.1, 3.2), PR 4 (4.1 storage/module/wiring), PR 5 (5.2, 5.3, 5.6 payment-part, 5.7-part), PR 6 (6.1–6.6).
- v1.1 (2026-08-14): Annotated all PR 1-4 tasks with verified-not-implemented status (HEAD `9b7df5e`); noted PR 3 Task 3.1 as partial (dispatch rows queued, but `emailPort.send` still inline — no consumer job). Added PR 5 (Correctness & Security Follow-ups) with findings B3/B4/B6/B8/B9 + M4/M5/L1-L3 from the 2026-08-14 audit: group deadline repricing, Knowledge Bank total-balance eligibility, payment/refund notifications, group-series creation, per-session post-H2 forfeit, conditional Xendit env validation, email HTML injection via reason, and body-size/OpenAPI hardening. Updated title/architecture to 5 PRs and roadmap with PR 5.
- v1.0 (2026-08-14): Created from the final backend codebase review. 4 PRs: security hardening, PRD money correctness, email outbox + re-purchase, file upload (R2).
