# Cogito Backend — Consolidation Phase 2.5: Gaps & Corrections

**Status:** Active — addendum to Phase 2 on `improvement/consolidation` branch
**Branch:** `improvement/consolidation`
**Date:** 2026-07-24
**Depends on:** Phase 1 + Phase 2 (error architecture) completed
**Blocks:** `improvement/production-readiness` must branch from this after merge

This phase closes the gaps between the implemented Phase 1/2 work and the current codebase reality. It is an **addendum** to `CONSOLIDATION-PHASE2-ERROR-ARCHITECTURE.md` — it references that plan, corrects its obsolete tasks, and adds the missing work that the audit surfaced.

The goal: a codebase where every module has a repo layer, every layer has single concerns, services throw only `DomainError` subclasses, repos are pure data access, and the import graph is a clean DAG with narrow consumer-driven ports — all at best-effort 100% test coverage.

---

## Execution Rules

1. **Every task must have passing tests before committing.** Run `bun test` after every change.
2. **Iterate until CI green.** After each phase, run `bun run check && bun run check-types && bun run build && bun test`.
3. **Commit messages:** `refactor(api): {description}` or `fix(api): {description}` — match the existing branch style.
4. **Test coverage:** Best-effort 100% on all new and modified files. Max effort on business-rule files (services, handlers, repos, error files). Accept diminishing returns on trivial branches. No hard gate on untouched infra (`pricing`, `email`, `meeting`, `scheduler`, `lib/retry`, `lib/circuit-breaker`).
5. **Commit after each logical unit** — never leave a partially-migrated module.
6. **No partial changes.** Each task must be fully done (code + tests) before committing.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 2 Obsolete Tasks to Drop](#2-phase-2-obsolete-tasks-to-drop)
3. [Phase A: Missing Repo Extractions](#3-phase-a-missing-repo-extractions)
4. [Phase B: Layer Violations](#4-phase-b-layer-violations)
5. [Phase C: Missing Error File](#5-phase-c-missing-error-file)
6. [Phase D: Type Escape Hatch](#6-phase-d-type-escape-hatch)
7. [Phase E: Test Coverage](#7-phase-e-test-coverage)
8. [Verification Gates](#8-verification-gates)
9. [Risk Register](#9-risk-register)
10. [Execution Checklist](#10-execution-checklist)

---

## 1. Overview

### Why This Phase

The audit of the current `improvement/consolidation` branch against the two plans surfaced three categories of work:

- **Obsolete tasks** in Phase 2 that are already done (payment repo, room types)
- **Missing tasks** that neither plan mentions (notification/room repo extraction, admin-booking→refund service port, wallet repo business logic, hardcoded repo filters, scheduler-adjacent gaps, type escape hatch)
- **Incomplete migrations** where the Phase 2 work was started but not finished (tutor service still throws `badRequest`, payment service knows about `ORPCError`, notification has no error file)

### Phase Summary

| Phase  | Focus                    | Tasks                          | Est. |
| ------ | ------------------------ | ------------------------------ | ---- |
| A      | Missing repo extractions | notification, room             | 0.5  |
| B      | Layer violations         | 9 fixes across 8 modules       | 1.5  |
| C      | Missing error file       | notification.errors.ts         | 0.25 |
| D      | Type escape hatch        | fallback.provider double cast  | 0.25 |
| E      | Test coverage            | close gaps to best-effort 100% | 1    |
| Verify | Grep gates + full CI     | —                              | 0.25 |

**Total: ~3.5 days**

### Out of Scope

- Scheduler wiring — addressed in the production-readiness plan (bugs N1/N2/N4)
- Handler-layer thinness redesign — handlers are intentionally thin; richness belongs in DTO projection
- Repo extraction for non-DB modules (pricing, email, meeting, scheduler) — N/A
- `as` cast reduction in repo row-mapping where it's a Drizzle inference limitation — best-effort only during normal edits
- Booking state machine logic — already migrated in Phase 2

---

## 2. Phase 2 Obsolete Tasks to Drop

These tasks in `CONSOLIDATION-PHASE2-ERROR-ARCHITECTURE.md` are already complete in the current branch. Do NOT re-execute. Strike them from the Phase 2 checklist if it's being used for tracking.

| Phase 2 ref | Task                                               | Why obsolete                                                                                                |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| AD-5        | Payment module gets a repo layer                   | `payment.repo.ts` exists; service delegates all DB to repo                                                  |
| AD-6        | Room module gets Zod schemas                       | `room.types.ts` exists with `createRoomInput`, `assignRoomInput` (with `z.coerce.date()`), `listRoomsInput` |
| §1.4        | Create `room/room.types.ts`                        | Already exists (see above)                                                                                  |
| §1.5        | Create `payment/payment.repo.ts`                   | Already exists; `payment.service.ts` uses it                                                                |
| §3.5        | Room: create types file, update handler and router | Types exist; handler/router already import from them                                                        |
| §3.11       | Payment service: refactor to use repo              | Already done; service calls `repo.*` exclusively                                                            |

**Acceptance:** These tasks are skipped. No code changes from this section.

---

## 3. Phase A: Missing Repo Extractions

**Goal:** Give the two remaining repo-less modules a proper repo layer.

### A.1 Extract `notification.repo.ts`

**Create:** `packages/api/src/modules/notification/notification.repo.ts`

Extract these 6 inline DB operations from `notification.service.ts` into `createNotificationRepo(db)`:

| Service method                    | Table(s)               | Repo function to create                        |
| --------------------------------- | ---------------------- | ---------------------------------------------- |
| `writeInternal` (insert)          | `notification`         | `insertNotification(db, values)`               |
| `writeInternal` (email lookup)    | `user`                 | `findUserEmail(db, userId)`                    |
| `writeInternal` (dispatch insert) | `notificationDispatch` | `insertDispatch(db, values)`                   |
| `writeInternal` (dispatch update) | `notificationDispatch` | `updateDispatchStatus(db, id, status, error?)` |
| `list`                            | `notification`         | `listNotifications(db, userId, opts)`          |
| `getUnreadCount`                  | `notification`         | `countUnread(db, userId)`                      |
| `markAsRead`                      | `notification`         | `updateReadStatus(db, id, userId, read)`       |
| `markAllAsRead`                   | `notification`         | `markAllRead(db, userId)`                      |
| `dispatchStatus`                  | `notificationDispatch` | `findDispatch(db, id)`                         |

**Modify:** `notification/notification.service.ts` — replace all inline `db.*` calls with `repo.*` calls. Service no longer imports `db`/`DbType` for queries (only passes the tx/connection to repo methods that need it).

**Modify:** `notification/index.ts` — wire `createNotificationRepo(db)` into `createNotificationModule`, pass repo to service.

**Test:** `tests/unit/notification.repo.test.ts` — test each repo function. Update `notification.service.test.ts` to mock repo instead of db.

**Commit:** `refactor(api): extract notification repo layer from service`

**Acceptance:** `notification.service.ts` has zero direct Drizzle imports/queries. All DB access goes through `notification.repo.ts`.

### A.2 Extract `room.repo.ts`

**Create:** `packages/api/src/modules/room/room.repo.ts`

Extract these 4 inline DB operations from `room.service.ts` into `createRoomRepo(db)`:

| Service method      | Table(s)              | Repo function to create                                  |
| ------------------- | --------------------- | -------------------------------------------------------- |
| `listActive`        | `room`                | `findActiveRooms(db)`                                    |
| `createRoom`        | `room`                | `insertRoom(db, values)`                                 |
| `checkAvailability` | `roomBooking`         | `findRoomBookings(db, roomId, startAt, endAt)`           |
| `assignRoom`        | `room`, `roomBooking` | `findRoomById(db, id)` + `insertRoomBooking(db, values)` |

**Modify:** `room/room.service.ts` — replace inline `db.*` with `repo.*`. The "check room exists, then check availability, then insert booking" orchestration stays in the service (that's business logic).

**Modify:** `room/index.ts` — wire `createRoomRepo(db)`.

**Test:** `tests/unit/room.repo.test.ts`. Update `room.service.test.ts`.

**Commit:** `refactor(api): extract room repo layer from service`

**Acceptance:** `room.service.ts` has zero direct Drizzle imports/queries. All DB access through `room.repo.ts`.

### A.3 Verify Phase A

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** Both modules have repo layers. No inline Drizzle queries in either service. All tests pass.

---

## 4. Phase B: Layer Violations

**Goal:** Fix the 9 layer-boundary violations the audit found. Each fix is a separate commit.

### B.1 Tutor service: replace badRequest with domain errors (keep completeness as business rule)

**Important:** `submitForReview` takes `z.void()` — no input. It validates the _existing DB profile state_ (is it complete enough to submit?), not request input. Therefore field-completeness CANNOT move to Zod — it's a business state check. Same for `validateUpdateInput`'s status check. Only the `badRequest()` (HTTP) throws need to become domain errors.

**Modify:** `modules/tutor/tutor.errors.ts`

Add a new domain error class for incomplete-profile submissions:

```ts
export class TutorProfileIncompleteError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, missingFields: string[]) {
    super(
      "TUTOR_PROFILE_INCOMPLETE",
      "All required fields must be filled before submission",
      { id, missingFields },
    );
  }
}
```

Update `mapTutorError` to map it:

```ts
if (err instanceof TutorProfileIncompleteError)
  return badRequest(err.message, err);
```

**Modify:** `modules/tutor/tutor.service.ts`

- `validateUpdateInput:43` — replace `throw badRequest(error)` with a domain error. Add `InvalidPricingError` to `tutor.errors.ts` (or reuse `TutorProfileIncompleteError` with a pricing-specific message). Prefer a dedicated `InvalidTutorPricingError` for clarity.
- `validateSubmitForReview:71` — replace `throw badRequest("All required fields must be filled before submission")` with `throw new TutorProfileIncompleteError(profile.id, [...missingFields])`
- `validateSubmitForReview:75` — replace `throw badRequest("At least one expertise track is required")` with `throw new TutorProfileIncompleteError(profile.id, ["expertise"])`
- `validateSubmitForReview:88` — replace `throw badRequest(error)` with `throw new InvalidTutorPricingError(profile.id, error)`
- Remove `import { badRequest } from "../../lib/errors"` — service no longer imports HTTP errors

**Test:** Update `tutor.service.test.ts` — the existing tests use `.toThrow()` without specific classes for the completeness checks (lines 156-172); update them to assert the new domain error classes. Add tests for `TutorProfileIncompleteError` and `InvalidTutorPricingError` if not covered.

**Commit:** `refactor(api): replace tutor service badRequest throws with domain errors`

**Acceptance:** `tutor.service.ts` has zero `lib/errors` imports. All throws are `DomainError` subclasses. Completeness checks remain in service (they validate DB state, not input).

### B.2 Payment service: remove ORPCError awareness

**Modify:** `modules/payment/payment.service.ts:1,118`

Remove `import { ORPCError } from "@orpc/server"` and the `if (error instanceof ORPCError) throw error;` check. Services should only throw `DomainError` subclasses. The provider layer may throw its own errors; the service wraps them as `PaymentProviderError` (already exists in `payment.errors.ts`). The handler's `withDomainMap` maps to HTTP.

**Test:** Update `payment.service.test.ts` — assert `PaymentProviderError` is thrown on provider failure, not `ORPCError`.

**Commit:** `refactor(api): remove ORPCError awareness from payment service`

**Acceptance:** `payment.service.ts` does not import `ORPCError` or reference it.

### B.3 Admin-booking: stop importing refund repo, use a refund service port

**Modify:** `modules/admin-booking/admin-booking.service.ts:15,246`

Remove `import { RefundRepo } from "../refund/refund.repo"`. Replace the direct `refundRepo.insertRefundRecord(tx, {...})` call with a call through a narrow refund service port.

**Modify:** `modules/admin-booking/index.ts`

Define an inline consumer-driven port:

```ts
interface AdminBookingRefundPort {
  createCorrection(
    db: DbOrTx,
    params: {
      bookingId: string;
      amount: number;
      reason: string;
      actorId: string;
    },
  ): Promise<{ refundId: string }>;
}
```

Inject this port into `createAdminBookingService(deps: { ..., refund: AdminBookingRefundPort })`.

**Modify:** `modules/refund/refund.service.ts`

Ensure `createCorrection` (or equivalent) satisfies `AdminBookingRefundPort`. If the refund service doesn't expose exactly this shape, add a thin adapter method. The refund service owns the `refundRepo.insertRefundRecord` call; admin-booking never touches the refund repo.

**Modify:** composition root (`services.ts`) — wire `refund.service` (or the adapter) as `AdminBookingRefundPort` into `createAdminBookingModule`.

**Test:** Update `admin-booking.service.test.ts` — mock the `refund` port instead of `refundRepo`. Update `refund.service.test.ts` if a new adapter method is added.

**Commit:** `refactor(api): admin-booking uses refund service port instead of refund repo directly`

**Acceptance:** `admin-booking.service.ts` does not import from `../refund/refund.repo`. The refund service is the only consumer of `refundRepo.insertRefundRecord`.

### B.4 Wallet repo: move getOrCreate orchestration and pagination to service

**Note:** `getOrCreate` currently uses the root `db` (not a passed tx), because it's called outside transactions by `auth.me`. The race-safe `ON CONFLICT DO NOTHING` primitive must stay a single SQL statement — the repo provides it, the service orchestrates when to use it. A transaction wrapper does NOT solve the TOCTOU race; only `INSERT ... ON CONFLICT` does.

**Modify:** `modules/wallet/wallet.repo.ts`

- Remove the `getOrCreate` orchestration method from `createWalletRepo` (the check-then-insert-then-reselect decision logic at lines 239-268).
- Add an `upsert` primitive that uses root `db`:

```ts
export async function upsert(values: {
  userId: string;
  totalBalance: number;
  heldBalance: number;
  availableBalance: number;
}): Promise<WalletSnapshot | null> {
  const [created] = await db
    .insert(wallet)
    .values(values)
    .onConflictDoNothing()
    .returning();
  return created ? (created as WalletSnapshot) : null;
}
```

Returns `null` when the conflict fired (another request created it). The service re-fetches via `getByUserId` in that case.

- Move pagination/cursor math (`Math.min(opts?.limit ?? 20, 100)`, `limit + 1` fetch, `slice`, `nextCursor`) out of `listLedger` (lines 222-231). Repo exposes `findLedgerEntries(conn, walletId, opts)` returning raw rows (including the `limit + 1` row so the service can detect `hasMore`). The service computes `nextCursor` and trims `items`.

**Modify:** `modules/wallet/wallet.service.ts`

- `getOrCreate` now lives in the service:

```ts
async function getOrCreate(userId: string): Promise<WalletSnapshot> {
  const existing = await repo.getByUserId(db, userId);
  if (existing) return existing;
  const created = await repo.upsert({
    userId,
    totalBalance: 0,
    heldBalance: 0,
    availableBalance: 0,
  });
  if (created) return created;
  // Conflict: another request created it — re-fetch
  const afterConflict = await repo.getByUserId(db, userId);
  if (!afterConflict) throw new WalletNotFoundError(userId);
  return afterConflict;
}
```

- `listLedger` now computes pagination in the service from repo's raw rows.

**Test:** Update `wallet.repo.test.ts` — test `getByUserId`, `upsert` (returns created on insert, `null` on conflict), `findLedgerEntries` (raw rows). Update `wallet.service.test.ts` — test `getOrCreate` orchestration (existing → return; not existing → upsert succeeds → return; not existing → upsert conflict → re-fetch) and pagination math.

**Commit:** `refactor(api): move wallet getOrCreate and pagination from repo to service`

**Acceptance:** `wallet.repo.ts` exposes only pure data primitives (`getById`, `getByUserId`, `upsert`, `atomicHold`, `atomicDeduct`, `insertLedger`, `findLedgerEntries`, etc.). No `getOrCreate` orchestration method, no pagination math. Race safety preserved via `ON CONFLICT DO NOTHING` primitive.

### B.5 Move remaining hardcoded repo filters and defaults to services

**Status of prior Phase 2 work:** `booking.repo.ts findOverlappingBookings` already accepts `excludeStates` (line 257) and `findAvailabilitySlot` already accepts `opts.futureOnly` (line 58). These are done. What remains:

**Modify:** `modules/tutor/tutor.repo.ts:66`

`listAvailability` hardcodes the "future-only" filter (`gte(availabilitySlot.startDate, new Date())`). Change to accept `opts: { from?: Date }`:

```ts
export async function listAvailability(
  conn: DbOrTx,
  userId: string,
  opts?: { from?: Date },
) {
  const conditions = [
    eq(availabilitySlot.tutorId, userId),
    eq(availabilitySlot.isActive, true),
  ];
  if (opts?.from) {
    conditions.push(gte(availabilitySlot.startDate, opts.from));
  }
  return conn
    .select()
    .from(availabilitySlot)
    .where(and(...conditions));
}
```

**Modify:** `modules/tutor/tutor.service.ts` — pass `from: new Date()` when listing availability (the current behavior is future-only; this makes the business rule explicit in the service).

**Modify:** `modules/booking/booking.repo.ts:48`

`findTutorProfile` hardcodes `eq(tutorProfile.onboardingStatus, ONBOARDING_STATUS.PUBLISHED)`. The "published-only" filter is a business rule (booking requires a published tutor). Change to accept `opts: { publishedOnly?: boolean }`:

```ts
async function findTutorProfile(
  conn: DbOrTx,
  tutorId: string,
  opts?: { publishedOnly?: boolean },
) {
  const conditions = [eq(tutorProfile.userId, tutorId)];
  if (opts?.publishedOnly) {
    conditions.push(
      eq(tutorProfile.onboardingStatus, ONBOARDING_STATUS.PUBLISHED),
    );
  }
  return (
    conn.query.tutorProfile.findFirst({ where: and(...conditions) }) ?? null
  );
}
```

**Modify:** `modules/booking/booking.service.ts` — pass `publishedOnly: true` at call sites where the current hardcoded behavior is intended.

**Modify:** `modules/tutor-discovery/discovery.repo.ts:15-16` — remove `const limit = input.limit ?? 20;` and `const offset = input.offset ?? 0;` defaults. The service sets defaults before calling the repo.

**Modify:** `modules/tutor-discovery/discovery.service.ts` — set `limit: opts.limit ?? 20, offset: opts.offset ?? 0` before calling repo.

**Modify:** `modules/achievement/achievement.repo.ts:53-57` — remove `|| null` and `|| []` fallbacks in the `insert` function. Let the service normalize missing data before passing to the repo (or let the DB default apply).

**Test:** Update repo tests to pass opts explicitly. Update service tests to assert defaults are applied.

**Commit:** `refactor(api): move remaining business filters and defaults from repos to services`

**Acceptance:** No hardcoded business filters or default values in any `*.repo.ts`. All defaults and filters passed from services (or accepted as opts).

### B.6 Refund service: remove dead amount check (Zod already validates)

**Note:** `refund.types.ts:5` already has `z.number().positive()` on the `amount` field. The `if (input.amount <= 0)` check in `refund.service.ts:31` is dead code — Zod rejects non-positive amounts before the service runs.

**Modify:** `modules/refund/refund.service.ts:31-35`

Delete the dead check:

```ts
// DELETE these lines:
if (input.amount <= 0)
  throw new InvalidRefundAmountError(input.amount, "Amount must be positive");
```

**Test:** Remove or update the test that covers the `amount <= 0` branch (it's unreachable). Verify the Zod schema rejects non-positive amounts via a router-level test (add if not present).

**Commit:** `refactor(api): remove dead amount check from refund service (Zod already validates)`

**Acceptance:** `refund.service.ts` no longer has the `amount <= 0` check. `InvalidRefundAmountError` remains for other validation contexts but is not thrown for non-positive amounts (Zod handles that).

### B.7 Verify Phase B

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** All 9 layer violations fixed. Grep gates (§8) pass.

---

## 5. Phase C: Missing Error File

### C.1 Create `notification.errors.ts`

**Create:** `packages/api/src/modules/notification/notification.errors.ts`

Move `mapNotificationError` (currently inline in `notification.handler.ts:12-13`) into this file. Add a `NotificationNotFoundError` class (for the case where a notification ID doesn't belong to the user or doesn't exist) — currently the service silently no-ops or returns; make it explicit.

```ts
export class NotificationNotFoundError extends DomainError {
  readonly domain = "notification";
  constructor(notificationId: string) {
    super("NOTIFICATION_NOT_FOUND", "Notification not found", {
      notificationId,
    });
  }
}

export function mapNotificationError(err: DomainError): ORPCError {
  if (err instanceof NotificationNotFoundError)
    return notFound(err.message, err);
  return internalServerError(err.message, err);
}
```

**Modify:** `modules/notification/notification.handler.ts` — import `mapNotificationError` from `./notification.errors`. Remove the inline definition.

**Modify:** `modules/notification/notification.service.ts` — throw `NotificationNotFoundError` where a notification lookup fails (replace silent no-ops).

**Test:** `tests/unit/notification.errors.test.ts` — instanceof, code, domain, message, details, mapper. Update `notification.handler.test.ts` and `notification.service.test.ts`.

**Commit:** `refactor(api): add notification.errors.ts, extract mapper from handler`

**Acceptance:** `notification.errors.ts` exists. Handler no longer defines the mapper inline. All 14 Phase 2 error files now present.

---

## 6. Phase D: Type Escape Hatch

### D.1 Fix `fallback.provider.ts` double cast

**Modify:** `modules/meeting/fallback.provider.ts:34`

The `return row as unknown as typeof meetingEventTable.$inferSelect;` double cast bypasses type checking. Root cause: the import alias `meetingEvent as meetingEventTable` creates a type mismatch between the inserted row and the inferred select type.

Fix by either:

- Removing the alias and importing `meetingEvent` directly, then casting to `typeof meetingEvent.$inferSelect` (single, valid cast), OR
- Adding a typed helper `toMeetingEvent(row): typeof meetingEvent.$inferSelect` that constructs the typed object field-by-field (no cast), OR
- Aligning the insert values type with the select type so no cast is needed.

Prefer the option that eliminates the `as unknown as` entirely. If a single `as` cast remains (row → inferred select), that's acceptable — the double cast is the real problem.

**Test:** Update `fallback.provider.test.ts` (or create it) to verify the returned row is properly typed and the meeting event is created correctly.

**Commit:** `fix(api): remove double type cast in meeting fallback provider`

**Acceptance:** No `as unknown as` casts in `meeting/fallback.provider.ts`. Type safety preserved.

---

## 7. Phase E: Test Coverage

**Goal:** Best-effort 100% on all new and modified files. Max effort on business-rule files.

### E.1 Coverage targets

| File category                                                                        | Target                       | Rationale                                               |
| ------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------- |
| New error files (`notification.errors.ts`)                                           | 100%                         | Every class + mapper branch                             |
| New repo files (`notification.repo.ts`, `room.repo.ts`)                              | 100%                         | Every function, including empty-result and error paths  |
| Modified services                                                                    | 100% on new/changed branches | Existing coverage preserved; new branches fully covered |
| Modified handlers                                                                    | 100% on new/changed branches | withDomainMap paths, error mapping                      |
| Modified repos                                                                       | 100% on new/changed branches | New primitive signatures, removed logic                 |
| Zod schema changes                                                                   | 100% on `.refine()` branches | Both pass and fail paths                                |
| Untouched infra (pricing, email, meeting, scheduler, lib/retry, lib/circuit-breaker) | No new gate                  | Best-effort only during normal edits                    |

### E.2 Coverage verification

```bash
bun run test:coverage
```

Review the coverage report for the touched modules. If any new/modified file is below 100%, add tests until either 100% is reached or the remaining uncovered branch is genuinely trivial (e.g. a defensive `catch` that re-throws). Document any accepted gaps in the commit message.

**Acceptance:** Coverage report shows ≥95% on touched modules (`notification`, `room`, `tutor`, `payment`, `admin-booking`, `wallet`, `refund`). Best-effort 100% on new files.

---

## 8. Verification Gates

Run these after all phases are complete. All must pass.

### 8.1 No HTTP errors in services

```bash
grep -rn "from.*lib/errors" packages/api/src/modules/ --include="*.service.ts"
```

**Acceptance:** Zero matches.

### 8.2 No HTTP errors in repos

```bash
grep -rn "from.*lib/errors" packages/api/src/modules/ --include="*.repo.ts"
```

**Acceptance:** Zero matches.

### 8.3 No cross-module repo imports outside index.ts

```bash
grep -rn "from.*\.\./[a-z-]*/[a-z-]*\.repo" packages/api/src/modules/ --include="*.service.ts" --include="*.handler.ts"
```

**Acceptance:** Zero matches. (Repos are only imported in their own `index.ts`.)

### 8.4 No inline Drizzle in notification/room services

```bash
grep -rn "db\.\(select\|insert\|update\|delete\|query\)" packages/api/src/modules/notification/notification.service.ts packages/api/src/modules/room/room.service.ts
```

**Acceptance:** Zero matches.

### 8.5 No `as unknown as` double casts

```bash
grep -rn "as unknown as" packages/api/src/modules/ packages/api/src/lib/
```

**Acceptance:** Zero matches.

### 8.6 All 14 error files present

```bash
ls packages/api/src/modules/*/  | grep "\.errors\.ts"
```

**Acceptance:** 14 files (one per module that has errors: achievement, admin, admin-booking, admin-tutor, auth, booking, invite, notification, payment, refund, room, tutor, tutor-discovery, wallet).

### 8.7 No `badRequest`/`notFound`/`forbidden`/`conflict` in services

```bash
grep -rn "throw \(badRequest\|notFound\|forbidden\|conflict\|serviceUnavailable\|internalServerError\)" packages/api/src/modules/ --include="*.service.ts"
```

**Acceptance:** Zero matches.

### 8.8 Full CI

```bash
bun run check && bun run check-types && bun run build && bun test && bun run test:coverage
```

**Acceptance:** All checks pass. Coverage thresholds met for touched modules.

---

## 9. Risk Register

| #   | Risk                                                                        | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Moving `wallet.repo.getOrCreate` to service breaks race safety              | Medium     | High   | The `upsert` repo primitive uses `INSERT ... ON CONFLICT DO NOTHING` — the race-safe atomic operation. The service orchestrates `findById` → `upsert`; the `ON CONFLICT` handles concurrent inserts. Test with parallel `getOrCreate` calls. |
| R2  | Admin-booking refund port doesn't match refund service signature            | Medium     | Medium | TypeScript catches this at the composition root wiring site. Define `AdminBookingRefundPort` first, then check `refund.service` satisfies it; add adapter method if needed.                                                                  |
| R3  | Tutor Zod `.refine()` changes reject previously-accepted input              | Low        | Medium | The refine rules mirror the existing `validateSubmitForReview` checks exactly. Test with the existing tutor profile fixtures.                                                                                                                |
| R4  | Notification repo extraction breaks the `writeInternal` transaction         | Medium     | High   | `writeInternal` inserts into 3 tables (notification, user lookup, notificationDispatch). Keep the multi-insert in one repo method that accepts the tx connection, OR split and pass the tx through. Test the full `write` path.              |
| R5  | Moving repo filters to service opts changes query behavior                  | Low        | Medium | The filters move verbatim — same conditions, just passed as params. TypeScript catches missing opts at call sites.                                                                                                                           |
| R6  | Payment service removing `ORPCError` check lets provider errors leak as 500 | Medium     | Medium | Wrap provider errors in `PaymentProviderError` before they propagate. The handler's `withDomainMap` maps `PaymentProviderError` to the correct HTTP status.                                                                                  |
| R7  | Coverage push adds low-value tests that lock in implementation              | Medium     | Low    | Best-effort, not hard 100%. Accept gaps on trivial branches; document them. Focus on business-rule and error-mapping branches.                                                                                                               |
| R8  | `fallback.provider` type fix breaks meeting creation                        | Low        | High   | The double cast was papering over an alias mismatch. Fixing the alias is mechanical. Test meeting event creation after the fix.                                                                                                              |

---

## 10. Execution Checklist

### Phase 2 Corrections

- [ ] Confirm AD-5, AD-6, §1.4, §1.5, §3.5, §3.11 are done (no action — verify only)

### Phase A: Missing Repo Extractions

- [ ] A.1 Extract `notification.repo.ts` (6+ functions), update service + index, add tests
- [ ] A.2 Extract `room.repo.ts` (4 functions), update service + index, add tests
- [ ] A.3 Verify Phase A (CI green)

### Phase B: Layer Violations

- [ ] B.1 Tutor: replace `badRequest` throws with domain errors (`TutorProfileIncompleteError`, `InvalidTutorPricingError`); keep completeness checks in service (they validate DB state)
- [ ] B.2 Payment: remove `ORPCError` awareness, wrap as `PaymentProviderError`
- [ ] B.3 Admin-booking: introduce `AdminBookingRefundPort`, stop importing refund repo
- [ ] B.4 Wallet: move `getOrCreate` + pagination to service, repo exposes `upsert` primitive (race-safe via `ON CONFLICT`)
- [ ] B.5 Move remaining hardcoded repo filters (tutor future-only, booking published-only, discovery defaults, achievement fallbacks) to service opts
- [ ] B.6 Refund: remove dead `amount <= 0` check (Zod `.positive()` already validates)
- [ ] B.7 Verify Phase B (CI green)

### Phase C: Missing Error File

- [ ] C.1 Create `notification.errors.ts` with `NotificationNotFoundError` + `mapNotificationError`, update handler + service, add tests
- [ ] Verify all 14 error files present

### Phase D: Type Escape Hatch

- [ ] D.1 Fix `fallback.provider.ts` double cast, add/update test

### Phase E: Test Coverage

- [ ] E.1 Run `bun run test:coverage`, review touched modules
- [ ] E.2 Add tests until best-effort 100% on new/changed files, ≥95% on touched modules

### Final Verification

- [ ] 8.1 No `lib/errors` in services (grep)
- [ ] 8.2 No `lib/errors` in repos (grep)
- [ ] 8.3 No cross-module repo imports outside index.ts (grep)
- [ ] 8.4 No inline Drizzle in notification/room services (grep)
- [ ] 8.5 No `as unknown as` double casts (grep)
- [ ] 8.6 All 14 error files present
- [ ] 8.7 No HTTP error throws in services (grep)
- [ ] 8.8 Full CI + coverage green

---

### Version Notes

- v1.0 (2026-07-24): Created. Addendum to Phase 2 — drops 6 obsolete tasks, adds 2 repo extractions, 9 layer-violation fixes, 1 missing error file, 1 type escape hatch fix, coverage push. Based on codebase audit of `improvement/consolidation` branch.
