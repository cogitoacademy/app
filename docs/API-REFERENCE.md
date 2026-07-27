# Cogito API Reference

Last updated: 2026-07-28

## Overview

All API endpoints use **POST** method (oRPC convention). Auth is via session cookies (Better Auth). Base path: `/rpc/{namespace}.{method}`.

### Auth Levels

| Level | Description |
|-------|-------------|
| `public` | No auth required |
| `protected` | Requires authenticated session |
| `admin` | Requires authenticated session with `role: "admin"` |
| `tutor` | Requires authenticated session with `role: "tutor"` |

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
- **Input:** `{ name?, email? }`
- **Output:** `{ user, profile }`
- **Description:** Updates user profile fields

---

## Admin (`admin.*`)

### `admin.listUsers`
- **Auth:** Admin
- **Input:** `{ cursor?, limit?, role? }`
- **Output:** `{ items: User[], nextCursor }`
- **Description:** Paginated user list with optional role filter

### `admin.setRole`
- **Auth:** Admin
- **Input:** `{ userId, role }`
- **Output:** `{ user }`
- **Errors:** `USER_NOT_FOUND` (404), `LAST_ADMIN` (409), `OPTIMISTIC_LOCK` (409)
- **Description:** Changes user role; prevents removing last admin

---

## Admin Tutor (`adminTutor.*`)

### `adminTutor.createInvite`
- **Auth:** Admin
- **Input:** `{ email }`
- **Output:** `{ invite }`
- **Description:** Creates tutor invite with unique token

### `adminTutor.listInvites`
- **Auth:** Admin
- **Input:** `{ cursor?, limit?, status? }`
- **Output:** `{ items: Invite[], nextCursor }`

### `adminTutor.resendInvite`
- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** `{ invite }`

### `adminTutor.revokeInvite`
- **Auth:** Admin
- **Input:** `{ inviteId, reason? }`
- **Output:** `{ invite }`

### `adminTutor.listTutorProfiles`
- **Auth:** Admin
- **Input:** `{ cursor?, limit?, onboardingStatus? }`
- **Output:** `{ items: TutorProfile[], nextCursor }`

### `adminTutor.reviewTutorProfile`
- **Auth:** Admin
- **Input:** `{ profileId, status, adminNote? }`
- **Output:** `{ profile }`

---

## Tutor (`tutor.*`)

### `tutor.getMyProfile`
- **Auth:** Protected (tutor)
- **Input:** None
- **Output:** `{ profile, availability }`

### `tutor.updateMyProfile`
- **Auth:** Protected (tutor)
- **Input:** `{ bio?, subjects?, prices?, modality?, availability?: SlotInput[] }`
- **Output:** `{ profile }`

### `tutor.submitForReview`
- **Auth:** Protected (tutor)
- **Input:** None
- **Output:** `{ profile }`
- **Description:** Changes onboarding status to `submitted_for_review`

---

## Tutor Discovery (`tutors.*`)

### `tutors.listPublished`
- **Auth:** Protected
- **Input:** `{ cursor?, limit?, subjects?, modality? }`
- **Output:** `{ items: TutorProfile[], nextCursor }`

### `tutors.getProfile`
- **Auth:** Protected
- **Input:** `{ userId }`
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
- **Input:** `{ token, email }`
- **Output:** `{ profile }`
- **Errors:** `INVITE_NOT_FOUND` (404), `INVITE_EMAIL_MISMATCH` (400), `PROFILE_ALREADY_EXISTS` (409)

---

## Achievement (`achievement.*`)

### `achievement.list`
- **Auth:** Protected
- **Input:** None
- **Output:** `{ items: Achievement[] }`

### `achievement.create`
- **Auth:** Protected
- **Input:** `{ eventName, category, award, level, eventDate?, location?, description?, subjects?, imageUrl? }`
- **Output:** `{ achievement }`

### `achievement.update`
- **Auth:** Protected
- **Input:** `{ id, expectedVersion, ...updateFields }`
- **Output:** `{ achievement }`
- **Description:** Optimistic locking via `expectedVersion`

### `achievement.remove`
- **Auth:** Protected
- **Input:** `{ id, expectedVersion }`
- **Output:** `{ deleted }`

### `achievement.adminList`
- **Auth:** Admin
- **Input:** `{ status?, limit, offset }`
- **Output:** `{ items: Achievement[] }`

### `achievement.adminReview`
- **Auth:** Admin
- **Input:** `{ id, status, adminNote? }`
- **Output:** `{ achievement }`

---

## Wallet (`wallet.*`)

### `wallet.getOrCreate`
- **Auth:** Protected
- **Input:** None
- **Output:** `{ id, totalBalance, heldBalance, availableBalance }`

### `wallet.hold`
- **Auth:** Protected
- **Input:** `{ walletId, amount, eventKey, sourceReference?, bookingId?, actorType, reason }`
- **Output:** `WalletSnapshot`
- **Errors:** `WALLET_NOT_FOUND` (404), `INSUFFICIENT_BALANCE` (400)

### `wallet.release`
- **Auth:** Protected
- **Input:** `{ walletId, amount, eventKey, sourceReference?, bookingId?, actorType, reason }`
- **Output:** `WalletSnapshot`

### `wallet.deduct`
- **Auth:** Protected
- **Input:** `{ walletId, amount, eventKey, sourceReference?, bookingId?, actorType, reason }`
- **Output:** `WalletSnapshot`

### `wallet.credit`
- **Auth:** Protected
- **Input:** `{ walletId, amount, eventKey, sourceReference?, bookingId?, actorType, reason }`
- **Output:** `WalletSnapshot`

### `wallet.compensate`
- **Auth:** Protected
- **Input:** `{ walletId, amount, eventKey, sourceReference?, bookingId?, actorType, reason }`
- **Output:** `WalletSnapshot`

### `wallet.listLedger`
- **Auth:** Protected
- **Input:** `{ cursor?, limit?, bookingId?, eventKey? }`
- **Output:** `{ items: LedgerEntry[], nextCursor }`

### `wallet.knowledgeBankEligible`
- **Auth:** Protected
- **Input:** None
- **Output:** `{ eligible: boolean }`

### `wallet.listPackages`
- **Auth:** Protected
- **Input:** None
- **Output:** `{ packages: MarkPackage[] }`

---

## Payment (`payment.*`)

### `payment.createCheckout`
- **Auth:** Protected
- **Input:** `{ packageCode }`
- **Output:** `{ checkoutUrl, paymentId }`
- **Description:** Creates Xendit payment request and returns checkout URL

### `payment.handleWebhook`
- **Auth:** Public
- **Input:** Raw body + Xendit webhook token header
- **Output:** `{ status: "ok" }`
- **Description:** Xendit webhook handler; idempotent; updates payment status and credits wallet

---

## Booking (`booking.*`)

### `booking.create`
- **Auth:** Protected
- **Input:** Solo: `{ tutorId, availabilitySlotId, modality, scheduledStartAt, scheduledEndAt, timezone }`
- **Output:** `{ booking }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400), `BOOKING_CONFLICT` (409), `INSUFFICIENT_MARKS` (400)

### `booking.createGroup`
- **Auth:** Protected
- **Input:** `{ tutorId, availabilitySlotId, modality, targetGroupSize, inviteeUserIds, scheduledStartAt, scheduledEndAt, timezone }`
- **Output:** `{ booking }`

### `booking.createSeries`
- **Auth:** Protected
- **Input:** `{ tutorId, availabilitySlotId, modality, sessions: [{ scheduledStartAt, scheduledEndAt }], timezone }`
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400) if sessions < 2 or > 4

### `booking.confirm`
- **Auth:** Protected (tutor)
- **Input:** `{ bookingId }`
- **Output:** `{ booking }`
- **Description:** Tutor accepts booking; creates meeting for online bookings

### `booking.withdraw`
- **Auth:** Protected
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ withdrawn: true, late: boolean }`

### `booking.cancel`
- **Auth:** Protected
- **Input:** `{ bookingId, cancellationReason? }`
- **Output:** `{ booking }`
- **Description:** Cancels booking; late cancel within H-2 becomes `late_cancelled`

### `booking.confirmInvite`
- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ confirmedHeadcount, targetGroupSize }`

### `booking.declineInvite`
- **Auth:** Protected
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ declined: true }`

### `booking.reconfirm`
- **Auth:** Protected
- **Input:** `{ bookingId, accept }`
- **Output:** `{ reconfirmed: boolean }`

### `booking.withdrawGroup`
- **Auth:** Protected
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ withdrawn: true, late: boolean }`

### `booking.completeSession`
- **Auth:** Protected (tutor)
- **Input:** `{ bookingId, sessionNote? }`
- **Output:** `{ booking }`

### `booking.proposeReschedule`
- **Auth:** Protected
- **Input:** `{ bookingId, proposedStartAt, proposedEndAt, reason? }`
- **Output:** `{ booking }`

### `booking.listSessions`
- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ sessions: BookingSession[] }`
- **Errors:** `BOOKING_NOT_EDITABLE` if not a series

---

## Tutor Actions (`tutorActions.*`)

### `tutorActions.accept`
- **Auth:** Protected (tutor)
- **Input:** `{ bookingId }`
- **Output:** `{ booking, isOffline }`
- **Description:** Tutor accepts booking; same as `booking.confirm`

### `tutorActions.decline`
- **Auth:** Protected (tutor)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ booking }`

---

## Room (`room.*`)

### `room.create`
- **Auth:** Admin
- **Input:** `{ name, capacity?, description? }`
- **Output:** `{ room }`

### `room.list`
- **Auth:** Admin
- **Input:** `{ cursor?, limit? }`
- **Output:** `{ items: Room[], nextCursor }`

### `room.get`
- **Auth:** Admin
- **Input:** `{ roomId }`
- **Output:** `{ room }`

### `room.update`
- **Auth:** Admin
- **Input:** `{ roomId, ...updateFields }`
- **Output:** `{ room }`

### `room.delete`
- **Auth:** Admin
- **Input:** `{ roomId }`
- **Output:** `{ deleted: true }`

### `room.book`
- **Auth:** Admin
- **Input:** `{ roomId, bookingId, scheduledStartAt, scheduledEndAt }`
- **Output:** `{ roomBooking }`

### `room.release`
- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ released: true }`

---

## Notification (`notification.*`)

### `notification.list`
- **Auth:** Protected
- **Input:** `{ cursor?, limit?, includeRead? }`
- **Output:** `{ items: Notification[], nextCursor }`

### `notification.markRead`
- **Auth:** Protected
- **Input:** `{ id }`
- **Output:** `{ notification }`

### `notification.markAllRead`
- **Auth:** Protected
- **Input:** None
- **Output:** `{ count }`

---

## Admin Booking (`adminBooking.*`)

### `adminBooking.listBookings`
- **Auth:** Admin
- **Input:** `{ cursor?, limit?, states? }`
- **Output:** `{ items: Booking[], nextCursor }`

### `adminBooking.getBookingDetails`
- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ booking, participants, stateHistory, payment? }`

### `adminBooking.overrideBooking`
- **Auth:** Admin
- **Input:** `{ bookingId, newState, reason, overrideMeta? }`
- **Output:** `{ previousState, updated }`
- **Description:** Force state transition bypassing state machine

---

## Refund (`refund.*`)

### `refund.processRefund`
- **Auth:** Protected
- **Input:** `{ bookingId, refundReason }`
- **Output:** `{ refund }`

### `refund.processCorrection`
- **Auth:** Protected
- **Input:** `{ paymentId, amount, reason }`
- **Output:** `{ correction }`