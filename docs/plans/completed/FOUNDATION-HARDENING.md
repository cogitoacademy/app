# Cogito Backend — Foundation Hardening Plan

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Status     | Complete                                       |
| Branch     | `improvement/foundation-hardening`             |
| Created    | 2026-07-24                                     |
| Depends on | improvement/consolidation merged to main (#16) |
| Next       | improvement/production-readiness               |
| Scope      | Backend-only                                   |

This branch fixes 46 issues found in a comprehensive second-pass audit (data integrity, security, resilience, performance, and auth hardening). It establishes the solid foundation that all subsequent plans (production-readiness, infrastructure, PRD-gaps) build on.

It runs BEFORE production-readiness — the bug fixes in production-readiness (B1-B5, N1-N15) depend on the patterns established here (safe terminal transitions, IDOR-safe handlers, hardened auth, transactional wallet operations).

---

## Table of Contents

1. [Findings Inventory](#1-findings-inventory)
2. [Story 1: Group Booking Hold Leaks](#story-1-group-booking-hold-leaks)
3. [Story 2: State Machine Completeness](#story-2-state-machine-completeness)
4. [Story 3: IDOR & Authorization](#story-3-idor--authorization)
5. [Story 4: Input Validation + Auth Hardening](#story-4-input-validation--auth-hardening)
6. [Story 5: Wallet & Transaction Integrity](#story-5-wallet--transaction-integrity)
7. [Story 6: Error Handling & Resilience](#story-6-error-handling--resilience)
8. [Story 7: Booking Idempotency](#story-7-booking-idempotency)
9. [Story 8: CSP + Performance Guard Rails](#story-8-csp--performance-guard-rails)
10. [Story 9: Frontend Hardening](#story-9-frontend-hardening)
11. [Relationship to Subsequent Plans](#relationship-to-subsequent-plans)
12. [Risk Register](#risk-register)
13. [Execution Checklist](#execution-checklist)

---

## 1. Findings Inventory

### CRITICAL — Money/State Integrity (A1-A7)

| ID  | Location                                        | Issue                                                                                                           |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A1  | `booking.service.ts:325-388` (cancel)           | Group booking cancel releases only proposer's hold. Invitee holds NOT released. Participant states NOT updated. |
| A2  | `booking.service.ts:458-505` (tutorDecline)     | Tutor decline releases only proposer's hold. Invitee holds NOT released.                                        |
| A3  | `booking.service.ts:1094-1136` (expireBookings) | Expiry releases only proposer's hold. Invitee holds NOT released.                                               |
| A4  | `booking.service.ts:884-966` (withdraw→cancel)  | When withdraw triggers group cancel, other confirmed participants' holds NOT released.                          |
| A5  | `booking.service.ts:780,884-966`                | `confirmedHeadcount` incremented on confirm but NOT decremented on withdraw.                                    |
| A6  | `booking.service.ts:325-505,1094-1136`          | `holdAmount` NOT zeroed on cancel/decline/expire. Stale value persists.                                         |
| A7  | `booking.service.ts:325-388`                    | Series booking cancel doesn't cascade to `bookingSession` rows.                                                 |

### CRITICAL — Stuck State Machine (B1-B2)

| ID  | Location                       | Issue                                                                         |
| --- | ------------------------------ | ----------------------------------------------------------------------------- |
| B1  | `booking-transitions.ts:60-62` | `RESCHEDULE_PROPOSED` not in expiry cron. No deadline. Booking stuck forever. |
| B2  | `booking.service.ts:1094-1100` | `AWAITING_ADMIN_ROOM_APPROVAL`, `SCHEDULED` not in expiry cron. No timeout.   |

### CRITICAL — Security / IDOR (C1-C6)

| ID  | Location                                        | Issue                                                                          |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| C1  | `booking.handler.ts:62-73`                      | `booking.get(bookingId)` — no ownership check. Any user views any booking.     |
| C2  | `booking.handler.ts:236-247`                    | `booking.listSessions(bookingId)` — same IDOR.                                 |
| C3  | `booking.router.ts:165-201`                     | Tutor actions use `protectedProcedure`, not a `tutorProcedure`. No role guard. |
| C4  | `admin-tutor.service.ts:152-183`                | `resendInvite()` doesn't invalidate old token. Intercepted links stay valid.   |
| C5  | `routes.ts` — `/openapi.json`, `/api-reference` | OpenAPI spec + Scalar UI exposed without auth. Leaks API structure.            |
| C6  | `packages/auth/src/index.ts:44-46`              | No password policy. Any password length accepted.                              |

### HIGH — Transaction & Wallet Integrity (D1-D4)

| ID  | Location                          | Issue                                                                          |
| --- | --------------------------------- | ------------------------------------------------------------------------------ |
| D1  | `wallet.service.ts:145-296`       | Wallet ops: atomic balance UPDATE then separate ledger INSERT. Not in same tx. |
| D2  | 8 service files                   | Read-then-write race conditions without optimistic locking.                    |
| D3  | `payment.service.ts:121-191`      | Webhook out-of-order: `PAID` before `PENDING` → user never credited.           |
| D4  | `booking.service.ts:249,658,1022` | Booking creation has no idempotency key. Retries create duplicate bookings.    |

### HIGH — Resilience (E1-E5)

| ID  | Location                           | Issue                                                                      |
| --- | ---------------------------------- | -------------------------------------------------------------------------- |
| E1  | `notification.service.ts:178-188`  | `write()` swallows ALL errors via `.catch()`. Notifications silently lost. |
| E2  | `google-meeting.provider.ts:37-51` | Google Meet call has no timeout. Request hangs forever.                    |
| E2  | `resend-email.provider.ts:11-24`   | Resend call has no timeout.                                                |
| E3  | `db/src/index.ts:16-18`            | No `statement_timeout`. Slow query holds connection indefinitely.          |
| E4  | `apps/server/src/index.ts:12-18`   | No `uncaughtException` handler. Sync errors crash silently.                |
| E5  | `webhooks/payments.ts:13-16,20-23` | Webhook timestamp validation disabled outside production.                  |

### MEDIUM — Input Validation (F1-F3)

| ID  | Location                     | Issue                                                                   |
| --- | ---------------------------- | ----------------------------------------------------------------------- |
| F1  | All `*.types.ts` (11+ files) | Unbounded string inputs (no `.max()`). DoS vector.                      |
| F2  | 6 Zod schemas                | Unbounded array inputs (no `.max()`).                                   |
| F3  | `booking.types.ts:8-9`       | Dates not validated to be in the future. Can book sessions in the past. |

### MEDIUM — Auth & Session (G1-G4)

| ID  | Location                           | Issue                                                                           |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- |
| G1  | `packages/auth/src/index.ts:38-42` | No session `expiresIn`. Sessions may last indefinitely.                         |
| G2  | `packages/auth/src/index.ts`       | No email verification flow. Users sign up with unverified emails.               |
| G3  | `packages/auth/src/index.ts:48-51` | Google OAuth credentials fall back to `""` if not set.                          |
| G4  | `packages/auth/src/index.ts:57`    | `sameSite: "none"` in production but no CSRF token. (Already documented as B5.) |

### MEDIUM — CSP Broken (H1)

| ID  | Location                | Issue                                                                                        |
| --- | ----------------------- | -------------------------------------------------------------------------------------------- |
| H1  | `security-headers.ts:6` | CSP only has `default-src 'self'`. No `connect-src`, `script-src`, etc. Production-breaking. |

### MEDIUM — Performance (I1-I3)

| ID  | Location                  | Issue                                                                     |
| --- | ------------------------- | ------------------------------------------------------------------------- |
| I1  | `booking.repo.ts:281-291` | `findBookingsExpiringByDeadline` has NO LIMIT. OOM risk.                  |
| I2  | `booking.repo.ts:256-279` | Missing composite index on `(tutorId, scheduledStartAt, scheduledEndAt)`. |
| I3  | `db/src/index.ts:28-30`   | Dev `onquery` logs all SQL + params to console. May log sensitive data.   |

### MEDIUM — Frontend (J1-J4)

| ID  | Location                                     | Issue                                                                                    |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| J1  | `apps/web/src/`                              | No React error boundary. Component crash = blank page.                                   |
| J2  | `apps/web/src/utils/orpc.ts`                 | No auth session expiry handling. 401 shows toast but user stuck.                         |
| J3  | 4 component files                            | Dead code: `header.tsx`, `not-found-page.tsx`, `default-page.tsx`, `booking-detail.tsx`. |
| J4  | `routes/_app.tsx:47`, `auth.callback.tsx:10` | `any` type casts for role access. Type safety gaps.                                      |

### LOW — Operational / Hygiene (K1-K7)

| ID  | Location                                      | Issue                                                               |
| --- | --------------------------------------------- | ------------------------------------------------------------------- |
| K1  | `routes.ts:231`, `webhooks/payments.ts:36-38` | No constant-time comparison for metrics token / webhook signatures. |
| K2  | `routes.ts:138-149`                           | No request body size limit on webhook endpoints.                    |
| K3  | `scheduler/jobs/*.ts`                         | No `attempts` configured. Failed jobs not retried.                  |
| K4  | `booking-state.types.ts:1-17`                 | `DRAFT` and `AWAITING_MARKS_HOLD` are unreachable dead states.      |
| K5  | `db/schema/booking.ts:74`                     | `repricedMarks` column is dead — never set or read.                 |
| K6  | `booking.types.ts:10`                         | `timezone` field stored but never used in calculations.             |
| K7  | `packages/api/src/lib/metrics.ts`             | No TTL eviction for stale path entries.                             |

---

## Story 1: Group Booking Hold Leaks

**Goal:** No user's marks should ever get stuck.
**Findings addressed:** A1, A2, A3, A4, A5, A6, A7
**Estimated:** 2 days
**Files:** `packages/api/src/modules/booking/booking.service.ts`, `booking.repo.ts`

### Root Cause

All group booking terminal transitions (`cancel`, `tutorDecline`, `expireBookings`, `withdraw→cancel`) release only the proposer's hold. Invitee holds (set in `confirmInvite:763-771`) are never released. `confirmedHeadcount` is never decremented. `holdAmount` is never zeroed. Series cancellation doesn't cascade to sessions.

### Implementation

#### 1.1 Extract shared `releaseAllParticipantHolds` helper

```ts
// booking.service.ts — new private helper
async function releaseAllParticipantHolds(
  tx: TxClient,
  bookingId: string,
  reason: string,
  actorType: string,
): Promise<void> {
  const participants = await repo.findConfirmedParticipants(tx, bookingId);
  for (const p of participants) {
    if (p.heldAmount > 0) {
      const w = await wallet.getByUserIdTx(tx, p.userId);
      if (w) {
        await wallet.release(tx, {
          walletId: w.id,
          amount: p.heldAmount,
          eventKey: `booking.${bookingId}.release.${p.userId}`,
          sourceReference: bookingId,
          bookingId,
          actorType,
          reason,
        });
      }
    }
    await repo.updateParticipantState(tx, p.id, {
      confirmationState: CONFIRMATION_STATE.WITHDRAWN_PRE_H2,
      withdrawnAt: new Date(),
      withdrawnReason: reason,
    });
  }
}
```

#### 1.2 Call in all terminal transitions

- `cancel()` (line 325): Call `releaseAllParticipantHolds(tx, bookingId, "Booking cancelled", ACTOR_TYPE.STUDENT)` after releasing proposer hold
- `tutorDecline()` (line 458): Same, with `ACTOR_TYPE.TUTOR`
- `expireBookings()` (line 1094): Same, with `ACTOR_TYPE.SYSTEM`
- `withdraw()` (line 884): When group cancel triggered (line 933-937), call `releaseAllParticipantHolds` before transition

#### 1.3 Zero `holdAmount` on terminal transitions

- Add `repo.updateBookingHoldAmount(tx, bookingId, 0)` in `cancel()`, `tutorDecline()`, `expireBookings()`

#### 1.4 Decrement `confirmedHeadcount` on withdraw

- In `withdraw()`, after updating participant state, add: `await repo.decrementBookingConfirmedHeadcount(tx, bookingId)`
- Add `decrementBookingConfirmedHeadcount` to `booking.repo.ts`:
  ```ts
  async function decrementBookingConfirmedHeadcount(conn, bookingId) {
    await conn
      .update(booking)
      .set({
        confirmedHeadcount: sql`GREATEST(${booking.confirmedHeadcount} - 1, 0)`,
      })
      .where(eq(booking.id, bookingId));
  }
  ```

#### 1.5 Cascade series cancellation

- In `cancel()`, when `b.type === BOOKING_TYPE.SERIES`, call `repo.cancelAllSessions(tx, bookingId)` before transition
- Add `cancelAllSessions` to `booking.repo.ts`:
  ```ts
  async function cancelAllSessions(conn, bookingId) {
    await conn
      .update(bookingSession)
      .set({ currentState: "cancelled" })
      .where(eq(bookingSession.seriesBookingId, bookingId));
  }
  ```

#### 1.6 Add `getByUserIdTx` to wallet port

- Wallet operations in `releaseAllParticipantHolds` need the wallet within a transaction. Add `getByUserIdTx(tx, userId)` to `wallet.service.ts` and the `BookingWalletPort` interface.

### Acceptance Tests

- **Integration test:** Group booking with 3 participants (proposer + 2 invitees confirmed). Cancel → assert all 3 holds released, all participant states updated, `holdAmount` = 0, `confirmedHeadcount` = 0.
- **Integration test:** Group booking, tutor declines → assert all participant holds released.
- **Integration test:** Group booking expires → assert all participant holds released.
- **Integration test:** Group booking, one participant withdraws → `confirmedHeadcount` decremented; if below minimum, all remaining holds released.
- **Integration test:** Series booking cancelled → all `bookingSession` rows have `currentState = "cancelled"`.
- **Unit test:** `releaseAllParticipantHolds` with zero participants → no error, no-op.
- **Wallet ledger test:** After terminal transition, `SUM(ledger entries)` matches total released amount.

---

## Story 2: State Machine Completeness

**Goal:** No booking should ever get stuck.
**Findings addressed:** B1, B2, K4, K5, K6
**Estimated:** 1 day
**Files:** `booking.service.ts`, `booking.repo.ts`, `booking-transitions.ts`, `booking-state.types.ts`, `db/schema/booking.ts`

### Implementation

#### 2.1 Add RESCHEDULE_PROPOSED to expiry

- Add `BOOKING_STATE.RESCHEDULE_PROPOSED` to the states array in `expireBookings()` (line 1096)
- Set `deadlineAt` for reschedule proposals in `proposeReschedule()` — e.g., 24 hours after proposal creation
- Add transition: `RESCHEDULE_PROPOSED → EXPIRED` to `booking-transitions.ts`

#### 2.2 Add SCHEDULED timeout

- Add `BOOKING_STATE.SCHEDULED` to expiry states, with a deadline of `scheduledEndAt + 24h`
- On expiry, transition to `NO_SHOW` (or `COMPLETED` if the session was marked as attended but not closed)
- Add transition: `SCHEDULED → NO_SHOW` to `booking-transitions.ts`

#### 2.3 Add AWAITING_ADMIN_ROOM_APPROVAL timeout

- Add to expiry states with deadline = `scheduledStartAt` (if no room approved by start time, expire)
- Add transition: `AWAITING_ADMIN_ROOM_APPROVAL → CANCELLED` to `booking-transitions.ts`

#### 2.4 Remove dead states and fields

- Remove `DRAFT` and `AWAITING_MARKS_HOLD` from `booking-state.types.ts` and `booking-transitions.ts` (or document as future use with a TODO comment)
- Remove `repricedMarks` column from `db/schema/booking.ts` (migration 0005)
- Document `timezone` field as unused or add a TODO to use it in deadline calculations

### Acceptance Tests

- **Property test:** For every non-terminal state, there exists a path to a terminal state.
- **Integration test:** Reschedule proposed → 24h passes → booking expires.
- **Integration test:** Scheduled session → 24h after scheduled end → auto NO_SHOW.
- **Integration test:** Awaiting admin room approval → scheduled start passes → booking cancelled.
- **Migration test:** Migration 0005 applies cleanly, `repricedMarks` column removed.

---

## Story 3: IDOR & Authorization

**Goal:** Users can only access their own data.
**Findings addressed:** C1, C2, C3, C4, C5
**Estimated:** 1 day
**Files:** `booking.handler.ts`, `booking.service.ts`, `procedures.ts`, `admin-tutor.service.ts`, `routes.ts`

### Implementation

#### 3.1 Fix booking.get() IDOR

- `booking.handler.ts:62-73`: Change `_context` to `context` and pass `context.session!.user.id` to service
- `booking.service.ts:180-184`: Add `userId` parameter, call new `assertBookingAccess(tx, bookingId, userId)` that checks proposer OR participant OR assigned tutor

```ts
async function assertBookingAccess(tx, bookingId, userId) {
  const b = await repo.findBookingById(tx, bookingId);
  if (!b) throw new BookingNotFoundError(bookingId);
  if (b.proposerId === userId) return b;
  if (b.tutorId === userId) return b;
  const participant = await repo.findParticipant(tx, bookingId, userId);
  if (!participant) throw new BookingNotOwnedError(bookingId, userId);
  return b;
}
```

#### 3.2 Fix booking.listSessions() IDOR

- Same pattern: pass `userId` from handler, call `assertBookingAccess` in `listSessions()`

#### 3.3 Add tutorProcedure middleware

- `procedures.ts`: Add `tutorProcedure` that checks `user.role === USER_ROLE.TUTOR`
  ```ts
  export const tutorProcedure = protectedProcedure.use(
    async ({ context, next }) => {
      const user = context.session?.user as CogitoUser;
      if (user?.role !== USER_ROLE.TUTOR) {
        throw new ORPCError("FORBIDDEN", "Tutor access required");
      }
      return next({ context });
    },
  );
  ```
- `booking.router.ts:165-201`: Change `protectedProcedure` to `tutorProcedure` for `acceptBooking`, `declineBooking`, `completeSession`

#### 3.4 Invalidate old invite token on resend

- `admin-tutor.service.ts:152-183`: In `resendInvite()`, within the transaction, set old invite `status = INVITE_STATUS.REVOKED` before creating new token. Or: update the existing invite's `token` field (replacing the old one) rather than creating a new invite row.

#### 3.5 Protect OpenAPI endpoints

- `routes.ts`: Add a simple auth check to `/openapi.json` and `/api-reference` — require either admin session or `METRICS_TOKEN` bearer. Or: disable these endpoints in production (`NODE_ENV === "production"`).

### Acceptance Tests

- **IDOR test:** User A creates booking. User B calls `booking.get(bookingA.id)` → `BookingNotOwnedError`.
- **IDOR test:** User A creates series. User B calls `booking.listSessions(seriesA.id)` → `BookingNotOwnedError`.
- **Role test:** Student calls `tutor/booking/accept` → `FORBIDDEN`.
- **Role test:** Tutor calls `tutor/booking/accept` for a booking they're not assigned to → `BookingNotOwnedError`.
- **Token test:** `resendInvite()` called twice → first token is `revoked`, only second token is `invited`.
- **OpenAPI test:** In production mode, `/openapi.json` returns 404 (or 401).

---

## Story 4: Input Validation + Auth Hardening

**Goal:** Inputs can't be weaponized. Auth is properly configured.
**Findings addressed:** F1, F2, F3, C6, G1, G2, G3, G4
**Estimated:** 1.5 days
**Files:** All `*.types.ts`, `packages/auth/src/index.ts`, `packages/env/src/server.ts`

### Implementation

#### 4.1 Bound all string inputs

Add `.max()` to every string field in all Zod schemas. Suggested limits:

| Field type                                  | Max length         | Files                                                                                                     |
| ------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| ID fields (userId, bookingId, etc.)         | 100                | All `*.types.ts`                                                                                          |
| Short text (name, displayName, category)    | 255                | `tutor.types.ts`, `achievement.types.ts`, `admin-tutor.types.ts`                                          |
| Long text (bio, reason, description, notes) | 2000               | `tutor.types.ts`, `achievement.types.ts`, `booking.types.ts`, `refund.types.ts`, `admin-booking.types.ts` |
| URL (imageUrl, proofUrls)                   | 2048               | `tutor.types.ts`, `achievement.types.ts`                                                                  |
| Email                                       | 320 (RFC 5321 max) | `admin-tutor.types.ts`                                                                                    |
| Token                                       | 256                | `invite.types.ts`                                                                                         |
| Search query                                | 200                | `discovery.types.ts`                                                                                      |
| Timezone                                    | 50                 | `booking.types.ts`                                                                                        |

#### 4.2 Bound all array inputs

| Field                  | Max                            | File                     |
| ---------------------- | ------------------------------ | ------------------------ |
| `inviteeUserIds`       | 5 (group max 6 minus proposer) | `booking.types.ts`       |
| `expertise`            | 20                             | `tutor.types.ts`         |
| `proofUrls`            | 10                             | `tutor.types.ts`         |
| `subjects`             | 20                             | `achievement.types.ts`   |
| `affectedParticipants` | 6                              | `admin-booking.types.ts` |
| `sessions`             | 4 (already has `.min(2)`)      | `booking.types.ts`       |
| `states`               | 15 (total state count)         | `booking.types.ts`       |

#### 4.3 Validate dates are in the future

- `booking.types.ts`: Add `.refine((d) => d > new Date(), "Must be in the future")` to `scheduledStartAt`, `scheduledEndAt`, `proposedStartAt`, `proposedEndAt`
- `availability.types.ts`: Same for `startDate`, `endDate`

#### 4.4 Add password policy

- `packages/auth/src/index.ts`:
  ```ts
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  ```
- **Note:** Better Auth 1.6.11 only supports `minPasswordLength` — character-class requirements (`requireUppercase`/`requireLowercase`/`requireDigits`) are not available in this version. The implemented policy enforces minimum length only. Carry-forward to production-readiness: either upgrade Better Auth (if a newer version adds character-class options) or add a custom Zod pre-validation hook on the signup input to enforce upper/lower/digit before the auth handler runs.

#### 4.5 Add session expiry

- `packages/auth/src/index.ts`:
  ```ts
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
    cookieCache: {
      enabled: true,
      maxAge: env.SESSION_COOKIE_CACHE_MAX_AGE,
    },
  },
  ```

#### 4.6 Add email verification — DEFERRED

> **Status: DEFERRED** to the `improvement/production-readiness` (or `feature/prd-gaps`) branch. Not implemented on `improvement/foundation-hardening`.
>
> **Rationale:** Email verification (finding G2) requires (a) a working Resend integration with a verification template, (b) a DB migration grandfathering existing users to `emailVerified = true`, (c) a new frontend `/verify-email` route + signup→login redirect changes. These are additive features that depend on infrastructure and email-wiring work that lives outside this hardening branch. Implementing them here risks blocking the merge of the 8 other stories on an unrelated feature.
>
> **Carry-forward tasks (for production-readiness / PRD-gaps branch):**
>
> - `packages/auth/src/index.ts`: set `requireEmailVerification: true` + `sendVerificationEmail` handler (delegate to EmailService; log URL in dev).
> - Frontend: add "verify your email" screen, `/verify-email` route calling `authClient.verifyEmail()`, post-signup redirect to "check your email" page, post-verification redirect to login.
> - Migration: set existing users `emailVerified = true` (grandfather clause — risk R2).
> - Wire the `sendVerificationEmail` callback to the EmailService port (depends on Story 6's email provider timeout wiring, which _is_ in this branch).
>
> **On this branch:** Story 4 still implements 4.4 (password policy), 4.5 (session expiry), 4.7 (conditional OAuth). Only email verification is deferred. The auth config added here must NOT set `requireEmailVerification: true` — it stays at its default (false) so existing signup/login flows keep working.

#### 4.7 Conditional Google OAuth

- `packages/auth/src/index.ts`: Only include `google` provider if both env vars are set:
  ```ts
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
  },
  ```

### Acceptance Tests

- **Boundary test:** String input exceeding `.max()` → Zod validation error with "String must contain at most N character(s)".
- **Boundary test:** Array input exceeding `.max()` → Zod validation error.
- **Date test:** `scheduledStartAt` in the past → Zod validation error.
- **Password test:** 7-char password → rejected. 8-char password → accepted. (Character-class checks deferred — see §4.4 note.)
- **Session test:** Session created → after 7 days → session expired, user must re-login.
- **Email test:** Signup → email verification URL logged in dev. Login before verification → rejected.
- **OAuth test:** With no `GOOGLE_CLIENT_ID` env var → Google OAuth not available (no empty config).

---

## Story 5: Wallet & Transaction Integrity

**Goal:** Money operations are atomic and race-safe.
**Findings addressed:** D1, D2, D3
**Estimated:** 2 days
**Files:** `wallet.service.ts`, `wallet.repo.ts`, 8 service files with race conditions, `payment.service.ts`

### Implementation

#### 5.1 Wrap wallet ops in transaction with ledger

- `wallet.service.ts`: Refactor `hold()`, `release()`, `deduct()`, `credit()`, `compensate()` to wrap both the atomic balance UPDATE and the ledger INSERT in a single `db.transaction()`:
  ```ts
  async function hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot> {
    return db.transaction(async (tx) => {
      const result = await repo.atomicHold(tx, params);
      if (!result) throw new InsufficientMarksError(params.amount, 0);
      await repo.insertLedgerEntry(tx, { ...params, walletId: result.id, ... });
      return toSnapshot(result);
    });
  }
  ```
- This ensures the ledger INSERT is in the same transaction as the balance UPDATE. If either fails, both roll back.

#### 5.2 Add optimistic locking to read-then-write locations

Add `version` columns (or use existing ones) to the 8 tables with read-then-write patterns:

| Service                       | Table                  | Approach                                                          |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------- |
| auth (profile upsert)         | `student_profile`      | Use `ON CONFLICT DO UPDATE` (already atomic)                      |
| achievement (update/delete)   | `achievement`          | Add `version` column + `WHERE version = expected` in UPDATE       |
| room (assignment)             | `room_booking`         | Add exclusion constraint for overlapping time ranges              |
| tutor (profile update)        | `tutor_profile`        | Add `version` column                                              |
| tutor (availability upsert)   | `availability_slot`    | Use `ON CONFLICT DO UPDATE` on (tutorId, startDate)               |
| admin (role change)           | `user`                 | Use `WHERE role = expected` in UPDATE (optimistic)                |
| admin-tutor (invite creation) | `tutor_invite`         | Add unique constraint on (email, status) WHERE status = 'invited' |
| refund (correction)           | Already in transaction | Ensure `beforeState` is read within the tx                        |

> **Note:** Adding `version` columns requires migrations (0007, 0008, etc. — 0006 is assigned to Story 8's composite index). Keep migrations additive — `version` defaults to 1.

#### 5.3 Payment webhook state transition guard

- `payment.service.ts:121-191`: Add explicit state transition validation:
  ```ts
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    PENDING: ["PAID", "FAILED", "EXPIRED"],
    PAID: ["SETTLED", "REFUNDED"],
    SETTLED: ["REFUNDED"],
    FAILED: [],
    EXPIRED: [],
    REFUNDED: [],
  };
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    // Out-of-order or invalid — log and return (idempotent no-op)
    return;
  }
  ```
- Make `shouldCredit` only true for `PENDING → PAID` transition. If `PAID → PAID` (re-delivery), skip credit but return success (idempotent).

### Acceptance Tests

- **Atomicity test:** Wallet hold → ledger INSERT fails (mock) → balance NOT changed (rollback).
- **Concurrency test:** 100 parallel `hold()` calls on same wallet → no negative balance, no ledger drift.
- **Optimistic locking test:** Two concurrent achievement updates → one succeeds, one gets version conflict error.
- **Webhook order test:** `PAID` webhook before `PENDING` → no credit, no error (idempotent no-op). `PENDING` then `PAID` → credit applied once.

---

## Story 6: Error Handling & Resilience

**Goal:** Failures are visible and bounded.
**Findings addressed:** E1, E2, E3, E4, E5, K1, K2
**Estimated:** 1.5 days
**Files:** `notification.service.ts`, `google-meeting.provider.ts`, `resend-email.provider.ts`, `db/index.ts`, `server/index.ts`, `webhooks/payments.ts`, `routes.ts`

### Implementation

#### 6.1 Fix notification error swallowing

- `notification.service.ts:178-188`: Split into two variants:
  - `writeBestEffort()`: Fire-and-forget (current behavior). Used for non-critical notifications (info, action).
  - `write()`: Must-succeed. Does NOT swallow errors. Used for critical notifications (booking state changes that the caller should know about).
  - Update callers: booking service uses `writeBestEffort` for info notifications, `write` for action/critical.

#### 6.2 Add timeouts to external calls

- `google-meeting.provider.ts`: Wrap `calendar.events.insert()` with `fetchWithTimeout` or a Promise.race timeout (30s)
- `resend-email.provider.ts`: Use `fetchWithTimeout(url, init, 30_000)` instead of raw `fetch`

#### 6.3 Add statement_timeout to DB pool

- `db/src/index.ts`:
  ```ts
  const client = postgres(url, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(env.NODE_ENV === "production" && {
      ssl: { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED },
    }),
  });
  // After connection, set statement_timeout
  client`SET statement_timeout = 30000`.execute();
  ```
  Or use `postgres` `connection: { statement_timeout: 30000 }` option if supported.

#### 6.4 Add uncaughtException handler

- `apps/server/src/index.ts`:
  ```ts
  process.on("uncaughtException", (error) => {
    log({
      level: "error",
      action: "uncaught_exception",
      error: { message: String(error), stack: error.stack },
    });
    // Give the process 1 second to flush logs, then exit
    // (continuing after uncaughtException is unsafe per Node.js docs)
    setTimeout(() => process.exit(1), 1000);
  });
  ```

#### 6.5 Enable webhook timestamp validation in all environments

- `webhooks/payments.ts:13-16,20-23`: Remove the `NODE_ENV !== "production"` guard. Always validate timestamp. In dev with stub provider, the stub checkout endpoint doesn't go through `validateWebhookTimestamp` (it's a separate route), so this won't break dev.

#### 6.6 Constant-time comparison

- `webhooks/payments.ts:36-38`: Replace `signature === expected` with `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))` (after length check)
- `routes.ts:231`: Same for `METRICS_TOKEN` comparison

#### 6.7 Add body size limit to webhooks

- `routes.ts:138-149`: Remove the webhook exclusion from body size check. Add a separate, larger limit for webhooks (e.g., 256KB) instead of skipping entirely.

### Acceptance Tests

- **Notification test:** `write()` throws on DB failure → caller catches error. `writeBestEffort()` swallows error → caller succeeds.
- **Timeout test:** Google Meet API hangs → request fails after 30s (not infinite).
- **Timeout test:** DB query takes > 30s → query cancelled with `statement_timeout`.
- **Crash test:** Sync error thrown → `uncaught_exception` logged, process exits with code 1.
- **Webhook test:** Webhook with timestamp > 5min old → rejected in all environments (not just prod).
- **Timing test:** Webhook signature comparison → no measurable timing difference between matching and non-matching signatures.

---

## Story 7: Booking Idempotency

**Goal:** Retries don't create duplicates.
**Findings addressed:** D4
**Estimated:** 1 day
**Files:** `booking.handler.ts`, `booking.router.ts`, `lib/idempotency.ts`, `booking.service.ts`

### Implementation

#### 7.1 Accept Idempotency-Key header

- `booking.handler.ts`: Extract `Idempotency-Key` header from request context (oRPC supports custom headers)
- Pass to `createSolo()`, `createGroup()`, `createSeries()`

#### 7.2 Wire bookingIdempotency store

- `booking.service.ts`: At the start of each create method, check `bookingIdempotency.isProcessed(key)`:
  ```ts
  const idempotencyKey = `booking:${userId}:${input.tutorId}:${input.scheduledStartAt.toISOString()}:${headerKey ?? ""}`;
  if (bookingIdempotency.isProcessed(idempotencyKey)) {
    return bookingIdempotency.getResult(idempotencyKey);
  }
  // ... create booking ...
  bookingIdempotency.markProcessed(idempotencyKey, result);
  return result;
  ```
- If no `Idempotency-Key` header is provided, use a composite key from the input fields (userId + tutorId + scheduledStartAt). This provides natural deduplication for identical requests within the TTL window.

#### 7.3 Return same result on retry

- Store the full booking result in the idempotency store
- On retry with same key, return the stored result (not a new booking)

### Acceptance Tests

- **Idempotency test:** Two identical `createSolo` requests with same `Idempotency-Key` → same booking returned, not two bookings.
- **Idempotency test:** Two identical `createSolo` requests without header → natural key deduplication, same booking returned.
- **Idempotency test:** Two different `createSolo` requests (different tutor) → two bookings created.

> **Note:** This in-memory idempotency is lost on restart. The production-readiness plan's Phase 2 (Redis) will make it durable. This is acceptable for single-instance deployment.

---

## Story 8: CSP + Performance Guard Rails

**Goal:** The system degrades gracefully under load. Browser security is production-ready.
**Findings addressed:** H1, I1, I2, I3, K3
**Estimated:** 1 day
**Files:** `security-headers.ts`, `booking.repo.ts`, `db/index.ts`, `scheduler/jobs/*.ts`

### Implementation

#### 8.1 Production-strict CSP

- `security-headers.ts`:
  ```ts
  const SECURITY_HEADERS: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      `connect-src 'self' ${env.CORS_ORIGIN}`, // Allow API calls to server origin
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // TailwindCSS v4 injects some inline styles
      "img-src 'self' data: https:", // Allow data URIs and HTTPS images
      "font-src 'self' https://fonts.gstatic.com", // If using Google Fonts
      "frame-ancestors 'none'",
    ].join("; "),
  };
  ```
- **Note:** `connect-src` must include the API origin (which is `CORS_ORIGIN`, a different origin from the frontend in production). Without this, the browser blocks all API calls.
- Import `env` from `@cogito-app/env/server` to access `CORS_ORIGIN` dynamically.

#### 8.2 Add LIMIT to expiry query

- `booking.repo.ts:281-291`: Add `.limit(500)` to `findBookingsExpiringByDeadline`:
  ```ts
  .limit(500)  // Process in batches of 500
  ```
- If more than 500 bookings expire, the scheduler will process them in the next run (5 min later). This prevents OOM.

#### 8.3 Add composite index for overlap check

- Migration 0006:
  ```sql
  CREATE INDEX booking_tutorId_scheduledStartAt_scheduledEndAt_idx
    ON booking (tutor_id, scheduled_start_at, scheduled_end_at);
  ```

#### 8.4 Guard dev DB logging

- `db/src/index.ts:28-30`: Add a redaction filter for sensitive params:
  ```ts
  onquery: (query) => {
    const redactedParams = query.params.map(p =>
      typeof p === "string" && (p.includes("@") || p.length > 100)
        ? "[REDACTED]"
        : p
    );
    console.log(`[DB] ${query.sql} | ${JSON.stringify(redactedParams)}`);
  },
  ```

#### 8.5 Add retry attempts to scheduler jobs

- `scheduler/jobs/expire-bookings.job.ts`: Add `attempts: 3` to job options
- `scheduler/jobs/release-holds.job.ts`: Same
- `scheduler/jobs/send-notification-email.job.ts`: Same

### Acceptance Tests

- **CSP test:** In production mode, frontend loads without CSP violations in browser console. API calls succeed. Styles render.
- **Performance test:** 1000 bookings expiring simultaneously → processed in batches of 500, no OOM.
- **Index test:** `EXPLAIN ANALYZE` on overlap query uses the new composite index (index scan, not seq scan).
- **Dev logging test:** Query with email param → `[REDACTED]` in dev console, not the actual email.

---

## Story 9: Frontend Hardening

**Goal:** The UI doesn't break silently.
**Findings addressed:** J1, J2, J3, J4, K7
**Estimated:** 1 day
**Files:** `apps/web/src/main.tsx`, `apps/web/src/utils/orpc.ts`, dead component files, `routes/_app.tsx`, `metrics.ts`

### Implementation

#### 9.1 Add React error boundary

- Create `apps/web/src/components/error-boundary.tsx`:

  ```tsx
  import { Component, type ReactNode } from "react";

  export class ErrorBoundary extends Component<
    { children: ReactNode; fallback?: ReactNode },
    { hasError: boolean }
  > {
    state = { hasError: false };
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    render() {
      if (this.state.hasError)
        return this.props.fallback ?? <div>Something went wrong.</div>;
      return this.props.children;
    }
  }
  ```

- `main.tsx`: Wrap router in `<ErrorBoundary>` with a user-friendly fallback.

#### 9.2 Add auth session expiry handler

- `apps/web/src/utils/orpc.ts`: Add a response interceptor or `onError` check:
  ```ts
  queryCache: new QueryCache({
    onError: (error) => {
      if (error.code === "UNAUTHORIZED") {
        window.location.href = "/login?redirect=" + encodeURIComponent(window.location.pathname);
        return;
      }
      toast.error(`Error: ${error.message}`, { ... });
    },
  }),
  ```
- Alternatively, add a global `onError` in the orpc link that checks for 401 status.

#### 9.3 Remove dead code

- Delete `apps/web/src/components/header.tsx` (not imported anywhere)
- Delete `apps/web/src/components/not-found-page.tsx` (not registered)
- Delete `apps/web/src/components/dashboard/pages/default-page.tsx` (not used)
- Delete `apps/web/src/components/booking/booking-detail.tsx` (no route renders it)
- **Or:** Wire them up if they have value (e.g., register `not-found-page.tsx` as `notFoundComponent` on the router)

#### 9.4 Fix type casts

- `routes/_app.tsx:47`: Replace `(session.data?.user as any)?.role` with proper type: `session.data?.user?.role` (Better Auth should provide the role type via `CogitoUser`)
- `routes/auth.callback.tsx:10`: Replace `session.data?.user as { role?: string }` with `session.data?.user` (CogitoUser has `role: string`)
- `routes/_app.admin-tutors.tsx:185`: Replace `(profile: any)` with proper type from API output schema
- `components/booking/booking-detail.tsx:88`: If keeping, type `booking` properly; if deleting, no change needed

#### 9.5 Add TTL eviction to metrics

- `lib/metrics.ts`: Add TTL-based eviction — if a path hasn't been hit in 10 minutes, remove it from `requestCounts` (not just `requestDurations`):
  ```ts
  private lastAccess = new Map<string, number>();
  // Update on every request, evict in maybeCleanup if now - lastAccess > TTL
  ```

### Acceptance Tests

- **Error boundary test:** Component throws → error boundary renders fallback (not blank page).
- **Auth expiry test:** Session expires → next API call → redirect to `/login?redirect=/dashboard`.
- **Type test:** `bun run check-types` passes with no `any` casts in route files.
- **Dead code test:** `rg "header|not-found-page|default-page|booking-detail" apps/web/src/` returns 0 results (or they're wired up).

---

## Relationship to Subsequent Plans

This plan establishes patterns that all subsequent plans build on. The codebase after this plan looks like:

### Established Patterns (new baseline)

| Pattern                                  | Where established | Used by subsequent plans                                               |
| ---------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `releaseAllParticipantHolds()`           | Story 1           | PRD-gaps: group series bookings (G15-G18)                              |
| `assertBookingAccess()`                  | Story 3           | PRD-gaps: all new booking endpoints                                    |
| `tutorProcedure` middleware              | Story 3           | PRD-gaps: tutor reschedule endpoints (G6)                              |
| Bounded Zod schemas                      | Story 4           | PRD-gaps: all new endpoints inherit bounds                             |
| Transactional wallet ops                 | Story 5           | Production-readiness: Redis wallet caching                             |
| Optimistic locking                       | Story 5           | Production-readiness: all future mutations                             |
| Payment state machine                    | Story 5           | PRD-gaps: refund endpoints (G16)                                       |
| `writeBestEffort()` / `write()`          | Story 6           | PRD-gaps: notification matrix (G17)                                    |
| `fetchWithTimeout` on all external calls | Story 6           | Production-readiness: circuit breaker wiring                           |
| `Idempotency-Key` header support         | Story 7           | Production-readiness: Redis-backed idempotency (Phase 2.3)             |
| Production-strict CSP                    | Story 8           | Infrastructure: Caddy doesn't need security headers (CSP at app level) |
| Batched expiry (LIMIT 500)               | Story 8           | Production-readiness: scheduler optimization                           |
| Error boundary + auth redirect           | Story 9           | PRD-gaps: all new frontend routes                                      |

### How Production-Readiness Plan Adapts

The existing ../active/PRODUCTION-READINESS-PLAN.md phases are updated to reference this plan:

- **Phase 1 (bug fixes):** B2 (meeting orphan) is now enhanced by Story 6's compensation pattern. N8 (withdraw holds) is fully fixed by Story 1's `releaseAllParticipantHolds`. N15 (holdAmount) is fixed by Story 1's zeroing. These tasks can be marked as superseded where applicable.
- **Phase 2 (Redis):** Story 7's in-memory idempotency is replaced by Redis-backed. No conflict — the interface stays the same.
- **Phase 4 (test coverage):** The 90%/80% target is now achievable because Stories 1-9 add comprehensive tests for each fix.
- **Phase 5 (security):** CSP is already done (Story 8). CSRF (B5) is partially addressed by Story 4's `sameSite` + session changes. The production-readiness plan adds the actual CSRF token if cross-site is still needed.

### How Infrastructure Plan Adapts

The infrastructure plan (rewritten for Coolify) builds on the hardened codebase:

- Dockerfiles build the post-foundation image (with all fixes applied)
- CI pipeline runs foundation-hardened tests (coverage threshold raised to 90%/80%)
- Coolify env vars match the hardened `packages/env` schema (including new auth config)
- Health check endpoint is already enhanced (Story 6 adds Redis check, production-readiness adds Redis)

### How PRD-Gaps Spec Adapts

The PRD-gaps branch (future) builds all 18 gap features on the established patterns:

- G6 (tutor reschedule): Uses `tutorProcedure` (Story 3), `assertBookingAccess` (Story 3), state machine expiry (Story 2)
- G11 (meeting link gating): Uses `fetchWithTimeout` (Story 6), transactional meeting creation (Story 6)
- G13-G14 (room booking): Uses bounded inputs (Story 4), optimistic locking (Story 5)
- G17 (notification matrix): Uses `writeBestEffort`/`write` split (Story 6), email provider timeout (Story 6)
- G18 (series session completion): Uses `releaseAllParticipantHolds` (Story 1), cascade cancellation (Story 1)

---

## Risk Register

| #   | Risk                                                        | Likelihood | Impact | Mitigation                                                                                                                          |
| --- | ----------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `releaseAllParticipantHolds` changes group booking behavior | Medium     | High   | Comprehensive integration tests for every terminal transition with group bookings.                                                  |
| R2  | Email verification breaks existing user login flow          | Medium     | High   | Add a migration to set all existing users' `emailVerified = true` (grandfather clause).                                             |
| R3  | Password policy rejects existing weak passwords             | Low        | Medium | Policy only applies to new signups. Existing users keep their passwords.                                                            |
| R4  | CSP blocks a legitimate third-party resource                | Medium     | Low    | Start with report-only CSP, monitor violations, then enforce. Or: use the specified policy and test.                                |
| R5  | Optimistic locking adds version column migration overhead   | Low        | Low    | Migrations are additive (version defaults to 1). No data loss.                                                                      |
| R6  | Notification `write()` throws break booking flows           | Medium     | High   | Use `writeBestEffort` for all non-critical notifications. Only use `write()` where the caller already has error handling.           |
| R7  | Session expiry (7 days) interrupts active users             | Low        | Medium | 7 days is generous. Cookie cache re-authenticates transparently within the session window.                                          |
| R8  | Idempotency natural key has false-positive dedup            | Low        | Medium | Include `Idempotency-Key` header in the composite key. Without header, fall back to input fields which should be unique per intent. |

---

## Execution Checklist

### Story 1: Group Booking Hold Leaks

- [x] 1.1 Extract `releaseAllParticipantHolds` helper
- [x] 1.2 Call in `cancel()`, `tutorDecline()`, `expireBookings()`, `withdraw→cancel`
- [x] 1.3 Zero `holdAmount` on all terminal transitions
- [x] 1.4 Add `decrementBookingConfirmedHeadcount` to repo, call in `withdraw()`
- [x] 1.5 Add `cancelAllSessions` to repo, call in `cancel()` for series bookings
- [x] 1.6 Add `getByUserIdTx` to wallet port
- [x] 1.7 Integration tests for all terminal transitions with group bookings
- [x] 1.8 Wallet ledger reconciliation test

### Story 2: State Machine Completeness

- [x] 2.1 Add RESCHEDULE_PROPOSED to expiry with 24h deadline
- [x] 2.2 Add SCHEDULED timeout (auto NO_SHOW 24h after end)
- [x] 2.3 Add AWAITING_ADMIN_ROOM_APPROVAL timeout
- [x] 2.4 Remove dead states (DRAFT, AWAITING_MARKS_HOLD)
- [x] 2.5 Remove dead column (repricedMarks) — migration 0005
- [x] 2.6 State machine property test

### Story 3: IDOR & Authorization

- [x] 3.1 Fix `booking.get()` IDOR — add `assertBookingAccess`
- [x] 3.2 Fix `booking.listSessions()` IDOR
- [x] 3.3 Add `tutorProcedure` middleware
- [x] 3.4 Apply `tutorProcedure` to tutor action routes
- [x] 3.5 Invalidate old invite token on resend
- [x] 3.6 Protect OpenAPI endpoints (disable in prod or auth-gate)
- [x] 3.7 IDOR tests, role tests, token tests

### Story 4: Input Validation + Auth Hardening

- [x] 4.1 Bound all string inputs with `.max()`
- [x] 4.2 Bound all array inputs with `.max()`
- [x] 4.3 Validate dates are in the future
- [x] 4.4 Add password policy (min 8 length; character-class deferred — see §4.4 note)
- [x] 4.5 Add session expiry (7 days)
- [ ] ~~4.6 Add email verification flow~~ — **DEFERRED** to production-readiness / PRD-gaps branch (see §4.6 above)
- [x] 4.7 Conditional Google OAuth (exclude when no credentials)
- [ ] ~~4.8 Frontend: add verify-email route~~ — **DEFERRED** with 4.6
- [ ] ~~4.9 Migration: set existing users `emailVerified = true`~~ — **DEFERRED** with 4.6
- [x] 4.10 Boundary tests, password tests, session tests

### Story 5: Wallet & Transaction Integrity

- [x] 5.1 Wrap wallet ops in transaction with ledger INSERT
- [x] 5.2 Add optimistic locking (version columns) — migrations 0007, 0008
- [x] 5.3 Fix 8 read-then-write race conditions
- [x] 5.4 Add payment state transition guard
- [x] 5.5 Add wallet reconciliation query (not cron yet — manual run)
- [x] 5.6 Atomicity tests, concurrency tests, webhook order tests

### Story 6: Error Handling & Resilience

- [x] 6.1 Split notification `write()` into `write()` + `writeBestEffort()`
- [x] 6.2 Add timeout to Google Meet provider (30s)
- [x] 6.3 Add timeout to Resend provider (30s)
- [x] 6.4 Add `statement_timeout` to DB pool config
- [x] 6.5 Add `uncaughtException` handler
- [x] 6.6 Enable webhook timestamp validation in all environments
- [x] 6.7 Constant-time comparison for signatures and tokens
- [x] 6.8 Add body size limit to webhook endpoints
- [x] 6.9 Timeout tests, crash test, timing test

### Story 7: Booking Idempotency

- [x] 7.1 Accept `Idempotency-Key` header in booking handlers
- [x] 7.2 Wire `bookingIdempotency` store with composite key
- [x] 7.3 Return same result on retry
- [x] 7.4 Idempotency tests

### Story 8: CSP + Performance Guard Rails

- [x] 8.1 Production-strict CSP (connect-src, script-src, style-src, img-src, font-src)
- [x] 8.2 Add LIMIT 500 to `findBookingsExpiringByDeadline`
- [x] 8.3 Add composite index migration (0006)
- [x] 8.4 Redact sensitive params in dev DB logging
- [x] 8.5 Add retry attempts to scheduler jobs
- [x] 8.6 CSP test, performance test, dev logging test

### Story 9: Frontend Hardening

- [x] 9.1 Add React error boundary
- [x] 9.2 Add auth session expiry handler (401 → redirect to login)
- [x] 9.3 Remove dead frontend components (or wire them up)
- [x] 9.4 Fix `any` type casts in route files
- [x] 9.5 Add TTL eviction to metrics
- [x] 9.6 Error boundary test, auth redirect test, type check

### Verify (after all stories)

- [x] `bun run check && bun run check-types && bun run build` all pass
- [x] `bun run test:coverage` passes with ≥ 90% packages/api, ≥ 80% overall
- [x] Manual smoke test: signup → login → purchase marks → discover tutor → book solo → book group → tutor accept → complete → cancel → verify all holds released
  > (Email verification step removed — deferred with §4.6. Signup/login flows tested without the verification gate.)
- [x] No CSP violations in browser console
- [x] No `any` types in route files (`rg "as any" apps/web/src/routes/` returns 0)

---

### Version Notes

- v1.0 (2026-07-24): Created. Foundation hardening branch: 9 stories addressing 46 findings from comprehensive second-pass audit. Establishes solid baseline for production-readiness, infrastructure, and PRD-gaps plans. Runs after consolidation merges to main.
- v1.1 (2026-07-24): Email verification (§4.6, finding G2) deferred to the `improvement/production-readiness` (or `feature/prd-gaps`) branch. It is additive and depends on email infrastructure + frontend work outside this hardening branch. Checklist items 4.6, 4.8, 4.9 struck through; §4.6 now records carry-forward tasks. Migration numbering fixed: 0005→Story 2, 0006→Story 8 composite index, 0007+0008→Story 5 version columns.
- v1.2 (2026-07-27): Code fixes — expireBookings honest count, getById single-fetch, webhook signature-before-timestamp ordering. Password policy spec corrected (Better Auth 1.6.11 only supports minPasswordLength).
