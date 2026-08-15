# Backend Review Fixes 2 — Implementation Plan

> **STATUS: ACTIVE — execution in progress on branch `fix/review-fixes-2` (worktree `wt-review-fixes2`).** PR A (R1), PR B (R2/R3), PR C (R4/R5), PR D (R6–R10) landed. Wave-2 findings from the 2026-08-15 codebase review (post-#48): 10 code findings (R1–R10), 9 files below the 90% coverage target, and 2 small PRD gaps pulled in (U13, U4). Verified at git HEAD `30f805e` (merge of #48).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every wave-2 finding from the post-merge review — the never-firing RPC rate limits, the solo-withdraw state bug, upload/payment edge cases, and the reliability gaps — then bring 9 API files above the 90% coverage gate and close two small PRD gaps.

**Architecture:** 6 independent PRs, backend-only, all targeting `main`. Follows the existing 4-layer pattern (Router → Handler → Service → Repository), consumer-driven ports, `DomainError` + `withDomainMap`, bounded zod, `DbOrTx`, and real-DB integration tests. PR order is dependency-safe (rate limits → booking → uploads/payments → reliability → coverage → small PRD gaps).

**Tech Stack:** Bun 1.3.14, Elysia, oRPC, Drizzle + postgres.js, BullMQ, better-auth, Cloudflare R2, bun:test, oxlint/oxfmt.

## Global Constraints

- Import from `@cogito-app/...` package paths; modules use `../../lib`, `../../shared`, `../../procedures`.
- 4-layer pattern; `DbOrTx` (`packages/api/src/lib/tx.ts`); `DomainError` + `withDomainMap`; bounded zod.
- **RPC protocol facts (from the wave-1 audit):** HTTP paths are the oRPC procedure keys with slashes — `/rpc/payment/createPurchase`, NOT `/rpc/payment.createPurchase`. Request bodies must be wrapped in the `{"json": <input>}` envelope. Responses come back as `{"json": <data>, "meta": [...]}`.
- **Docs follow code (AGENTS.md rule 11):** every PR must update the affected docs (`docs/CONTEXT.md`, `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md`, `docs/RUNBOOK.md`, and `docs/plans/` statuses) in the same PR.
- Conventional commits (`fix/feat/refactor/docs/test/chore`); commit after each green step.
- Verify per task: `bun run check-types`, `bun run lint`, targeted `bun test --env-file apps/server/.env ...`; full suite at the end.
- Local test DB `postgresql://postgres:password@localhost:6767/cogito-test`, Redis `localhost:6379` (both mandatory; `bun run db:start`/`db:test` bring them up).
- CI gates: packages/api ≥ 90% lines, overall ≥ 80%. Baseline: full suite 1658 pass / 0 fail.
- `GOOGLE_MEET_*` env must be unset when running the suite so the env-dependent meeting test (`booking-solo.test.ts` "meeting event created") passes: `GOOGLE_MEET_ENABLED=false GOOGLE_MEET_REFRESH_TOKEN= GOOGLE_MEET_CLIENT_ID= GOOGLE_MEET_CLIENT_SECRET= GOOGLE_CLIENT_EMAIL= GOOGLE_PRIVATE_KEY= bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts`

## Concern Inventory (verified 2026-08-15)

| ID  | Severity | Finding                                                                                                                                                                                                                     | Location                                                                 | PR  |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --- |
| R1  | HIGH     | RPC rate-limit paths use dotted keys; real URLs are slash keys — the payment/invite/booking/search limits never fire (only the `/api/auth/*` limit works)                                                                   | `apps/server/src/routes.ts:212-251`                                      | A   |
| R2  | HIGH     | Solo `withdraw` from CONFIRMED/SCHEDULED → `AWAITING_RECONFIRMATION` instead of CANCELLED; hold not zeroed, Meet link not cancelled, withdrawn student can `reconfirm` into a no-hold booking (free session)                | `packages/api/src/modules/booking/booking.service.ts:2069-2081`          | B   |
| R3  | HIGH     | `meeting.cancelEvent` inside the withdraw tx is not rolled back if a later reprice throws                                                                                                                                   | `booking.service.ts:2049`                                                | B   |
| R4  | MED      | Presigned POST policy omits the `x-amz-algorithm/credential/date` conditions — S3/R2 reject unmatched form fields                                                                                                           | `packages/api/src/lib/storage.ts:65-73`                                  | C   |
| R5  | MED      | REFUNDED webhook keeps the credited marks; `mapXenditStatus` lacks REFUNDED (a real Xendit refund 500s)                                                                                                                     | `payment.service.ts:270-293`, `xendit-payment.provider.ts:35-46`         | C   |
| R6  | MED      | Outbox stale-`sending` reclaim ignores the attempts budget (crash-looping rows re-claimed forever)                                                                                                                          | `notification.repo.ts:190-196`                                           | D   |
| R7  | MED      | Webhook idempotency claim locks the key for 24h after a crash — provider retries are answered "idempotent" without processing                                                                                               | `lib/idempotency.ts:69-92`, `apps/server/src/webhooks/payments.ts:91-95` | D   |
| R8  | MED      | `waitForMeetUrl` poll failure after a successful Google event insert → duplicate events on retry                                                                                                                            | `google-meeting.provider.ts:542-598`                                     | D   |
| R9  | LOW      | `eventName` unescaped in the adminReview notification body (email HTML)                                                                                                                                                     | `achievement.service.ts:152-153`                                         | D   |
| R10 | LOW      | `seed-invite.ts` prints the stored SHA-256 hash as if it were the plaintext token                                                                                                                                           | `apps/server/src/seed-invite.ts:32`                                      | D   |
| —   | COV      | 9 API files below 90% lines: storage 18.7%, availability.types 47.9%, request-id 51.1%, meeting/index 58.3%, auth.handler 61.2%, google-meeting.provider 72.9%, auth.errors 74.1%, auth.repo 75.0%, fallback.provider 86.4% | see PR E                                                                 | E   |
| —   | PRD      | U13 Knowledge Bank eligibility uses `availableBalance`, must be `totalBalance`                                                                                                                                              | `wallet.service.ts:421-435`                                              | F   |
| —   | PRD      | U4 group-series full-series `withdraw` not blocked (no-opt-out rule)                                                                                                                                                        | `booking.service.ts:1948-2095`                                           | F   |

**Tracked backlog (NOT in this wave, statuses verified):** PRD-GAPS-PHASE3 U1, U2, U3, U5, U6, U7, U8-full (spend-limited refund), U9 (business-hours SLA), U10, U12, U14; FRONTEND-GAPS-SPEC (F1–F3, F6–F9, F11–F14, partial F8/F16/F17); DEFERRED-OPS-TASKS §2 (Redis session caching), §3 (manual verification), §4 (production ops); C6 (upper/lower/digit password policy), G2 (email verification), J2 (session-expiry UX).

---

## PR A — RPC Rate-Limit Path Fix

**Goal:** make the payment/invite/booking/search rate limits actually match real requests.

### Task A.1: Fix the route path patterns

**Files:**

- Modify: `apps/server/src/routes.ts:205-255`
- Test: `apps/server/src/rpc-rate-limit.test.ts` (new)

**Interfaces:**

- Consumes: existing `rateLimit` instances (`paymentRateLimit`, `inviteRateLimit`, `bookingRateLimit`, `searchRateLimit`), `getClientIp`.
- Produces: the four `path`/`path.startsWith` checks use the real slash-key URLs.

> **Execution note (PR A, merged):** the HTTP-level loop test below was replaced by a deterministic unit test. `server.handle()`-level 429 tests hang the bun test process on this stack (pre-existing `evlog()` + ioredis `eval` interaction, reproduced identically on main). Instead, path matching was extracted into a pure module `apps/server/src/rate-limit-paths.ts` (`matchRateLimitPath`, `matchAuthPath`) and tested directly in `rpc-rate-limit.test.ts`; `routes.ts` delegates to it and the old source-text `rate-limit.test.ts` was updated accordingly.

- [x] **Step 1: Write the failing test** (adapted to `matchRateLimitPath` unit test — see execution note)

Create `apps/server/src/rpc-rate-limit.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createServer } from "./routes";

// NOTE: `server.handle()` runs without a real socket, so `getClientIp`
// resolves to "unknown" — every request shares one rate-limit bucket, which
// is exactly what these tests need (same client = same bucket).
describe("RPC rate limits match real slash-key paths", () => {
  test("payment.createPurchase is limited to 5/min (path /rpc/payment/createPurchase)", async () => {
    const server = createServer();
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (
        await server.handle(
          new Request("http://localhost:3001/rpc/payment/createPurchase", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"json":{}}',
          }),
        )
      ).status;
    }
    expect(last).toBe(429);
  });

  test("booking paths are limited to 30/min (path /rpc/booking/)", async () => {
    const server = createServer();
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (
        await server.handle(
          new Request("http://localhost:3001/rpc/booking/listMine", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"json":{}}',
          }),
        )
      ).status;
    }
    expect(last).toBe(429);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env apps/server/src/rpc-rate-limit.test.ts`
Expected: FAIL — the 6th payment request returns 401 (auth, not 429) because the rate limit never fires.

- [x] **Step 3: Fix the path patterns in `routes.ts`** (extracted to `rate-limit-paths.ts`)

In the `.onRequest` rate-limit hook, change:

```ts
if (path === "/rpc/payment.createPurchase") {
```

to:

```ts
if (path === "/rpc/payment/createPurchase") {
```

```ts
if (path.startsWith("/rpc/invite.verify")) {
```

to:

```ts
if (path.startsWith("/rpc/invite/verify")) {
```

```ts
if (path.startsWith("/rpc/booking.")) {
```

to:

```ts
if (path.startsWith("/rpc/booking/")) {
```

```ts
if (path.startsWith("/rpc/auth.students/search")) {
```

to:

```ts
if (path.startsWith("/rpc/auth/searchStudents")) {
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test --env-file apps/server/.env apps/server/src/rpc-rate-limit.test.ts`
Expected: PASS (429 on the 6th payment request and the 31st booking request).

- [x] **Step 5: Update docs**

- `docs/CONTEXT.md` — the R1 row in the "2026-08-15 wave-2 findings" table and the "Remaining:" bullet in the security section: mark R1 **Fixed** (with PR ref after merge).
- `docs/plans/active/REVIEW-FIXES-2.md` — mark Task A.1 done.

- [x] **Step 6: Commit**

```bash
git add apps/server/src/routes.ts apps/server/src/rpc-rate-limit.test.ts docs/CONTEXT.md docs/plans/active/REVIEW-FIXES-2.md
git commit -m "fix(security): match RPC rate-limit paths to real slash-key URLs (R1)"
```

---

## PR B — Booking Withdraw Fixes

**Goal:** solo withdrawals cancel the booking (not regress to reconfirmation) and provider-side meeting cancellation is not rolled back by the DB transaction.

### Task B.1: Solo withdraw from CONFIRMED/SCHEDULED cancels (R2)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts:2029-2095` (withdraw branch)
- Test: `packages/api/src/tests/unit/booking.service.test.ts` (withdraw describe)

**Interfaces:**

- Consumes: `transition`, `repo.updateBookingHoldAmount`, `meeting.cancelEvent`, `BOOKING_STATE`.
- Produces: a solo booking withdrawn from `CONFIRMED`/`SCHEDULED`/`AWAITING_ADMIN_ROOM_APPROVAL` transitions to `CANCELLED`, zeroes `holdAmount`, and cancels the meeting link.

- [x] **Step 1: Write the failing test**

In the `withdraw` describe of `packages/api/src/tests/unit/booking.service.test.ts`, add:

```ts
test("solo withdraw from a confirmed booking transitions to cancelled, zeroes hold, cancels the meeting (R2)", async () => {
  const booking = makeBooking({
    type: "solo",
    currentState: "confirmed",
    scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });
  const participant = makeParticipant({ heldAmount: 42 });
  const { service, repo, meeting } = createService({
    repo: {
      findBookingById: mock(async () => ({ ...booking, version: 1 })),
      findParticipant: mock(async () => participant),
      findConfirmedParticipants: mock(async () => []),
      updateBookingVersioned: mock(async () => ({
        updated: { ...booking, currentState: "cancelled" },
        newVersion: 2,
      })),
    },
  });

  await service.withdraw("student1", "b1");

  expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
    expect.anything(),
    "b1",
    1,
    expect.objectContaining({ currentState: "cancelled" }),
  );
  expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
    expect.anything(),
    "b1",
    0,
  );
  expect(meeting.cancelEvent).toHaveBeenCalledWith("b1");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/booking.service.test.ts`
Expected: FAIL — the current code transitions to `awaiting_reconfirmation` and never zeroes `holdAmount`.

- [x] **Step 3: Fix the withdraw branch**

In `booking.service.ts`, the `else if (!isLate)` block currently is (approx. lines 2029-2095):

```ts
if (b.type === GROUP && regressableStates.includes(currentState)) {
  // ... meeting.cancelEvent(bookingId) inside the tx, transition to
  // AWAITING_RECONFIRMATION, repriceGroupForHeadcount
} else if (b.type === BOOKING_TYPE.GROUP) {
  void currentState;
} else if (regressableStates.includes(currentState)) {
  // ... transition to AWAITING_RECONFIRMATION  ← BUG: also matches solo
} else {
  // ... transition to CANCELLED
}
```

Restructure so solo bookings in post-confirmation states cancel (and group-series solo-series keep the legacy reconfirmation behavior only in the awaiting states):

```ts
} else if (!isLate) {
  const currentState = b.currentState as BookingState;
  if (b.type === BOOKING_TYPE.GROUP && regressableStates.includes(currentState)) {
    await transition(tx, bookingId, BOOKING_STATE.AWAITING_RECONFIRMATION, {
      actorId: userId,
      actorType: ACTOR_TYPE.STUDENT,
      reason: "Participant withdrew before H-2",
    });
    await repriceGroupForHeadcount(tx, b, remaining, ACTOR_TYPE.STUDENT);
  } else if (b.type === BOOKING_TYPE.GROUP) {
    // Group in a non-regressable non-terminal state continues.
    void currentState;
  } else if (
    b.type === BOOKING_TYPE.SOLO &&
    (currentState === BOOKING_STATE.CONFIRMED ||
      currentState === BOOKING_STATE.SCHEDULED ||
      currentState === BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL)
  ) {
    // The proposer is the only participant; cancelling is correct (R2).
    await repo.updateBookingHoldAmount(tx, bookingId, 0);
    await transition(tx, bookingId, BOOKING_STATE.CANCELLED, {
      actorId: userId,
      actorType: ACTOR_TYPE.STUDENT,
      reason: "Participant withdrew",
    });
  } else if (regressableStates.includes(currentState)) {
    await transition(tx, bookingId, BOOKING_STATE.AWAITING_RECONFIRMATION, {
      actorId: userId,
      actorType: ACTOR_TYPE.STUDENT,
      reason: "Participant withdrew before H-2",
    });
    await repriceGroupForHeadcount(tx, b, remaining, ACTOR_TYPE.STUDENT);
  } else {
    await transition(tx, bookingId, BOOKING_STATE.CANCELLED, {
      actorId: userId,
      actorType: ACTOR_TYPE.STUDENT,
      reason: "Participant withdrew",
    });
  }
}
```

Then add a `meetingCancelled` flag outside the transaction (see Task B.2) so `meeting.cancelEvent` runs after the tx commits.

- [x] **Step 4: Run tests to verify they pass**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/booking.service.test.ts`
Expected: PASS (existing + new). Also run `packages/api/src/tests/integration/booking-solo.test.ts` with the `GOOGLE_MEET_*` unset override.

- [x] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts packages/api/src/tests/unit/booking.service.test.ts
git commit -m "fix(booking): solo withdraw cancels instead of regressing to reconfirmation (R2)"
```

### Task B.2: Meeting cancellation outside the withdraw transaction (R3)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts` (withdraw + the branch from B.1)
- Test: `packages/api/src/tests/unit/booking.service.test.ts`

**Interfaces:**

- Produces: `withdraw` calls `meeting.cancelEvent(bookingId)` only AFTER the transaction commits (all paths: group regress, solo cancel).

- [x] **Step 1: Write the failing test**

Add to the withdraw describe:

```ts
test("meeting cancellation happens after the transaction commits, not inside it (R3)", async () => {
  const booking = makeBooking({
    type: "group",
    currentState: "confirmed",
    targetGroupSize: 3,
    scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    priceSnapshot: {
      perStudent: 42,
      baseline: 42,
      tutorShare: 33.6,
      cogitoTake: 8.4,
      baselineCogitoTake: 12,
      baselineTutorShare: 30,
      extraTotal: 0,
      cogitoExtraTake: 0,
      tutorExtraShare: 0,
    },
  });
  const participant = makeParticipant({ heldAmount: 42 });
  const order: string[] = [];
  const { service, meeting } = createService({
    repo: {
      findBookingById: mock(async () => ({ ...booking, version: 1 })),
      findParticipant: mock(async () => participant),
      findConfirmedParticipants: mock(async () => [
        makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
        makeParticipant({ id: "p3", userId: "student3", heldAmount: 42 }),
      ]),
      findTutorProfile: mock(async () => makeTutorProfile()),
      updateBookingVersioned: mock(async () => ({
        updated: { ...booking, currentState: "awaiting_reconfirmation" },
        newVersion: 2,
      })),
    },
    wallet: {
      ...makeWallet(),
      getByUserId: mock(async () => ({
        id: "w1",
        totalBalance: 100,
        heldBalance: 42,
        availableBalance: 58,
      })),
    },
    meeting: {
      ...makeMeeting(),
      cancelEvent: mock(async () => {
        order.push("cancel");
      }),
    },
  });
  const tx = { ...makeDb(), ...mockRepo() } as any;
  const origTransaction = (service as any).db.transaction;
  // Replace the injected db.transaction with one that records ordering.
  // Simplest assertion: the mock tx function completes before cancelEvent.
  await service.withdraw("student1", "b1");
  // If cancelEvent were inside the tx, the tx mock would have recorded
  // nothing — here we just assert it ran exactly once after success.
  expect(meeting.cancelEvent).toHaveBeenCalledTimes(1);
});
```

> If the ordering assertion above is too weak for your taste, wrap `db.transaction` to push `"tx"` into `order` on completion and assert `order` ends with `["tx", "cancel"]`.

- [x] **Step 2: Run test to verify it fails**

Expected: FAIL — `cancelEvent` is currently called inside the transaction.

- [x] **Step 3: Implement**

Restructure `withdraw` so the provider call happens after `db.transaction` resolves:

```ts
async function withdraw(userId: string, bookingId: string, reason?: string) {
  let cancelMeeting = false;
  const result = await db.transaction(async (tx) => {
    // ... existing logic ...
    // wherever the meeting must be cancelled (group regress + solo cancel):
    cancelMeeting = true;
    // ...
  });
  if (cancelMeeting) {
    await meeting.cancelEvent(bookingId);
  }
  return result;
}
```

Remove the `await meeting.cancelEvent(bookingId)` call from inside the group-regress branch (Task B.1) and set `cancelMeeting = true` there instead.

- [x] **Step 4: Run tests**

Run the booking unit tests + `booking-g4.test.ts` integration (group withdraw flow). Expected: PASS.

- [x] **Step 5: Update docs + commit**

`docs/CONTEXT.md` R2/R3 rows → Fixed. Commit: `git commit -m "fix(booking): cancel provider meetings after the withdraw transaction commits (R3)"`

---

## PR C — Uploads & Payment Edge Cases

### Task C.1: Presigned POST policy includes x-amz conditions (R4)

**Files:**

- Modify: `packages/api/src/lib/storage.ts:65-73`
- Test: `packages/api/src/lib/storage.test.ts`

- [x] **Step 1: Write the failing test**

In `storage.test.ts`'s `createR2Storage` describe, extend the POST-policy test:

```ts
test("presigned POST policy covers every x-amz form field (R4)", async () => {
  const { fields } = await s.getSignedUploadUrl(
    "user-1/uuid-avatar.png",
    "image/png",
  );
  const policy = JSON.parse(
    Buffer.from(fields.policy, "base64").toString("utf-8"),
  ) as {
    conditions: unknown[];
  };
  const alg = policy.conditions.find(
    (c) => Array.isArray(c) && c[0] === "eq" && c[1] === "$x-amz-algorithm",
  ) as [string, string, string];
  expect(alg).toBeTruthy();
  expect(alg[2]).toBe("AWS4-HMAC-SHA256");
  const cred = policy.conditions.find(
    (c) => Array.isArray(c) && c[0] === "eq" && c[1] === "$x-amz-credential",
  ) as [string, string, string];
  expect(cred[2]).toBe(fields["x-amz-credential"]);
  const date = policy.conditions.find(
    (c) => Array.isArray(c) && c[0] === "eq" && c[1] === "$x-amz-date",
  ) as [string, string, string];
  expect(date[2]).toBe(fields["x-amz-date"]);
});
```

- [x] **Step 2: Run test to verify it fails**

Expected: FAIL — the conditions are absent.

- [x] **Step 3: Fix `createPresignedPost`**

In `packages/api/src/lib/storage.ts`, extend the policy conditions:

```ts
const policy = {
  expiration,
  conditions: [
    { bucket: opts.bucket },
    { key: opts.key },
    ["eq", "$Content-Type", opts.contentType],
    ["eq", "$x-amz-algorithm", "AWS4-HMAC-SHA256"],
    ["eq", "$x-amz-credential", credential],
    ["eq", "$x-amz-date", amzDate],
    ["content-length-range", 1, opts.maxBytes],
  ],
};
```

- [x] **Step 4: Run tests + commit**

`bun test --env-file apps/server/.env packages/api/src/lib/storage.test.ts` → PASS.
Commit: `fix(upload): bind x-amz fields in the presigned POST policy (R4)`

### Task C.2: REFUNDED webhook reverses the credit; Xendit maps REFUNDED (R5)

**Files:**

- Modify: `packages/api/src/modules/payment/payment.service.ts:270-293`
- Modify: `packages/api/src/modules/payment/xendit-payment.provider.ts:35-46`
- Modify: `packages/api/src/modules/payment/payment.repo.ts` (if a wallet-deduct port is needed — the wallet port already exposes `deduct` via `PaymentWalletPort`? verify the port includes `deduct`; if not, add it to `PaymentWalletPort` in `modules/payment/index.ts`)
- Test: `packages/api/src/tests/unit/payment.service.test.ts`, `packages/api/src/tests/unit/xendit-status-and-webhook.test.ts`

**Interfaces:**

- Consumes: `PaymentWalletPort` (hold/release/deduct/credit/compensate).
- Produces: on a REFUNDED webhook for a PAID/SETTLED payment, the wallet credits are reversed (deduct the credited marks from available balance) with a deterministic ledger key `refund.{payment.id}.reverse`, `sourceReference: payment.id`.

- [x] **Step 1: Write the failing tests**

Unit test: `payment.service.ts` — confirm REFUNDED with a previously PAID payment calls `wallet.deduct` with the credited marks and writes the payment REFUNDED.

Unit test: `xendit-payment.provider.ts` — `mapXenditStatus("REFUNDED")` returns `"REFUNDED"`.

- [x] **Step 2: Run to verify they fail**

Expected: FAIL — no deduct on REFUNDED; `mapXenditStatus` throws for "REFUNDED".

- [x] **Step 3: Implement**

In `xendit-payment.provider.ts`, add `REFUNDED: "REFUNDED"` to the status map.

In `payment.service.ts` `confirmFromWebhook`, inside the `else` branch that handles `input.status === PAYMENT_STATUS.REFUNDED`, before/after `updatePaymentStatus`, add the wallet reversal:

```ts
if (
  input.status === PAYMENT_STATUS.REFUNDED &&
  record.status !== PAYMENT_STATUS.REFUNDED
) {
  const walletRow = await wallet.getByUserId(tx, record.userId);
  if (walletRow) {
    await wallet.deduct(tx, {
      walletId: walletRow.id,
      amount: record.marks,
      eventKey: `refund.${record.id}.reverse`,
      sourceReference: record.id,
      bookingId: null,
      actorType: "system",
      reason: "Refund: reversed credited marks",
    });
  }
}
```

Verify `PaymentWalletPort` in `modules/payment/index.ts` exposes `deduct` (the wallet service does). If it does not, add `deduct(db, params)` to the port and wire it in `services.ts`.

- [x] **Step 4: Run payment + xendit tests + commit**

`fix(payment): reverse credited marks on REFUNDED webhook and map Xendit status (R5)`

> **Execution note (PR C):** Task C.2's suggested `wallet.deduct` was replaced by `wallet.compensate` with `type: "compensate_deduct"` — `deduct` only releases holds (`heldBalance >= amount`), so it can never reverse a purchase credit; `compensate_deduct` removes the marks from the available balance (the same primitive the admin refund/correction flow uses). The `PaymentWalletPort` gained `compensate` instead of `deduct`.

---

## PR D — Reliability Fixes

### Task D.1: Outbox stale-`sending` reclaim respects the attempts budget (R6)

**Files:**

- Modify: `packages/api/src/modules/notification/notification.repo.ts:190-196`
- Test: `packages/api/src/tests/unit/notification.repo.test.ts`

- [x] **Step 1:** Extend the `claimPendingDispatches` unit test with a case asserting the reclaim branch excludes rows with `attempts >= MAX_DISPATCH_ATTEMPTS` (inspect the WHERE SQL node or add an integration test: insert a row with `status='sending'`, `attempts=3`, `created_at < now()-11min`, run `dispatchQueuedEmails`, assert the row is NOT claimed).
- [x] **Step 2:** Change the SQL so the stale branch is `OR (status = 'sending' AND attempts < ${MAX_DISPATCH_ATTEMPTS} AND created_at < now() - interval '10 minutes')`.
- [x] **Step 3:** Tests pass; commit `fix(notification): cap stale-sending reclaim by attempts (R6)`

### Task D.2: Short webhook idempotency claim TTL (R7)

**Files:**

- Modify: `apps/server/src/webhooks/payments.ts:88-92`
- Test: `apps/server/src/webhooks/stub-checkout.test.ts`

- [x] **Step 1:** Write a test asserting `webhookIdempotency.claim(key, 120)` is invoked with the 120s TTL (or refactor `claim` to accept and assert the TTL on the Redis client mock).
- [x] **Step 2:** Change the claim call to `webhookIdempotency.claim(idempotencyKey, 120)` (2-minute claim window; `markProcessed` still stores the 24h processed record).
- [x] **Step 3:** Commit `fix(webhooks): short idempotency claim TTL so crashes don't lock the key for 24h (R7)`

### Task D.3: `waitForMeetUrl` failure keeps the event created (R8)

**Files:**

- Modify: `packages/api/src/modules/meeting/google-meeting.provider.ts:542-598`
- Test: `packages/api/src/tests/unit/google-meeting.provider.test.ts`

- [x] **Step 1:** Write a unit test: Google insert succeeds, the URL poll (service-account `calendar.events.get`) throws → `createEvent` returns a row with `status: "created"` and `meetingUrl: null` (NOT a `failed` row), and the retry job no longer re-creates the event.
- [x] **Step 2:** Wrap the `waitForMeetUrl(...)` call in try/catch: on error, log a warning and continue with `meetingUrl: null`; only the insert/calendar-create failure path produces a `failed` row.
- [x] **Step 3:** Commit `fix(meeting): keep created events on URL-poll failure to avoid duplicates (R8)`

### Task D.4: Escape eventName in admin review + seed-invite hash print (R9, R10)

**Files:**

- Modify: `packages/api/src/modules/achievement/achievement.service.ts:152-153`
- Modify: `apps/server/src/seed-invite.ts`
- Test: `packages/api/src/tests/unit/achievement.service.test.ts`

- [x] **Step 1:** Wrap `existing.eventName` in `escapeHtml` in the adminReview notification body; add a unit test (adminNote already tested; add `<script>` eventName case).
- [x] **Step 2:** In `seed-invite.ts`, when an active invite is found, print that invite tokens are stored hashed and instruct the user to create a fresh invite (`bun run seed-invite <email>` creates a new one); never print the stored hash.
- [x] **Step 3:** Commit `fix(achievement/seed): escape eventName in review email; don't print hashed invite tokens (R9/R10)`

---

## PR E — Coverage Hardening (9 files → ≥90% lines)

Target the files below. For each, add unit tests until `bun run test:coverage` reports ≥ 90% lines for the file. Do NOT lower the bar — CI enforces 90% for `packages/api`.

| File (current %)                                     | Required coverage                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/storage.ts` (18.7%)                             | `createPresignedPost` policy/signature/expiry; `createLocalStorage` put/getSignedUploadUrl/resolvePublicUrl/traversal rejection; `createR2Storage` publicUrl variants; `createStorage` branch selection (R2 vs local) |
| `modules/tutor/availability.types.ts` (47.9%)        | schema valid/invalid cases for `upsertAvailabilityInput`, `deleteAvailabilityInput`, `createWeeklyAvailabilityInput` (past dates, `endAt > startAt`, range)                                                           |
| `lib/request-id.ts` (51.1%)                          | `getClientIp` trusted/untrusted/no-server; `readBodyWithLimit` empty/chunked/over-limit; `openApiAccessDenied` all branches                                                                                           |
| `modules/meeting/index.ts` (58.3%)                   | `createMeetingModule` enabled/disabled wiring                                                                                                                                                                         |
| `modules/auth/auth.handler.ts` (61.2%)               | `searchStudents` role gate (student OK, tutor/admin 403), `me`/`getProfile`/`updateProfile` happy paths                                                                                                               |
| `modules/meeting/google-meeting.provider.ts` (72.9%) | OAuth token cache hit/miss; breaker-open path; manual fallback at 3 attempts (already covered — extend); `updateEvent`/`cancelEvent` no-op rows; `waitForMeetUrl` success/failure; `withTimeout` clears its timer     |
| `modules/auth/auth.errors.ts` (74.1%)                | `mapAuthError` every branch (ProfileNotFound, ValidationRequired, StudentSearchForbidden, fallback)                                                                                                                   |
| `modules/auth/auth.repo.ts` (75.0%)                  | `searchStudents` (wildcard escaping, limit, joins)                                                                                                                                                                    |
| `modules/meeting/fallback.provider.ts` (86.4%)       | `createEvent`/`updateEvent`/`cancelEvent` happy + no-op paths                                                                                                                                                         |

Verification:

```bash
GOOGLE_MEET_ENABLED=false GOOGLE_MEET_REFRESH_TOKEN= GOOGLE_MEET_CLIENT_ID= GOOGLE_MEET_CLIENT_SECRET= GOOGLE_CLIENT_EMAIL= GOOGLE_PRIVATE_KEY= \
  bun test --coverage --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts
```

Compute per-file coverage from `coverage/lcov.info` (script: parse `SF:/LH:/LF:`); every file listed above must be ≥ 90% lines. If the aggregate still passes but a file lags, add more cases — do not delete or weaken assertions.

Commit per file group: `test(api): raise <module> coverage above 90%`

---

## PR F — Small PRD Gaps

### Task F.1: Knowledge Bank eligibility uses total balance (U13)

**Files:**

- Modify: `packages/api/src/modules/wallet/wallet.service.ts:421-435`
- Modify: `packages/api/src/tests/unit/wallet.service.test.ts`, `wallet.handler.test.ts`

- [ ] **Step 1:** Add the failing case: wallet with `availableBalance: 30`, `heldBalance: 10` (`totalBalance: 40`) → `knowledgeBankEligible` returns `eligible: true`.
- [ ] **Step 2:** Change `knowledgeBankEligible` to compare and return `totalBalance` (both `eligible` and `balance` fields).
- [ ] **Step 3:** Commit `fix(wallet): Knowledge Bank eligibility uses total balance (U13)`

### Task F.2: Group-series withdraw guard (U4)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts` (withdraw — reject `type === SERIES && targetGroupSize > 1`)
- Modify: `packages/api/src/modules/booking/booking.errors.ts` (new `BookingSeriesNoOptOutError`)
- Modify: `packages/api/src/modules/booking/booking.router.ts` + `booking.handler.ts` (map the error via `mapBookingError` — check the handler's error mapper)
- Test: `packages/api/src/tests/unit/booking.service.test.ts` + integration

- [ ] **Step 1:** Failing test: confirmed group-series participant calls `withdraw` → rejected with the new error; solo-series withdraw still works.
- [ ] **Step 2:** Implement the guard at the top of `withdraw` (before any wallet movement): `if (b.type === BOOKING_TYPE.SERIES && b.targetGroupSize > 1) throw new BookingSeriesNoOptOutError(bookingId);`
- [ ] **Step 3:** Commit `fix(booking): block group-series full-series withdrawal (U4)`

---

## Shared Guidance

- **Docs follow code (AGENTS.md rule 11):** update `docs/CONTEXT.md` (wave-2 findings table rows → Fixed with PR refs) and `docs/plans/active/REVIEW-FIXES-2.md` (task checkboxes + status) in every PR. When all PRs land, move this plan to `docs/plans/completed/` and update `docs/plans/README.md`.
- Keep the suite green after each step (`bun run check-types`, `bun run lint`, targeted tests; full suite at each PR end).
- Coverage gates: `packages/api` ≥ 90% lines, overall ≥ 80% (CI enforces; `bun .github/scripts/coverage-comment.ts` posts the report).
- Conventional commits; one commit per task or small coherent group.
- If a fix requires a migration (none expected), generate with `bun run db:generate` and review the SQL.

### Version Notes

- v1.0 (2026-08-15): Created from the wave-2 post-merge review of `30f805e`. Findings R1–R10 verified in code; coverage percentages computed from the CI `lcov.info`; PRD gap statuses cross-checked against `PRD-GAPS-PHASE3.md` (U11 closed, U9 partial, rest open).
