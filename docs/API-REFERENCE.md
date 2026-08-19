# Cogito API Reference

Last updated: 2026-08-19

## Overview

All API endpoints use **POST** method (oRPC convention). Auth is via session cookies (Better Auth). Base path: `/rpc/{namespace}/{method}` — the path segments are the oRPC procedure keys (e.g. `POST /rpc/auth/me`, `POST /rpc/payment/createPurchase`; not the dotted identifiers used as section headers below). Request bodies must be wrapped in the `{"json": <input>}` protocol envelope. Responses are wrapped as `{"json": <data>, "meta": [...]}`.

The web dashboard has no aggregate endpoint. Its role-specific views compose existing procedures: student (`booking.listMine`, `tutors.listPublished`, `wallet.get`), tutor (`tutorActions.listBookings`, `tutor.listAvailability`, `tutor.getMyProfile`, `tutor.getMyPayouts`), and admin (`adminBooking.listBookings`, `adminTutor.listTutorProfiles`, `achievement.adminList`).

### Auth Levels

| Level       | Description                                           |
| ----------- | ----------------------------------------------------- |
| `public`    | No auth required                                      |
| `protected` | Requires authenticated session                        |
| `student`   | Requires authenticated session with `role: "student"` |
| `admin`     | Requires authenticated session with `role: "admin"`   |
| `tutor`     | Requires authenticated session with `role: "tutor"`   |

---

## System

### `healthCheck`

- **Auth:** Public
- **Input:** None
- **Output:** `"OK"`
- **Description:** Returns OK if server is running

---

## Auth (`auth.*`)

### `auth.me`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ user, profile, tutorProfile?, wallet }`
- **Description:** Returns current user with profile and wallet (lazily creates wallet)

### `auth.getProfile`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ user, profile, tutorProfile }`
- **Description:** Returns user profile

### `auth.updateProfile`

- **Auth:** Protected
- **Input:** `{ phoneNumber?, schoolName?, gradeLevel?, parentName?, parentPhone?, parentEmail? }`
- **Output:** `{ user, profile }`
- **Description:** Creates or updates the authenticated user's student profile fields
- **Account identity:** The student profile page also uses Better Auth `updateUser` to update the signed-in user's `name` and optional `image`; email remains read-only on this surface.

### `auth.searchStudents`

- **Auth:** Protected
- **Input:** `{ query, limit? }` (`query` 2–100 chars, `limit` 1–10 default 5)
- **Output:** `[{ id, name, email }]` — up to 10 students matching a name or email, excluding the requester
- **Description:** Debounced student lookup used by the group-booking invite UI

---

## Password Reset (Better Auth — `/api/auth/*`)

Not part of the oRPC namespace. Mounted under `/api/auth` on the Elysia server.

### `POST /api/auth/request-password-reset`

- **Auth:** Public
- **Input:** `{ email, redirectTo? }`
- **Output:** `200 { status: true }` — identical for known and unknown emails (no enumeration)
- **Description:** Sends a reset email (category `auth`, via `setAuthEmailSender`). Link = `{BETTER_AUTH_URL}/reset-password/{token}?callbackURL={redirectTo}`. Rate-limited (10/min per IP, same limiter as other auth endpoints). Token valid 1 hour.

### `GET /api/auth/reset-password/{token}`

- **Auth:** Public
- **Description:** Validates token, redirects to `callbackURL?token=<token>` or `callbackURL?error=INVALID_TOKEN`.

### `POST /api/auth/reset-password`

- **Auth:** Public
- **Input:** `{ newPassword, token }`
- **Description:** Sets new password. Revokes all existing sessions (`revokeSessionsOnPasswordReset: true`). Used tokens are invalidated (replay fails).

### Frontend routes

- `/forgot-password` — email request form (always shows success state after submit)
- `/reset-password` — token entry + new password form; renders invalid/expired state on `error=INVALID_TOKEN`

---

## Admin (`admin.*`)

### `admin.listUsers`

- **Auth:** Admin
- **Input:** `{ limit?, offset? }` (`limit` default 50)
- **Output:** `{ users: User[], total, limit, offset }`
- **Description:** Paginated user list

### `admin.setRole`

- **Auth:** Admin
- **Input:** `{ userId, role, expectedRole }`
- **Output:** `{ user }`
- **Errors:** `USER_NOT_FOUND` (404), `LAST_ADMIN` (409), `OPTIMISTIC_LOCK` (409)
- **Description:** Changes user role; prevents removing last admin; optimistic lock via `expectedRole`

### `admin.getWallet`

- **Auth:** Admin
- **Input:** `{ userId }`
- **Output:** `{ id, totalBalance, heldBalance, availableBalance }`
- **Errors:** `WALLET_NOT_FOUND` (404)
- **Description:** Returns any user's Marks wallet (G9)

### `admin.listLedgerEntries`

- **Auth:** Admin
- **Input:** `{ walletId?|userId?, limit?, cursor?, bookingId?, entryType?, dateFrom?, dateTo? }` (`entryType` one of credit/hold/release/deduct/compensate_credit/compensate_deduct)
- **Output:** `{ items: LedgerEntry[], nextCursor }`
- **Errors:** `INVALID_LEDGER_FILTER` (400) — walletId and userId are mutually exclusive; exactly one required
- **Description:** Paginated ledger for any wallet, filterable by type, date range, or booking

### `admin.getTutorPayouts`

- **Auth:** Admin
- **Input:** `{ tutorId, dateFrom?, dateTo? }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }` (`tutorPayoutIdr` at 7,000 IDR/Mark)
- **Errors:** `INVALID_LEDGER_FILTER` (400) — invalid date
- **Description:** Tutor payout summary from completed bookings in a date range

---

## Admin Tutor (`adminTutor.*`)

### `adminTutor.inspectInvitee`

- **Auth:** Admin
- **Input:** `{ email }`
- **Output:** `{ exists, email, name, role, providers, hasGoogle, hasPassword }`
- **Description:** Checks whether an invite email already belongs to a Better Auth user and reports linked authentication providers for clear admin guidance

### `adminTutor.createInvite`

- **Auth:** Admin
- **Input:** `{ email, displayName, internalNotes? }`
- **Output:** `{ invite }`
- **Description:** Creates a tutor invite with a unique token and sends the branded tutor-onboarding email with an account-email reminder, UTC expiry, primary claim CTA, and fallback URL

### `adminTutor.listInvites`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Invite[], total, limit, offset }`

### `adminTutor.resendInvite`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** `{ invite }`
- **Description:** Regenerates token and expiry for manual copy (invalidates the previous token); does not send email

### `adminTutor.sendInviteAgain`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** Invite row with a new one-time plaintext token and `emailDelivery` (`sent`/`skipped`/`failed`)
- **Description:** Explicitly rotates the invite link and sends the replacement through Resend

### `adminTutor.revokeInvite`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** `{ invite }`

### `adminTutor.listTutorProfiles`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: TutorProfile[], total, limit, offset }`

### `adminTutor.reviewTutorProfile`

- **Auth:** Admin
- **Input:** `{ tutorProfileId, action, adminNote? }` (`action` one of request_changes/approve_unpublished/publish/unpublish/suspend)
- **Output:** `{ profile }`

---

## Tutor (`tutor.*`)

### `tutor.getMyProfile`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ profile }`
- **Description:** Returns the authenticated tutor's profile

### `tutor.updateMyProfile`

- **Auth:** Tutor
- **Input:** `{ version, displayName?, shortBio?, credentialsSummary?, expertise?, modality?, prices?, availabilitySummary?, proofUrls? }`
- **Output:** `{ profile }`
- **Errors:** `OPTIMISTIC_LOCK` (409) on version mismatch, `INVALID_TUTOR_PRICING` (400) on floor-price violation
- **Description:** Updates the draft tutor profile; optimistic lock via `version`

### `tutor.submitForReview`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ profile }`
- **Description:** Submits a draft profile for admin review

### `tutor.listAvailability`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ items: AvailabilitySlot[] }`
- **Description:** Lists the tutor's active future availability slots

### `tutor.upsertAvailability`

- **Auth:** Tutor
- **Input:** `{ id?, startDate, endDate, modality, isRecurring?, recurrenceRule?, isActive? }`
- **Output:** `{ slot }`
- **Errors:** `AVAILABILITY_SLOT_OVERLAP` (409)
- **Description:** Creates or updates a single availability window

### `tutor.createWeeklyAvailability`

- **Auth:** Tutor
- **Input:** `{ startDate, endDate, repeatUntil, modality }`
- **Output:** `{ slots: AvailabilitySlot[] }`
- **Errors:** `WEEKLY_AVAILABILITY_RANGE` (400) if > 53 occurrences, `AVAILABILITY_SLOT_OVERLAP` (409)
- **Description:** Materializes weekly windows from `startDate` through `repeatUntil`

### `tutor.replaceWeeklyAvailability`

- **RPC path:** `/rpc/tutor/replaceWeeklyAvailability`
- **Auth:** Tutor
- **Input:** `{ effectiveFrom, repeatUntil, ranges: [{ dayOfWeek, startTime, endTime, modality }] }` (`dayOfWeek` 0–6, times use 24-hour `HH:mm`, max 21 weekly ranges, range up to 52 weeks)
- **Output:** `AvailabilitySlot[]`
- **Errors:** `AVAILABILITY_SLOT_OVERLAP` (409) for overlapping weekly ranges
- **Description:** Atomically deactivates future recurring windows from `effectiveFrom` and regenerates them from weekly hours. One-off date overrides are preserved and take priority over conflicting generated occurrences.

### `tutor.deleteAvailability`

- **Auth:** Tutor
- **Input:** `{ id }`
- **Output:** None (void)
- **Description:** Deactivates (soft-deletes) an availability slot

### `tutor.getMyPayouts`

- **Auth:** Tutor
- **Input:** `{ dateFrom?, dateTo? }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }`
- **Errors:** `INVALID_DATE_RANGE` (400)
- **Description:** The authenticated tutor's payout summary from completed bookings

---

## Tutor Discovery (`tutors.*`)

### `tutors.listPublished`

- **Auth:** Student
- **Input:** `{ search?, expertise?, modality?, limit?, offset? }` (`limit` default 20, max 50)
- **Output:** `{ items: TutorProfile[], total, limit, offset }`

### `tutors.getProfile`

- **Auth:** Student
- **Input:** `{ tutorId }`
- **Output:** `{ profile }`

---

## Invite (`invite.*`)

### `invite.verify`

- **Auth:** Public
- **Input:** `{ token }`
- **Output:** `{ invite }`
- **Description:** Returns invite details without claiming

### `invite.claim`

- **Auth:** Protected
- **Input:** `{ token }`
- **Output:** `{ profile }`
- **Errors:** `INVITE_NOT_FOUND` (404), `INVITE_EMAIL_MISMATCH` (400), `PROFILE_ALREADY_EXISTS` (409)
- **Description:** Claims the invite using the signed-in user's email and creates a tutor profile in `onboarding` status

---

## Achievement (`achievement.*`)

### `achievement.listApproved`

- **RPC path:** `/rpc/achievements/listApproved`
- **Auth:** Public
- **Input:** None
- **Output:** `{ items: Achievement[] }` — approved + visible achievements with the owner's `displayName` attached (public landing, F16)
- **Description:** Returns approved and visible achievements for the public landing page; rejected/pending achievements are never exposed

### `achievement.list`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ items: Achievement[] }`

### `achievement.create`

- **Auth:** Protected
- **Input:** `{ eventName, category, award, level, awardingDate?, location?, description?, subjects?, evidenceUrl?, documentationUrl? }`
- **Output:** `{ achievement }`
- **Description:** Submits a new achievement in `pending` status

### `achievement.update`

- **Auth:** Protected
- **Input:** `{ id, version, data: { ...achievementFields } }`
- **Output:** `{ achievement }`
- **Description:** Updates a pending achievement; optimistic locking via `version`

### `achievement.delete`

- **Auth:** Protected
- **Input:** `{ id, version }`
- **Output:** `{ deleted }`
- **Description:** Deletes a pending achievement; optimistic locking via `version`

### `achievement.adminList`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Achievement[], total, limit, offset }`

### `achievement.adminReview`

- **Auth:** Admin
- **Input:** `{ achievementId, status, adminNote? }` (`status` one of `approved`/`rejected`)
- **Output:** `{ achievement }`

---

## Wallet (`wallet.*`)

### `wallet.get`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ id, totalBalance, heldBalance, availableBalance }`
- **Description:** Returns the authenticated user's wallet (lazily created)

### `wallet.listLedger`

- **Auth:** Protected
- **Input:** `{ cursor?, limit?, bookingId?, eventKey? }`
- **Output:** `{ items: LedgerEntry[], nextCursor }`

### `wallet.listPackages`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ packages: MarkPackage[] }`
- **Description:** Returns active purchasable mark packages

### `wallet.knowledgeBankEligible`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ eligible, balance, threshold }`
- **Description:** Checks Knowledge Bank gating (min balance threshold); eligibility and `balance` use the **total balance** (held Marks count toward the 35-Mark threshold, per PRD DL-16 / U13). No Marks are deducted.

### `wallet.competitionCalendarLink`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ url }`
- **Description:** Returns the external competition-calendar link

> Note: `hold`/`release`/`deduct`/`credit`/`compensate` are service-layer methods only — they are not exposed over RPC; other modules call them via consumer-driven ports.

---

## Payment (`payment.*`)

### `payment.createPurchase`

- **Auth:** Protected
- **Input:** `{ packageCode }`
- **Output:** `{ paymentId, providerReference, checkoutUrl }`
- **Errors:** `PACKAGE_NOT_FOUND` (404), `PACKAGE_ALREADY_PURCHASED` (409), `PAYMENT_PROVIDER_ERROR` (502)
- **Description:** Creates a purchase intent with the payment provider (reuses a pending intent; resets FAILED/EXPIRED payments to PENDING and re-creates the checkout — re-purchase, #46); on success the webhook credits the wallet

### `payment.getPurchase`

- **Auth:** Protected
- **Input:** `{ paymentId }`
- **Output:** `{ id, status, provider, providerReference, amountIdr, marks, receiptUrl, failureReason, createdAt }`
- **Errors:** `PAYMENT_NOT_FOUND` (404)
- **Description:** Returns the payment record if owned by the requesting user

### `POST /webhooks/payments/:provider` (external)

- **Auth:** Public (non-oRPC route)
- **Input:** Raw body; headers `x-callback-token` (xendit) / `x-webhook-signature`, `x-event-id`, `x-timestamp` (timestamp validation is **skipped for xendit** — the API documents only `x-callback-token`, P3.5/L4)
- **Output:** `{ ok: true }`
- **Errors:** 401 signature failure, 408 stale timestamp (> 5 min, non-xendit), 403 IP not allowlisted, 500 processing failure
- **Description:** Provider webhook; verifies signature, validates timestamp (provider-conditional), then atomically claims the idempotency key (keyed on the verified payload's event id — released on processing failure), calls `payment.confirmFromWebhook`, and updates payment status (`PENDING → PAID/SETTLED/FAILED/EXPIRED`; `PAID/SETTLED → REFUNDED`); credits the wallet on PAID/SETTLED and writes the payment notification (#46). Xendit idempotency keys are derived from `data.payment_id ?? data.payment_request_id` (2024-11-11 webhooks carry no `event_id` — P3.4). On re-purchase after FAILED/EXPIRED the `providerRequestId` is rotated to the new attempt while the previous `providerEventId` is retained as a stale-generation marker: a late FAILED/EXPIRED webhook for the OLD attempt is ignored so it cannot flip the re-purchased PENDING row terminal and strand the new purchase's credit (H3, wave-6b). A REFUNDED webhook reads the wallet through the transaction (`wallet.getByUserId(tx, ...)`, N4) and reverses the credited Marks from the **total balance** (`held + available`): held Marks are released back to available (`refund.{id}.release`) then the full payment Marks are reversed via `compensate_deduct` (`refund.{id}.reverse`) when total ≥ marks; if the Marks were already spent (`totalBalance < marks`, H4), the payment is still marked REFUNDED and a `refund_webhook_reconciliation` audit + `refund_record` row are written for admin (no reversal, no throw, no 500/retry loop — P2.7/H4, M1/N4 wave-6b)

### Provider refunds (X1, P3.6 — superseded by N1, 2026-08-19)

- ~~`adminRefund` initiates a provider-side refund via the active provider's `refund(paymentRequestId, amountIdr, reason?)` — Xendit `POST /v3/refunds` (`{payment_request_id, currency, amount, reason}` → `{id}`), stub returns `rfd-stub-{paymentRequestId}`. The provider refund is **best-effort**: a provider failure is logged and never rolls back the Marks reversal. The returned refund id is stored on `refund_record.provider_event_id`.~~ **REMOVED (N1):** `adminRefund` no longer calls the payment provider at all — admin refunds are in-app Marks credits only (PRD §677: purchased Marks are never convertible back to rupiah). `refund_record.amount_idr` is `0` and `provider_event_id` is `NULL` for admin refunds. The provider `refund()` port (Xendit `POST /v3/refunds`, migration 0025 `payment_record.provider_request_id`) remains on the provider/payment service for a future payment-error-only cash-refund flow, but `adminRefund` must never invoke it.

---

## Booking (`booking.*`)

### `booking.createSolo`

- **Auth:** Student
- **Input:** `{ tutorId, availabilitySlotId, modality, scheduledStartAt, timezone?, learningGoal }` (`scheduledStartAt` must leave room for the server-fixed 90-minute session inside the availability window; `timezone` default `Asia/Jakarta`)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400), `BOOKING_CONFLICT` (409), `INSUFFICIENT_MARKS` (400)
- **Description:** Creates a solo booking and holds Marks; idempotency via `idempotency-key` header

### `booking.get`

- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ booking, participants, history }` — ownership-checked
- **Errors:** `BOOKING_NOT_FOUND` (404)

### `booking.listMine`

- **Auth:** Student
- **Input:** `{ cursor?, limit?, states? }`
- **Output:** `{ items: Booking[], nextCursor }`
- **Description:** Returns bookings where the user is proposer

### `booking.cancel`

- **Auth:** Student
- **Input:** `{ bookingId, cancellationReason? }`
- **Output:** `{ booking }`
- **Description:** Cancels booking and releases held Marks; late cancel within H-2 becomes `late_cancelled`

### `booking.acceptReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Records one acceptance on the active proposal. Partial acceptance does not change the schedule; unanimous tutor + active-student acceptance applies the proposed 90-minute time and restores the booking state that was active before the proposal.

### `booking.getRescheduleAvailability`

- **RPC path:** `/rpc/booking/getRescheduleAvailability`
- **Auth:** Protected; booking tutor, proposer, or participant
- **Input:** `{ bookingId }`
- **Output:** `AvailabilitySlot[]`
- **Description:** Returns active tutor availability for the booking-scoped reschedule picker. Access is checked against the booking rather than tutor discovery visibility.

### `booking.rejectReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Rejects the active proposal, preserves the original schedule, and restores the booking state that was active before the proposal

### `booking.proposeReschedule`

- **Auth:** Student (booking proposer)
- **Input:** `{ bookingId, sessionId?, proposedStartAt, reason? }`
- **Output:** `{ booking }`
- **Description:** Proposes a new fixed 90-minute time for one booking session; proposals expire after 24 hours and require tutor plus all active-student approval

### `booking.cancelSession`

- **Auth:** Student (proposer)
- **Input:** `{ sessionId }`
- **Output:** `{ booking }`
- **Description:** Student cancels an individual series session; pre-H-2 releases the session hold, post-H-2 forfeits it (per-session penalty, #46). Group-series sessions cannot be cancelled (no opt-out)

### `booking.addSessionNote`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId, content }` (`content` max 10,000 chars, sanitized)
- **Output:** `{ note }`
- **Description:** Adds a note to a completed session

### `booking.getSessionNotes`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId }`
- **Output:** `{ items: SessionNote[] }`
- **Description:** Lists notes for a completed session

### `booking.createGroup`

- **Auth:** Student
- **Input:** `{ tutorId, availabilitySlotId, modality, targetGroupSize, inviteeUserIds, scheduledStartAt, timezone?, learningGoal }` (`targetGroupSize` 2–6, `inviteeUserIds` 1–5; duration is server-fixed to 90 minutes)
- **Output:** `{ booking }`
- **Description:** Creates a group booking, holds proposer Marks, invites participants; idempotency via `idempotency-key` header

### `booking.createSeries`

- **Auth:** Student
- **Input:** `{ tutorId, availabilitySlotId, modality, sessions: [{ availabilitySlotId, scheduledStartAt }], timezone?, learningGoal }` (2–4 sessions; each session is fixed to 90 minutes)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400) if sessions < 2 or > 4
- **Description:** Creates a multi-session solo series booking

### `booking.createGroupSeries`

- **Auth:** Student
- **Input:** `{ tutorId, availabilitySlotId, modality, sessions: [...], targetGroupSize, inviteeUserIds, timezone? }` (`targetGroupSize` 2–6, `inviteeUserIds` 1–5, sessions 2–4)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400), `USER_NOT_FOUND` (400) for unknown invitees
- **Description:** Creates a group series with upfront per-participant holds for all sessions (FR-20, #46); invitees accept/decline the full-series package via `booking.confirmInvite`/`booking.declineInvite`

### `booking.confirmInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId }`
- **Output:** `{ confirmedHeadcount, targetGroupSize }`
- **Description:** Invitee confirms participation and holds Marks

### `booking.declineInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ declined: true }`

### `booking.reconfirm`

- **Auth:** Student (participant)
- **Input:** `{ bookingId, accept }`
- **Output:** `{ reconfirmed: boolean }`
- **Description:** Participant accepts or rejects the repriced offer

### `booking.withdraw`

- **Auth:** Student (participant)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ withdrawn: true, late: boolean }`
- **Description:** Participant withdraws; pre-H-2 releases held Marks, post-H-2 late-cancels. Group-series bookings (`type: "series"` with `targetGroupSize > 1`) are rejected with `CONFLICT` (`BOOKING_SERIES_NO_OPT_OUT`) — no opt-out from the series (U4)

### `booking.listSessions`

- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ sessions: BookingSession[] }`
- **Errors:** `BOOKING_NOT_EDITABLE` if not a series

---

## Tutor Actions (`tutorActions.*`)

### `tutorActions.listBookings`

- **RPC path:** `/rpc/tutor/booking/list`
- **Auth:** Tutor
- **Input:** `{ cursor?, limit?, states? }`
- **Output:** `{ items: Booking[], nextCursor }`
- **Description:** Returns bookings assigned to the signed-in tutor

### `tutorActions.proposeReschedule`

- **RPC path:** `/rpc/tutor/booking/reschedule/propose`
- **Auth:** Tutor
- **Input:** `{ bookingId, sessionId?, proposedStartAt, reason? }`
- **Output:** `{ booking }`
- **Description:** Tutor proposes a new fixed 90-minute time for one session; tutor proposals may be outside the original availability window and require every active student's acceptance

### `tutorActions.acceptBooking`

- **RPC path:** `/rpc/tutor/booking/accept`
- **Auth:** Tutor
- **Input:** `{ bookingId }`
- **Output:** `{ booking, isOffline }`
- **Description:** Tutor accepts a solo booking; online goes `scheduled` (creates meeting), offline goes `awaiting_admin_room_approval`

### `tutorActions.declineBooking`

- **RPC path:** `/rpc/tutor/booking/decline`
- **Auth:** Tutor
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ booking }`
- **Description:** Tutor declines a booking and releases held Marks

### `tutorActions.completeSession`

- **RPC path:** `/rpc/tutor/booking/complete`
- **Auth:** Tutor
- **Input:** `{ bookingId, sessionId? }` (`sessionId` required for series child sessions)
- **Output:** `{ booking }`
- **Description:** Marks a scheduled session completed and deducts held Marks

### `tutorActions.markAttendance`

- **RPC path:** `/rpc/tutor/booking/mark-attendance`
- **Auth:** Tutor
- **Input:** `{ bookingId, attendance }` (`attendance` one of `present`/`late`)
- **Output:** `{ bookingId, attendanceState }`
- **Description:** Marks tutor attendance; only allowed within ±15 minutes of the scheduled start (`BookingNotEditableError` otherwise, so tutors can't pre-mark to dodge lateness). There is no auto-cancel: an unmarked session is instead surfaced to the admin queue via `adminBooking.listBookings({ category: "tutor_lateness_pending" })`.

### `tutorActions.markParticipantNoShow`

- **RPC path:** `/rpc/tutor/booking/mark-participant-no-show`
- **Auth:** Tutor
- **Input:** `{ bookingId, participantUserId, sessionId? }` (`sessionId` required for series child sessions)
- **Output:** `{ bookingId, participantUserId, sessionId, forfeitedMarks }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400) before start+15 min, `BOOKING_STATE_TRANSITION` (409) if not `scheduled`
- **Description:** Marks a participant as no-show 15 minutes after the session starts (U5/TC-30); their session hold is forfeited. A solo booking transitions to `no_show`; a group booking stays live and only the target's hold is forfeited (C1); a series session keeps its state so other participants are unaffected.

---

## Room (`room.*`)

### `room.list`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ items: Room[] }` — active rooms
- **Description:** Lists active rooms for offline scheduling

### `room.create`

- **Auth:** Admin
- **Input:** `{ name, location, capacity }`
- **Output:** `{ room }`

### `room.assign`

- **Auth:** Admin
- **Input:** `{ bookingId, roomId, startAt, endAt }`
- **Output:** `{ roomBooking }`
- **Description:** Confirms a room for an offline booking and transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED`; notifies tutor + confirmed students (G14, #46)

### `room.checkAvailability`

- **Auth:** Protected
- **Input:** `{ roomId, startAt, endAt }`
- **Output:** `{ available: boolean }`
- **Description:** Returns whether a room is free for a time slot; **known gap G13** — not yet integrated into booking creation (tracked U14 in `docs/plans/active/PRD-GAPS-PHASE3.md`)

### `room.relocate`

- **Auth:** Admin
- **Input:** `{ bookingId, roomId, startAt, endAt }`
- **Output:** `{ roomBooking }`
- **Description:** Moves a booking to a different room, freeing the previous one

### `room.cancelBooking`

- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ cancelled: true }`
- **Description:** Cancels a booking's room assignment; the booking continues without a room

---

## Notification (`notification.*`)

### `notification.list`

- **Auth:** Protected
- **Input:** `{ unreadOnly?, limit?, cursor? }`
- **Output:** `{ items: Notification[], nextCursor }`

### `notification.getUnreadCount`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ count }`
- **Description:** Returns the number of unread notifications for the user

### `notification.markAsRead`

- **Auth:** Protected
- **Input:** `{ id }`
- **Output:** `{ notification }`

### `notification.markAllAsRead`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ count }`

---

## Admin Booking (`adminBooking.*`)

### `adminBooking.applyOverride`

- **Auth:** Admin
- **Input:** `{ bookingId, category, reason, affectedParticipants?, marksAction?, userNote?, internalNote? }` (`category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel; `marksAction` one of release_holds/compensate_credit/compensate_deduct)
- **Output:** `{ booking }` — the updated booking
- **Errors:** `BOOKING_NOT_FOUND` (404), terminal-state override rejected
- **Description:** Force state transition bypassing the state machine; optionally adjusts held Marks per participant; records audit log + state history + participant notification

### `adminBooking.previewOverride`

- **Auth:** Admin
- **Input:** Same as `applyOverride`
- **Output:** `{ bookingId, currentState, projectedState, affectedParticipants, marksAction, perParticipantImpact }` — no persistence
- **Description:** Returns the projected booking state and per-participant wallet impact before applying

### `adminBooking.listBookings`

- **Auth:** Admin
- **Input:** `{ bookingId?, limit?, cursor?, category?, urgency?, escalated? }` (`category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel/tutor_lateness_pending — `tutor_lateness_pending` lists sessions flagged by the lateness sweep for admin review)
- **Output:** `{ items: Booking[], nextCursor }`
- **Description:** Paginated booking list sorted by urgency

### `adminBooking.getBookingStateHistory`

- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ items: BookingStateHistory[] }`
- **Description:** Returns full state transition history for a booking

### `adminBooking.adminRefund`

- **Auth:** Admin
- **Input:** `{ paymentId, reason }`
- **Output:** `{ correction }`
- **Description:** Issues a compensating ledger entry for a payment error. **In-app Marks credit only (N1, PRD §677):** credits the payer's wallet with the spend-adjusted refundable Marks, marks the payment REFUNDED, and writes a `refund_record` with `amount_idr = 0` and no `provider_event_id`. The payment provider is **never** called (purchased Marks are not convertible back to rupiah; no cash moves). Errors: `BOOKING_NOT_FOUND` (404) for unknown payment/wallet, `INVALID_REFUND_STATE` (400) unless the payment is PAID/SETTLED, `REFUND_SPEND_EXHAUSTED` for fully-spent payments.

### `adminBooking.setMeetingLink`

- **RPC path:** `/rpc/admin/booking/setMeetingLink`
- **Auth:** Admin
- **Input:** `{ bookingId, url }` (`url` must be a valid URL, max 2048 chars)
- **Output:** `{ bookingId, meetingUrl, status }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400) unless the booking is `SCHEDULED`/`CONFIRMED`
- **Description:** Records a manual meeting URL on a booking as fallback when Google Meet generation failed or is disabled (U1/FR-21); notifies confirmed participants and writes an `admin_set_meeting_link` audit record

### `adminBooking.cancelSeriesSession`

- **RPC path:** `/rpc/admin/booking/cancel-series-session`
- **Auth:** Admin
- **Input:** `{ sessionId, marksAction, amount? }` (`marksAction` one of `release`/`forfeit`/`partial`; `amount` required when `partial`, max 1000)
- **Output:** `{ sessionId, currentState: "cancelled", marksAction, affectedParticipants }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_STATE_TRANSITION` (409) if the session is not `scheduled`
- **Description:** Cancels a single series session; the session hold is released, forfeited, or partially returned per `marksAction` (U6/TC-31); records audit + participant notifications

---

## Refund (`refund.*`)

### `refund.createCorrection`

- **Auth:** Admin
- **Input:** `{ walletId, amount, type, reason, bookingId? }` (`type` one of `compensate_credit`/`compensate_deduct`, `amount` > 0)
- **Output:** `{ walletId, type, amount }`
- **Errors:** `WALLET_NOT_FOUND` (404)
- **Description:** Admin-only: creates a compensating ledger entry for wallet corrections; records a `refund_record` + audit log

### `refund.listCorrections`

- **Auth:** Admin
- **Input:** `{ walletId, limit?, cursor? }`
- **Output:** `{ items: LedgerEntry[], nextCursor }` — only `compensate_credit`/`compensate_deduct` entries

---

## Support (`support.*`)

### `support.createTicket`

- **Auth:** Protected
- **Input:** `{ category, bookingId?, description }` (`category` one of tutor_late/tutor_no_show/technical/payment/other; `description` max 2,000 chars)
- **Output:** `{ ticket }`
- **Errors:** `SUPPORT_BOOKING_ACCESS` (400) — lateness categories require the reporter to be a participant; `LATENESS_REPORT_TOO_EARLY` (400) — booking must have started > 15 min ago
- **Description:** Reports a tutoring lateness/no-show or another issue; lateness/no-show categories require an associated booking started > 15 minutes ago

### `support.listTickets`

- **Auth:** Protected
- **Input:** `{ status?, limit? }`
- **Output:** `{ items: Ticket[] }`
- **Description:** Returns the authenticated user's support tickets

### `support.adminListTickets`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Ticket[], total, limit, offset }`
- **Description:** Returns all support tickets sorted by SLA urgency (earliest deadline first)

### `support.adminResolveTicket`

- **Auth:** Admin
- **Input:** `{ ticketId, resolution }` (`resolution` max 2,000 chars)
- **Output:** `{ ticket }`
- **Errors:** `SUPPORT_TICKET_NOT_FOUND` (404), `SUPPORT_TICKET_ALREADY_RESOLVED` (409)
- **Description:** Resolves a ticket, assigns the admin, notifies the reporter, and records an audit log

> SLA auto-escalation: the `escalate-support-tickets` scheduler job (15 min) marks open tickets past `slaDeadline` as `in_progress` + escalated (OQ-04 in-app part, #46). Business-hours SLA windows (30 min / 4 h) + WhatsApp escalation tracked U9 in `PRD-GAPS-PHASE3.md`.

---

## Upload (`upload.*`)

### `upload.createUploadUrl`

- **Auth:** Protected
- **Input:** `{ filename, contentType }` (`contentType` one of `image/png`/`image/jpeg`/`image/webp`/`image/gif`/`application/pdf`; `filename` max 255 chars, no `..`/leading `/`)
- **Output:** `{ uploadUrl, key, publicUrl, contentType, maxBytes, method, fields }` (`maxBytes` 5 MB; `method: "POST"`; `fields` carries the S3/R2 presigned-POST policy fields — or is `{}` in local mode)
- **Errors:** `INVALID_CONTENT_TYPE` (400), `INVALID_FILENAME` (400)
- **Description:** Returns a presigned POST URL (Cloudflare R2, size-bounded via `content-length-range` in the policy) or a local URL (dev, `POST /uploads/*` with a session) for uploading a file; uploaded objects are referenced by `key`/`publicUrl` (e.g. private achievement `evidenceUrl`, public `documentationUrl`, or user avatar). Local files are served via `GET /uploads/*` when `R2_PUBLIC_URL` is unset
