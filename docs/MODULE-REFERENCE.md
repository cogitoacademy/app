# Cogito Module Reference

Last updated: 2026-08-22

Tutor invitations use the shared email provider: create sends once, **Generate & copy link** only rotates the token, and the separate **Send again** procedure rotates then explicitly delivers through Resend. Delivery failure does not roll back the valid invite.

The invite form performs an admin-only account preflight by exact normalized email. Provider facts come from Better Auth `account.providerId` rows (`google`, `credential`, or both); admin-role accounts are shown as ineligible and cannot be submitted from the UI.

## Overview

The `packages/api` package implements business logic using a 4-layer architecture: **Router → Handler → Service → Repository**. Each module lives in `packages/api/src/modules/{module}/` with these files:

Frontend dashboard integration is intentionally read-only and role-scoped: student data comes from booking/discovery/wallet, tutor data from tutor actions/profile/availability/payouts, and admin data from booking operations/tutor moderation/achievement moderation. The shared booking list keeps financial/status metadata beside participant avatars, uses the Cogito mark icon plus status-badge tooltips for compact row presentation, orders active/all rows by nearest scheduled start while keeping past/cancelled history newest-first, and defaults by role to Upcoming (student), Pending when tutor requests exist (tutor), or All (admin); an explicit `tab` query parameter wins. Booking detail activity uses transition-specific icons and a single destination-state badge for scanability, while the overview keeps format/access and participant profile/name/status information together for quick scanning and the rail surfaces available booking actions above Marks. Dashboard cards link to the existing feature routes where mutations and detailed workflows live.

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
- `achievement.handler.ts` — `list`, `listApproved`, `create`, `update`, `remove`, `adminList`, `adminReview`
- `achievement.router.ts` — Protected routes for student ops, admin routes for review, public `listApproved` route

**Service Methods:**

- `list(userId)` — Returns achievements for a user
- `listApprovedPublic()` — Returns approved + visible achievements with the owner's display name for the public landing (F16)
- `create(userId, input)` — Creates achievement in `pending` status
- `update(userId, input)` — Updates with optimistic lock check (`input.version` + `input.data`)
- `remove(userId, id, expectedVersion)` — Deletes with optimistic lock check
- `adminList(input)` — Paginated list with optional status filter
- `adminReview(id, status, adminNote?)` — Approve/reject achievement

**Dependencies:** `AchievementRepo`

**Business Rules:**

- Achievements start in `pending` status
- Only the owning student can create/update/delete their achievements
- `awardingDate` is the canonical award date; `evidenceUrl` is private verification material available only to the owner/admin workflows, while `documentationUrl` is optional public-safe documentation
- Optimistic locking prevents lost updates (`version` field)
- Admin review changes status to `approved` or `rejected`

---

## Admin Module

**Purpose:** System administration — user management, role assignment, wallet/ledger lookup, payout summaries, and active economy schedule management.

**Files:**

- `admin.types.ts` — `listUsersInput`, `setRoleInput`, `adminGetWalletInput`, `adminListLedgerEntriesInput`, `adminGetTutorPayoutsInput`, `adminUpdateEconomySettingsInput`
- `admin.errors.ts` — `UserNotFoundError`, `LastAdminError`, `OptimisticLockError`, `WalletNotFoundError`, `InvalidLedgerFilterError`, `EconomyConfigConflictError`
- `admin.repo.ts` — `findUserById`, `listUsers`, `listUserIdsByRole`, `updateUserRole`
- `admin.service.ts` — `listUsers`, `setRole`, `getWallet`, `listLedgerEntries`, `getTutorPayouts`, `getEconomySettings`, `updateEconomySettings`
- `admin.handler.ts` — `listUsers`, `setRole`, `getWallet`, `listLedgerEntries`, `getTutorPayouts`, `getEconomySettings`, `updateEconomySettings`
- `admin.router.ts` — Admin-only routes

**Service Methods:**

- `listUsers(opts)` — Paginated user list with role filter
- `setRole(userId, role, adminId)` — Changes user role; throws `LastAdminError` if removing last admin; optimistic lock via `expectedRole`; records audit log
- `getWallet({ userId })` — Returns any user's wallet balances; throws `WalletNotFoundError`
- `listLedgerEntries(input)` — Paginated ledger filtered by wallet/user, entry type, date range, or booking; `walletId` and `userId` are mutually exclusive
- `getTutorPayouts({ tutorId, dateFrom?, dateTo? })` — Delegates to the booking module's `getTutorPayouts` port
- `getEconomySettings()` — Returns the active computational Mark value and IDR schedules
- `updateEconomySettings(adminId, input)` — Optimistically updates the four Cogito take fields, records an `economy_config_updated` audit event, and affects future booking/repricing snapshots only; fan-outs one durable in-app rate-change notification to every current tutor, while identical values return the current config without a write

**Dependencies:** `AdminRepo`, `AuditPort`, `AdminWalletPort`, `BookingPayoutPort`, `EconomyService`, `NotificationPort`

**Business Rules:**

- Cannot remove the last admin role from the system
- Role changes are audit-logged
- Ledger filters must target exactly one wallet (`walletId` or `userId`, not both)
- Economy writes require the current `version`; stale writes fail with `ECONOMY_CONFIG_CONFLICT`
- Economy base and increment values are validated in Rp 5,000 increments; increments are non-negative
- Existing booking price snapshots are immutable when the active schedule changes
- Rate-change notifications are in-app system notifications for all users whose current role is `tutor`; event keys are unique per economy version and tutor
- Re-saving the same four schedule values is a no-op and does not increment the economy version, write audit, or fan out notifications

---

## Admin-Booking Module

**Purpose:** Admin operations console for bookings — filtered override queue with urgency, booking detail/history review, before/after override preview, state history, and admin refunds.

**Files:**

- `admin-booking.types.ts` — Zod schemas for override/list/state-history/admin-refund inputs
- `admin-booking.errors.ts` — `BookingNotFoundError`
- `admin-booking.repo.ts` — booking lookup, override state application, state history
- `admin-booking.service.ts` — `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`, `setMeetingLink`, `cancelSeriesSession`; exports `OVERRIDE_CATEGORIES` and `MARKS_ACTIONS`
- `admin-booking.handler.ts` — `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`, `setMeetingLink`, `cancelSeriesSession`
- `admin-booking.router.ts` — Admin-only routes

**Service Methods:**

- `listBookings(opts)` — Paginated booking list sorted by urgency, filterable by category/urgency/escalated
- `applyOverride(adminId, input)` — Force state transition by `category` (tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel); optionally adjusts held Marks (`marksAction`); records audit log + state history
- `previewOverride(input)` — Returns the projected booking state and per-participant wallet impact without persisting anything
- `getBookingStateHistory(bookingId)` — Returns full state transition history for a booking
- `adminRefund(adminId, { paymentId, reason })` — Creates a compensating ledger entry for a payment error. **In-app Marks credit only (N1, PRD §677):** no provider call, `refundRecord.amountIdr = 0`, no `providerEventId` — purchased Marks are never convertible back to rupiah.
- `setMeetingLink(adminId, { bookingId, url })` — Records a manual meeting URL on a `SCHEDULED`/`CONFIRMED` booking (U1/FR-21); notifies confirmed participants and records an `admin_set_meeting_link` audit record
- `cancelSeriesSession(adminId, { sessionId, marksAction, amount? })` — Cancels one `scheduled` series session; the per-participant session hold is released, forfeited, or partially returned per `marksAction` (U6/TC-31); records audit + participant notifications

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
- Approving published profile edits validates and applies pending `subjectIds` to the normalized tutor-subject join table in the same transaction as the profile update

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
- Email verification (G2, REVIEW-FIXES-4 P4.4): the `emailOTP` plugin sends a 6-digit OTP on sign-up (`sendVerificationOnSignUp`, 5 min expiry) via the shared email port (`setVerificationEmailSender` + `buildVerificationEmail`); `POST /api/auth/email-otp/verify-email` marks the user verified; the web `/verify-email` route collects the code

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
- `booking.router.ts` — Student-owned booking mutations use `studentProcedure`; shared booking/detail/session reads stay protected; `booking.proposeReschedule` is the student-proposer route, while `tutorActions.*` (including `proposeReschedule`) uses `tutorProcedure`

**Service Methods:**

- `getById(bookingId, userId, userRole?)` — Returns booking with access check; admins may inspect any booking. The read model derives `meetingStatus`/`meetingUrl` and includes participant profile images plus state-history fields used by the booking-detail timeline.
- `listAccessible(userId, userRole, opts)` — Shared role-aware list: proposer/participant visibility for students, assigned bookings for tutors, and all bookings for admins; cursor-paginated
- `listMine(userId, opts)` — Paginated list of user's bookings (proposer)
- `listForTutor(tutorId, opts)` — Paginated list of bookings assigned to a tutor
- `createSolo(proposerId, input)` — Creates solo booking with wallet hold, overlap check, and notification
- `createGroup(proposerId, input)` — Creates group booking with invitees
- `createSeries(proposerId, input)` — Creates a solo series booking with sessions (2-4 sessions, each checked for overlaps)
- `createGroupSeries(proposerId, input)` — Creates a group series (targetGroupSize 2-6, inviteeUserIds) with upfront per-participant holds for all sessions (FR-20, landed #46)
- `confirmInvite(userId, bookingId)` — Invitee confirms participation; holds marks
- `declineInvite(userId, bookingId, reason?)` — Invitee declines
- `reconfirm(userId, bookingId, accept)` — Participant accepts/rejects the repriced offer after repricing
- `withdraw(userId, bookingId, reason?)` — Participant withdraws; pre-H2 releases hold, post-H2 late-cancels; cancels group if below minimum; group-series (`type === "series" && targetGroupSize > 1`) is rejected with `BOOKING_SERIES_NO_OPT_OUT` (U4 no-opt-out rule)
- `cancel(userId, bookingId, reason?)` — Cancels booking; releases all holds; late cancel becomes `late_cancelled`
- `tutorAccept(bookingId, tutorId)` — Tutor accepts booking; attempts meeting creation for online bookings and schedules on success, while a provider failure leaves the booking `CONFIRMED` for scheduler retry; sets room approval for offline. The booking-detail UI confirms the scheduled date/time, modality, and attendance before invoking this method; cancel/complete actions use the same in-app confirmation pattern.
- `tutorDecline(bookingId, tutorId, reason?)` — Tutor declines; releases all holds
- `completeSession(bookingId, tutorId, sessionId?)` — Marks a session complete; deducts held marks (sessionId for series children)
- `cancelSession(userId, sessionId)` — Student cancels an individual series session (> 2h before start)
- `proposeReschedule(actorId, actorRole, bookingId, sessionId, start, reason?)` — Shared service used by the student-proposer and tutor RPC routes; proposes a fixed 90-minute replacement for one session
- `acceptReschedule(actorId, bookingId, proposalId?)` / `rejectReschedule(...)` — Records a required tutor/student vote against the active proposal; `proposalId` prevents stale UI actions from deciding a superseded proposal. Only unanimous acceptance applies the schedule, then the booking returns to its pre-proposal state; any rejection keeps the old schedule and also returns to that state.
- `addSessionNote(userId, bookingId, content)` — Adds a sanitized note to a completed session
- `getSessionNotes(userId, bookingId)` — Lists notes for a completed session
- `markTutorAttendance(bookingId, tutorId, attendance)` — Marks tutor present/late; allowed only within `[scheduledStartAt ± 15 min]` (LATENESS_TOLERANCE_MS). Marking suppresses the lateness flag — unmarked sessions are surfaced to the admin queue (`tutor_lateness_pending`), never auto-cancelled
- `markParticipantNoShow(bookingId, tutorId, participantUserId, sessionId?)` — Marks a participant as no-show 15 minutes after the session starts (U5/TC-30); forfeits the target's (per-session) hold and notifies them. Solo transitions to `no_show`; group stays live with only the target's hold forfeited and `holdAmount` recomputed (C1); series sessions keep their state so other participants are unaffected
- `listSessions(bookingId, userId)` — Lists sessions for a series booking
- `getTutorPayouts({ tutorId, dateFrom?, dateTo? })` — Aggregates completed sessions → `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }`; new IDR bookings sum tutor honorarium snapshots and legacy bookings use a compatibility fallback
- `expireBookings()` — Batch expiry job; routes to correct terminal state based on current state
- `releaseExpiredHolds()` — Transition-or-skip (M4): transitions past-deadline bookings to their terminal target (shared `EXPIRY_TARGET` with `expireBookings`) FIRST, then releases holds (or forfeits for NO_SHOW); version conflicts / terminal / RESCHEDULE_PROPOSED bookings are skipped without touching the wallet
- `checkTutorLateness()` — Flags scheduled bookings where the tutor never marked attendance past the 15-min lateness tolerance: keeps the booking SCHEDULED with holds intact, sets `overrideMeta.category = "tutor_lateness_pending"` (admin-queue surface), writes a `tutor_lateness_pending_review` audit record, and notifies proposer + tutor; returns `{ flagged, failed }` (no auto-cancel, no hold release)
- `retryFailedMeetings()` — Re-creates Google Meet for CONFIRMED online bookings with a failed meetingEvent (up to 3 attempts, driven by the `retry-failed-meetings` job); successful retry moves the booking to `SCHEDULED`, while exhausted attempts remain available for `adminBooking.setMeetingLink`

**Dependencies:** `BookingRepo`, `BookingWalletPort`, `BookingPricingPort`, `BookingAuditPort`, `BookingNotificationPort`, `BookingMeetingPort`

**Business Rules:**

- State machine enforces valid transitions via `canTransition()`
- All state transitions are recorded in `bookingStateHistory`
- Online meeting creation starts when the tutor accepts the booking after required participant confirmations. A successful provider response creates the meeting event and moves the booking to `SCHEDULED`; a failed response leaves it `CONFIRMED` until retry or manual-link intervention.
- The booking detail read model reports a meeting as `ready` only when `meetingUrl` is non-null, so a URL-less provider row is never presented as an openable link.
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
- New IDR booking snapshots copy the active economy version, tutor base/increment, tutor honorarium, Cogito take, total IDR, total Marks, and rounded pooled Marks. Later economy updates do not mutate those snapshots.
- Only `student` accounts can create bookings or perform student participant actions; tutor/admin attempts fail with `FORBIDDEN` before handlers run. The protected booking list/detail/session reads are available to authenticated parties, while admins can inspect the full booking set; tutor fulfillment remains under `tutorActions.*`.
- Group deadline repricing (B3): `expireBookings` reprices partial groups (confirmed ≥ 2 but < target) to `AWAITING_RECONFIRMATION` with a fresh 12h deadline instead of expiring (#46)
- Group-series creation (B8) and per-session post-H2 forfeit (B9) landed in #46
- Follow-ups (reconfirmation-deadline reprice, per-participant no-show, admin per-session cancel, per-session reschedule) are **implemented** — U3/U5–U7 closed by REVIEW-FIXES-3 P3.8/P5 (see `docs/plans/active/PRD-GAPS-PHASE3.md`, all U-items closed); group-series full-series withdrawal block (U4) **implemented** in REVIEW-FIXES-2 PR F (`BOOKING_SERIES_NO_OPT_OUT`)

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
- `probe()` — Boot-time connectivity probe (P4.2/X3): `calendarList.get` with a 10s timeout, logs loudly on failure (wired into the server bootstrap so a broken Google Meet swap fails at boot, not at the first booking)
- Falls back to manual link URL format when circuit breaker is open

**Business Rules:**

- Google Meet calls have 30-second timeout
- Circuit breaker: 5 failures → open for 60 seconds
- On failure, creates a `meetingEvent` record with `status: "failed"` and `errorReason`; the booking scheduler retries failed Google attempts every 5 minutes up to the configured retry budget
- Manual-link entry updates the newest meeting-attempt row, matching the booking read model's newest-row selection after multiple provider attempts
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

- `createIntent(userId, walletId, packageCode)` — Creates a purchase intent; reuses an existing PENDING intent for the same provider+user+package (returning the persisted `checkoutUrl` when available — H4, migration 0026 adds `payment_record.checkout_url`); resets FAILED/EXPIRED payments to PENDING and re-creates the intent, rotating `providerRequestId` to the new attempt while retaining the previous `providerEventId` as a stale-generation marker (re-purchase, #46; H3 wave-6b); returns `{ paymentId, providerReference, checkoutUrl }`
- `confirmFromWebhook({ provider, providerReference, providerEventId, status, ... })` — Enforces the `ALLOWED_TRANSITIONS` state machine (PENDING → PAID/SETTLED/FAILED/EXPIRED; PAID → SETTLED/REFUNDED), credits the wallet on first PAID/SETTLED, idempotent via provider event ID + DB UNIQUE; writes `payment.{id}.credited` notification (B6, #46). A late FAILED/EXPIRED terminal event on a PENDING re-purchase whose `providerEventId` equals the retained stale marker is ignored (H3 wave-6b). On REFUNDED it reads the wallet through the transaction (`getByUserId`, N4) and reverses the credited Marks from the **total balance** (`held + available`): held Marks are released (`refund.{id}.release`) then the full payment Marks are reversed via `compensate_deduct` (`refund.{id}.reverse`); when the total is below the payment marks (spent all, H4) it marks the payment REFUNDED, writes a `refund_webhook_reconciliation` audit + `refund_record` row for admin, and skips the reversal + refund notification (P2.7/H4, M1/N4 wave-6b)
- `getPurchase(paymentId, userId)` — Returns the payment record if owned by the user

**Dependencies:** `PaymentRepo`, `PaymentWalletPort`, `PaymentProvider`, `NotificationPort`, `AuditPort`, `RefundRecordPort`

**Business Rules:**

- Webhook signature verified via `verifyWebhook` (provider-specific) + timestamp window (5 min) + IP allowlist (honors `TRUST_PROXY`)
- Webhook idempotency is atomic — `IdempotencyStore.claim` keyed on the verified payload event id, released on processing failure (#46)
- Circuit breaker prevents cascading failures to the provider
- Payment statuses: `PENDING` → `PAID`/`SETTLED`/`EXPIRED`/`FAILED`/`REFUNDED`
- Payment/refund notifications are written per the PRD matrix (B6, #46); `PAYMENT_PROVIDER=xendit` requires Xendit credentials (no silent stub fallback)

---

## Economy Module

**Purpose:** Persistent singleton for the active Marks and IDR economy parameters used by pricing and admin controls.

**Files:**

- `economy.types.ts` — `EconomyParameters`, `EconomyConfigUpdate`, defaults, and singleton id
- `economy.repo.ts` — `getOrCreate`, `updateWithVersion`
- `economy.service.ts` — `getConfig`, `updateConfig`
- `economy/index.ts` — module wiring and exports

**Service Methods:**

- `getConfig(conn)` — Reads the singleton, creating the client-approved defaults if missing
- `updateConfig(conn, input)` — Validates the version and writes the active schedule with `updatedBy`

**Business Rules:**

- Computational value defaults to Rp 5,000 per Mark
- Tutor minimum base defaults to Rp 50,000; online/offline tutor increments default to Rp 30,000/Rp 40,000
- Cogito take defaults to online Rp 50,000 + Rp 20,000 per additional student and offline Rp 90,000 + Rp 40,000 per additional student
- Admin may edit only the active Cogito take fields through `admin.*`; every update is audit-logged
- The config version is copied into new economic snapshots; existing snapshots do not change

**Dependencies:** `DbType`

---

## Pricing Module

**Purpose:** Pricing validation plus IDR-to-Marks calculations; the calculation functions are pure while active configuration is read through the Economy port.

**Files:**

- `pricing.service.ts` — `computeSplit`, `validatePrices`, `validateBaseRates`, `computeEconomics`, `getEconomyConfig`

**Service Methods:**

- `computeSplit(modality, tutorPricePerStudent, headcount)` — Legacy compatibility split for profiles that still use the old Marks pricing map
- `computeEconomics(modality, baseRateIdr, headcount, config)` — Returns the IDR honorarium, IDR Cogito take, total IDR, total Marks, rounded per-student Marks, and immutable snapshot fields
- `validatePrices(prices, modality)` — Validates floor prices by modality; returns error string or null
- `validateBaseRates(baseRatesIdr, modality, config?)` — Validates minimum IDR base honorarium, supported modalities, and Rp 5,000 increments

**Dependencies:** None (pure functions)

**Business Rules:**

- New IDR economics use the active Economy config and calculate tutor honorarium and Cogito take separately
- Total IDR is converted at the configured Mark value, then Marks per student is rounded up
- `both` profile modality still requires both IDR base rates; a booking always selects online or offline
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

- `room.types.ts` — Zod schemas for list/pending-approval/create/assign/check-availability/relocate/cancel inputs
- `room.errors.ts` — `RoomNotFoundError`, `RoomBookingConflictError`
- `room.repo.ts` — room queries, pending approval lookup, room-booking insert/update/find
- `room.service.ts` — `listActive`, `listPendingApprovals`, `createRoom`, `assignRoom`, `checkAvailability`, `relocateRoom`, `cancelRoomBooking`
- `room.handler.ts` — `list`, `listPendingApprovals`, `create`, `assign`, `checkAvailability`, `relocate`, `cancelBooking`
- `room.router.ts` — `list`/`checkAvailability` protected; `listPendingApprovals`/`create`/`assign`/`relocate`/`cancelBooking` admin-only

**Service Methods:**

- `listActive()` — Returns active rooms
- `listPendingApprovals(limit?)` — Returns offline bookings in `AWAITING_ADMIN_ROOM_APPROVAL`, including bookings with no requested room row after a requested-room conflict
- `createRoom({ name, location, capacity })` — Creates a room
- `assignRoom(bookingId, roomId, startAt, endAt)` — Confirms a room for a booking with conflict check; transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED` and notifies tutor + confirmed students (#46, G14)
- `checkAvailability(roomId, startAt, endAt)` — Returns whether the room is free for the slot
- `relocateRoom(bookingId, roomId, startAt, endAt, actorId?)` — Moves a booking to a different room, freeing the previous one; transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED` (mirroring `assignRoom`, safe no-op otherwise) and notifies tutor + confirmed students (#46, H3/REVIEW-FIXES-4 P2.6)
- `cancelRoomBooking(bookingId, actorId?)` — Cancels the booking's room assignment; while awaiting approval it also delegates the booking cancellation/hold release/audit through `RoomBookingPort`, including the no-requested-room conflict case; notifies tutor + confirmed students (#46)

**Dependencies:** `RoomRepo`, `RoomNotificationPort`, `RoomBookingPort` (transition to scheduled)

**Business Rules:**

- Room bookings have status `requested`/`confirmed`/`relocated`/`cancelled`
- The admin pending-approval queue is sourced from offline bookings in `awaiting_admin_room_approval`; the requested room is optional because room creation can report a conflict and let the booking continue to admin review
- G14 (assign → scheduled + notifications) fixed in #46
- Remaining gap G13: `checkAvailability` is not yet integrated into booking creation — tracked U14 in `docs/plans/active/PRD-GAPS-PHASE3.md`

---

## Scheduler Module

**Purpose:** Background job scheduling using BullMQ for booking expiry, hold release, tutor-lateness admin-queue flagging, email outbox dispatch, and support-ticket SLA escalation.

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
- `onCheckTutorLateness()` — Calls `bookingService.checkTutorLateness()` (flags unmarked tutor-attendance sessions for admin review past the 15-min lateness tolerance, G3)
- `onSendNotificationEmail()` — Calls `notificationService.dispatchQueuedEmails(50)` (outbox consumer; #46; failed rows retried up to 3 attempts)
- `onEscalateSupportTickets()` — Calls `supportService.escalatePastSlaTickets()` (marks overdue tickets in_progress + escalated + audit; #46)
- `onRetryFailedMeetings()` — Calls `bookingService.retryFailedMeetings()` (re-schedules CONFIRMED online bookings with a failed meeting)

**Dependencies:** `BookingService`, `NotificationService`, `SupportService`, BullMQ queue

**Business Rules:**

- Expiry job every 5 min; hold-release every 10 min; lateness every 5 min; email every 60 s; SLA escalation every 15 min
- Jobs use retry with exponential backoff (3 attempts); after attempts are exhausted the job is moved to the `cogito-jobs-dlq` dead-letter queue, whose worker logs the entry and keeps a bounded Redis list (`cogito:dlq`, max 100 entries) for inspection (M4)
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

- `createTicket(userId, { category, bookingId?, description })` — Lateness/no-show categories (`tutor_late`/`tutor_no_show`) require the reporter to be a participant and the booking to have started > 15 min ago (`LATENESS_TOLERANCE_MS`); sets `slaDeadline` via `computeSlaDeadline` (OQ-04: 30 min Mon–Sat 09:00–21:00 WIB, else 4h) and auto-acknowledges the ticket to the reporter (`support.{id}.acknowledged` notification)
- `listTickets(userId, { status?, limit? })` — The user's own tickets
- `adminList({ status?, limit?, offset? })` — All tickets sorted by SLA urgency (earliest deadline first)
- `adminResolveTicket(adminId, { ticketId, resolution })` — Sets `resolved` + assignee, notifies the reporter, records an audit log; throws `SupportTicketAlreadyResolvedError` if already resolved/closed
- `escalatePastSlaTickets()` — Called by the `escalate-support-tickets` scheduler job; marks open tickets past `slaDeadline` as `in_progress` + escalated, records an audit log, and emits a `support.{id}.escalated` notification row (metadata `whatsappTarget: +6288101190195`, `escalate: true`) as the hook point a future WhatsApp adapter consumes (OQ-04; #46, P2.8)

**Dependencies:** `SupportRepo`, `SupportNotificationPort`, `SupportAuditPort`

**Business Rules:**

- Tickets start `open`; statuses `open`/`in_progress`/`resolved`/`closed`
- SLA deadline per OQ-04 (REVIEW-FIXES-4 P2.8): 30 min during business hours (Mon–Sat 09:00–21:00 WIB, UTC+7), 4 h otherwise — wall-clock rule computed by `computeSlaDeadline`
- Auto-acknowledgement notification on ticket creation (OQ-04)
- Escalation emits a `support.{id}.escalated` notification row that a future WhatsApp adapter consumes; WhatsApp itself is out of scope until an integration is approved (OQ-04)
- Lateness reports are time-gated (15 min after scheduled start)

---

## Tutor Module

**Purpose:** Tutor profile management — create, update, submit for review, availability management, and payout summaries.

**Files:**

- `tutor.types.ts` — Zod schemas for profile fields, `getMyPayoutsInput`
- `availability.types.ts` — Availability slot types (`upsert`, weekly-create, weekly-replace, delete)
- `tutor.errors.ts` — `TutorProfileNotFoundError`, `TutorNotAvailableError`, `AvailabilitySlotOverlapError`, `InvalidTutorPricingError`, `OptimisticLockError`, `InvalidDateRangeError`, `WeeklyAvailabilityRangeError`
- `tutor.repo.ts` — `findByUserId`, `create`, `update`, `upsertAvailability`
- `tutor.service.ts` — `getMyProfile`, `updateMyProfile`, `submitForReview`, `listAvailability`, `upsertAvailability`, `createWeeklyAvailability`, `replaceWeeklyAvailability`, `deleteAvailability`, `getMyPayouts`
- `tutor.handler.ts` — Maps handler context/input
- `tutor.router.ts` — Tutor-guarded routes (`tutorProcedure`)

**Service Methods:**

- `getMyProfile(userId)` — Returns tutor profile
- `updateMyProfile(userId, input)` — Updates profile fields with optimistic locking (`version`). Published profiles apply bio and availability-summary edits immediately, while trust-sensitive edits are stored as pending changes for admin review so discovery continues serving the approved values.
- `submitForReview(userId)` — Validates required fields + pricing, then sets `onboardingStatus` to `pending_review`; records audit log
- `listAvailability(userId)` — Lists the tutor's active future availability slots
- `upsertAvailability(userId, input)` — Creates/updates a slot, rejecting overlaps
- `createWeeklyAvailability(userId, input)` — Materializes weekly slots through `repeatUntil` (≤ 53 occurrences), rejecting overlaps
- `replaceWeeklyAvailability(userId, input)` — Atomically replaces future recurring occurrences from weekday/time ranges; preserves one-off overrides and skips generated occurrences they supersede
- `deleteAvailability(userId, slotId)` — Deactivates a slot (soft delete)
- `getMyPayouts(userId, { dateFrom?, dateTo? })` — Delegates to the booking module's `getTutorPayouts` port

**Dependencies:** `TutorRepo`, `TutorPricingPort`, `TutorAuditPort`, `BookingPayoutPort`

**Business Rules:**

- Only tutors with `published` status are visible in discovery
- Availability slots must be in the future and non-overlapping
- A one-off slot deactivates a conflicting recurring occurrence, making date overrides authoritative without changing other weeks
- `submitForReview` can only be called from `draft`/`changes_requested` status
- Profile updates use optimistic locking (`version`)
- New tutor pricing is stored as IDR base honoraria by modality (`baseRatesIdr`) and validated against the active economy minimum and Rp 5,000 increments; the legacy Marks map remains readable during migration
- New tutor submissions must select at least one active child subject from the normalized catalog; mother categories cannot be selected directly
- A normalized subject update replaces the tutor's join rows atomically and never accepts arbitrary legacy `expertise` strings as category ids

## Tutor Subject Taxonomy Module

**Purpose:** Maintain the editable mother/child subject catalog and normalized tutor selections.

**Files:**

- `tutor-subject.ts` (database schema) — `subject_category` hierarchy and `tutor_profile_subject` join table
- `tutor-subjects/subject-selection.ts` — selection limits, active-child validation, and public projection helpers
- `0027_subject_taxonomy.sql` — schema migration and source-informed initial catalog

**Business Rules:**

- Mother categories are the seven competition areas currently presented by Cogito Academy: Model United Nations, Public Speaking, Olympiad, World Scholar's Cup, Essay & Scientific Writing, Debate, and Business Plan
- Only active child rows are selectable by tutors; each selection belongs to exactly one mother category
- The legacy `expertise` JSON remains for compatibility with existing rows and clients, but normalized `subjectIds` drives new onboarding and discovery filters
- The onboarding and student tutor-list selectors keep normalized IDs for persistence/filtering while rendering human-readable labels; raw UUIDs are an implementation detail and must not appear in user-facing triggers

---

## Tutor Discovery Module

**Purpose:** Public taxonomy discovery plus student-only tutor search and profile viewing.

**Files:**

- `discovery.types.ts` — Zod schemas for taxonomy listing and search filters
- `discovery.errors.ts` — `TutorNotFoundError`
- `discovery.repo.ts` — `listSubjects`, `listPublished`, `findByUserId`
- `discovery.service.ts` — `listSubjects()`, `listPublished(filters)`, `getProfile(userId)`, active Marks price projection
- `discovery.handler.ts` — Maps handler context/input
- `discovery.router.ts` — Public `listSubjects` plus student-only tutor routes

**Service Methods:**

- `listSubjects()` — Returns active mother categories grouped with active child subjects
- `listPublished(filters)` — Paginated list of published tutor profiles with category, child-subject, legacy expertise, and modality filters; `categoryIds` and `subjectIds` are ORed within each facet, combined as an AND across facets, and enforced through one correlated normalized subject-existence check that returns no rows when there is no match
- `getProfile(userId)` — Returns full tutor profile and future availability
- IDR profiles receive `pricesByModality` Marks maps computed from the active economy config; legacy profiles keep their stored Marks map and no student discovery response exposes the tutor's IDR base honorarium
- Frontend filter selects normalize displayed objects back to primitive category/subject ID arrays or modality values before calling `listPublished`; empty arrays represent the corresponding “All” option, child-subject options are the union of the selected mother categories, and the query is debounced by 300 ms.

**Dependencies:** `DiscoveryRepo`, `PricingPort`

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
- `knowledgeBankEligible(userId)` — Returns `{ eligible, balance, threshold }`; eligibility and `balance` use the **total balance** (held Marks count toward the 35-Mark threshold, PRD DL-16 / U13)
- `listActivePackages()` — Returns active mark packages

**Dependencies:** `WalletRepo`

**Business Rules:**

- All balance modifications are atomic (UPDATE with WHERE balance = expected)
- Every operation creates a ledger entry with unique `eventKey`
- Wallet invariant: `totalBalance = heldBalance + availableBalance`
- Idempotency via `eventKey` on ledger entries
- Insufficient available balance throws `InsufficientBalanceError`
- `hold`/`release`/`deduct`/`credit`/`compensate` are service-layer only — consumed via ports, not exposed over RPC
