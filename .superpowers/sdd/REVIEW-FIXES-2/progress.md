# SDD ledger — plan: docs/plans/active/REVIEW-FIXES-2.md

Wave plan (dispatched by a fresh agent with zero context — this ledger tracks execution):

- Baseline: main `30f805e` (merge of #48). Docs synced by `chore/docs-sync` (PR TBD).
- Verification DB `cogito-test` (port 6767), Redis 6379. Env override note: unset `GOOGLE_MEET_*` for the suite.

## PR A — Rate limiting & request path

- Task A.1 RPC rate-limit paths (R1) — DONE (path matching extracted to `rate-limit-paths.ts`; unit-tested via `matchRateLimitPath`; source-text test updated. Note: HTTP-level 429 loop tests hang bun test on this stack — pre-existing evlog+ioredis interaction, reproduced on main; documented in plan execution note. Also noted pre-existing env-xid/allowlist test failures from missing REDIS_URL in fixtures, out of CI scope.)

## PR B — Booking withdraw fixes

- Task B.1 solo withdraw cancels (R2) — DONE (solo CONFIRMED/SCHEDULED/AWAITING_ADMIN_ROOM_APPROVAL → CANCELLED + hold zeroed + meeting cancelled; unit tests)
- Task B.2 meeting cancel outside tx (R3) — DONE (cancelMeeting flag; provider call after db.transaction resolves; ordering assertion in unit test)

## PR C — Uploads & payment

- Task C.1 presigned POST policy conditions (R4) — DONE (policy binds x-amz-algorithm/credential/date; unit test asserts conditions match form fields)
- Task C.2 REFUNDED webhook reversal + Xendit status (R5) — DONE (mapXenditStatus REFUNDED; reversal via wallet.compensate compensate_deduct with key refund.{id}.reverse; PaymentWalletPort gained compensate — plan's deduct suggestion replaced: deduct only releases holds, cannot reverse a credit; integration payment-flow + refund-flow green)

## PR D — Reliability

- Task D.1 outbox reclaim attempts gate (R6) — DONE (SQL stale branch requires attempts < MAX_DISPATCH_ATTEMPTS; integration test in notification-email-g17)
- Task D.2 webhook idempotency short TTL (R7) — DONE (claim(key, 120); new webhook-idempotency-ttl.test.ts with mocked services)
- Task D.3 waitForMeetUrl keeps created event (R8) — DONE (try/catch around poll; warn log; row stays 'created' with meetingUrl null; unit test)
- Task D.4 escape eventName + seed-invite print (R9/R10) — DONE (escapeHtml on eventName in adminReview body; seed-invite prints fresh-invite hint instead of the hash; 3 unit tests; note: existing achievement mocks needed eventName added)

## PR E — Coverage hardening

- storage.ts ≥90% — status:
- availability.types.ts ≥90% — status:
- request-id.ts ≥90% — status:
- meeting/index.ts ≥90% — status:
- auth.handler.ts ≥90% — status:
- google-meeting.provider.ts ≥90% — status:
- auth.errors.ts ≥90% — status:
- auth.repo.ts ≥90% — status:
- fallback.provider.ts ≥90% — status:

## PR F — Small PRD gaps

- Task F.1 KB total balance (U13) — DONE (knowledgeBankEligible compares/returns totalBalance; held marks count toward the 35 threshold; unit + handler + integration green)
- Task F.2 group-series withdraw guard (U4) — status:
