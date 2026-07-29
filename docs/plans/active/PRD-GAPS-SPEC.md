# Cogito Backend — PRD Gaps Specification

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| Status     | Planning reference                                                           |
| Branch     | feature/prd-gaps (future)                                                    |
| Created    | 2026-07-21                                                                   |
| Depends on | improvement/production-readiness + improvement/infrastructure merged to main |
| Next       | —                                                                            |
| Scope      | Backend-only                                                                 |

This document catalogs all PRD requirements that are not yet implemented. It serves as a reference for future feature development. No implementation work should begin until `improvement/foundation-hardening` and `improvement/production-readiness` branches are merged to main.

---

## Table of Contents

1. [Gap Summary](#1-gap-summary)
2. [Detailed Gap Specifications](#2-detailed-gap-specifications)
3. [Test Coverage Gaps](#3-test-coverage-gaps)
4. [Implementation Pattern](#4-implementation-pattern)
5. [Estimated Timeline](#5-estimated-timeline)

---

## 1. Gap Summary

| #   | Gap                                       | PRD Ref      | Priority | Effort | Module        |
| --- | ----------------------------------------- | ------------ | -------- | ------ | ------------- |
| G1  | Report tutor lateness/no-show             | FR-14, DL-26 | High     | 3d     | support       |
| G2  | 12-hour deadline enforcement by scheduler | DL-25        | High     | 2d     | scheduler     |
| G3  | 15-minute lateness auto-cancel            | DL-26, OQ-07 | High     | 2d     | scheduler     |
| G4  | Group repricing recalculation             | FR-16        | High     | 2d     | booking       |
| G5  | Series cancellation rules                 | FR-20        | Medium   | 2d     | booking       |
| G6  | Tutor reschedule with student approval    | FR-15        | Medium   | 1d     | booking       |
| G7  | Rich-text session notes                   | FR-09, DL-18 | Low      | 1d     | booking       |
| G8  | Admin override queue with urgency         | FR-10        | Medium   | 2d     | admin-booking |
| G9  | Admin wallet/ledger view                  | FR-10        | Medium   | 1d     | admin-booking |
| G10 | Before/after override preview             | FR-10        | Medium   | 1d     | admin-booking |
| G11 | Meeting link visibility gating            | FR-21        | High     | 1d     | meeting       |
| G12 | Google Meet attendee automation           | FR-21, OQ-05 | Medium   | 2d     | meeting       |
| G13 | Offline room availability                 | FR-22        | Low      | 1d     | room          |
| G14 | Admin room approval                       | FR-22        | Low      | 1d     | room          |
| G15 | Group series no opt-out disclaimer        | FR-20        | Low      | 0.5d   | booking       |
| G16 | Tutor payout calculation                  | DL-11        | Medium   | 1d     | wallet        |
| G17 | Full notification matrix                  | FR-17        | Medium   | 2d     | notification  |
| G18 | Series session completion                 | FR-20        | Medium   | 1d     | booking       |
| G19 | Pricing extra-take rule (above-baseline)  | FR-05, FR-19, DL-22, TC-06 | High | 1d | pricing |

**Total estimated effort: ~25 days (backend)**

> **Note:** Frontend gaps are tracked separately in `docs/plans/active/FRONTEND-GAPS-SPEC.md`. This document is backend-only.

---

## 2. Detailed Gap Specifications

### G1: Report Tutor Lateness/No-Show

**PRD:** FR-14 (Support Ticket System), DL-26 (Lateness Tolerance)

**Current state:** No support ticket model. No lateness reporting endpoint.

**Required:**

1. **New table:** `supportTicket`
   - `id` (uuid PK)
   - `reporterId` (FK → user)
   - `bookingId` (FK → booking)
   - `category` enum: `tutor_late`, `tutor_no_show`, `technical`, `payment`, `other`
   - `description` text
   - `status` enum: `open`, `in_progress`, `resolved`, `closed`
   - `slaDeadline` timestamp (12 hours from creation for lateness)
   - `assignedTo` (FK → user, nullable, admin)
   - `resolution` text (nullable)
   - `createdAt`, `updatedAt`

2. **New module:** `support`
   - `POST /rpc/support.createTicket` — student reports lateness/no-show
   - `POST /rpc/support.listTickets` — student sees own tickets
   - `POST /rpc/admin.listTickets` — admin sees all tickets, sorted by SLA urgency
   - `POST /rpc/admin.resolveTicket` — admin resolves ticket

3. **Business rules:**
   - Student can report lateness if booking start time + 15 minutes has passed and tutor hasn't joined
   - Student can report no-show if booking start time + 15 minutes has passed and no attendance
   - SLA: admin must respond within 12 hours (configurable)
   - Ticket auto-escalates if SLA deadline passes without response

**Acceptance tests:**

- Student reports tutor 20 minutes late → ticket created with SLA deadline
- Student reports no-show → ticket created, booking status updated
- Admin lists tickets sorted by urgency (SLA deadline ascending)
- Admin resolves ticket → student notified

---

### G2: 12-Hour Deadline Enforcement by Scheduler

**PRD:** DL-25 (12-Hour Confirmation Window)

**Current state:** Scheduler has `expireBookings` job but it's either not running or not processing correctly (N1 bug). Even after bug fix, there's no periodic enforcement of the 12-hour deadline.

**Required:**

1. Configure BullMQ repeatable job to run `expireBookings` every 5 minutes
2. Job queries: `SELECT * FROM booking WHERE status IN ('pending_confirmed', 'pending') AND deadline_at < NOW()`
3. For each expired booking: transition to `expired`, release held funds, send notification
4. Also expire series sessions with past `deadline_at` (N4 fix ensures they have deadlines)
5. Add logging/metrics for number of bookings expired per run

**Acceptance tests:**

- Booking created with 12h deadline → after 12h, scheduler expires it
- Held funds released when booking expires
- Series session with past deadline → expired by scheduler
- Notification sent when booking expires

---

### G3: 15-Minute Lateness Auto-Cancel

**PRD:** DL-26 (Lateness Tolerance), OQ-07 (15-Minute Rule)

**Current state:** No automatic detection of tutor lateness. Student must manually report.

**Required:**

1. **New scheduler job:** `checkTutorLateness`
   - Runs every 5 minutes
   - Queries bookings where `start_time + 15 minutes < NOW()` AND `tutor_attendance = 'unknown'`
   - For each: set `tutor_attendance = 'absent'`, transition booking to `auto_cancelled`
   - Release student's held funds
   - Send notification to both student and tutor

2. **Attendance tracking:**
   - Add `tutorAttendance` field to `bookingParticipant` (enum: `unknown`, `present`, `late`, `absent`)
   - When tutor joins meeting link: set `tutorAttendance = 'present'`
   - When 15 minutes pass without joining: scheduler sets `tutorAttendance = 'absent'`

**Acceptance tests:**

- Booking starts, tutor doesn't join within 15 minutes → auto-cancelled, funds released
- Tutor joins at minute 5 → attendance set to `present`, no auto-cancel
- Student notified of auto-cancellation

---

### G4: Group Repricing Recalculation

**PRD:** FR-16 (Group Pricing Adjustment)

**Current state:** Group bookings have a fixed price set at creation time. If headcount changes (someone drops out during reconfirmation), the price per student doesn't update.

**Required:**

1. When a participant withdraws from a group booking during reconfirmation:
   - Recalculate price per student using pricing service
   - Update `booking.holdAmount` for remaining participants
   - Release excess held funds for the withdrawing student
   - Adjust held amounts for remaining participants (increase if per-student price went up due to fewer students)
   - Send reconfirmation notification with updated price

2. When a participant joins a group booking (waitlist or invitation):
   - Recalculate price per student
   - Reduce per-student hold amount (more students = lower per-student price)
   - Hold funds for new participant
   - Release excess held funds for existing participants

**Acceptance tests:**

- Group of 4 at 28 Marks/student → 1 drops out → remaining 3 at 35 Marks/student, holds adjusted
- Group of 3 at 35 Marks/student → 1 joins → all 4 at 28 Marks/student, excess released
- Reconfirmation notification shows updated price

---

### G5: Series Cancellation Rules

**PRD:** FR-20 (Series)

**Current state:** Series bookings can be cancelled but don't enforce the H-2 cancellation window.

**Required:**

1. **Individual session cancellation:** Student can cancel individual sessions up to 2 hours before start time
   - `POST /rpc/booking.cancelSession` with `sessionId`
   - Validation: session start time must be > 2 hours from now
   - Cancel session: release hold, send notification

2. **Group series no opt-out:** Group series bookings cannot have individual sessions cancelled
   - Return disclaimer text in booking response: "Group series bookings require attendance at all sessions. Individual sessions cannot be cancelled."
   - Enforce at service level: `canCancelSession(session)` returns false for group series

**Acceptance tests:**

- Solo series: cancel session 3 hours before start → allowed, funds released
- Solo series: cancel session 1 hour before start → rejected
- Group series: cancel session → rejected with disclaimer

---

### G6: Tutor Reschedule with Student Approval

**PRD:** FR-15 (Rescheduling)

**Current state:** `proposeReschedule` endpoint **already exists** (`booking.router.ts:71`, `booking.service.ts:619`) but is wired as a **student** action (`protectedProcedure`, `ACTOR_TYPE.STUDENT`). This **contradicts PRD FR-15**, which requires the **tutor** to propose and the **student** to approve. No `acceptReschedule` or `rejectReschedule` endpoints exist. The `bookingRescheduleProposal` table exists and is written to by the existing endpoint.

**Required:**

1. **Fix `proposeReschedule` role:** Change from `protectedProcedure` (student) to `tutorProcedure` (tutor). Change `ACTOR_TYPE.STUDENT` to `ACTOR_TYPE.TUTOR` in the service. This is a **breaking fix**, not a new endpoint.

2. `POST /rpc/booking.acceptReschedule` — student accepts the tutor's proposal
   - Validates: booking is in `reschedule_proposed` state, student is the proposer
   - Updates booking start/end time to the proposed values
   - Updates meeting link if needed (recreate Google Meet event or update manual link)
   - Transitions `reschedule_proposed` → `awaiting_reconfirmation` (per state machine) or directly to `confirmed`/`scheduled` if no other participants affected
   - Sends notification to tutor

3. `POST /rpc/booking.rejectReschedule` — student rejects
   - Marks proposal as `rejected`
   - Transitions back to the previous state (before `reschedule_proposed`)
   - Sends notification to tutor
   - Booking remains at original time

**Acceptance tests:**

- Tutor proposes reschedule → proposal created, student notified (existing endpoint, after role fix)
- Student accepts → booking time updated, both notified
- Student rejects → proposal rejected, booking unchanged, tutor notified
- Only tutor can propose (student attempt → 403), only student can accept/reject (tutor attempt → 403)
- **Regression:** existing student-initiated reschedule (if any UI depends on it) must be removed or redirected to cancel+rebook flow

---

### G7: Rich-Text Session Notes

**PRD:** FR-09 (Session Notes), DL-18 (Post-Session Documentation), PRD §Session Notes (prd.tex:1033-1043)

**Current state:** `_sessionNote` field exists in schema but is unused and undocumented. No sanitization.

**Required:**

1. Add `sessionNotes` field to `bookingParticipant` or create separate `sessionNote` table:
   - `id` (uuid PK)
   - `bookingId` (FK → booking)
   - `authorId` (FK → user)
   - `content` (text, rich-text/markdown)
   - `createdAt`, `updatedAt`

2. Endpoints:
   - `POST /rpc/booking.addSessionNote` — tutor or student adds note
   - `POST /rpc/booking.getSessionNotes` — both parties can view notes
   - Only visible after session is completed

3. **Sanitization (PRD requirement):** Rich-text content must be sanitized before storage or rendering. Allowed tags: paragraphs, headings, bullet lists, numbered lists, links, bold, italic. Use DOMPurify or similar. File upload, image embed, scoring fields, and rubric fields are out of Phase 0.

**Acceptance tests:**

- Tutor adds note after session → stored, visible to student
- Student views notes → sees tutor's notes
- Attempt to add note before session completed → rejected
- Attempt to inject `<script>` or disallowed tags → sanitized, no XSS
- Attempt to add image/file embed → rejected (out of scope)

---

### G8: Admin Override Queue with Urgency

**PRD:** FR-10 (Admin Override)

**Current state:** `applyOverride` exists but `listBookings` returns null cursor (N9), no urgency sorting, no SLA tracking.

**Required:**

1. Fix `listBookings` pagination (N9)
2. Add urgency sorting: bookings sorted by (1) state urgency, (2) time-to-session
3. Add SLA tracking: admin override requests that haven't been addressed within 12 hours escalate
4. Add exception filters: filter by override category, urgency level, SLA status

**Acceptance tests:**

- Admin lists bookings → sorted by urgency (pending overrides first)
- Filter by category → shows only matching bookings
- SLA deadline passed → booking flagged as escalated

---

### G9: Admin Wallet/Ledger View

**PRD:** FR-10 (Admin Override)

**Current state:** No admin endpoint for viewing user wallets and ledger entries.

**Required:**

1. `POST /rpc/admin.getWallet` — admin views any user's wallet
2. `POST /rpc/admin.listLedgerEntries` — admin views ledger entries for any wallet
   - Paginated with cursor
   - Filterable by: entry type, date range, booking ID

**Acceptance tests:**

- Admin views student wallet → sees balance, held, available
- Admin views ledger entries → paginated, filterable
- Non-admin attempts → 403

---

### G10: Before/After Override Preview

**PRD:** FR-10 (Admin Override)

**Current state:** `applyOverride` applies changes directly. No preview.

**Required:**

1. `POST /rpc/admin.previewOverride` — returns projected state changes without applying them
   - Shows: booking state before/after, wallet balance changes, participant impact
   - Does NOT persist any changes

**Acceptance tests:**

- Admin previews override → sees before/after booking state
- Admin previews override → sees wallet balance impact
- Preview does not modify any data

---

### G11: Meeting Link Visibility Gating

**PRD:** FR-21 (Meeting Link)

**Current state:** Meeting link created immediately on booking confirmation, regardless of participant status.

**Required:**

1. Create meeting link only when all participants have confirmed AND tutor has accepted
2. Before link creation: show "Meeting link will be available once all participants confirm"
3. After link creation: show link to all confirmed participants
4. If participant withdraws after link creation: don't revoke link (tutor may still want to use it)

**Acceptance tests:**

- Booking confirmed by student, waiting for tutor → no meeting link
- Tutor accepts → meeting link created, visible to both
- Group booking: 3 of 4 confirmed → no link yet
- Group booking: all confirmed → link created

---

### G12: Google Meet Attendee Automation

**PRD:** FR-21 (Meeting Link), OQ-05 (Calendar Integration)

**Current state:** Google Meet events are created but don't include student/tutor as attendees.

**Required:**

1. When creating Google Calendar event for a booking:
   - Add tutor email as attendee
   - Add student email as attendee
   - Both receive calendar invitation
2. When cancelling a booking:
   - Remove attendees from calendar event (or cancel event entirely)
3. When rescheduling:
   - Update calendar event with new time

**Acceptance tests:**

- Booking confirmed → tutor and student receive Google Calendar invite
- Booking cancelled → calendar event updated/cancelled
- Booking rescheduled → calendar event time updated

---

### G13: Offline Room Availability

**PRD:** FR-22 (Offline Room Booking)

**Current state:** No room availability checking during booking creation.

**Required:**

1. When creating offline booking:
   - Check room availability for requested time slot
   - If room available: auto-approve room request
   - If room unavailable: allow booking without room (student arranges own venue)
   - If room partially available (different room): suggest alternatives
2. Room availability query:
   - `POST /rpc/room.checkAvailability` — check if room is free for a time slot

**Acceptance tests:**

- Offline booking with available room → room auto-assigned
- Offline booking with unavailable room → booking created without room
- Room availability check for overlapping time → returns conflict

---

### G14: Admin Room Approval

**PRD:** FR-22 (Offline Room Booking)

**Current state:** Room bookings have `requested` status but no admin endpoints to approve/relocate/cancel.

**Required:**

1. `POST /rpc/admin.approveRoom` — approve room booking
2. `POST /rpc/admin.relocateRoom` — move booking to different room
3. `POST /rpc/admin.cancelRoom` — cancel room booking (booking continues without room)

**Acceptance tests:**

- Admin approves room → status changes to `confirmed`, student notified
- Admin relocates room → booking updated with new room, student notified
- Admin cancels room → room freed, booking continues

---

### G15: Group Series No Opt-Out Disclaimer

**PRD:** FR-20 (Series)

**Current state:** No disclaimer text returned in series booking API response.

**Required:**

1. Add `disclaimer` field to series booking response:
   - "Group series bookings require attendance at all sessions. Individual sessions cannot be cancelled."
2. Enforce at service level: `canCancelSession(session)` returns false for group series

**Acceptance tests:**

- Create group series → response includes disclaimer text
- Attempt to cancel individual session → rejected with disclaimer reference

---

### G16: Tutor Payout Calculation

**PRD:** DL-11 (Tutor Payout)

**Current state:** No endpoint for calculating tutor share from completed bookings.

**Required:**

1. `POST /rpc/admin.getTutorPayouts` — admin views tutor payout summary
   - Parameters: tutor ID, date range
   - Returns: total completed sessions, total Marks earned, Cogito's take, tutor's payout amount
   - Calculation: `tutorPayout = totalEarnings × (1 - COGITO_TAKE_RATE)`

2. `POST /rpc/tutor.getMyPayouts` — tutor views own payout summary
   - Same calculation but scoped to requesting tutor

**Acceptance tests:**

- Admin views tutor payouts → sees correct calculation with COGITO_TAKE_RATE
- Tutor views own payouts → sees only own data
- Payout includes only completed sessions, not cancelled ones

---

### G17: Full Notification Matrix

**PRD:** FR-17 (Notification System), PRD §Notification Matrix (prd.tex:912-955)

**Current state:** Notification records are created in DB. `onSendNotificationEmail` is implemented (N2 fixed). The notification service has `EMAIL_SUPPORTED_CATEGORIES` (booking/payment/refund/schedule/override) but the routing is category-level, not event-level. The existing matrix below was invented and does **not match the PRD**. This spec must be aligned to the PRD's source-of-truth matrix.

**Required:**

Implement the full notification matrix **as defined in the PRD** (prd.tex:912-955). The PRD matrix is the source of truth — any discrepancy between this spec and the PRD, the PRD wins:

| Event                                      | In-App | Email | Email Recipient | Notes (from PRD) |
| ------------------------------------------ | ------ | ----- | ---------------- | ---------------- |
| Booking request created                    | ✅     | ✅    | Tutor only       | Action required by tutor |
| Account created                             | ✅     | ✅    | New student      | Signup confirmation, onboarding entry, login link, brief intro |
| Group session or series invitation received | ✅    | ✅    | Registered invitees | Email must include full schedule, per-student price, total Marks hold, direct CTA. Phase 0 invitations only to registered users |
| Student or group has confirmed a booking   | ✅     | ✅    | Assigned tutor   | Tutor prep notice. Include student/group name, session type, date, time. For series, list all session dates/times |
| Booking accepted / declined                 | ✅     | ✅    | Student only     | Critical booking outcome |
| Online meeting link created                 | ✅     | ✅    | Tutor + confirmed students | Sent only after all required participant, tutor, and admin conditions complete |
| Offline room confirmed / relocated / cancelled | ✅  | ✅    | Tutor + confirmed students | Critical operational notices |
| Student cancel before H-2                   | ✅     | ✅    | Affected participants | Schedule-affecting change |
| Late cancel / no-show / emergency override  | ✅     | ✅    | Affected participants | Penalty or correction event |
| Tutor reschedule proposed / approved        | ✅     | ✅    | Affected participants | Requires student approval |
| Group repricing / reconfirmation request     | ✅     | ✅    | All current participants | Cost changes must be explicit |
| Payment / refund / emergency refund         | ✅     | ✅    | Payer             | Wallet event |
| Achievement submitted / reviewed             | ✅    | ❌    | —                | Keep review traffic in-app |
| Reminder / non-critical update               | ✅    | ❌    | —                | Never consumes email quota |

**Implementation notes:**

- The current `EMAIL_SUPPORTED_CATEGORIES` set (booking/payment/refund/schedule/override) is too coarse. The routing needs to distinguish within a category (e.g., "achievement" events in the "booking" category should NOT email, but "booking accepted" should).
- Add an `emailRequired: boolean` flag or per-event routing function rather than category-level gating.
- Email dispatch is best-effort, rate-limited, and deduplicated by event key (PRD §Notification Matrix closing note).
- In-app notifications are the source of record for all events.

**Acceptance tests:**

- Each event type creates the correct notification records
- Email dispatch happens for events marked ✅ in Email column, to the correct recipient
- Email is NOT sent for achievement events or non-critical reminders
- In-app notification visible in notification list for all events
- Email includes required content per PRD (e.g., group invite email includes full schedule + price + total hold + CTA)
- N2 bug fix ensures `onSendNotificationEmail` actually dispatches

---

### G18: Series Session Completion

**PRD:** FR-20 (Series)

**Current state:** No endpoint to mark individual series sessions as completed. `completeSession` rejects series bookings.

**Required:**

1. `POST /rpc/booking.completeSession` — mark individual series session as completed
   - Validates: session exists, booking is a series, session start time has passed
   - Sets session state to `completed`
   - Deducts held funds for this session
   - Notifies both parties

2. After all sessions in series are completed:
   - Transition booking to `completed`
   - Release any remaining holds

**Acceptance tests:**

- Mark session 1 of 3 as completed → session state updated, funds deducted
- Mark all 3 sessions → booking state transitions to `completed`
- Attempt to complete future session → rejected
- Attempt to complete already-completed session → rejected

---

### G19: Pricing Extra-Take Rule (Above-Baseline Tutor Pricing)

**PRD:** FR-05 (tutor prices respect Cogito floors), FR-19 (tutor self-pricing), DL-22 (extra-take rule), TC-06 (verify above-floor tutor pricing split)

**Current state — BUG:** `pricing.service.ts:69-79` (`computeSplit`) uses a flat `COGITO_TAKE_RATE = 0.2` (20% of total Marks). This is **wrong**. The PRD requires the **extra-take rule**:

- Baseline total = floor price per student × final confirmed headcount
- Tutor total = tutor-set per-student price × final confirmed headcount
- Extra total = tutor total − baseline total
- Cogito extra take = ⌊ extra total / 5 ⌋ Marks
- Tutor extra share = extra total − Cogito extra take
- Final Cogito take = baseline Cogito take + Cogito extra take
- Final tutor share = baseline tutor share + tutor extra share

The constant `EXTRA_TAKE_DIVISOR = 5` is defined in `packages/api/src/shared/constants.ts:19` but **never used**. Every tutor payout above the floor is miscalculated.

**Examples from PRD (TC-06):**

- Online class for 1 at floor (42 Marks): tutor 30, Cogito 12 — flat 20% gives 33.6/8.4, **wrong**
- Online class for 1 at 50 Marks: extra = 8, Cogito extra = ⌊8/5⌋ = 1, final tutor = 37, final Cogito = 13 — flat 20% gives 40/10, **wrong**
- Online class for 3 at 32 Marks/student (96 total): extra = 12, Cogito extra = ⌊12/5⌋ = 2, final tutor = 74, final Cogito = 22 — flat 20% gives 76.8/19.2, **wrong**

**Required:**

1. Rewrite `computeSplit` in `pricing.service.ts` to implement the extra-take rule:
   - Accept `modality` (online/offline) and `groupSize` to look up baseline floor + baseline split
   - Accept `tutorPricePerStudent` (the tutor-set price) and `confirmedHeadcount`
   - Calculate baseline total, tutor total, extra total, Cogito extra take, final splits
   - Return `{ perStudent, baseline, tutorShare, cogitoTake, baselineCogitoTake, baselineTutorShare, extraTotal, cogitoExtraTake, tutorExtraShare }`

2. Update the `PricingPort` interface to include the new parameters

3. Update all callers of `computeSplit` (booking creation, series creation, group repricing, admin payout G16) to pass the tutor-set price and modality

4. Add baseline split lookup table (baseline Cogito take + baseline tutor share per group size per modality) — derived from the PRD floor pricing tables (prd.tex:768-804)

**Acceptance tests:**

- Online class for 1 at floor (42) → tutor 30, Cogito 12
- Online class for 1 at 50 → tutor 37, Cogito 13 (extra 8, Cogito extra 1)
- Online class for 3 at floor (28/student, 84 total) → tutor 64, Cogito 20
- Online class for 3 at 32/student (96 total) → tutor 74, Cogito 22 (extra 12, Cogito extra 2)
- Offline class for 2 at floor (45/student, 90 total) → tutor 70, Cogito 20
- Extra total = 4 → Cogito extra 0, all 4 to tutor
- Extra total = 5 → Cogito extra 1, 4 to tutor
- Extra total = 12 → Cogito extra 2, 10 to tutor
- Below-floor price → rejected (existing `validatePrices` handles this)

**Depends on:** G16 (tutor payout) must use the corrected `computeSplit` output.

---

### Other PRD Requirements Not Yet Tracked

These PRD requirements have no gap entry above but are not verified as implemented:

| Ref | Requirement | Status | Action |
| --- | ----------- | ------ | ------ |
| FR-02 | Optional parent contact information on student profile | Not verified — check `studentProfile` schema + `auth.updateProfile` | Verify schema has parent contact fields; add to profile form if missing |
| OQ-04 | Admin SLA escalation via WhatsApp (+62 881-0119-90195) — 30 min business hours, 4 hours outside | Not implemented — G1 support ticket creates the queue but no WhatsApp escalation | Add SLA timer + WhatsApp escalation to G1 support ticket flow |
| PRD §Emergency Override UI/UX (prd.tex:717-728) | Full override form: category, reason, affected participants, Marks action (no change/release/compensate/reverse/partial/finance-followup), payment/ledger display, before/after preview, audit history, user-visible notification | G10 covers preview only; the full form UX is not specified | Track in FRONTEND-GAPS-SPEC (admin override form) |
| G7 (rich-text sanitization) | PRD §Session Notes requires sanitized rich text (paragraphs, headings, lists, links, bold, italic) | G7 mentions storage but not sanitization | Add sanitization requirement to G7: use DOMPurify or similar before render; store editor JSON or sanitized HTML |

---

## 3. Test Coverage Gaps

These tests should be written during PRD gap implementation, not deferred:

| Area                                         | Tests Needed                                         | Priority |
| -------------------------------------------- | ---------------------------------------------------- | -------- |
| Booking state machine (all transitions)      | Integration test covering every `canTransition` path | High     |
| Wallet concurrency (parallel holds/releases) | Concurrent operation test with 5+ parallel holds     | High     |
| Group repricing recalculation                | Integration test for headcount change → price update | High     |
| Series no opt-out enforcement                | Unit + integration test                              | High     |
| Payment idempotency race condition           | Concurrent webhook test (2 identical webhooks)       | High     |
| 12-hour deadline enforcement                 | Scheduler integration test                           | Medium   |
| Scheduler jobs (release holds, send email)   | Integration test with BullMQ                         | Medium   |
| Tutor reschedule approval flow               | Integration test                                     | Medium   |
| Offline room approval flow                   | Integration test                                     | Medium   |
| Pricing extra-take calculation (G19)          | Unit test for 1-per-5-Marks rule + above-floor split vs PRD examples | **High**   |
| Notification matrix routing                  | Unit test for email vs in-app                        | Medium   |
| Admin override with hold amount update       | Integration test                                     | Medium   |
| Support ticket SLA tracking                  | Integration test                                     | Medium   |
| Series session completion                    | Integration test                                     | Medium   |
| Circuit breaker open/close cycles            | Unit test                                            | Low      |
| Rate limiting effectiveness                  | Integration test                                     | Low      |
| Auth session caching                         | Integration test                                     | Low      |

---

## 4. Implementation Pattern

For each gap:

1. **Schema migration** (if new tables/columns needed)
2. **Repo layer** — data access methods (`{module}.repo.ts`)
3. **Service layer** — pure business logic + consumer port interfaces + unit tests (`{module}.service.ts`)
4. **Handler layer** — DI factory + `{ context, input }` adapters (`{module}.handler.ts`)
5. **Router definition** — oRPC route + zod schemas (`{module}.router.ts`)
6. **Module index** — `createModule()` factory function (`{module}/index.ts`)
7. **Wire in services.ts** — add module, declare consumer port interfaces if needed
8. **Integration test** — via `createRouterClient`
9. **Update CONTEXT.md and MODULE-REFERENCE.md**

### Established Patterns (from foundation-hardening)

All new endpoints must use these patterns established by the foundation-hardening branch:

| Pattern                                                                | Where                                                    | Usage                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `assertBookingAccess(b, userId, conn, bookingId)`                      | `booking.service.ts`                                     | All booking endpoints check proposer/tutor/participant access                          |
| `tutorProcedure`                                                       | `procedures.ts`                                          | Tutor-only endpoints (G6 reschedule, G18 series completion)                            |
| Bounded Zod schemas (`.max()` on strings/arrays, `.refine()` on dates) | All `*.types.ts`                                         | All new input schemas inherit bounds                                                   |
| `writeBestEffort()` / `write()` notification split                     | `notification.service.ts`                                | G17 notification matrix — use `writeBestEffort` for info, `write` for action/critical  |
| `fetchWithTimeout` / `AbortController` on external calls               | `google-meeting.provider.ts`, `resend-email.provider.ts` | G11/G12 meeting endpoints — all external calls must have timeouts                      |
| `Idempotency-Key` header support                                       | `booking.handler.ts`                                     | Any create endpoint that could be retried                                              |
| `releaseAllParticipantHolds(tx, bookingId, reason, actorType)`         | `booking.service.ts`                                     | G5 series cancellation, G18 series completion — all terminal transitions release holds |
| Optimistic locking (`version` column + `updateWithVersion`)            | `booking.repo.ts`, `achievement.repo.ts`                 | All update/delete operations on versioned tables                                       |

---

## 5. Estimated Timeline

| Phase                                                 | Gaps               | Days         |
| ----------------------------------------------------- | ------------------ | ------------ |
| Support tickets + lateness (G1, G2, G3)               | G1, G2, G3         | 7            |
| Booking improvements (G4, G5, G6, G7)                 | G4, G5, G6, G7     | 6            |
| Admin improvements (G8, G9, G10)                      | G8, G9, G10        | 4            |
| Meeting + Room (G11, G12, G13, G14)                   | G11, G12, G13, G14 | 5            |
| Payouts + Notifications + Series (G15, G16, G17, G18) | G15, G16, G17, G18 | 4.5          |
| Pricing fix (G19)                                     | G19                | 1            |
| Test coverage                                         | High-priority gaps | 3-4          |
| **Total (backend)**                                   |                    | **~31 days** |

> Frontend gaps are tracked in `docs/plans/active/FRONTEND-GAPS-SPEC.md` and run in parallel.

---

### Version Notes

- v1.0 (2026-07-21): Created. 18 PRD gaps catalogued with specifications, acceptance tests, and timeline. Reference document for future `feature/prd-gaps` branch.
- v1.1 (2026-07-27): Added "Established Patterns" section documenting foundation-hardening patterns that all new endpoints must use. Updated dependency line (consolidation merged → foundation-hardening).
- v1.2 (2026-07-29): Codebase audit. Added G19 (pricing extra-take rule bug — `computeSplit` uses flat 20% instead of PRD's 1-per-5-Marks-above-baseline). Fixed G6 (proposeReschedule already exists but as student action, not tutor — reframed as role fix + add accept/reject). Fixed G7 (added sanitization requirement). Replaced G17 matrix with PRD source-of-truth matrix (prd.tex:912-955). Added "Other PRD Requirements Not Yet Tracked" section (FR-02 parent contact, OQ-04 WhatsApp SLA, full override form UX). Updated timeline to ~31 days. Marked scope as backend-only with reference to FRONTEND-GAPS-SPEC.md.
