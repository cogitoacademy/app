# Cogito Backend — PRD Gaps Phase 3 Specification

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Status     | Planned — not implemented (future PRs against main)                  |
| Branch     | main (future PRs)                                                    |
| Created    | 2026-08-14 (audit of git HEAD `ec8b16c`, post-#46)                   |
| Depends on | #36/#39–#43 (G1–G20) + #46 (BACKEND-HARDENING-PHASE2) merged to main |
| Next       | After this spec: `BACKEND-CLEANUP.md`, then FRONTEND-GAPS-SPEC       |
| Scope      | Backend-only                                                         |

This spec catalogs the PRD requirements the backend **does not yet implement** that were found by the 2026-08-14 PRD-vs-code audit (read `docs/prd.tex` FR/DL/TC references and compare against code at HEAD `ec8b16c`). None of these are tracked anywhere else — the previous gap specs (`PRD-GAPS-SPEC.md` G1–G20) and `BACKEND-HARDENING-PHASE2.md` (B-series) are complete.

> **Rule:** the PRD (`docs/prd.tex`) is the source of truth. If a requirement in this spec conflicts with the PRD, the PRD wins.

## Gap Summary

| #   | Requirement                                                                 | PRD Ref                   | Severity | Module        | Status                                          |
| --- | --------------------------------------------------------------------------- | ------------------------- | -------- | ------------- | ----------------------------------------------- |
| U1  | Admin manual meeting-link entry                                             | FR-21, TC-36              | Medium   | meeting       | Not implemented                                 |
| U2  | Student self-service reschedule before H-2                                  | FR-14, TC-15              | Medium   | booking       | Not implemented                                 |
| U3  | Reconfirmation-deadline repricing for still-valid partial headcount         | FR-16, TC-18              | High     | booking       | Not implemented                                 |
| U4  | Group-series full-series withdrawal not blocked (no opt-out)                | FR-20, TC-24              | Medium   | booking       | Not implemented                                 |
| U5  | Per-participant no-show marking for series sessions                         | FR-20, TC-30              | Medium   | booking       | Not implemented                                 |
| U6  | Admin per-session series cancel with Marks-return choice                    | FR-20, TC-31              | Medium   | admin-booking | Not implemented                                 |
| U7  | Per-session tutor reschedule within a series                                | FR-20, TC-33              | Low      | booking       | Not implemented                                 |
| U8  | Payment-error refund reconciliation guard (no blind full refund)            | TC-39, Refund Policy      | High     | admin-booking | Not implemented                                 |
| U9  | Support SLA business-hours windows (30 min / 4 h) + WhatsApp escalation     | OQ-04                     | Medium   | support       | Partial (in-app escalation job exists, #46)     |
| U10 | Achievement submission fields match PRD (issuer, visibility, enum category) | FR-18 (prd.tex:1004-1014) | Low      | achievement   | Not implemented                                 |
| U11 | Group (non-series) invitee "registered user" validation                     | DL-19                     | Low      | booking       | **Closed** — implemented by BACKEND-REVIEW-HARDENING M4 (`fix/backend-review-hardening`) |
| U12 | Offline room approval deadline rule (12h window)                            | DL-25 (prd.tex:853)       | Low      | booking       | Deviation (deadline = session start)            |
| U13 | Knowledge Bank eligibility uses total balance (B4)                          | DL-16, FR-12              | Medium   | wallet        | Not implemented (carried from phase-2 Task 5.2) |
| U14 | Offline room availability integrated into booking creation (G13)            | FR-22, TC-20              | Low      | room/booking  | Not implemented                                 |

---

## U1: Admin manual meeting-link entry (FR-21 / TC-36)

**PRD:** "Admin may paste any valid meeting URL as fallback" — when Google Meet generation fails or is disabled, the admin must be able to record a manual meeting URL on the booking.

**Current state:** `fallback.provider.ts:22-27` and `google-meeting.provider.ts:587-606` create `meetingEvent` rows with `provider: "manual"` and `meetingUrl: null` when Meet fails. There is **no RPC or route** for an admin to paste the URL afterwards — the meeting is permanently `failed` with no link, so `computeMeetingInfo` can never surface a usable link.

**Required:**

1. New endpoint (admin or protected-with-role): `meeting.setManualLink` (or `adminBooking.setMeetingLink`) — input `{ bookingId, url }` (bounded, `.url()`), sets/updates the `meetingEvent` row (`provider='manual'`, `meetingUrl`, `status='active'`) and notifies confirmed participants (notification matrix row "Online meeting link created").
2. Only when the booking is `SCHEDULED`/`CONFIRMED` and there is a `meetingEvent` row in `failed`/`manual` state (or create one if missing).

**Acceptance tests:**

- Meet creation fails → admin pastes URL → `meetingEvent` updated, participants notified (in-app + email dispatch row)
- Invalid URL rejected by zod
- Link not settable before the booking is scheduled

---

## U2: Student self-service reschedule before H-2 (FR-14 / TC-15 / Permissions Matrix prd.tex:350)

**PRD:** the permissions matrix lists student "reschedule (before H-2)" as a permitted action. TC-15: "Student reschedules pre-H-2 without penalty."

**Current state:** only the tutor-initiated flow exists (`tutorActions.proposeReschedule` + `booking.acceptReschedule`/`rejectReschedule`). A student who wants a new time can only cancel + rebook. `PRD-GAPS-SPEC.md` G6 documented removing student-initiated reschedule during the role fix, but **no doc tracks the resulting PRD deviation**.

**Required:**

1. `booking.rescheduleSelf` (protected, student proposer) — input `{ bookingId, newStartAt, newEndAt }`, gated to `now + 2h < newStartAt` (before H-2) and the existing slot-overlap checks.
2. Transitions the booking (solo/confirmed or awaiting states) to a reschedule flow that requires tutor approval (`RESCHEDULE_PROPOSED` direction student→tutor), or direct transition for states where no tutor consent is needed per PRD. **Decide with the PRD** which states allow direct student reschedule vs. tutor approval.
3. Notifies the tutor + affected participants (matrix row "Tutor reschedule proposed / approved").

**Acceptance tests:**

- Pre-H-2 student reschedule succeeds with valid slot; tutor notified
- Post-H-2 student reschedule rejected (must cancel → late-cancel penalty)
- Overlapping slot rejected (`BOOKING_CONFLICT`)
- Series/group bookings: per PRD rules (U7 notes series is per-session; group needs participant approval if schedule-affecting)

---

## U3: Reconfirmation-deadline repricing (FR-16 / TC-18 — second deadline)

**PRD:** a group at a deadline with valid partial headcount (≥ 2, < target) reprices to the final per-student total and enters reconfirmation. This applies at **every** 12h deadline, not just the first.

**Current state:** `expireBookings` (`booking.service.ts:2456-2492`) has a headcount branch **only for `AWAITING_PARTICIPANT_CONFIRMATION`** (the first deadline, fixed in #46/B3). A group sitting in `AWAITING_RECONFIRMATION` at its reconfirmation deadline with `confirmed >= 2` falls into the else-branch and **EXPIRES + releases all holds** instead of repricing again and reissuing reconfirmation.

**Required:**

1. Extend the headcount branch in `expireBookings` to also cover `AWAITING_RECONFIRMATION`: reprice to `confirmed × perStudent`, reset `deadlineAt = now + 12h`, transition back to `AWAITING_RECONFIRMATION`, notify participants (reuse the B3 path — extract a shared `repriceAtDeadline` helper).
2. Only `confirmed < 2` expires; `confirmed >= target` should not be reachable at a reconfirmation deadline (already moved on) — assert/guard.

**Acceptance tests:**

- 3-of-5 group at its **reconfirmation** deadline → repriced + still `AWAITING_RECONFIRMATION`, holds settled, notified
- 1-of-5 at reconfirmation deadline → EXPIRED + all holds released (existing behavior preserved)

---

## U4: Group-series full-series withdrawal not blocked (FR-20 / TC-24)

**PRD (prd.tex:890):** group-series participants "cannot withdraw from the series as a whole."

**Current state:** `cancelSession` blocks per-session cancellation for group series (`booking.service.ts:1243-1245`), but `withdraw` (`booking.service.ts:1902`) has **no `type === SERIES && targetGroupSize > 1` guard** — a confirmed group-series participant can still call `withdraw` to leave the whole series (deducting/releasing their hold), contradicting the no-opt-out rule.

**Required:**

1. In `withdraw`, reject when the booking is a group series (`BOOKING_SERIES_NO_OPT_OUT` error or similar).
2. Exception per PRD: if the PRD allows leaving before confirmation/deadline, implement that exception explicitly — otherwise blanket block.

**Acceptance tests:**

- Confirmed group-series participant calls `withdraw` → rejected, no hold movement
- Solo-series withdraw still works
- Pre-confirmation state: decide + test per PRD

---

## U5: Per-participant no-show marking (FR-20 / TC-30)

**PRD:** TC-30 "group series per-session no-show affects one session" — a participant who misses a session should forfeit that session's Marks.

**Current state:** the forfeit path in `cancelSession` (`booking.service.ts:1264-1275`) is only reachable via **student-initiated cancel**. There is no way to mark a participant no-show for a specific session (`markTutorAttendance` at `:1346` covers the tutor only), so a genuine no-show (no action taken) never deducts.

**Required:**

1. New endpoint (tutor or admin): `tutorActions.markParticipantNoShow` (or admin variant) — input `{ sessionId, participantUserId }`, gated to sessions whose `scheduledStartAt + 15min` has passed and that are not yet completed.
2. Deducts that participant's per-session hold (same ledger path as the forfeit), marks their session participation `no_show`, and notifies the participant.
3. For solo bookings this maps to the existing whole-booking no-show handling — keep consistent.

**Acceptance tests:**

- Tutor marks participant no-show after start+15min → session hold deducted, ledger `forfeit`-style entry, notification
- Cannot mark before start+15min
- Cannot mark a completed session

---

## U6: Admin per-session series cancel with Marks-return choice (FR-20 / TC-31)

**PRD:** TC-31 "Admin cancels one series session with Marks choice."

**Current state:** `adminBooking.applyOverride` operates on the **whole booking** only; there is no admin endpoint to cancel a single series session with a Marks-handling choice (release vs forfeit vs partial).

**Required:**

1. Extend `adminBooking` with a per-session action (e.g. `adminBooking.cancelSeriesSession`) — input `{ sessionId, marksAction }` where `marksAction ∈ {release, forfeit, partial}` (partial = `{ amount }` bounded).
2. Cancels the `bookingSession`, applies the chosen Marks treatment per participant, records audit + state history + notifications.
3. If the PRD intends this to be part of the override form (F2), define the API shape so the frontend form maps 1:1.

**Acceptance tests:**

- Admin cancels session 2 of 4 with `release` → participants' session holds released
- Admin cancels with `forfeit` → session holds deducted
- Audit entry + notifications written for each choice

---

## U7: Per-session tutor reschedule within a series (FR-20 / TC-33)

**PRD:** TC-33 "Group series one-session tutor reschedule."

**Current state:** `proposeReschedule`/`acceptReschedule` move the **booking-level** `scheduledStartAt`/`scheduledEndAt` only; `bookingSession` child rows are never touched. Series sessions cannot be rescheduled individually.

**Required:**

1. Extend `tutorActions.proposeReschedule` (or add `proposeSessionReschedule`) to target a `sessionId`: proposes a new slot for one session; student approves via the existing accept/reject flow; on accept, update the `bookingSession` row + `meetingEvent` (via `updateEvent`).
2. Overlap checks against the tutor's other commitments for the new session slot.

**Acceptance tests:**

- Tutor proposes new time for session 3 of 4 → student accepts → only session 3 moves, meeting event updated
- Overlap rejected
- Other sessions unchanged

---

## U8: Payment-error refund reconciliation guard (TC-39 / Refund Policy prd.tex:687-688)

**PRD:** refunds are only for payment errors + admin corrections, and must NOT be a blind full cash refund when the credited Marks were already spent.

**Current state:** `adminRefund` (`admin-booking.service.ts:427-496`) credits back the **full** `payment.marks` for any PAID/SETTLED payment regardless of how many Marks the user has since spent (only guarded by existing wallet/ledger balance mechanics — it can over-credit relative to what was actually paid for, and can create negative effective spend accounting).

**Required:**

1. Before refunding, compute the payer's spend: `credited marks − current total balance` (or track per-payment spend via ledger `sourceReference` analysis). Refund amount = `min(payment.marks, credited − spent)` = unused excess.
2. If the user spent everything, refuse a cash/credit refund and offer only a compensating correction per DL-12 (no blind refund), with a clear error.
3. Keep the compensating-ledger + `refund_record` + audit + notification behavior for the refundable amount.

**Acceptance tests:**

- Payment 120 Marks, user spent 40 → refund credits 80
- Payment 120 Marks, user spent all → refund rejected with explicit error (no blind refund)
- Unused-amount boundary cases (spent exactly all / none)

---

## U9: Support SLA business-hours windows + WhatsApp (OQ-04)

**PRD OQ-04:** admin SLA escalation via WhatsApp (+62 881-0119-90195) — 30 min during business hours (Mon–Sat 09:00–21:00 WIB), 4 hours otherwise.

**Current state:** flat `SUPPORT_SLA_MS = 12h` (`constants.ts:8`, `support.service.ts:69`); the in-app `escalate-support-tickets` job (15 min) exists (#46). No WhatsApp integration, no business-hours SLA computation.

**Required:**

1. Replace the flat 12h with business-hours-aware SLA: compute `slaDeadline` per OQ-04 (30 min inside Mon–Sat 09:00–21:00 WIB, else 4h). WIB = UTC+7 — implement timezone-aware (store deadline as timestamptz).
2. Keep/extend the escalation job; add an `escalated` flag + audit (already done) and prepare an escalation hook point for WhatsApp.
3. **WhatsApp itself is out of scope for backend until an integration is approved** — document the hook (`support` service emits an `escalated` event the future WhatsApp adapter consumes). Do not build the WhatsApp client.

**Acceptance tests:**

- Ticket at 10:00 WIB Mon → SLA 10:30 WIB
- Ticket at 22:00 WIB → SLA 02:00 WIB (4h)
- Escalation job marks overdue tickets + audit (existing tests keep passing)

---

## U10: Achievement submission fields match PRD (FR-18, prd.tex:1004-1014)

**PRD fields:** title, category (enum: competition/award/certificate/leadership/publication/other), short summary, issuer/institution, date earned, proof URL **or file**, optional public note, visibility flag.

**Current state:** `achievement.types.ts:3-13` + schema `achievement.ts:24-33` store `eventName, category (free text), award, level, eventDate, location, description, subjects, imageUrl`. Missing: **issuer/institution**, **visibility flag**; category not enum-constrained; proof is a single `imageUrl` (no file upload flow beyond the new upload module, no PDF/URL-optional shape).

**Required:**

1. Migration: add `issuer` (text) + `visibility` (boolean, default true) columns; keep legacy columns (or map `eventName → title` alias at the API boundary to avoid breaking the frontend — decide during implementation).
2. Constrain `category` to the PRD enum (existing rows: map or allow `other`).
3. Proof: `imageUrl` may reference an `upload.createUploadUrl` key/URL (already possible); document the flow; add `proofUrl` if the PRD requires a non-image link.

**Acceptance tests:**

- Create/update accepts the new fields; category enum enforced
- `visibility=false` achievements excluded from public surfacing (F16)
- Uploaded proof file URL accepted as `imageUrl`

---

## U11: Group (non-series) invitee "registered user" validation (DL-19)

> **STATUS: CLOSED** — implemented by `BACKEND-REVIEW-HARDENING.md` Task 2.9 (M4) on branch `fix/backend-review-hardening`: `createGroup` now validates invitees (dedupe, self-invite rejection, headcount bound, registered-user lookup with clean `USER_NOT_FOUND` errors). Acceptance tests below were covered there.

**PRD:** group invitees must be registered users (Phase 0 only invites registered users).

**Current state:** `createGroup` (`booking.service.ts:1657-1678`) inserts participants for arbitrary `inviteeUserIds` with **no existence check** (only the group-series path validates via `findUsersByIds`, `:2179`). A bad id yields a raw FK violation / 500 instead of a clean validation error.

**Required:**

1. In `createGroup`, look up invitees by ids (reuse `findUsersByIds` or add repo method) and return a clean `USER_NOT_FOUND`-style error listing unknown ids.
2. Bounded `inviteeUserIds` already enforced (1–5); keep.

**Acceptance tests:**

- `createGroup` with a nonexistent invitee id → clean 400 error
- Valid invitees → unchanged behavior

---

## U12: Offline room approval deadline rule (DL-25)

**PRD (prd.tex:853):** offline room approval should follow the 12-hour window rules (DL-25).

**Current state:** `tutorAccept` sets the offline booking's `deadlineAt = scheduledStartAt` (`booking.service.ts:861`) — the room-approval window is capped by session start rather than the 12h approval window. The result is stricter than the PRD (a booking created > 12h before the session gets less approval time), so this may be intentional — but it is an undocumented deviation.

**Required (decision + implementation):**

1. Decide with the PRD owner: either (a) keep session-start cap and document it in the PRD/context, or (b) implement `deadlineAt = min(now + 12h, scheduledStartAt)` per DL-25.
2. Add a test asserting the chosen behavior for offline bookings (created 24h ahead → deadline 12h; created 6h ahead → deadline at session start).

---

## U13: Knowledge Bank eligibility uses total balance (B4, from BACKEND-HARDENING-PHASE2 Task 5.2)

**PRD DL-16 / FR-12:** KB eligibility = login + **≥ 35 total Marks** (total balance, not available).

**Current state:** `knowledgeBankEligible` (`wallet.service.ts:421-435`) compares `availableBalance`. Held Marks (committed to bookings) should count toward the 35-Mark threshold.

**Required:**

1. `eligible: w.totalBalance >= KNOWLEDGE_BANK_THRESHOLD`, `balance: w.totalBalance` (output shape unchanged).
2. Update `wallet.service.test.ts` + `wallet.handler.test.ts` assertions (the "available 30 < 35 but total 40 ≥ 35 → eligible" case).
3. Frontend pairing (client-side balance page check) is tracked in FRONTEND-GAPS.

**Acceptance tests:**

- Wallet with available 30, held 10 (total 40) → eligible true
- Wallet with total 30 → eligible false

---

## U14: Offline room availability integrated into booking creation (G13, from PRD-GAPS-SPEC)

**PRD FR-22 / TC-20:** when creating an offline booking, check room availability for the requested slot; auto-assign if free, allow booking without room otherwise, suggest alternatives if partially available.

**Current state:** `room.checkAvailability` exists (`room.service.ts:22-36`) but `createSolo`/`createGroup` never call it — offline bookings go straight to `awaiting_admin_room_approval` with no room request.

**Required:**

1. In the offline booking-creation path, accept an optional `requestedRoomId`; check availability in the same transaction; if free → create `roomBooking` with status `requested` (or `confirmed` per PRD) and flow to `awaiting_admin_room_approval`; if taken → booking proceeds without room and the response surfaces alternatives (via `room.list`/`checkAvailability`).
2. Keep the admin `room.assign`/`relocate`/`cancelBooking` flow as the approval layer.

**Acceptance tests:**

- Offline booking with a free room → room request created
- Offline booking with a taken room → booking created without room, response includes `roomConflict: true`
- Overlapping slot conflict returns available=false (existing behavior)

---

## Implementation Guidance (shared)

- Follow the 4-layer pattern, consumer-driven ports, `DomainError` + `withDomainMap`, bounded zod, `DbOrTx`, and integration tests via `createRouterClient` (see `docs/CONTEXT.md` → "How to Add a New Module").
- All PRD constants referenced above (H-2 = 2h, deadline = 12h, lateness = 15 min, KB threshold = 35, SLA) live in `packages/api/src/shared/constants.ts`.
- Money paths (U3/U5/U6/U8) must use `wallet.hold/release/deduct/credit/compensate` inside the booking transaction with deterministic `eventKey`s (ledger idempotency).
- Verify: `bun run check-types`, `bun run lint`, full suite `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env.test packages/api/src/tests/ apps/server/src/openapi.test.ts` (0 fail), coverage gates (api ≥ 90%, overall ≥ 80%).
- Conventional commits; one PR per U-item or a small coherent group.

### Version Notes

- v1.0 (2026-08-14): Created from the PRD-vs-code audit of HEAD `ec8b16c`. All 14 items verified in code and cross-checked against `PRD-GAPS-SPEC.md` (completed) and `BACKEND-HARDENING-PHASE2.md` (completed) so nothing is double-tracked. U13 = B4 carried from phase-2 Task 5.2; U14 = G13 carried from PRD-GAPS-SPEC; U9 partial (in-app escalation landed in #46).
