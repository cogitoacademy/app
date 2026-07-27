# Cogito Backend — Consolidation Phase 2: Error Architecture + Layer Cleanup + BOOKING_STATE

| Field      | Value                            |
| ---------- | -------------------------------- |
| Status     | Complete                         |
| Branch     | `improvement/consolidation`      |
| Created    | 2026-07-22                       |
| Depends on | Consolidation Phase 1            |
| Next       | improvement/foundation-hardening |
| Scope      | Backend-only                     |

This phase adds domain error architecture, cleans up layer violations, replaces booking state string literals, and DRYs up handler boilerplate. The goal is a codebase where:

- Services throw **domain errors** (not HTTP-aware `ORPCError`)
- Handlers map domain errors to HTTP responses via `withDomainMap`
- Repos are **pure data access** — no HTTP errors, no business logic
- Handlers own **Zod validation + data transforms**
- `BOOKING_STATE.XXX` constants replace all raw string literals
- Every change has **100% test coverage** and CI is green before pushing

---

## Execution Rules

1. **Every task must have passing tests before committing.** Run `bun test` after every change. If tests fail, fix before proceeding.
2. **Iterate until CI is green.** After each phase, run `bun run check && bun run check-types && bun run build && bun test`. If anything fails, fix it before moving on.
3. **Verbose commit messages** following the existing branch style: `refactor(api): domain error architecture for {module} module` or `fix(api): {specific fix}`. Match the pattern: `type(scope): description`.
4. **100% test coverage** for all new files (`domain-errors.ts`, `handler-utils.ts`, `{module}.errors.ts`). For modified files, add tests for the new behavior.
5. **Commit after each module migration** — never leave a partially-migrated module.
6. **No partial changes.** Each module must be fully migrated (service → domain errors, handler → withDomainMap, tests updated) before committing.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Phase 0: Green Baseline](#3-phase-0-green-baseline)
4. [Phase 1: Foundation — Base Classes and Utilities](#4-phase-1-foundation--base-classes-and-utilities)
5. [Phase 2: BOOKING_STATE Mechanical Replacement](#5-phase-2-booking_state-mechanical-replacement)
6. [Phase 3: Layer Cleanup — Repo Purity, Zod Schemas, Type Dedup](#6-phase-3-layer-cleanup--repo-purity-zod-schemas-type-dedup)
7. [Phase 4: Module Migration — Simplest First](#7-phase-4-module-migration--simplest-first)
8. [Phase 5: Module Migration — Medium Complexity](#8-phase-5-module-migration--medium-complexity)
9. [Phase 6: Module Migration — Complex Modules](#9-phase-6-module-migration--complex-modules)
10. [Phase 7: Module Migration — Booking (Most Complex)](#10-phase-7-module-migration--booking-most-complex)
11. [Phase 8: Cleanup — Remove Unused Error Factories, Final Verification](#11-phase-8-cleanup--remove-unused-error-factories-final-verification)
12. [Risk Register](#12-risk-register)
13. [Execution Checklist](#13-execution-checklist)

---

## 1. Overview

### Why This Phase

The initial consolidation (Phase 1) restructured file layout and wiring. But error handling, layer boundaries, and type safety still have problems:

- **Services throw HTTP-aware `ORPCError`** — couples business logic to HTTP
- **Handlers are boilerplate try/catch** — no mapping logic, no enrichment
- **Repos throw HTTP errors** — `wallet.repo.ts` throws `badRequest()` from data access
- **Payment has no repo layer** — service does direct DB queries
- **Room has no Zod schemas** — no runtime input validation
- **Admin-tutor has duplicated types** — TS interfaces alongside Zod schemas
- **BOOKING_STATE constant exists but is unused** — 50+ raw string literals
- **Handlers do date transforms** — `new Date()` instead of Zod coercion
- **`tutor-discovery` handler throws `notFound`** — HTTP concern in handler layer

### Phase Summary

| Phase | Focus           | Tasks                                                                    | Est. |
| ----- | --------------- | ------------------------------------------------------------------------ | ---- |
| 0     | Green baseline  | Verify CI passes                                                         | 0    |
| 1     | Foundation      | Domain error base class, handler utils, all error files, new repos/types | 1    |
| 2     | BOOKING_STATE   | Mechanical constant replacement                                          | 0.5  |
| 3     | Layer cleanup   | Repo purity, Zod schemas, type dedup, new files                          | 1    |
| 4     | Simple modules  | achievement, room, invite, admin, auth, refund                           | 1    |
| 5     | Medium modules  | wallet, admin-tutor, admin-booking, payment, tutor, tutor-discovery      | 1.5  |
| 6     | Complex modules | (reserved if needed)                                                     | 0    |
| 7     | Booking module  | 24 error classes, most complex                                           | 1.5  |
| 8     | Cleanup         | Remove unused factories, final verification                              | 0.5  |

**Total: ~6 days**

### Architecture After This Phase

```
modules/{module}/
  {module}.errors.ts    ← NEW: domain error classes + mapXxxError()
  {module}.router.ts    ← oRPC route definitions (thin, no logic)
  {module}.handler.ts   ← withDomainMap() + Zod-validated input
  {module}.service.ts   ← throws DomainError subclasses (no HTTP imports)
  {module}.repo.ts      ← pure data access (no HTTP errors, no business logic)
  {module}.types.ts     ← Zod schemas with z.coerce.date() and .refine()
  index.ts              ← createModule() factory
```

Services never import from `lib/errors`. Handlers never throw domain errors. Repos never throw HTTP errors.

---

## 2. Architecture Decisions

### AD-1: Fine-Grained Domain Errors with Explicit Mappers

**Decision:** Each business rule violation gets its own `DomainError` subclass. Each module has a `mapXxxError()` function that maps domain errors to HTTP errors.

**Rationale:** Fine-grained errors give type-safe catchability and self-documenting code. The per-module mapper is explicit — no magic, no hidden HTTP codes on domain classes. Services are truly HTTP-agnostic.

```ts
// booking.errors.ts
export class BookingNotFoundError extends DomainError {
  readonly domain = "booking";
  constructor(bookingId: string) {
    super("BOOKING_NOT_FOUND", "Booking not found", { bookingId });
  }
}

export function mapBookingError(err: DomainError): ORPCError {
  if (err instanceof BookingNotFoundError) return notFound(err.message, err);
  if (err instanceof InsufficientMarksError) return conflict(err.message, err);
  // ... exhaustive
  return internalServerError(err.message, err);
}
```

### AD-2: Handler Validation via Zod, Service Validation via Domain Errors

**Decision:** Handlers validate syntax (Zod schemas, data transforms). Services validate business rules (state transitions, ownership, overlaps) and throw domain errors.

**Rationale:** Some validations require DB access (ownership, state checks). Handlers can't do those without calling service/repo first. Zod handles format validation; services handle semantic validation.

### AD-3: Repo Returns Result Objects, Not Errors

**Decision:** Repo atomic operations that can fail (e.g., insufficient balance) return `{ success: false, reason }` instead of throwing HTTP errors. Services check the result and throw domain errors.

**Rationale:** Repos should not know about HTTP. A balance check is a business rule, not a data access concern.

### AD-4: Preserve Domain Error as Cause in ORPCError

**Decision:** When handlers map `DomainError` → `ORPCError`, the domain error is preserved as the `cause` field. This enables full error chain debugging in logs.

### AD-5: Payment Module Gets a Repo Layer

**Decision:** Extract `payment.repo.ts` from `payment.service.ts`. Same pattern as all other modules.

**Rationale:** Consistency. Direct DB queries in services violate the 4-layer architecture.

### AD-6: Room Module Gets Zod Schemas

**Decision:** Create `room.types.ts` with Zod schemas for all room endpoints. Move inline router schemas to this file.

**Rationale:** Every other module has `.types.ts`. Room is the only module without runtime validation.

---

## 3. Phase 0: Green Baseline

**Goal:** Verify CI passes before starting.

### 0.1 Verify green baseline

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** All checks pass. This is the rollback point.

---

## 4. Phase 1: Foundation — Base Classes and Utilities

**Goal:** Create all new files that don't touch existing code. After this phase, all new infrastructure exists but nothing is wired up yet.

### 1.1 Create `lib/domain-errors.ts`

**Create:** `packages/api/src/lib/domain-errors.ts`

```ts
export abstract class DomainError extends Error {
  readonly code: string;
  abstract readonly domain: string;

  constructor(
    code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
```

**Test:** `packages/api/src/tests/unit/domain-errors.test.ts` — test `code`, `domain`, `message`, `details`, `name`, `instanceof`.

### 1.2 Create `lib/handler-utils.ts`

**Create:** `packages/api/src/lib/handler-utils.ts`

```ts
import { ORPCError } from "@orpc/server";
import { DomainError } from "./domain-errors";
import { internalServerError } from "./errors";

export function withDomainMap<T>(
  fn: () => Promise<T>,
  mapper: (err: DomainError) => ORPCError,
): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof ORPCError) throw err;
    if (err instanceof DomainError) throw mapper(err);
    throw internalServerError("Unexpected error", err);
  });
}
```

**Test:** `packages/api/src/tests/unit/handler-utils.test.ts` — test that ORPCError passes through, DomainError gets mapped, unknown errors become internalServerError.

### 1.3 Create all `{module}.errors.ts` files

Create 14 error definition files. Each contains domain error classes and a mapper function.

**Files to create:**

| #      | File                                            | Classes                                                                                                                | Mapper                 |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1.3.1  | `modules/achievement/achievement.errors.ts`     | `AchievementNotFoundError`, `AchievementNotEditableError`                                                              | `mapAchievementError`  |
| 1.3.2  | `modules/admin/admin.errors.ts`                 | `UserNotFoundError`, `LastAdminError`                                                                                  | `mapAdminError`        |
| 1.3.3  | `modules/admin-booking/admin-booking.errors.ts` | `BookingNotFoundError`, `TerminalStateOverrideError`, `InvalidRefundStateError`                                        | `mapAdminBookingError` |
| 1.3.4  | `modules/admin-tutor/admin-tutor.errors.ts`     | `InviteNotFoundError`, `TutorProfileNotFoundError`, `InvalidInviteActionError`                                         | `mapAdminTutorError`   |
| 1.3.5  | `modules/auth/auth.errors.ts`                   | `ProfileNotFoundError`, `ValidationRequiredError`                                                                      | `mapAuthError`         |
| 1.3.6  | `modules/booking/booking.errors.ts`             | 24 classes (see spec)                                                                                                  | `mapBookingError`      |
| 1.3.7  | `modules/invite/invite.errors.ts`               | `InviteNotFoundError`, `InviteEmailMismatchError`, `ProfileAlreadyExistsError`                                         | `mapInviteError`       |
| 1.3.8  | `modules/payment/payment.errors.ts`             | `PackageNotFoundError`, `PackageAlreadyPurchasedError`, `PaymentProviderError`                                         | `mapPaymentError`      |
| 1.3.9  | `modules/refund/refund.errors.ts`               | `WalletNotFoundError`, `InvalidRefundAmountError`                                                                      | `mapRefundError`       |
| 1.3.10 | `modules/room/room.errors.ts`                   | `RoomNotFoundError`, `RoomBookingConflictError`                                                                        | `mapRoomError`         |
| 1.3.11 | `modules/tutor/tutor.errors.ts`                 | `TutorProfileNotFoundError`, `TutorProfileNotEditableError`, `InvalidTutorStatusError`, `AvailabilitySlotOverlapError` | `mapTutorError`        |
| 1.3.12 | `modules/tutor-discovery/discovery.errors.ts`   | `TutorProfileNotFoundError`                                                                                            | `mapDiscoveryError`    |
| 1.3.13 | `modules/wallet/wallet.errors.ts`               | `WalletNotFoundError`, `InsufficientBalanceError`                                                                      | `mapWalletError`       |
| 1.3.14 | `modules/booking/booking-state.types.ts`        | No new file — update existing                                                                                          | —                      |

**Test:** Create a test for each error file verifying:

- `instanceof DomainError` works
- `err.code`, `err.domain`, `err.message`, `err.details` are correct
- `err.name` equals constructor name
- Mapper maps each error to the correct HTTP status

**Acceptance:** All 14 error files exist. All tests pass. No existing code is modified yet.

### 1.4 Create `room/room.types.ts`

**Create:** `packages/api/src/modules/room/room.types.ts`

```ts
import { z } from "zod";

export const createRoomInput = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  capacity: z.number().int().min(1),
});

export const assignRoomInput = z.object({
  bookingId: z.string().min(1),
  roomId: z.string().min(1),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

export const listRoomsInput = z.void();
```

**Test:** Verify schemas parse valid/invalid input.

### 1.5 Create `payment/payment.repo.ts`

**Create:** `packages/api/src/modules/payment/payment.repo.ts`

Extract all direct DB queries from `payment.service.ts` into a repo, following the same pattern as other modules (`createPaymentRepo(db)`).

Functions to extract:

- `findPackageById(db, id)`
- `findPaymentByEventKey(db, eventKey)`
- `findPaymentById(db, id)`
- `insertPayment(db, values)`
- `updatePaymentStatus(db, id, status)`
- `listPackages(db, opts)`
- `findActivePackagesByUserId(db, userId)`
- `insertPaymentRecord(db, values)` (for webhook processing)

**Test:** Create `tests/unit/payment.repo.test.ts` with repo method tests.

**Acceptance:** `payment.repo.ts` exists. `payment.service.ts` still uses direct DB queries (migration happens in Phase 5). All tests pass.

### 1.6 Verify Phase 1

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** All checks pass. New files are created but not wired into existing code yet.

---

## 5. Phase 2: BOOKING_STATE Mechanical Replacement

**Goal:** Replace all raw booking state string literals with `BOOKING_STATE.XXX` constants. This is purely mechanical — no behavior changes.

### 2.1 Update `booking-state.types.ts`

Change `TERMINAL_STATES` to use `BOOKING_STATE` constants instead of raw strings.

### 2.2 Update `booking.service.ts`

Replace all 78+ raw state strings with `BOOKING_STATE.XXX`. For example:

- `"awaiting_tutor_review"` → `BOOKING_STATE.AWAITING_TUTOR_REVIEW`
- `"cancelled"` → `BOOKING_STATE.CANCELLED`
- etc.

### 2.3 Update `booking-transitions.ts`

Replace all state string keys and values with `BOOKING_STATE.XXX`.

### 2.4 Update `booking.repo.ts`

- Replace inline terminal states filter in `findOverlappingBookings` with `TERMINAL_STATES` constant passed as parameter
- Update method signature: `findOverlappingBookings(conn, tutorId, startAt, endAt, excludeBookingId?, { excludeStates })`

### 2.5 Update `admin-booking.service.ts`

Replace `CATEGORY_STATE_MAP` values with `BOOKING_STATE.XXX` constants.

### 2.6 Update `booking.service.ts` calls to `findOverlappingBookings`

Update all call sites to pass the `excludeStates` parameter.

### 2.7 Verify Phase 2

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Commit:** `refactor(api): replace booking state string literals with BOOKING_STATE constants`

**Acceptance:** No raw booking state strings remain in `booking.service.ts`, `booking-transitions.ts`, `booking.repo.ts`, or `admin-booking.service.ts`. All tests pass.

---

## 6. Phase 3: Layer Cleanup — Repo Purity, Zod Schemas, Type Dedup

**Goal:** Fix layer violations before module migration. Repo purity, Zod schemas, type dedup.

### 3.1 Wallet repo: return result objects

**Modify:** `packages/api/src/modules/wallet/wallet.repo.ts`

Change `atomicHold` and `atomicDeduct` to return result objects instead of throwing `badRequest`:

```ts
type AtomicResult =
  | { success: true; wallet: WalletSnapshot }
  | { success: false; reason: "insufficient_balance" | "insufficient_held" };
```

**Modify:** `packages/api/src/modules/wallet/wallet.service.ts`

Check result objects and throw domain errors:

```ts
const result = await repo.atomicHold(db, { ... });
if (!result.success) throw new InsufficientBalanceError(w.availableBalance, params.amount);
```

**Test:** Update `wallet.repo.test.ts` and `wallet.service.test.ts`.

**Commit:** `refactor(api): wallet repo returns result objects instead of throwing HTTP errors`

### 3.2 Booking repo: remove business logic

**Modify:** `packages/api/src/modules/booking/booking.repo.ts`

Change `findOverlappingBookings` to accept `opts: { excludeStates?: string[] }` instead of hardcoding the active states filter.

**Modify:** `packages/api/src/modules/booking/booking.service.ts`

Pass `TERMINAL_STATES`-derived active states from service to repo.

**Commit:** `refactor(api): move booking active states filter from repo to service`

### 3.3 Booking types: add `z.coerce.date()` and validation `.refine()`

**Modify:** `packages/api/src/modules/booking/booking.types.ts`

- Change all date fields from `z.string().datetime()` to `z.coerce.date()`
- Add `.refine()` for time range validation (`endAt > startAt`)
- Add `.min()`/`.max()` for group size and series session count

**Modify:** `packages/api/src/modules/booking/booking.handler.ts`

Remove all `new Date()` calls — Zod handles date coercion now.

**Modify:** `packages/api/src/modules/booking/booking.service.ts`

Remove validations that moved to Zod (time range checks, group/series size bounds). Keep business rule validations (state transitions, ownership, overlaps).

**Commit:** `refactor(api): move date coercion and syntax validation from handler/service to Zod schemas`

### 3.4 Tutor availability types: add `z.coerce.date()`

**Modify:** `packages/api/src/modules/tutor/availability.types.ts`

Change date fields from `z.string().datetime()` to `z.coerce.date()`.

**Modify:** `packages/api/src/modules/tutor/tutor.service.ts` (if it does `new Date()`)

Remove any `new Date()` date transforms.

**Commit:** `refactor(api): move tutor availability date coercion to Zod schemas`

### 3.5 Room types: create Zod schemas and update handler/router

**Modify:** `packages/api/src/modules/room/room.handler.ts`

- Import types from `room.types.ts` instead of inline
- Remove `new Date()` calls (Zod handles it)
- Replace inline TypeScript types with Zod-inferred types

**Modify:** `packages/api/src/modules/room/room.router.ts`

Import schemas from `room.types.ts` instead of inline definitions.

**Modify:** `packages/api/src/modules/room/room.service.ts`

Remove inline `CreateRoomInput` type (use `z.infer<typeof createRoomInput>`).

**Commit:** `refactor(api): add Zod schemas to room module, remove inline types`

### 3.6 Admin-booking types: add `.enum()` validation

**Modify:** `packages/api/src/modules/admin-booking/admin-booking.types.ts`

Add `.enum()` validation for `category` and `marksAction` fields using the existing `OVERRIDE_CATEGORIES` and `MARKS_ACTIONS` constants.

**Modify:** `packages/api/src/modules/admin-booking/admin-booking.handler.ts`

Remove `validateCategory()` and `validateMarksAction()` functions — Zod handles it now.

**Commit:** `refactor(api): move admin-booking enum validation from handler to Zod schemas`

### 3.7 Admin-tutor types: remove duplicated interfaces

**Modify:** `packages/api/src/modules/admin-tutor/admin-tutor.types.ts`

Remove duplicated TypeScript interfaces (`CreateInviteInput`, `ListInvitesInput`, `ListTutorProfilesInput`, `ReviewTutorProfileInput`). Use `z.infer<>` instead.

**Modify:** `packages/api/src/modules/admin-tutor/admin-tutor.service.ts`

Update imports from interfaces to `z.infer<>`.

**Commit:** `refactor(api): remove duplicated type interfaces in admin-tutor, use z.infer`

### 3.8 Auth types: add `.refine()` for blank string validation

**Modify:** `packages/api/src/modules/auth/auth.types.ts`

Add `.refine()` to prevent blank strings in update fields.

**Modify:** `packages/api/src/modules/auth/auth.service.ts`

Remove `validateUpdateInput()` — Zod handles it now.

**Commit:** `refactor(api): move auth blank string validation from service to Zod schemas`

### 3.9 Achievement repo: move default limit to service

**Modify:** `packages/api/src/modules/achievement/achievement.repo.ts`

Remove `input.limit ?? 50` default.

**Modify:** `packages/api/src/modules/achievement/achievement.service.ts`

Set default limit before calling repo.

**Commit:** `refactor(api): move default pagination limit from achievement repo to service`

### 3.10 Refund repo: remove unused parameter

**Modify:** `packages/api/src/modules/refund/refund.repo.ts`

Remove or properly type the unused `_db` parameter in `createRefundRepo`.

**Commit:** `fix(api): remove unused parameter from refund repo factory`

### 3.11 Payment service: refactor to use new repo

**Modify:** `packages/api/src/modules/payment/payment.service.ts`

Replace all direct DB queries with `repo.*` calls using the new `payment.repo.ts`.

**Modify:** `packages/api/src/modules/payment/index.ts`

Wire `payment.repo` into the module factory.

**Test:** Verify all payment service and repo tests pass.

**Commit:** `refactor(api): extract payment repo layer from service`

### 3.12 Tutor-discovery: add proper service methods

**Modify:** `packages/api/src/modules/tutor-discovery/discovery.service.ts`

Add `listPublished(opts)` and `getProfile(tutorId)` methods that wrap repo calls and throw `TutorProfileNotFoundError`.

**Modify:** `packages/api/src/modules/tutor-discovery/discovery.handler.ts`

Remove direct repo calls. Call service methods instead. Remove `notFound` import. Use `withDomainMap`.

**Modify:** `packages/api/src/modules/tutor-discovery/index.ts`

Wire service instead of passing repo directly to handler.

**Commit:** `refactor(api): add service layer to tutor-discovery, move notFound out of handler`

### 3.13 Verify Phase 3

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** All layer violations are fixed. No HTTP errors in repos. No business logic in repos. All Zod schemas are updated. All tests pass.

---

## 7. Phase 4: Module Migration — Simplest Modules

**Goal:** Migrate the simplest modules first. Each module: service throws domain errors, handler uses `withDomainMap`, tests updated.

### 4.1 Achievement module

**Modify:** `achievement.service.ts` — replace `notFound`/`badRequest` with domain errors
**Modify:** `achievement.handler.ts` — replace try/catch with `withDomainMap`
**Test:** Update `achievement.service.test.ts` and `achievement.handler.test.ts` to assert `DomainError` subclasses

**Commit:** `refactor(api): migrate achievement module to domain errors`

### 4.2 Room module

**Modify:** `room.service.ts` — replace `notFound`/`conflict` with domain errors
**Modify:** `room.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate room module to domain errors`

### 4.3 Invite module

**Modify:** `invite.service.ts` — replace `notFound`/`forbidden`/`conflict` with domain errors
**Modify:** `invite.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate invite module to domain errors`

### 4.4 Admin module

**Modify:** `admin.service.ts` — replace `notFound`/`conflict` with domain errors
**Modify:** `admin.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate admin module to domain errors`

### 4.5 Auth module

**Modify:** `auth.service.ts` — replace `badRequest`/`notFound` with domain errors
**Modify:** `auth.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate auth module to domain errors`

### 4.6 Refund module

**Modify:** `refund.service.ts` — replace `badRequest`/`notFound` with domain errors
**Modify:** `refund.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate refund module to domain errors`

### 4.7 Verify Phase 4

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** All 6 simple modules migrated. No `lib/errors` imports in their services. All tests pass.

---

## 8. Phase 5: Module Migration — Medium Complexity

### 5.1 Wallet module

**Modify:** `wallet.service.ts` — replace `notFound`/`badRequest` with domain errors; check repo result objects
**Modify:** `wallet.handler.ts` — replace try/catch with `withDomainMap`

**Test:** Update `wallet.service.test.ts` to assert `DomainError` subclasses and result object checks
**Test:** Update `wallet.repo.test.ts` to assert result objects instead of thrown errors

**Commit:** `refactor(api): migrate wallet module to domain errors and result objects`

### 5.2 Admin-tutor module

**Modify:** `admin-tutor.service.ts` — replace `notFound`/`badRequest`/`conflict` with domain errors; update type imports
**Modify:** `admin-tutor.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate admin-tutor module to domain errors`

### 5.3 Admin-booking module

**Modify:** `admin-booking.service.ts` — replace `notFound`/`badRequest` with domain errors; use BOOKING_STATE constants
**Modify:** `admin-booking.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate admin-booking module to domain errors`

### 5.4 Payment module

**Modify:** `payment.service.ts` — replace `notFound`/`conflict`/`serviceUnavailable` with domain errors; use repo instead of direct DB
**Modify:** `payment.handler.ts` — replace try/catch with `withDomainMap`; move `wallet.getOrCreate()` to service

**Commit:** `refactor(api): migrate payment module to domain errors and repo layer`

### 5.5 Tutor module

**Modify:** `tutor.service.ts` — replace `notFound`/`forbidden`/`badRequest` with domain errors
**Modify:** `tutor.handler.ts` — replace try/catch with `withDomainMap`

**Commit:** `refactor(api): migrate tutor module to domain errors`

### 5.6 Tutor-discovery module

**Modify:** `discovery.handler.ts` — replace try/catch with `withDomainMap`; use service methods (added in Phase 3)
**Modify:** `discovery.service.ts` — already throws domain errors (added in Phase 3)

**Commit:** `refactor(api): migrate tutor-discovery module to domain errors`

### 5.7 Notification module

**Modify:** `notification.handler.ts` — replace try/catch with `withDomainMap` (no domain errors, generic mapper)
**Modify:** `notification.service.ts` — add fire-and-forget comment

**Commit:** `refactor(api): migrate notification handler to withDomainMap pattern`

### 5.8 Verify Phase 5

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** All medium modules migrated. All tests pass.

---

## 9. Phase 6: Module Migration — Complex Modules

(Reserved for modules that need extra care during migration. Currently empty — all medium-complexity modules are in Phase 5.)

### 6.1 No-Change Modules

The following modules require **no changes** in this phase. They are explicitly listed here for completeness:

| Module                                                                                                                                                           | Reason                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pricing`                                                                                                                                                        | Pure computation, no errors thrown, no handler                                     |
| `scheduler`                                                                                                                                                      | BullMQ worker, no errors thrown, no handler                                        |
| `email`                                                                                                                                                          | Provider wrappers only, `resend-email.provider.ts` keeps ORPCError (infra adapter) |
| `meeting`                                                                                                                                                        | Provider wrappers only, no errors thrown in service                                |
| `audit`                                                                                                                                                          | Simple port implementation, no errors thrown, no handler                           |
| `lib/circuit-breaker.ts`                                                                                                                                         | Infrastructure, keeps `serviceUnavailable` from `lib/errors`                       |
| `lib/db-errors.ts`                                                                                                                                               | Infrastructure, keeps `classifyDbError` as-is                                      |
| `lib/db.ts`, `lib/tx.ts`                                                                                                                                         | Pure utilities, no changes                                                         |
| `lib/logger.ts`, `lib/retry.ts`, `lib/rate-limit.ts`, `lib/request-id.ts`, `lib/security-headers.ts`, `lib/metrics.ts`, `lib/db-health.ts`, `lib/idempotency.ts` | No changes                                                                         |

---

## 10. Phase 7: Module Migration — Booking (Most Complex)

**Goal:** Migrate the booking module — the largest with 24 domain error classes and the most complex service.

### 7.1 Migrate booking service

**Modify:** `booking.service.ts`

- Replace all `notFound`/`conflict`/`forbidden`/`badRequest`/`serviceUnavailable` imports with domain error imports from `./booking.errors`
- Replace every `throw notFound("Booking not found")` with `throw new BookingNotFoundError(bookingId)`
- Replace every `throw conflict(...)` with the appropriate domain error
- Replace every `throw forbidden(...)` with the appropriate domain error
- Replace every `throw badRequest(...)` with the appropriate domain error
- Add `isUniqueViolation` / `isForeignKeyViolation` catch blocks where needed (for repo DB constraint errors)
- Update `expireBookings()` logging to check for `DomainError` and include `err.code`

### 7.2 Migrate booking handler

**Modify:** `booking.handler.ts`

- Replace all try/catch blocks with `withDomainMap`
- Import `mapBookingError` from `./booking.errors`
- Import `withDomainMap` from `../../lib/handler-utils`

### 7.3 Migrate booking repo

**Modify:** `booking.repo.ts`

- Already updated in Phase 2 (BOOKING_STATE) and Phase 3 (excludeStates param)
- Verify no HTTP error imports remain

### 7.4 Verify booking migration

```bash
bun test -- --grep booking
```

**Commit:** `refactor(api): migrate booking module to domain errors (24 error classes)`

### 7.5 Verify Phase 7

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** Booking module fully migrated. All 24 domain errors used. All tests pass.

---

## 11. Phase 8: Cleanup — Remove Unused Error Factories, Final Verification

**Goal:** Remove dead code, verify everything works end-to-end.

### 8.1 Remove unused error factories from `lib/errors.ts`

**Modify:** `packages/api/src/lib/errors.ts`

Remove these functions (never used anywhere):

- `preconditionFailed`
- `unprocessableContent`
- `rateLimited`
- `timeout`

**Modify:** `packages/api/src/tests/unit/errors.test.ts`

Remove tests for deleted functions.

**Commit:** `refactor(api): remove unused error factories from lib/errors`

### 8.2 Add JSDoc to `DomainError` and `withDomainMap`

**Modify:** `packages/api/src/lib/domain-errors.ts`
**Modify:** `packages/api/src/lib/handler-utils.ts`

Add JSDoc comments explaining usage patterns.

**Commit:** `docs(api): add JSDoc to DomainError and withDomainMap`

### 8.3 Verify no `lib/errors` imports remain in services

```bash
grep -r "from.*lib/errors" packages/api/src/modules/*/  --include="*.service.ts"
```

**Acceptance:** Zero matches. All services use domain errors.

### 8.4 Verify no HTTP errors in repos

```bash
grep -r "from.*lib/errors" packages/api/src/modules/*/  --include="*.repo.ts"
```

**Acceptance:** Zero matches. No repos import HTTP errors.

### 8.5 Verify no raw booking state strings

```bash
grep -r '"awaiting_tutor_review"\|"awaiting_participant_confirmation"\|"awaiting_reconfirmation"\|"awaiting_marks_hold"\|"awaiting_admin_room_approval"\|"scheduled"\|"confirmed"\|"cancelled"\|"late_cancelled"\|"declined"\|"expired"\|"completed"\|"no_show"\|"reschedule_proposed"' packages/api/src/modules/booking/ --include="*.ts" --include="*.tsx"
grep -r '"declined"\|"cancelled"\|"late_cancelled"\|"no_show"\|"expired"\|"completed"' packages/api/src/modules/admin-booking/ --include="*.ts"
```

**Acceptance:** Zero matches (except in `booking-state.types.ts` where the values are defined).

### 8.6 Verify no try/catch patterns in handlers

```bash
grep -r "if (err instanceof ORPCError)" packages/api/src/modules/*/  --include="*.handler.ts"
```

**Acceptance:** Zero matches. All handlers use `withDomainMap`.

### 8.7 Verify no `new Date()` in handlers

```bash
grep -r "new Date(input\." packages/api/src/modules/*/  --include="*.handler.ts"
```

**Acceptance:** Zero matches. All date coercion is in Zod schemas.

### 8.8 Full CI verification

```bash
bun run check && bun run check-types && bun run build && bun test
```

**Acceptance:** All checks pass. Zero type errors. Zero lint errors. All tests green.

### 8.9 Final commit

```bash
git add -A
git commit -m "refactor(api): consolidation phase 2 — domain error architecture, layer cleanup, BOOKING_STATE constants, handler DRY-up"
git push origin improvement/consolidation
```

---

## 12. Risk Register

| #   | Risk                                                           | Likelihood | Impact | Mitigation                                                                                                                                                              |
| --- | -------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Domain error class names collide across modules                | Low        | Medium | Use module-prefixed codes (e.g., `BOOKING_NOT_FOUND` vs `ADMIN_BOOKING_NOT_FOUND`)                                                                                      |
| R2  | Mapper not exhaustive — unhandled domain error                 | Medium     | High   | Every mapper has a fallback `return internalServerError(err.message, err)`. TypeScript strict mode catches missing `instanceof` branches if using discriminated unions. |
| R3  | Service still imports from `lib/errors` after migration        | Low        | High   | Phase 8 grep verification catches this. CI fails on any remaining `lib/errors` imports in services.                                                                     |
| R4  | `z.coerce.date()` changes API contract                         | Low        | Medium | oRPC serializes Date objects to ISO strings. Zod coercion happens at parse time. Test that date fields are correctly coerced.                                           |
| R5  | Wallet repo result object breaks existing tests                | Medium     | High   | Update `wallet.repo.test.ts` and `wallet.service.test.ts` in same commit as repo change.                                                                                |
| R6  | Payment repo extraction misses a query                         | Medium     | High   | Grep `payment.service.ts` for direct Drizzle imports. Every query must be in `payment.repo.ts`.                                                                         |
| R7  | BOOKING_STATE replacement introduces typo                      | Low        | High   | TypeScript type checking catches invalid `BOOKING_STATE.XXX` references. `BOOKING_STATE` is `as const` so all values are string literals.                               |
| R8  | Booking module migration is complex — risk of partial breakage | Medium     | High   | Migrate booking last after all other modules are proven. Run booking-specific tests after every change.                                                                 |
| R9  | `withDomainMap` changes error response format                  | Low        | Medium | Domain errors are preserved as `cause` in ORPCError. The HTTP response body format doesn't change — only the internal error chain is richer.                            |
| R10 | Admin-booking Zod enum validation breaks existing requests     | Low        | Medium | The enum values are the same. Zod `.enum()` validates the same set of values that `validateCategory` was checking.                                                      |

---

## 13. Execution Checklist

### Phase 0: Green Baseline

- [x] 0.1 Verify CI green (`bun run check && bun run check-types && bun run build && bun test`)

### Phase 1: Foundation

- [x] 1.1 Create `lib/domain-errors.ts` with test
- [x] 1.2 Create `lib/handler-utils.ts` with test
- [x] 1.3 Create all 14 `{module}.errors.ts` files with tests
- [x] 1.4 Create `room/room.types.ts` with Zod schemas
- [x] 1.5 Create `payment/payment.repo.ts` (extract from service)
- [x] 1.6 Verify Phase 1 (all checks pass)

### Phase 2: BOOKING_STATE

- [x] 2.1 Update `booking-state.types.ts` — TERMINAL_STATES uses BOOKING_STATE.XXX
- [x] 2.2 Update `booking.service.ts` — all state strings → BOOKING_STATE.XXX
- [x] 2.3 Update `booking-transitions.ts` — all state strings → BOOKING_STATE.XXX
- [x] 2.4 Update `booking.repo.ts` — accept excludeStates param, use BOOKING_STATE
- [x] 2.5 Update `admin-booking.service.ts` — CATEGORY_STATE_MAP uses BOOKING_STATE.XXX
- [x] 2.6 Update all call sites for findOverlappingBookings
- [x] 2.7 Verify Phase 2 (commit)

### Phase 3: Layer Cleanup

- [x] 3.1 Wallet repo: return result objects instead of throwing HTTP errors
- [x] 3.2 Booking repo: accept excludeStates param, remove hardcoded filter
- [x] 3.3 Booking types: add z.coerce.date(), remove handler date transforms
- [x] 3.4 Tutor availability types: add z.coerce.date()
- [x] 3.5 Room: create types file, update handler and router
- [x] 3.6 Admin-booking types: add .enum() validation, remove handler validation functions
- [x] 3.7 Admin-tutor types: remove duplicated interfaces
- [x] 3.8 Auth types: add .refine() for blank strings
- [x] 3.9 Achievement repo: move default limit to service
- [x] 3.10 Refund repo: remove unused parameter
- [x] 3.11 Payment service: refactor to use repo
- [x] 3.12 Tutor-discovery: add service methods, move notFound to service
- [x] 3.13 Verify Phase 3 (all checks pass)

### Phase 4: Simple Module Migration

- [x] 4.1 Migrate achievement (2 errors)
- [x] 4.2 Migrate room (2 errors)
- [x] 4.3 Migrate invite (3 errors)
- [x] 4.4 Migrate admin (2 errors)
- [x] 4.5 Migrate auth (2 errors)
- [x] 4.6 Migrate refund (2 errors)
- [x] 4.7 Verify Phase 4 (all checks pass)

### Phase 5: Medium Module Migration

- [x] 5.1 Migrate wallet (2 errors + repo result objects)
- [x] 5.2 Migrate admin-tutor (3 errors + type dedup)
- [x] 5.3 Migrate admin-booking (3 errors + BOOKING_STATE + Zod enums)
- [x] 5.4 Migrate payment (3 errors + repo extraction)
- [x] 5.5 Migrate tutor (4 errors)
- [x] 5.6 Migrate tutor-discovery (1 error + service layer)
- [x] 5.7 Migrate notification (0 errors, withDomainMap only)
- [x] 5.8 Verify Phase 5 (all checks pass)

### Phase 6: Complex Module Migration

- [x] (Reserved — currently empty)

### Phase 7: Booking Module Migration

- [x] 7.1 Migrate booking.service.ts (24 domain errors)
- [x] 7.2 Migrate booking.handler.ts (withDomainMap)
- [x] 7.3 Verify booking.repo.ts (no HTTP errors)
- [x] 7.4 Verify booking migration (booking tests pass)
- [x] 7.5 Verify Phase 7 (all checks pass)

### Phase 8: Cleanup

- [x] 8.1 Remove unused error factories (preconditionFailed, unprocessableContent, rateLimited, timeout)
- [x] 8.2 Add JSDoc to DomainError and withDomainMap
- [x] 8.3 Verify no `lib/errors` imports in services
- [x] 8.4 Verify no HTTP errors in repos
- [x] 8.5 Verify no raw booking state strings
- [x] 8.6 Verify no try/catch patterns in handlers
- [x] 8.7 Verify no `new Date()` in handlers
- [x] 8.8 Full CI verification
- [x] 8.9 Push to GitHub

---

### Version Notes

- v1.0 (2026-07-22): Created. Domain error architecture, layer cleanup, BOOKING_STATE replacement, handler DRY-up.
