# Cogito Module Reference

Last updated: 2026-07-28

## Overview

The `packages/api` package implements business logic using a 4-layer architecture: **Router → Handler → Service → Repository**. Each module lives in `packages/api/src/modules/{module}/` with these files:

| File                  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `{module}.types.ts`   | Zod input/output schemas                                 |
| `{module}.errors.ts`  | DomainError subclasses + ORPCError mapper                |
| `{module}.repo.ts`    | Data access (SQL queries via Drizzle + postgres.js)      |
| `{module}.service.ts` | Pure business logic + consumer port interfaces           |
| `{module}.handler.ts` | DI factory: adapts `{ context, input }` to service calls |
| `{module}.router.ts`  | oRPC route definitions with auth middleware              |
| `index.ts`            | `createModule()` factory, exports public API             |

---

## Achievement Module

**Purpose:** Manage student achievements (competitions, certifications, awards). Students CRUD their own; admins review and approve/reject.

**Files:**

- `achievement.types.ts` — Zod schemas for create/update/list/admin filters
- `achievement.errors.ts` — `AchievementNotFoundError`, `AchievementNotOwnedError`, `OptimisticLockError`
- `achievement.repo.ts` — CRUD with optimistic locking (`updateWithVersion`, `deleteWithVersion`)
- `achievement.service.ts` — Ownership checks, admin review workflow, optimistic lock handling
- `achievement.handler.ts` — `list`, `create`, `update`, `remove`, `adminList`, `adminReview`
- `achievement.router.ts` — Protected routes for student ops, admin routes for review

**Service Methods:**

- `list(userId)` — Returns achievements for a user
- `create(userId, input)` — Creates achievement in `pending` status
- `update(userId, id, input, expectedVersion)` — Updates with optimistic lock check
- `remove(userId, id, expectedVersion)` — Deletes with optimistic lock check
- `adminList(input)` — Paginated list with optional status filter
- `adminReview(id, status, adminNote?)` — Approve/reject achievement

**Dependencies:** `AchievementRepo`

**Business Rules:**

- Achievements start in `pending` status
- Only the owning student can create/update/delete their achievements
- Optimistic locking prevents lost updates (`version` field)
- Admin review changes status to `approved` or `rejected`

---

## Admin Module

**Purpose:** System administration — user management and role assignment.

**Files:**

- `admin.types.ts` — `setRoleInput` schema
- `admin.errors.ts` — `UserNotFoundError`, `LastAdminError`, `OptimisticLockError`
- `admin.repo.ts` — `findUserById`, `listUsers`, `updateUserRole`
- `admin.service.ts` — `listUsers`, `setRole` (prevents removing last admin)
- `admin.handler.ts` — `listUsers`, `setRole`
- `admin.router.ts` — Admin-only routes

**Service Methods:**

- `listUsers(opts)` — Paginated user list with role filter
- `setRole(userId, role, adminId)` — Changes user role; throws `LastAdminError` if removing last admin; records audit log

**Dependencies:** `AdminRepo`, `AuditPort`

**Business Rules:**

- Cannot remove the last admin role from the system
- Role changes are audit-logged

---

## Admin-Booking Module

**Purpose:** Admin overrides for booking management — force state transitions, view booking details, adjust pricing.

**Files:**

- `admin-booking.types.ts` — Zod schemas for override and list filters
- `admin-booking.errors.ts` — `BookingNotFoundError`
- `admin-booking.repo.ts` — `findBookingById`, `listBookingsByState`, `getStateHistory`, `updateBookingWithOverride`, `findParticipantsByBookingId`, `findPaymentById`, `updatePaymentStatus`, `updateBookingHoldAmount`
- `admin-booking.service.ts` — Override workflow with audit logging
- `admin-booking.handler.ts` — `listBookings`, `getBookingDetails`, `overrideBooking`

**Service Methods:**

- `listBookings(opts)` — Paginated list filtered by booking states
- `getBookingDetails(bookingId)` — Returns booking with participants, state history, and payment info
- `overrideBooking(bookingId, newState, reason, overrideMeta)` — Force state transition bypassing state machine; updates `previousState`, `stateReason`, `overrideMeta`; records audit log and state history entry

**Dependencies:** `AdminBookingRepo`, `AuditPort`

**Business Rules:**

- Admin overrides bypass the state machine — any state can be set
- All overrides require a reason and are audit-logged
- `overrideMeta` stores admin identity and justification

---

## Admin-Tutor Module

**Purpose:** Admin management of tutor invites and profile review.

**Files:**

- `admin-tutor.types.ts` — Zod schemas for invite creation and profile review
- `admin-tutor.errors.ts` — `InviteNotFoundError`, `TutorProfileNotFoundError`, `InvalidInviteActionError`, `DuplicateInviteError`
- `admin-tutor.repo.ts` — Invite CRUD, tutor profile listing and review
- `admin-tutor.service.ts` — `createInvite`, `resendInvite`, `revokeInvite`, `listInvites`, `listTutorProfiles`, `reviewTutorProfile`
- `admin-tutor.handler.ts` — Maps handler input to service calls
- `admin-tutor.router.ts` — Admin-only routes

**Service Methods:**

- `createInvite(adminId, email)` — Creates tutor invite with unique token
- `resendInvite(inviteId)` — Regenerates token and sends email
- `revokeInvite(inviteId, adminId, reason?)` — Marks invite as revoked
- `listInvites(opts)` — Paginated invite list
- `listTutorProfiles(opts)` — Paginated tutor profiles with status filter
- `reviewTutorProfile(profileId, status, adminNote?)` — Approve/reject tutor profile

**Dependencies:** `AdminTutorRepo`, `EmailPort`

---

## Audit Module

**Purpose:** Append-only audit log for tracking state changes and admin actions.

**Files:**

- `audit.repo.ts` — `insert`, `listByTarget`, `listByActor`
- `audit.service.ts` — `record(entry)`, `listByTarget(targetId, targetType)`, `listByActor(actorId)`

**Service Methods:**

- `record(entry)` — Inserts audit log entry with actor, action, target, before/after state
- `listByTarget(targetId, targetType)` — Lists audit entries for a specific entity
- `listByActor(actorId)` — Lists audit entries by actor

**Dependencies:** `AuditRepo`

**Business Rules:**

- Audit logs are append-only — never updated or deleted
- Every admin action and state transition should be logged

---

## Auth Module

**Purpose:** User authentication via Better Auth with session management and wallet initialization.

**Files:**

- `auth.types.ts` — `updateProfileInput` schema
- `auth.errors.ts` — `ProfileNotFoundError`
- `auth.repo.ts` — `findUserWithProfile`, `updateProfile`
- `auth.service.ts` — `me`, `getProfile`, `updateProfile` (lazy-creates wallet)
- `auth.handler.ts` — Maps session context to service calls
- `auth.router.ts` — Protected routes for `me`, `getProfile`, `updateProfile`

**Service Methods:**

- `me(userId)` — Returns user + profile + tutorProfile + wallet (creates wallet if missing)
- `getProfile(userId)` — Returns user with profile and tutor profile
- `updateProfile(userId, input)` — Updates user name and profile fields

**Dependencies:** `AuthRepo`, `WalletPort` (for lazy wallet creation)

**Business Rules:**

- Wallet is lazily created on first `me` call
- Better Auth handles session management, password hashing, and session cookies

---

## Booking Module

**Purpose:** Core booking lifecycle — solo, group, and series bookings with state machine transitions, wallet holds, and meeting integration.

**Files:**

- `booking-state.types.ts` — Booking state enum and terminal states
- `booking-transitions.ts` — `canTransition()` state machine logic
- `booking.types.ts` — Zod schemas for all booking operations
- `booking.errors.ts` — 11 error classes for booking domain
- `booking.repo.ts` — 20+ data access methods for bookings, participants, sessions, reschedules
- `booking.service.ts` — 15+ public methods; consumer ports for wallet, pricing, audit, notification, meeting
- `booking.handler.ts` — Maps handler context/input to service calls
- `booking.router.ts` — Protected routes for all booking operations

**Service Methods:**

- `getById(bookingId, userId)` — Returns booking with access check
- `listMine(userId, opts)` — Paginated list of user's bookings
- `createSolo(proposerId, input)` — Creates solo booking with wallet hold, overlap check, and notification
- `createGroup(proposerId, input)` — Creates group booking with invitees
- `createSeries(proposerId, input)` — Creates series booking with sessions (2-4 sessions, each checked for overlaps)
- `confirmInvite(userId, bookingId)` — Invitee confirms participation; holds marks
- `declineInvite(userId, bookingId, reason?)` — Invitee declines
- `reconfirm(userId, bookingId, accept)` — Reconfirms participation after reschedule
- `withdraw(userId, bookingId, reason?)` — Participant withdraws; releases hold; cancels group if below minimum
- `cancel(userId, bookingId, reason?)` — Cancels booking; releases all holds; late cancel becomes `late_cancelled`
- `tutorAccept(bookingId, tutorId)` — Tutor accepts booking; creates meeting for online; sets room approval for offline
- `tutorDecline(bookingId, tutorId, reason?)` — Tutor declines; releases all holds
- `completeSession(bookingId, tutorId)` — Marks session complete; deducts held marks
- `proposeReschedule(userId, bookingId, start, end, reason?)` — Proposes new time
- `listSessions(bookingId, userId)` — Lists sessions for a series booking
- `expireBookings()` — Batch expiry job; routes to correct terminal state based on current state
- `releaseExpiredHolds()` — Releases holds on bookings past deadline

**Dependencies:** `BookingRepo`, `BookingWalletPort`, `BookingPricingPort`, `BookingAuditPort`, `BookingNotificationPort`, `BookingMeetingPort`

**Business Rules:**

- State machine enforces valid transitions via `canTransition()`
- All state transitions are recorded in `bookingStateHistory`
- Group bookings require minimum 2 participants (MIN_GROUP_HEADCOUNT)
- Series bookings require 2-4 sessions (MIN_SERIES_SESSIONS to MAX_SERIES_SESSIONS)
- Deadline is set to `now + 12 hours` for new bookings (RESPONSE_WINDOW_MS)
- Late cancellation within H-2 threshold results in `late_cancelled` state
- Series cancel cascades to all `bookingSession` rows
- Wallet holds are released on cancel, decline, and expiry
- Overlap detection prevents double-booking tutor slots
- Optimistic locking via `version` field prevents concurrent state changes

---

## Email Module

**Purpose:** Email delivery abstraction with Resend (production) and stub (development) providers.

**Files:**

- `email.service.ts` — `EmailPort` interface, `createEmailService()` with circuit breaker
- `resend-email.provider.ts` — Production provider using Resend API with 30s timeout
- `stub-email.provider.ts` — Development stub that logs but doesn't send

**Service Methods:**

- `write(params)` — Sends email, throws on failure
- `writeBestEffort(params)` — Sends email, swallows errors (logs only)

**Business Rules:**

- Circuit breaker on Resend: 3 failures → open for 120s
- 30-second timeout per email send request
- `writeBestEffort` used for non-critical notifications (booking reminders)

---

## Invite Module

**Purpose:** Tutor invite flow — verify token, claim invite to create tutor profile.

**Files:**

- `invite.types.ts` — Zod schemas
- `invite.errors.ts` — `InviteNotFoundError`, `InviteEmailMismatchError`, `ProfileAlreadyExistsError`
- `invite.repo.ts` — `findByToken`, `markUsed`
- `invite.service.ts` — `verify(token)`, `claim(userId, token, email)`
- `invite.handler.ts` — Maps to service calls
- `invite.router.ts` — `verify` is public, `claim` is protected

**Service Methods:**

- `verify(token)` — Returns invite details without claiming
- `claim(userId, token, email)` — Validates token and email match; creates tutor profile in `onboarding` status

**Dependencies:** `InviteRepo`, `TutorPort` (for profile creation)

**Business Rules:**

- Tokens are single-use; claimed tokens are marked `used`
- Email must match the invited email exactly

---

## Meeting Module

**Purpose:** Meeting link creation via Google Calendar API with circuit breaker and fallback.

**Files:**

- `meeting.types.ts` — `MeetingEvent` interface
- `google-meeting.provider.ts` — Production provider with 30s timeout and circuit breaker (5 failures → open for 60s)
- `fallback.provider.ts` — Manual link fallback when Google Meet fails
- `index.ts` — Exports `createGoogleMeetingProvider` and `createGoogleMeetingProviderWithFallback`

**Service Methods:**

- `createEvent(bookingId, scheduledStartAt?, scheduledEndAt?)` — Creates Google Calendar event with Meet conference; falls back to manual link on failure
- Falls back to manual link URL format when circuit breaker is open

**Business Rules:**

- Google Meet calls have 30-second timeout
- Circuit breaker: 5 failures → open for 60 seconds
- On failure, creates a `meetingEvent` record with `status: "failed"` and `errorReason`
- Offline bookings skip meeting creation entirely (go to `awaiting_admin_room_approval`)

---

## Notification Module

**Purpose:** In-app notification creation and email dispatch.

**Files:**

- `notification.types.ts` — Zod schemas for notification input
- `notification.errors.ts` — `NotificationNotFoundError`
- `notification.repo.ts` — `insert`, `listByUserId`, `markRead`, `markAllRead`
- `notification.service.ts` — `write(params)`, `writeBestEffort(params)`, `list(userId, opts)`, `markRead(id, userId)`, `markAllRead(userId)`
- `notification.handler.ts` — Maps handler context/input
- `notification.router.ts` — Protected routes

**Service Methods:**

- `write(params)` — Creates notification and dispatches email; throws on failure
- `writeBestEffort(params)` — Creates notification and dispatches email; swallows errors
- `list(userId, opts)` — Paginated list with `includeRead` filter
- `markRead(id, userId)` — Marks single notification as read
- `markAllRead(userId)` — Marks all unread notifications as read

**Dependencies:** `NotificationRepo`, `EmailPort`

**Business Rules:**

- Every notification has a unique `eventKey` for idempotency
- `write` throws — used for critical notifications
- `writeBestEffort` swallows errors — used for non-critical notifications

---

## Payment Module

**Purpose:** Payment processing via Xendit with webhook handling and idempotency.

**Files:**

- `payment.types.ts` — Zod schemas for checkout and webhook
- `payment.errors.ts` — `PaymentNotFoundError`
- `payment.repo.ts` — `insertRecord`, `findByProviderReference`, `updateStatus`
- `payment.service.ts` — `createCheckout`, `handleWebhook`; idempotency via `webhookIdempotency` store
- `payment.handler.ts` — Maps handler context/input
- `payment.router.ts` — Protected route for `createCheckout`, public route for `handleWebhook`
- `xendit-payment.provider.ts` — Xendit API integration with circuit breaker (5 failures → 30s) and retry
- `stub-payment.provider.ts` — Development stub

**Service Methods:**

- `createCheckout(userId, input)` — Creates Xendit payment request; returns checkout URL
- `handleWebhook(rawBody, token)` — Verifies webhook signature; idempotency via `webhookIdempotency`; updates payment status and triggers wallet credit

**Dependencies:** `PaymentRepo`, `WalletPort`, `IdempotencyStore`, `PaymentProvider`

**Business Rules:**

- Webhook token verification uses `timingSafeEqual`
- Idempotency prevents double-processing of webhooks
- Circuit breaker prevents cascading failures to Xendit
- Payment statuses: `PENDING` → `PAID`/`EXPIRED`/`FAILED`

---

## Pricing Module

**Purpose:** Pure pricing calculations — no dependencies, no database.

**Files:**

- `pricing.service.ts` — `computeSplit`, `validatePrices`

**Service Methods:**

- `computeSplit(total, headcount)` — Returns `{ perStudent, baseline, tutorShare, cogitoTake }` with 20% Cogito take
- `validatePrices(prices, modality)` — Validates floor prices by modality; returns error string or null

**Dependencies:** None (pure functions)

**Business Rules:**

- Cogito takes 20% of baseline
- Floor prices: online `{"1": 30, "2": 25, "3": 20, "4": 18, "5": 15, "6": 12}`, offline +10 on each
- `both` modality uses the higher floor price for each group size
- Group sizes 1-6 only

---

## Refund Module

**Purpose:** Refund and correction processing for wallet operations.

**Files:**

- `refund.types.ts` — Zod schemas
- `refund.errors.ts` — `RefundNotFoundError`
- `refund.repo.ts` — `createRefund`, `createCorrection`
- `refund.service.ts` — `processRefund`, `processCorrection`
- `refund.handler.ts` — Maps handler context/input
- `refund.router.ts` — Protected routes

**Service Methods:**

- `processRefund(bookingId, refundReason)` — Creates refund record and credits wallet
- `processCorrection(paymentId, amount, reason)` — Creates correction record; uses `paymentId` (not `bookingId`)

**Dependencies:** `RefundRepo`, `WalletPort`

**Business Rules:**

- Refunds credit the wallet with held amount
- Corrections can be positive (credit) or negative (deduct)
- Event keys use deterministic format: `refund:{bookingId}` or `correction:{paymentId}:{timestamp}`

---

## Room Module

**Purpose:** Room management for offline bookings — room CRUD and booking assignment.

**Files:**

- `room.types.ts` — Zod schemas
- `room.errors.ts` — `RoomNotFoundError`, `RoomBookingConflictError`
- `room.repo.ts` — `createRoom`, `listRooms`, `findRoomById`, `updateRoom`, `deleteRoom`, `createBooking`, `findRoomBookingsForUpdate`
- `room.service.ts` — Full room and room-booking lifecycle
- `room.handler.ts` — Maps handler context/input
- `room.router.ts` — Admin-only routes

**Service Methods:**

- `createRoom(input)`, `listRooms()`, `getRoom(id)`, `updateRoom(id, input)`, `deleteRoom(id)`
- `bookRoom(roomId, bookingId, start, end)` — Books a room with conflict check
- `releaseRoom(bookingId)` — Releases room booking

**Dependencies:** `RoomRepo`

---

## Scheduler Module

**Purpose:** Background job scheduler using BullMQ for booking expiry, hold release, and notification dispatch.

**Files:**

- `scheduler.service.ts` — `start()`, `shutdown()`, job handlers
- `jobs/expire-bookings.job.ts` — `onExpireBookings` handler
- `jobs/release-holds.job.ts` — `onReleaseHolds` handler

**Service Methods:**

- `start()` — Registers BullMQ repeatable jobs
- `shutdown()` — Graceful shutdown with 10s timeout
- `onExpireBookings()` — Calls `bookingService.expireBookings()`
- `onReleaseHolds()` — Calls `bookingService.releaseExpiredHolds()`
- `onSendNotificationEmail()` — Sends notification emails (was a no-op, now dispatched via `notification.writeBestEffort`)

**Dependencies:** `BookingService`, `NotificationPort`, BullMQ queue

**Business Rules:**

- Expiry job runs every 5 minutes
- Hold release job runs every 5 minutes
- Jobs use retry with exponential backoff (3 attempts)
- Circuit breaker state persisted in Redis (when available)

---

## Tutor Module

**Purpose:** Tutor profile management — create, update, submit for review.

**Files:**

- `tutor.types.ts` — Zod schemas for profile fields, availability slots
- `availability.types.ts` — Availability slot types
- `tutor.errors.ts` — `TutorProfileNotFoundError`, `TutorNotAvailableError`
- `tutor.repo.ts` — `findByUserId`, `create`, `update`, `upsertAvailability`
- `tutor.service.ts` — `getMyProfile`, `updateMyProfile`, `submitForReview`
- `tutor.handler.ts` — Maps handler context/input
- `tutor.router.ts` — Protected routes with `tutorProcedure` guard

**Service Methods:**

- `getMyProfile(userId)` — Returns tutor profile with availability slots
- `updateMyProfile(userId, input)` — Updates profile fields and availability slots
- `submitForReview(userId)` — Changes `onboardingStatus` to `submitted_for_review`

**Dependencies:** `TutorRepo`

**Business Rules:**

- Only tutors with `published` status are visible in discovery
- Availability slots must be in the future
- `submitForReview` can only be called from `onboarding` status

---

## Tutor Discovery Module

**Purpose:** Public-facing tutor search and profile viewing.

**Files:**

- `discovery.types.ts` — Zod schemas for search filters
- `discovery.errors.ts` — `TutorNotFoundError`
- `discovery.repo.ts` — `listPublished`, `findByUserId`
- `discovery.service.ts` — `listPublished(filters)`, `getProfile(userId)`
- `discovery.handler.ts` — Maps handler context/input
- `discovery.router.ts` — Protected routes

**Service Methods:**

- `listPublished(filters)` — Paginated list of published tutor profiles with subject and modality filters
- `getProfile(userId)` — Returns full tutor profile

**Dependencies:** `DiscoveryRepo`

---

## Wallet Module

**Purpose:** Marks (currency) management — balances, holds, ledger entries, and package purchases.

**Files:**

- `wallet.types.ts` — Zod schemas for all wallet operations
- `wallet.errors.ts` — `WalletNotFoundError`, `InsufficientBalanceError`
- `wallet.repo.ts` — Atomic operations: `atomicHold`, `atomicRelease`, `atomicDeduct`, `atomicCredit`, `atomicCompensateCredit`, `atomicCompensateDeduct`, plus `insertLedger`, `findLedgerEntries`
- `wallet.service.ts` — `getOrCreate`, `hold`, `release`, `deduct`, `credit`, `compensate`, `listLedger`, `knowledgeBankEligible`, `listPackages`
- `wallet.handler.ts` — Maps handler context/input
- `wallet.router.ts` — Protected + admin routes

**Service Methods:**

- `getOrCreate(userId)` — Gets or lazily creates wallet with 0 balance
- `hold(db, params)` — Atomically holds marks from available balance
- `release(db, params)` — Atomatically releases held marks back to available
- `deduct(db, params)` — Atomically deducts from held balance (session completion)
- `credit(db, params)` — Atomically credits available balance (payment received)
- `compensate(db, params)` — Compensation operation (positive or negative)
- `listLedger(userId, opts)` — Paginated ledger with `bookingId` and `eventKey` filters
- `knowledgeBankEligible(userId)` — Checks if user meets minimum balance for knowledge bank
- `listPackages()` — Returns available mark packages

**Dependencies:** `WalletRepo`

**Business Rules:**

- All balance modifications are atomic (UPDATE with WHERE balance = expected)
- Every operation creates a ledger entry with unique `eventKey`
- Wallet invariant: `totalBalance = heldBalance + availableBalance`
- Idempotency via `eventKey` on ledger entries
- Insufficient available balance throws `InsufficientBalanceError`
