# 100% Test Coverage — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Achieve 100% line and function coverage on all `packages/api/src` source files in the PR branch.

**Architecture:** Add unit tests for 16 uncovered files. Repo files use Drizzle ORM mock patterns. Handler/service files mock their dependencies. Router files test that route definitions call the correct service methods. Booking service requires the most extensive testing.

**Tech Stack:** Bun test runner, manual mock factories (same pattern as existing tests), drizzle-orm query mock chains.

---

## File Categories & Testing Approach

### Category A: Repo Files (7 files — thin DB wrappers)
Test each repo function by mocking the `conn` object with Drizzle query chain methods (`select().from().where().limit()` etc.).

### Category B: Handler/Service Files (5 files — contain business logic)
Test the service layer (not the handler pass-through). Mock all ports/repos/db.

### Category C: Router Files (3 files — pure route wiring)
Test that routes call the correct service methods with correct inputs. Mock `protectedProcedure` and `adminProcedure`.

### Category D: Booking Service (1 file — 1086 lines, most complex)
Full unit tests with all 6 ports mocked. This is the largest single file.

---

### Task 1: refund.repo.ts — 11.6% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/refund.repo.test.ts`

**Functions to test:**
- `findPaymentByReference(conn, providerReference)` — returns row or null
- `insertRefundRecord(conn, record)` — inserts and returns row
- `updatePaymentStatus(conn, paymentId, status)` — updates and returns row or null

- [ ] **Step 1:** Write all three function tests with mocked `conn` (Drizzle query chain patterns)
- [ ] **Step 2:** Run tests: `cd packages/api && bun test src/tests/unit/refund.repo.test.ts`
- [ ] **Step 3:** Commit

---

### Task 2: auth.repo.ts — 13.2% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/auth.repo.test.ts`

**Functions to test:**
- `getStudentProfile(conn, userId)` — returns row or null
- `getTutorProfile(conn, userId)` — returns row or null
- `upsertProfile(conn, userId, input)` — UPDATE query
- `createProfile(conn, userId, input)` — INSERT query

- [ ] **Step 1:** Write all four function tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 3: achievement.repo.ts — 16.7% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/achievement.repo.test.ts`

**Functions to test (8):**
- `listByUserId`, `insert`, `findByIdForUser`, `update`, `deleteRow`, `adminList`, `getById`, `updateStatus`

- [ ] **Step 1:** Write all eight function tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 4: refund.handler.ts + refund.service.ts — handler 25% → 100%

**Note:** `refund.service.ts` already has a test file. The handler is a pure pass-through. The CI reports 8.6% on refund.service.ts (the existing test may not be covering all paths).

**Files:**
- Create: `packages/api/src/tests/unit/refund.handler.test.ts`

**Handler functions to test:**
- `createCorrection(adminId, input)` — delegates to `refundService.createCorrection`
- `listCorrections(input)` — delegates to `refundService.listCorrections`

**Check existing refund.service.ts test coverage and add missing paths.**

- [ ] **Step 1:** Read existing `refund.service.test.ts` to check coverage gaps
- [ ] **Step 2:** Write handler delegation tests
- [ ] **Step 3:** Fill any service coverage gaps
- [ ] **Step 4:** Run tests
- [ ] **Step 5:** Commit

---

### Task 5: auth.handler.ts — 32% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/auth.handler.test.ts`

**Service functions to test (inside `createAuthService`):**
- `me(userId)` — Promise.all of profile + tutorProfile + wallet
- `getProfile(userId)` — throws notFound if null
- `updateProfile(userId, input)` — validate → upsert or create

**Handler functions to test (inside `createAuthHandler`):**
- `me`, `getProfile`, `updateProfile` — delegates to authService

- [ ] **Step 1:** Write service tests with mocked `authRepo`, `walletPort`, `db`
- [ ] **Step 2:** Write handler delegation tests
- [ ] **Step 3:** Run tests
- [ ] **Step 4:** Commit

---

### Task 6: achievement.handler.ts — 30.3% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/achievement.handler.test.ts`

**Service functions to test (inside `createAchievementService`):**
- `list(userId)` — delegates to repo
- `create(userId, input)` — delegates to repo
- `update(userId, input)` — validateUpdate → repo.update
- `remove(userId, id)` — validateDelete → repo.deleteRow
- `adminList(input)` — delegates to repo
- `adminReview(adminId, input)` — finds by ID, transaction: updateStatus + audit

- [ ] **Step 1:** Write service tests with mocked `achievementRepo`, `auditPort`, `db`
- [ ] **Step 2:** Write handler delegation tests
- [ ] **Step 3:** Run tests
- [ ] **Step 4:** Commit

---

### Task 7: admin-booking.repo.ts — 39.5% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/admin-booking.repo.test.ts`

**Functions to test (8):**
- `findBookingById`, `listBookingsByState`, `getStateHistory`, `updateBookingWithOverride`, `insertStateHistoryEntry`, `findParticipantsByBookingId`, `findPaymentById`, `updatePaymentStatus`

- [ ] **Step 1:** Write all eight function tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 8: wallet.repo.ts — 62.1% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/wallet.repo.test.ts`

**Functions to test (14):**
- `getById`, `getByUserId`, `getOrCreate`, `insert`, `updateBalances`
- `atomicHold`, `atomicRelease`, `atomicDeduct`, `atomicCredit`, `atomicCompensateCredit`, `atomicCompensateDeduct`
- `insertLedger`, `listLedger`, `listActivePackages`

Key paths:
- `atomicHold` throws `badRequest` on insufficient balance
- `atomicDeduct` throws `badRequest` on insufficient held balance
- `getOrCreate` race condition (insert fails → re-read)
- `listLedger` cursor-based pagination

- [ ] **Step 1:** Write all 14 function tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 9: booking.repo.ts — 70.5% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/booking.repo.test.ts`

**Functions to test (20+):** All repo methods. Key paths:
- `updateBookingVersioned` returns null on version mismatch
- `findOverlappingBookings` filters terminal states
- `findTutorProfile` only returns published tutors
- `findAvailabilitySlot` with `futureOnly` option
- `findBookingsExpiringByDeadline` filters by states and deadline

- [ ] **Step 1:** Write all function tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 10: admin.repo.ts — 73.9% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/admin.repo.test.ts`

**Functions to test (5):**
- `listUsers`, `countUsers`, `getById`, `countAdmins`, `updateRole`

- [ ] **Step 1:** Write all five function tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 11: admin.handler.ts — 75.9% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/admin.handler.test.ts`

**Service functions to test:**
- `listUsers(input)` — parallel fetch with default limit/offset
- `setRole(adminId, input)` — validates role change, checks last admin, transaction

- [ ] **Step 1:** Write service tests with mocked `adminRepo`, `auditPort`, `db`
- [ ] **Step 2:** Write handler delegation tests
- [ ] **Step 3:** Run tests
- [ ] **Step 4:** Commit

---

### Task 12: payment.router.ts — 64.7% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/payment.router.test.ts`

**Routes to test:**
- `createPurchase` — calls wallet.getOrCreate then payment.createIntent
- `getPurchase` — calls payment.getPurchase

Router tests mock the `protectedProcedure` and service context.

- [ ] **Step 1:** Write router tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 13: auth.router.ts — 75.5% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/auth.router.test.ts`

**Routes to test:**
- `me` — calls auth.me
- `getProfile` — calls auth.getProfile
- `updateProfile` — calls auth.updateProfile with validated input

- [ ] **Step 1:** Write router tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 14: achievement.router.ts — 77.8% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/achievement.router.test.ts`

**Routes to test (6):**
- `list`, `create`, `update`, `delete` (protected)
- `adminList`, `adminReview` (admin)

- [ ] **Step 1:** Write router tests
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 15: booking.service.ts — 69.0% → 100%

**Files:**
- Create: `packages/api/src/tests/unit/booking.service.test.ts`

**This is the largest file (1086 lines) with complex business logic.** All 6 ports need mocking:
- `BookingRepo`, `WalletPort`, `PricingPort`, `AuditPort`, `InAppNotificationPort`, `MeetingPort`

**Functions to test:**
- `getById`, `listMine`
- `createSolo`, `createGroup`, `createSeries`
- `cancel`, `tutorAccept`, `tutorDecline`
- `completeSession`, `proposeReschedule`
- `confirmInvite`, `declineInvite`, `reconfirm`, `withdraw`
- `expireBookings`, `listSessions`

- [ ] **Step 1:** Write comprehensive booking service tests (largest task)
- [ ] **Step 2:** Run tests
- [ ] **Step 3:** Commit

---

### Task 16: Final verification

- [ ] **Step 1:** Run `cd packages/api && bun test --coverage` and verify all files at 100%
- [ ] **Step 2:** Check CI passes
- [ ] **Step 3:** Push and verify CI coverage comment shows 100%