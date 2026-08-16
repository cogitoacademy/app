# Cogito Module Reference

Last updated: 2026-08-14

Tutor invitations use the shared email provider: create sends once, **Generate & copy link** only rotates the token, and the separate **Send again** procedure rotates then explicitly delivers through Resend. Delivery failure does not roll back the valid invite.

The invite form performs an admin-only account preflight by exact normalized email. Provider facts come from Better Auth `account.providerId` rows (`google`, `credential`, or both); admin-role accounts are shown as ineligible and cannot be submitted from the UI.

## Overview

The `packages/api` package implements business logic using a 4-layer architecture: **Router → Handler → Service → Repository**. Each module lives in `packages/api/src/modules/{module}/` with these files:

Frontend dashboard integration is intentionally read-only and role-scoped: student data comes from booking/discovery/wallet, tutor data from tutor actions/profile/availability/payouts, and admin data from booking operations/tutor moderation/achievement moderation. Dashboard cards link to the existing feature routes where mutations and detailed workflows live.

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
- `update(userId, input)` — Updates with optimistic lock check (`input.version` + `input.data`)
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

**Purpose:** System administration — user management, role assignment, wallet/ledger lookup, and payout summaries.

**Files:**

- `admin.types.ts` — `listUsersInput`, `setRoleInput`, `adminGetWalletInput`, `adminListLedgerEntriesInput`, `adminGetTutorPayoutsInput`
- `admin.errors.ts` — `UserNotFoundError`, `LastAdminError`, `OptimisticLockError`, `WalletNotFoundError`, `InvalidLedgerFilterError`
- `admin.repo.ts` — `findUserById`, `listUsers`, `updateUserRole`
- `admin.service.ts` — `listUsers`, `setRole`, `getWallet`, `listLedgerEntries`, `getTutorPayouts`
- `admin.handler.ts` — `listUsers`, `setRole`, `getWallet`, `listLedgerEntries`, `getTutorPayouts`
- `admin.router.ts` — Admin-only routes

**Service Methods:**

- `listUsers(opts)` — Paginated user list with role filter
- `setRole(userId, role, adminId)` — Changes user role; throws `LastAdminError` if removing last admin; optimistic lock via `expectedRole`; records audit log
- `getWallet({ userId })` — Returns any user's wallet balances; throws `WalletNotFoundError`
- `listLedgerEntries(input)` — Paginated ledger filtered by wallet/user, entry type, date range, or booking; `walletId` and `userId` are mutually exclusive
- `getTutorPayouts({ tutorId, dateFrom?, dateTo? })` — Delegates to the booking module's `getTutorPayouts` port

**Dependencies:** `AdminRepo`, `AuditPort`, `AdminWalletPort`, `BookingPayoutPort`

**Business Rules:**

- Cannot remove the last admin role from the system
- Role changes are audit-logged
- Ledger filters must target exactly one wallet (`walletId` or `userId`, not both)

---

## Admin-Booking Module

**Purpose:** Admin operations console for bookings — override queue with urgency, before/after override preview, state history, and admin refunds.

**Files:**

- `admin-booking.types.ts` — Zod schemas for override/list/state-history/admin-refund inputs
- `admin-booking.errors.ts` — `BookingNotFoundError`
- `admin-booking.repo.ts` — booking lookup, override state application, state history
- `admin-booking.service.ts` — `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`; exports `OVERRIDE_CATEGORIES` and `MARKS_ACTIONS`
- `admin-booking.handler.ts` — `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`
- `admin-booking.router.ts` — Admin-only routes

**Service Methods:**

- `listBookings(opts)` — Paginated booking list sorted by urgency, filterable by category/urgency/escalated
- `applyOverride(adminId, input)` — Force state transition by `category` (tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel); optionally adjusts held Marks (`marksAction`); records audit log + state history
- `previewOverride(input)` — Returns the projected booking state and per-participant wallet impact without persisting anything
- `getBookingStateHistory(bookingId)` — Returns full state transition history for a booking
- `adminRefund(adminId, { paymentId, reason })` — Creates a compensating ledger entry for a payment error

**Dependencies:** `AdminBookingRepo`, `AuditPort`, wallet port

**Business Rules:**

- Admin overrides bypass the state machine — any state can be set
- All overrides require a reason and are audit-logged
- `previewOverride` never persists
- Override categories map to target states (`tutor_no_show`/`student_no_show` → `no_show`; the rest → `cancelled`)

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

**Business Rules:**

- Tutor invitation email copy has one primary action: accept the invitation and set up the tutor profile
- The email states the exact account email required for claiming, shows expiry in UTC, and includes a plain fallback URL
- Invitee-controlled display names, email addresses, and URLs are escaped before rendering into HTML

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

- `auth.types.ts` — `updateProfileInput`, `searchStudentsInput`
- `auth.errors.ts` — `ProfileNotFoundError`
- `auth.repo.ts` — `findUserWithProfile`, `updateProfile`, `searchStudents`
- `auth.service.ts` — `me`, `getProfile`, `updateProfile`, `searchStudents` (lazy-creates wallet)
- `auth.handler.ts` — Maps session context to service calls
- `auth.router.ts` — Protected routes for `me`, `getProfile`, `updateProfile`, `searchStudents`

**Service Methods:**

- `me(userId)` — Returns user + profile + tutorProfile + wallet (creates wallet if missing)
- `getProfile(userId)` — Returns user with profile and tutor profile
- `updateProfile(userId, input)` — Creates or updates student profile fields (phone, school, grade, parent contacts)
- Student account `name` and optional `image` are edited from the same UI through Better Auth `updateUser`; email is displayed read-only and is not part of `auth.updateProfile`.
- `searchStudents(requesterId, query, limit)` — ILIKE search of `student`-role users by name/email, excluding the requester, up to 10 results

**Dependencies:** `AuthRepo`, `WalletPort` (for lazy wallet creation)

**Business Rules:**

- Wallet is lazily created on first `me` call
- Better Auth handles session management, password hashing, and session cookies

---

## Booking Module

**Purpose:** Core booking lifecycle — solo, group, and series bookings with state machine transitions, reschedule approval, session notes, wallet holds, payouts, and meeting integration.

**Files:**

- `booking-state.types.ts` — Booking state enum and terminal states
- `booking-transitions.ts` — `canTransition()` state machine logic
- `booking.types.ts` — Zod schemas for all booking operations
- `booking.errors.ts` — error classes for the booking domain
- `booking.repo.ts` — data access for bookings, participants, sessions, notes, reschedules, payouts
- `booking.service.ts` — service methods below; consumer ports for wallet, pricing, audit, notification, meeting
- `booking.handler.ts` — `createBookingHandler` (student/proposer) and `createTutorActionsHandler` (tutor)
- `booking.router.ts` — Student-owned booking mutations use `studentProcedure`; shared party reads/notes stay protected; `tutorActions.*` uses `tutorProcedure`

**Service Methods:**

- `getById(bookingId, userId)` — Returns booking with access check
- `listMine(userId, opts)` — Paginated list of user's bookings (proposer)
- `listForTutor(tutorId, opts)` — Paginated list of bookings assigned to a tutor
- `createSolo(proposerId, input)` — Creates solo booking with wallet hold, overlap check, and notification
- `createGroup(proposerId, input)` — Creates group booking with invitees
- `createSeries(proposerId, input)` — Creates a solo series booking with sessions (2-4 sessions, each checked for overlaps)
- `createGroupSeries(proposerId, input)` — Creates a group series (targetGroupSize 2-6, inviteeUserIds) with upfront per-participant holds for all sessions (FR-20, landed #46)
- `confirmInvite(userId, bookingId)` — Invitee confirms participation; holds marks
- `declineInvite(userId, bookingId, reason?)` — Invitee declines
- `reconfirm(userId, bookingId, accept)` — Participant accepts/rejects the repriced offer after repricing
- `withdraw(userId, bookingId, reason?)` — Participant withdraws; pre-H2 releases hold, post-H2 late-cancels; cancels group if below minimum
- `cancel(userId, bookingId, reason?)` — Cancels booking; releases all holds; late cancel becomes `late_cancelled`
- `tutorAccept(bookingId, tutorId)` — Tutor accepts booking; creates meeting for online; sets room approval for offline
- `tutorDecline(bookingId, tutorId, reason?)` — Tutor declines; releases all holds
- `completeSession(bookingId, tutorId, sessionId?)` — Marks a session complete; deducts held marks (sessionId for series children)
- `cancelSession(userId, sessionId)` — Student cancels an individual series session (> 2h before start)
- `proposeReschedule(actorId, actorRole, bookingId, sessionId, start, reason?)` — Tutor or booking proposer proposes a fixed 90-minute replacement for one session
- `acceptReschedule(actorId, bookingId, proposalId?)` / `rejectReschedule(...)` — Records a required tutor/student vote against the active proposal; `proposalId` prevents stale UI actions from deciding a superseded proposal. Only unanimous acceptance applies the schedule, then the booking returns to its pre-proposal state; any rejection keeps the old schedule and also returns to that state.
- `addSessionNote(userId, bookingId, content)` — Adds a sanitized note to a completed session
- `getSessionNotes(userId, bookingId)` — Lists notes for a completed session
- `markTutorAttendance(bookingId, tutorId, attendance)` — Marks tutor present/late so the lateness job skips the booking
- `listSessions(bookingId, userId)` — Lists sessions for a series booking
- `getTutorPayouts({ tutorId, dateFrom?, dateTo? })` — Aggregates completed sessions → `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }`
- `expireBookings()` — Batch expiry job; routes to correct terminal state based on current state
- `releaseExpiredHolds()` — Releases holds on bookings past deadline
- `checkTutorLateness()` — Auto-cancels bookings where the tutor never marked attendance past the 15-min lateness tolerance
- `retryFailedMeetings()` — Re-creates Google Meet for CONFIRMED online bookings with a failed meetingEvent (up to 3 attempts, driven by the `retry-failed-meetings` job); prevents the CONFIRMED-without-meeting-link dead state

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
- Availability is stored as a free-time window; students may choose any minute-level start that keeps the server-fixed 90-minute session inside it. Terminal bookings do not keep the window blocked.
- Rescheduling is per session, may iterate until accepted, expires after 24 hours, and requires the tutor plus every active student. Proposal expiry reverts to the pre-proposal state without cancelling the booking, releasing its hold, or changing its original schedule. Only the tutor may propose outside the original availability window.
- Optimistic locking via `version` field prevents concurrent state changes
- Only `student` accounts can create bookings or perform student participant actions; tutor/admin attempts fail with `FORBIDDEN` before handlers run.
- Group deadline repricing (B3): `expireBookings` reprices partial groups (confirmed ≥ 2 but < target) to `AWAITING_RECONFIRMATION` with a fresh 12h deadline instead of expiring (#46)
- Group-series creation (B8) and per-session post-H2 forfeit (B9) landed in #46
- Follow-ups (reconfirmation-deadline reprice, group-series full withdrawal block, per-participant no-show, admin per-session cancel, per-session reschedule) tracked in `docs/plans/active/PRD-GAPS-PHASE3.md` (U3–U7)

---

## Email Module

**Purpose:** Email delivery abstraction with Resend (production) and stub (development) providers.

**Files:**

- `email.service.ts` — `EmailPort` interface + `createEmailService()`
- `resend-email.provider.ts` — Production provider using Resend API with 30s timeout and circuit breaker
- `stub-email.provider.ts` — Development stub that logs but doesn't send

**Service Methods:**

- `send(message)` — Sends an email; `message` is `{ to, subject, html, category }` where `category` is `booking`/`payment`/`refund`/`schedule`/`override`; returns `{ messageId }` or `{ skipped: true }`

**Business Rules:**

- Circuit breaker on Resend: 3 failures → open for 120s
- 30-second timeout per email send request
- Emails are dispatched via the **outbox**: `notification.write` only queues `notificationDispatch` rows (`status='queued'`) inside the DB transaction; the `send-notification-email` scheduler job (60s) calls `notification.dispatchQueuedEmails()` to send and mark rows `sent`/`failed`/`suppressed` (landed #46)

---

## Invite Module

**Purpose:** Tutor invite flow — verify token, claim invite to create tutor profile.

**Files:**

- `invite.types.ts` — Zod schemas
- `invite.errors.ts` — `InviteNotFoundError`, `InviteEmailMismatchError`, `ProfileAlreadyExistsError`
- `invite.repo.ts` — `findByToken`, `markUsed`
- `invite.service.ts` — `verify(token)`, `claim(userId, userEmail, token)`
- `invite.handler.ts` — Maps to service calls
- `invite.router.ts` — `verify` is public, `claim` is protected

**Service Methods:**

- `verify(token)` — Returns invite details without claiming
- `claim(userId, userEmail, token)` — Validates the signed-in user's email matches the invited email; creates tutor profile in `onboarding` status

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
- `updateEvent(bookingId, scheduledStartAt, scheduledEndAt)` — Updates the Google event when a reschedule is accepted (OQ-05, #46)
- `cancelEvent(bookingId)` — Cancels the Google event on terminal booking states (cancel/late-cancel/decline/expire; best-effort via circuit breaker) (#46)
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
- `notification.repo.ts` — `insert`, `listByUserId`, `updateReadStatus`, `markAllRead`, `countUnread`
- `notification.service.ts` — `write(params)`, `writeBestEffort(params)`, `list(userId, opts)`, `getUnreadCount(userId)`, `markAsRead(id, userId)`, `markAllAsRead(userId)`
- `notification.handler.ts` — Maps handler context/input
- `notification.router.ts` — Protected routes

**Service Methods:**

- `write(params)` — Creates notification + queues email dispatch row; throws on failure
- `writeBestEffort(params)` — Creates notification + queues email dispatch row; swallows errors
- `dispatchQueuedEmails(limit = 50)` — Outbox consumer: sends queued dispatch rows via `EmailPort`, marks `sent`/`failed`/`suppressed` (called by the `send-notification-email` scheduler job)
- `list(userId, opts)` — Paginated list with `unreadOnly` filter
- `getUnreadCount(userId)` — Returns the number of unread notifications
- `markAsRead(id, userId)` — Marks single notification as read
- `markAllAsRead(userId)` — Marks all unread notifications as read

**Dependencies:** `NotificationRepo`, `EmailPort` (+ `db` for the outbox consumer)

**Business Rules:**

- Every notification has a unique `eventKey` for idempotency
- `write` throws — used for critical notifications
- `writeBestEffort` swallows errors — used for non-critical notifications
- Email dispatch is outbox-based: rows are queued inside the DB transaction and sent by the scheduler job; no email I/O inside open transactions (#46)

---

## Payment Module

**Purpose:** Mark package purchases via a payment provider (Xendit) with webhook confirmation, idempotency, and wallet crediting.

**Files:**

- `payment.types.ts` — `createPurchaseInput`/`getPurchaseInput` + output schemas
- `payment.errors.ts` — `PackageNotFoundError`, `PaymentNotFoundError`, `PackageAlreadyPurchasedError`, `PaymentProviderError`
- `payment.repo.ts` — `findPackageByCode`, `insertPayment`, `findPaymentByProviderReference`, `findPaymentByProviderEventId`, `findPaymentById`, `updatePaymentStatus`
- `payment.service.ts` — `createIntent`, `confirmFromWebhook`, `getPurchase`; exposes `provider`
- `payment.handler.ts` — `createPurchase`, `getPurchase`
- `payment.router.ts` — Protected routes for `createPurchase`/`getPurchase`
- `xendit-payment.provider.ts` — Xendit API integration with circuit breaker and retry; `verifyWebhook`
- `stub-payment.provider.ts` — Development stub
- Webhook route lives in `apps/server/src/webhooks/payments.ts` (`POST /webhooks/payments/:provider`)

**Service Methods:**

- `createIntent(userId, walletId, packageCode)` — Creates a purchase intent; reuses an existing PENDING intent for the same provider+user+package; resets FAILED/EXPIRED payments to PENDING and re-creates the intent (re-purchase, #46); returns `{ paymentId, providerReference, checkoutUrl }`
- `confirmFromWebhook({ provider, providerReference, providerEventId, status, ... })` — Enforces the `ALLOWED_TRANSITIONS` state machine (PENDING → PAID/SETTLED/FAILED/EXPIRED; PAID → SETTLED/REFUNDED), credits the wallet on first PAID/SETTLED, idempotent via provider event ID + DB UNIQUE; writes `payment.{id}.credited` notification (B6, #46)
- `getPurchase(paymentId, userId)` — Returns the payment record if owned by the user

**Dependencies:** `PaymentRepo`, `PaymentWalletPort`, `PaymentProvider`, `NotificationPort`

**Business Rules:**

- Webhook signature verified via `verifyWebhook` (provider-specific) + timestamp window (5 min) + IP allowlist (honors `TRUST_PROXY`)
- Webhook idempotency is atomic — `IdempotencyStore.claim` keyed on the verified payload event id, released on processing failure (#46)
- Circuit breaker prevents cascading failures to the provider
- Payment statuses: `PENDING` → `PAID`/`SETTLED`/`EXPIRED`/`FAILED`/`REFUNDED`
- Payment/refund notifications are written per the PRD matrix (B6, #46); `PAYMENT_PROVIDER=xendit` requires Xendit credentials (no silent stub fallback)

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

**Purpose:** Admin wallet corrections — compensating credit/deduct ledger entries and correction listing.

**Files:**

- `refund.types.ts` — `createCorrectionInput`, `listCorrectionsInput`
- `refund.errors.ts` — `RefundNotFoundError`, `WalletNotFoundError`
- `refund.repo.ts` — `insertRefundRecord`
- `refund.service.ts` — `createCorrection`, `listCorrections`, `createRefundRecord`
- `refund.handler.ts` — `createCorrection`, `listCorrections`
- `refund.router.ts` — Admin-only routes

**Service Methods:**

- `createCorrection(adminId, { walletId, amount, type, reason, bookingId? })` — Compensates a wallet (`compensate_credit`/`compensate_deduct`), writes a `refund_record`, and records an audit log with before/after balances; throws `WalletNotFoundError` if the wallet is missing
- `listCorrections({ walletId, limit?, cursor? })` — Returns only `compensate_credit`/`compensate_deduct` ledger entries for a wallet
- `createRefundRecord(db, params)` — Internal helper used by other modules to persist a refund/correction record

**Dependencies:** `RefundRepo`, `RefundWalletPort`, `RefundAuditPort`

**Business Rules:**

- Corrections can be positive (credit) or negative (deduct)
- Event keys use a deterministic format `correction.{type}.{walletId}.{sha256(payload)[:32]}` — derived from the payload so a retried request can never double-apply (idempotent via the ledger unique index)
- Every correction is audit-logged with before/after wallet state

---

## Room Module

**Purpose:** Room management for offline bookings — room CRUD, availability checks, assignment, relocation, and un-assignment.

**Files:**

- `room.types.ts` — Zod schemas for list/create/assign/check-availability/relocate/cancel inputs
- `room.errors.ts` — `RoomNotFoundError`, `RoomBookingConflictError`
- `room.repo.ts` — room queries, room-booking insert/update/find
- `room.service.ts` — `listActive`, `createRoom`, `assignRoom`, `checkAvailability`, `relocateRoom`, `cancelRoomBooking`
- `room.handler.ts` — `list`, `create`, `assign`, `checkAvailability`, `relocate`, `cancelBooking`
- `room.router.ts` — `list`/`checkAvailability` protected; `create`/`assign`/`relocate`/`cancelBooking` admin-only

**Service Methods:**

- `listActive()` — Returns active rooms
- `createRoom({ name, location, capacity })` — Creates a room
- `assignRoom(bookingId, roomId, startAt, endAt)` — Confirms a room for a booking with conflict check; transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED` and notifies tutor + confirmed students (#46, G14)
- `checkAvailability(roomId, startAt, endAt)` — Returns whether the room is free for the slot
- `relocateRoom(bookingId, roomId, startAt, endAt)` — Moves a booking to a different room, freeing the previous one; notifies tutor + confirmed students (#46)
- `cancelRoomBooking(bookingId)` — Cancels the booking's room assignment (booking continues without a room); notifies tutor + confirmed students (#46)

**Dependencies:** `RoomRepo`, `RoomNotificationPort`, `RoomBookingPort` (transition to scheduled)

**Business Rules:**

- Room bookings have status `requested`/`confirmed`/`relocated`/`cancelled`
- G14 (assign → scheduled + notifications) fixed in #46
- Remaining gap G13: `checkAvailability` is not yet integrated into booking creation — tracked U14 in `docs/plans/active/PRD-GAPS-PHASE3.md`

---

## Scheduler Module

**Purpose:** Background job scheduling using BullMQ for booking expiry, hold release, tutor-lateness auto-cancel, email outbox dispatch, and support-ticket SLA escalation.

**Files:**

- `scheduler.service.ts` — `createSchedulerService()`, `start()`, `shutdown()`, job handlers
- `jobs/expire-bookings.job.ts` — repeatable job (5 min)
- `jobs/release-holds.job.ts` — repeatable job (10 min)
- `jobs/check-tutor-lateness.job.ts` — repeatable job (5 min)
- `jobs/send-notification-email.job.ts` — repeatable job (60 s) — consumes the email outbox (queued + failed-with-retries-left rows, max 3 attempts per dispatch)
- `jobs/escalate-support-tickets.job.ts` — repeatable job (15 min) — SLA escalation
- `jobs/retry-failed-meetings.job.ts` — repeatable job (5 min) — re-creates Google Meet for CONFIRMED online bookings whose meeting creation failed (max 3 attempts; afterwards left for admin manual link, U1)
- Wiring: `apps/server/src/scheduler.ts` — `initScheduler()` gates on `SCHEDULER_ENABLED=true` + `REDIS_URL`

**Service Methods:**

- `start()` — Registers BullMQ repeatable jobs
- `shutdown()` — Graceful shutdown with 10s timeout (forced close after timeout)
- `onExpireBookings()` — Calls `bookingService.expireBookings()`
- `onReleaseHolds()` — Calls `bookingService.releaseExpiredHolds()`
- `onCheckTutorLateness()` — Calls `bookingService.checkTutorLateness()` (15-min lateness auto-cancel, G3)
- `onSendNotificationEmail()` — Calls `notificationService.dispatchQueuedEmails(50)` (outbox consumer; #46; failed rows retried up to 3 attempts)
- `onEscalateSupportTickets()` — Calls `supportService.escalatePastSlaTickets()` (marks overdue tickets in_progress + escalated + audit; #46)
- `onRetryFailedMeetings()` — Calls `bookingService.retryFailedMeetings()` (re-schedules CONFIRMED online bookings with a failed meeting)

**Dependencies:** `BookingService`, `NotificationService`, `SupportService`, BullMQ queue

**Business Rules:**

- Expiry job every 5 min; hold-release every 10 min; lateness every 5 min; email every 60 s; SLA escalation every 15 min
- Jobs use retry with exponential backoff (3 attempts; no DLQ yet)
- Circuit breaker state persisted in Redis (when available)

---

## Support Module

**Purpose:** Support/lateness tickets (G1) — students report tutoring lateness/no-show or other issues; admins triage by SLA urgency and resolve.

**Files:**

- `support.types.ts` — `createTicketInput`, `listTicketsInput`, `adminListTicketsInput`, `adminResolveTicketInput`; `SUPPORT_CATEGORIES`, `SUPPORT_STATUSES`
- `support.errors.ts` — `SupportTicketNotFoundError`, `SupportBookingAccessError`, `LatenessReportTooEarlyError`, `SupportTicketAlreadyResolvedError`
- `support.repo.ts` — `findBookingForReporter`, `insert`, `listByReporter`, `adminList`, `findById`, `updateResolution`
- `support.service.ts` — `createTicket`, `listTickets`, `adminList`, `adminResolveTicket`
- `support.handler.ts` — Maps handler context/input
- `support.router.ts` — `createTicket`/`listTickets` protected; `adminListTickets`/`adminResolveTicket` admin-only

**Service Methods:**

- `createTicket(userId, { category, bookingId?, description })` — Lateness/no-show categories (`tutor_late`/`tutor_no_show`) require the reporter to be a participant and the booking to have started > 15 min ago (`LATENESS_TOLERANCE_MS`); sets `slaDeadline` = now + 12h (`SUPPORT_SLA_MS`)
- `listTickets(userId, { status?, limit? })` — The user's own tickets
- `adminList({ status?, limit?, offset? })` — All tickets sorted by SLA urgency (earliest deadline first)
- `adminResolveTicket(adminId, { ticketId, resolution })` — Sets `resolved` + assignee, notifies the reporter, records an audit log; throws `SupportTicketAlreadyResolvedError` if already resolved/closed
- `escalatePastSlaTickets()` — Called by the `escalate-support-tickets` scheduler job; marks open tickets past `slaDeadline` as `in_progress` + escalated and records an audit log (#46)

**Dependencies:** `SupportRepo`, `SupportNotificationPort`, `SupportAuditPort`

**Business Rules:**

- Tickets start `open`; statuses `open`/`in_progress`/`resolved`/`closed`
- SLA deadline is `created + 12 hours`; auto-escalation job landed in #46 (OQ-04 in-app part). Business-hours SLA windows (30 min / 4 h) + WhatsApp escalation remain open — tracked U9 in `docs/plans/active/PRD-GAPS-PHASE3.md`
- Lateness reports are time-gated (15 min after scheduled start)

---

## Tutor Module

**Purpose:** Tutor profile management — create, update, submit for review, availability management, and payout summaries.

**Files:**

- `tutor.types.ts` — Zod schemas for profile fields, `getMyPayoutsInput`
- `availability.types.ts` — Availability slot types (`upsert`, weekly-create, delete)
- `tutor.errors.ts` — `TutorProfileNotFoundError`, `TutorNotAvailableError`, `AvailabilitySlotOverlapError`, `InvalidTutorPricingError`, `OptimisticLockError`, `InvalidDateRangeError`, `WeeklyAvailabilityRangeError`
- `tutor.repo.ts` — `findByUserId`, `create`, `update`, `upsertAvailability`
- `tutor.service.ts` — `getMyProfile`, `updateMyProfile`, `submitForReview`, `listAvailability`, `upsertAvailability`, `createWeeklyAvailability`, `deleteAvailability`, `getMyPayouts`
- `tutor.handler.ts` — Maps handler context/input
- `tutor.router.ts` — Tutor-guarded routes (`tutorProcedure`)

**Service Methods:**

- `getMyProfile(userId)` — Returns tutor profile
- `updateMyProfile(userId, input)` — Updates draft profile fields with optimistic lock (`version`); throws `TutorProfileNotEditableError` if published
- `submitForReview(userId)` — Validates required fields + pricing, then sets `onboardingStatus` to `pending_review`; records audit log
- `listAvailability(userId)` — Lists the tutor's active future availability slots
- `upsertAvailability(userId, input)` — Creates/updates a slot, rejecting overlaps
- `createWeeklyAvailability(userId, input)` — Materializes weekly slots through `repeatUntil` (≤ 53 occurrences), rejecting overlaps
- `deleteAvailability(userId, slotId)` — Deactivates a slot (soft delete)
- `getMyPayouts(userId, { dateFrom?, dateTo? })` — Delegates to the booking module's `getTutorPayouts` port

**Dependencies:** `TutorRepo`, `TutorPricingPort`, `TutorAuditPort`, `BookingPayoutPort`

**Business Rules:**

- Only tutors with `published` status are visible in discovery
- Availability slots must be in the future and non-overlapping
- `submitForReview` can only be called from `draft`/`changes_requested` status
- Profile updates use optimistic locking (`version`)

---

## Tutor Discovery Module

**Purpose:** Student-only tutor search and profile viewing.

**Files:**

- `discovery.types.ts` — Zod schemas for search filters
- `discovery.errors.ts` — `TutorNotFoundError`
- `discovery.repo.ts` — `listPublished`, `findByUserId`
- `discovery.service.ts` — `listPublished(filters)`, `getProfile(userId)`
- `discovery.handler.ts` — Maps handler context/input
- `discovery.router.ts` — Student-only routes (`studentProcedure`)

**Service Methods:**

- `listPublished(filters)` — Paginated list of published tutor profiles with subject and modality filters
- `getProfile(userId)` — Returns full tutor profile

**Dependencies:** `DiscoveryRepo`

---

## Upload Module

**Purpose:** Secure file uploads for achievement proofs and avatars — signed PUT URLs via Cloudflare R2 (production) or local-disk fallback (dev).

**Files:**

- `upload.types.ts` — `createUploadUrlInput` (filename sanitized + bounded, `contentType` allowlist: png/jpeg/webp/gif/pdf); `MAX_UPLOAD_BYTES` = 5 MB
- `upload.errors.ts` — `InvalidContentTypeError`, `InvalidFilenameError`
- `upload.service.ts` — `createUploadUrl`, `resolvePublicUrl`
- `upload.handler.ts` — `createUploadUrl`
- `upload.router.ts` — `protectedProcedure`, path `/upload/create-url`
- `index.ts` — `createUploadModule({ storage })`
- Storage abstraction: `packages/api/src/lib/storage.ts` — `StoragePort` (`put`, `getSignedUploadUrl`), `createR2Storage` (`@aws-sdk/client-s3` + presigner), `createLocalStorage` (writes `UPLOAD_DIR`), `createStorage(envLike)` factory

**Service Methods:**

- `createUploadUrl(userId, { filename, contentType })` — Returns `{ uploadUrl, key, publicUrl, contentType, maxBytes }`; key = `{userId}/{uuid}-{sanitizedFilename}`
- `resolvePublicUrl(key)` — Key → public URL helper (used by `createUploadUrl` output)

**Business Rules:**

- When all `R2_*` vars are set → R2 signed-URL uploads; otherwise local storage served via `GET /uploads/*` (with path-traversal guard) when `R2_PUBLIC_URL` is unset
- Content types restricted to the allowlist; 5 MB size cap; filenames sanitized (no `..`, no leading `/`)

---

## Wallet Module

**Purpose:** Marks (currency) management — balances, holds, ledger entries, and package purchases.

**Files:**

- `wallet.types.ts` — Zod schemas for ledger listing + outputs (`walletOutput`, `knowledgeBankOutput`)
- `wallet.errors.ts` — `WalletNotFoundError`, `InsufficientBalanceError`
- `wallet.repo.ts` — Atomic operations: `atomicHold`, `atomicRelease`, `atomicDeduct`, `atomicCredit`, `atomicCompensateCredit`, `atomicCompensateDeduct`, plus `insertLedger`, `findLedgerEntries`
- `wallet.service.ts` — `getOrCreate`, `hold`, `release`, `deduct`, `credit`, `compensate`, `listLedger`, `knowledgeBankEligible`, `listActivePackages`
- `wallet.handler.ts` — `get`, `listLedger`, `listPackages`, `knowledgeBankEligible`, `competitionCalendarLink`
- `wallet.router.ts` — Protected routes

**Service Methods:**

- `getOrCreate(userId)` — Gets or lazily creates wallet with 0 balance
- `hold(db, params)` — Atomically holds marks from available balance
- `release(db, params)` — Atomatically releases held marks back to available
- `deduct(db, params)` — Atomically deducts from held balance (session completion)
- `credit(db, params)` — Atomically credits available balance (payment received)
- `compensate(db, params)` — Compensation operation (positive or negative)
- `listLedger(walletId, opts)` — Paginated ledger with `bookingId` and `eventKey` filters
- `knowledgeBankEligible(userId)` — Returns `{ eligible, balance, threshold }`; **known bug B4** — uses `availableBalance` instead of total balance (`wallet.service.ts:431`); tracked U13 in `docs/plans/active/PRD-GAPS-PHASE3.md`
- `listActivePackages()` — Returns active mark packages

**Dependencies:** `WalletRepo`

**Business Rules:**

- All balance modifications are atomic (UPDATE with WHERE balance = expected)
- Every operation creates a ledger entry with unique `eventKey`
- Wallet invariant: `totalBalance = heldBalance + availableBalance`
- Idempotency via `eventKey` on ledger entries
- Insufficient available balance throws `InsufficientBalanceError`
- `hold`/`release`/`deduct`/`credit`/`compensate` are service-layer only — consumed via ports, not exposed over RPC
