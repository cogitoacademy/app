# REVIEW-FIXES-4 — SDD Progress Ledger

Wave-4 audit execution. Plan: `docs/plans/active/REVIEW-FIXES-4.md`; agent prompt: `docs/plans/active/REVIEW-FIXES-4-AGENT-PROMPT.md`.

Created 2026-08-17 by the wave-4 auditor (docs/plans + `.superpowers/sdd` reconciliation, backend correctness, third-party readiness). Execution is delegated to a fresh-context agent. This ledger tracks the executing agent's progress; fill it as PRs land.

## Baseline

- HEAD `6c80391` (all wave-3 PRs #59–#65 merged). Working tree clean.
- Full suite: API 1803 pass / 0 fail, server 44 pass / 0 fail; coverage api 97.6%, overall 97.5%.

## Status

| PR  | Tasks                                              | Status  | Notes                                      |
| --- | -------------------------------------------------- | ------- | ------------------------------------------ |
| P1  | Docs/planning reconciliation (D1–D10)              | pending | Docs-only + `.superpowers/sdd` disposition |
| P2  | Money-correctness C1–C3, H1–H6, M1–M9, L1–L5 (TDD) | pending | Booking/payment/room/support/wallet        |
| P3  | Xendit provider rewrite 2024-11-11 + refund port   | pending | Needs user-provided sandbox keys           |
| P4  | Fail-loud guards Resend/Meet/R2 + ops docs         | pending | + G2 email verification (scoped)           |

## Key audit facts (verified 2026-08-17)

See the plan's Concern Inventory for full evidence (file:line). Highlights:

- C1 group no-show strands other participants' holds (`booking.service.ts:1486-1493`)
- C2 H-2 reschedule bypass (`booking.service.ts:1576-1604`)
- C3 completeSession missing start guard (`booking.service.ts:1015-1027`)
- H1 reschedule-accept stale deadline → auto expire (`booking.service.ts:1780-1786`, `:3263-3299`)
- H4 REFUNDED webhook wedges on spent marks (`payment.service.ts:297-321`)
- X1 Xendit provider is legacy v3; current API needs `api-version: 2024-11-11` schema, `SUCCEEDED` statuses, `actions[].value`, `data.payment_id` webhook field, and a provider refund port.

## Worktree baseline (verified 2026-08-17 by executing agent)

- Worktree: `/Users/miapalovaara/cogito/wt-review-fixes4`, branch `fix/review-fixes-4`, off `main` (= origin/main at `6c80391`).
- Local `.env` copied from main checkout; `DATABASE_URL` → `cogito-test-rf4` (created + migrated); `REDIS_URL` added.
- check-types ✅, lint 0 errors (73 pre-existing warnings), oxfmt flags only new/uncommitted plan docs (P1 will rewrite).
- Full API suite: **1804 pass / 0 fail** (165 files). Server suite (separate process): **49 pass / 0 fail**.

## P1 — Docs reconciliation — DONE (2026-08-17)

- Commit `ba7b35d docs: reconcile plans, CONTEXT, and README with verified wave-4 audit; decide .superpowers/sdd disposition` (off main `6c80391`).
- Moved REVIEW-FIXES-3 → completed/ (added completed header, PR list #59–#65, G2 deferred note); fixed phantom RPC names + migration numbers in it.
- PRD-GAPS-PHASE3 header/intro/U9-row/U9-spec + migration numbers (U7→0020, U10→0023) + phantom names → proposeReschedule/acceptReschedule.
- DEFERRED-OPS 1.4 → 0 bare `.select()` remain.
- CONTEXT: 17 routers, module lists (setMeetingLink/cancelSeriesSession/markParticipantNoShow/getRescheduleAvailability/listApproved), C6 → fully implemented, plans table + execution order, admin-booking.repo.ts:94, wave-4 findings table (C1–C3/H1–H6/M1–M9/L1–L5/X1–X5), .superpowers/sdd disposition note.
- README index corrected; RUNBOOK env table + real-provider swap section; infra/.env.prod.example + monitoring.md stale lines.
- `.superpowers/sdd` disposition (user: keep+commit): .gitignore relaxed, BACKEND-HARDENING (69 files) + BACKEND-HARDENING-PHASE2 (9 files) committed (secret-scanned).
- oxfmt clean; staged as one commit.

## P2.1 (C1) group no-show — complete

- Commit `f20916c5` (off P1 `697eb33`; review clean).
- Targeted 5/5; regression batches green; check-types/lint/oxfmt clean.
- Minor (deferred): tutor-ownership guard not explicitly regression-tested (coverage gap only); degenerate single-survivor GROUP no-show stays live (plan-mandated `type===GROUP` semantics).

## P2.2 (C2) reschedule H-2 guard — complete

- Commit `62547ee` (off `f20916c`); review clean (2 plan-consistent minors: error message text not surfaced verbatim; `<=` boundary is the safer direction).
- Targeted 7/7; reschedule/series/group regressions green. gitignore was reverted by subagent → restored + recommitted with ledger.

## P2.3 (C3) completeSession start guard — complete

- Commit `4928c3a` (off `62547ee`); review clean (2 minors: series-themed error copy on solo/group rejection — plan-prescribed class, message nit only; implicit test ordering convention matches existing suite patterns).
- Guard suite 8/8; regressions 62/62 + 181/181; check-types/lint/oxfmt clean.

## P2.4 (H1) reschedule accept deadline — complete

- Commit `cb96ee5` + fix round 1 `5fb17a0` (review found 1 Important: missing AWAITING_ADMIN_ROOM_APPROVAL test; fixed + re-reviewed clean).
- Discovers pre-existing schema drift: migration 0020 dropped 'expired' from `reschedule_status_check` while schema+code rely on it → new migration 0024 restores it (journaled).
- Targeted 5/5; regressions 24/24; check-types/lint/oxfmt clean.

## P2.5 (H2) tutor lateness — complete

- Commit `ce867e7` + fix round 1 `a2bfbf5` (3 Important fixed: RPC enum for tutor_lateness_pending via OVERRIDE_LIST_CATEGORIES; idempotent flagging via repo exclusion + two-sweep test; API-REFERENCE copy).
- Design (user): marking window ±15min + admin surface via overrideMeta category; no auto-cancel/release.
- Targeted 8/8; regressions 68/68 + full integration 280/280; unit 1530/1530; check-types/lint/oxfmt clean.

## P2.6 (H3) relocateRoom transition — complete

- Commit `ff8eb9a` (off `a2bfbf5`); review clean (2 minors: notification test weak isolation across suite; no unit-level port assertion — acceptable).
- Targeted 4/4; room/offline-scheduled/expiry regressions 34/34; check-types/lint/oxfmt clean.

## P2.7 (H4) REFUNDED webhook reconciliation — complete

- Commit `155d7d5`; targeted + regressions green (see plan).

## P2.8 (H5) support SLA business-hours WIB — complete

- `isBusinessTimeWib` + `computeSlaDeadline` (30 min Mon–Sat 09:00–21:00 WIB / 4h otherwise, wall-clock per PRD OQ-04); `SUPPORT_SLA_MS` replaced by WIB constants.
- Auto-ack notification on ticket creation (`support.{id}.acknowledged`); escalation emits `support.{id}.escalated` notification row (metadata `whatsappTarget: +6288101190195`, `escalate: true`) — WhatsApp hook point, adapter NOT built.
- Docs: CONTEXT H5 row, MODULE-REFERENCE support section, PRD-GAPS-PHASE3 U9 → CLOSED.
- Targeted 34/34 (support-sla + support.service + support-flow + escalation job); full API 1860/0; server 49/0; check-types/lint/oxfmt clean.

## P2.9 (H6 + M1) applyOverride meeting cancel + marks participants — complete

- H6: terminal overrides call `meeting.cancelEvent` best-effort after tx commit (provider failure logged, never breaks override).
- M1: `planOverride` throws `OverrideMarksParticipantsRequiredError` (400) when marksAction lacks non-empty affectedParticipants.
- `AdminBookingMeetingPort` + `cancelEvent`; `meeting` dep optional with guard for setMeetingLink.
- Targeted 53/53 (service + errors) + admin-override/override-preview/admin-meeting-link regressions 70/70; full API 1871/0; server 49/0 (1 known uploads flake on first run, green on rerun); check-types/lint/oxfmt clean.

## P2.10 (M2) expireBookings no-show forfeit — complete

- SCHEDULED→NO_SHOW branch deducts each confirmed participant's held amount (`booking.{id}.no_show.{userId}`) + zeroes participant hold instead of releasing; release stays for EXPIRED/CANCELLED pre-start states. Notification copy "held marks were forfeited".
- Tests: `booking-expiry-no-show.test.ts` (new), `scheduler-expiry.test.ts` updated (forfeit: available 390/total 460 + ledger deduct), `booking.service.test.ts` unit updated.
- Batch 184/184; check-types/lint/oxfmt clean.

## P2.11 (M3) group-series cancel guard — complete

- `cancel()` throws `BookingSeriesNoOptOutError` for `type === SERIES && targetGroupSize > 1` past `AWAITING_PARTICIPANT_CONFIRMATION`; pre-confirmation cancel still works with EXPIRED fallback where CANCELLED unreachable.
- Tests: unit (4 new cases) + integration `booking-group-series.test.ts` (proposer cancel → CONFLICT).
- Full API 1873/0; check-types/lint/oxfmt clean.

## P2.12 (M4) releaseExpiredHolds transition-or-skip — complete

- Terminal transition FIRST in the same tx (shared EXPIRY_TARGET), then release/forfeit; version-conflict / terminal / RESCHEDULE_PROPOSED skipped without wallet movement.
- Tests: 5 new unit cases + scheduler-holds.test.ts + booking-no-show-group.test.ts updated (survivor SCHEDULED forfeits on expiry).
- Full API 1878/0; check-types/lint/oxfmt clean.

## P2.13 (M5 + M7) deadline refresh + room-request cancel — complete

- M5: reconfirm-decline survival path + withdraw-pre-H2 regression path both refresh `deadlineAt = now + 12h` after repricing.
- M7: withdraw from AWAITING_ADMIN_ROOM_APPROVAL cancels the pending `requested` roomBooking via new `roomPort.cancelRequestedRoomForBooking` (room service + repo `findRequestedRoomBookingByBookingId`).
- Tests: 4 new unit cases (2 M5 reconfirm, 2 M7 withdraw) + 2 room.service M7 cases.
- Full API 1884/0; check-types/lint/oxfmt clean.

## P2.14 (M6) cancelRoomBooking cancels awaiting-approval booking — complete

- `room.cancelRoomBooking` calls `bookingPort.cancelOfflineBooking` (releases holds + transition CANCELLED + audit, no-op past AWAITING_ADMIN_ROOM_APPROVAL); `findCancellableRoomBookingByBookingId` includes pending `requested` rows (FR-22).
- Tests: room.service (3 new), booking.service (2 new), booking-u14-room-request (1 integration).
- Full API 1889/0; check-types/lint/oxfmt clean.

## P2.15 (M8) withdraw reprice fallback — complete

- withdraw regression branch catches InsufficientMarksError from repriceGroupForHeadcount → release remaining holds + zero hold + transition EXPIRED (B5 mirror); other errors propagate.
- Tests: 2 unit cases (withdraw-branch + G4 reprice test rewritten to expiry semantics).
- Full API 1890/0; check-types/lint/oxfmt clean.

## P2.16 (M9 + L1) KB student-only + series deduct cap — complete

- M9: `wallet.knowledgeBankEligible` → `studentProcedure`; integration test (student eligible / tutor FORBIDDEN / admin FORBIDDEN / anon UNAUTHORIZED).
- L1: `completeSeriesSession` deduct capped via `Math.min(session.holdAmount, p.heldAmount)` for solo-series (participant read) and group-series branches.
- Tests: wallet-knowledge-bank-guard.test.ts (new, 4 cases) + booking.service.test.ts (2 L1 cases).
- Full API 1896/0; check-types/lint/oxfmt clean.

## P2.17 (L2 + L3) meeting tx propagation + link-pending copy — complete

- L2: MeetingPort.createEvent accepts optional conn (DbOrTx); both providers write meetingEvent through it; finalizeMeetingSchedule passes the booking tx + best-effort cancelEvent on post-creation failure.
- L3: scheduled notification copy derived from meetingResult.meetingUrl (ready vs pending).
- Tests: 2 L3 unit cases + createEvent tx-arg assertion; meeting/fallback provider suites green.
- Full API 1898/0; server 49/0; check-types/lint/oxfmt clean.

## P3 (X1) Xendit provider rewrite 2024-11-11 + refund port — complete

- createIntent: POST /v3/payment_requests with api-version 2024-11-11 header, request_amount/channel_code (OVO/QRIS/BCA)/channel_properties.{success,failure_return_url}/optional customer; top-level response actions[].value (REDIRECT_CUSTOMER → PRESENT_TO_CUSTOMER).
- mapXenditStatus: SUCCEEDED→PAID, REQUIRES_ACTION/AUTHORIZED→PENDING, CANCELED→FAILED; legacy kept.
- Webhook: providerEventId from data.payment_id ?? payment_request_id (fixes xendit:no-event-id idempotency collision); event_id/receipt_url dropped.
- L4: validateWebhookTimestamp(request, provider) skips xendit.
- P3.6: PaymentProvider.refund() — Xendit POST /v3/refunds; stub rfd-stub-{id}; adminRefund best-effort provider refund → refundRecord.providerEventId; migration 0025 payment_record.provider_request_id.
- P3.7: env superRefine requires XENDIT_SUCCESS/FAILURE_REDIRECT_URL when PAYMENT_PROVIDER=xendit.
- Tests: 18 provider unit (rewritten), status tests rewritten, env-xendit + timestamp + refund-flow updated; full API 1911/0; server 51/0; check-types/lint/oxfmt clean.

## P4 (X2/X3/X4) fail-loud guards + ops docs — complete (4.1–4.3)

- P4.1: env superRefine — RESEND_API_KEY required when NODE_ENV=production; EMAIL_FROM must not be the dev default (verified Resend domain).
- P4.2: GOOGLE_MEET_ENABLED=true requires a complete credential set (OAuth triple OR SA email+key); GOOGLE_IMPERSONATED_USER required in SA mode. Boot-time meeting.probe() (calendarList.get, 10s) wired into server bootstrap; env examples fixed. Also fixed z.coerce.boolean() coercing "false"→true (the documented GOOGLE_MEET_ENABLED=false test invocation was silently enabling Meet).
- P4.3: production requires all four R2_* vars together AND R2_PUBLIC_URL; env examples updated.
- P4.4 (G2): user decision — separate PR after 4.1.
- Tests: env-xendit.test.ts (P4.1–P4.3 + coercion); full API 1911/0; server 58/0; check-types/lint/oxfmt clean.

## P4.4 (G2) email verification — complete (separate PR)

- better-auth emailOTP plugin: 6-digit OTP, 5 min expiry, sendVerificationOnSignUp.
- OTP delivered via shared email port: setVerificationEmailSender + buildVerificationEmail (packages/auth/src/verification-email.ts).
- Web: /verify-email route + VerifyEmailForm (authClient.emailOtp.verifyEmail).
- Tests: verification-email.test.ts (2 unit) + email-verification-g2.test.ts (3 integration: sign-up OTP row + sender, verify marks emailVerified, wrong OTP rejected).
- Full API 1914/0; server 58/0; check-types/lint/oxfmt clean.

## FINAL — all PRs merged (2026-08-18)

- P1 #68 (cd141f28) · P2 #69 (ae0f234) · P3 #70 (f72c01e) · P4 #75 (752f58f) · G2 #76 (90ab85a) — all CI green.
- Plan moved to docs/plans/completed/REVIEW-FIXES-4.md; README + CONTEXT updated.
- Final suite: API 1914/0, server 58/0; coverage api 96.4% lines, overall 98.1%.

## FINAL VERIFICATION (2026-08-18, on main)

- Full API suite: 1914 pass / 0 fail · Server suite: 58 pass / 0 fail (separate process)
- Coverage: api 96.1% lines (gate ≥90%), overall 97.9% (gate ≥80%)
- check-types ✅ · lint 0 errors · oxfmt ✅
- Plan moved to docs/plans/completed/REVIEW-FIXES-4.md; README + CONTEXT updated (#77)
