# SDD ledger — plan: docs/plans/active/REVIEW-FIXES-2.md

Wave plan (dispatched by a fresh agent with zero context — this ledger tracks execution):

- Baseline: main `30f805e` (merge of #48). Docs synced by `chore/docs-sync` (PR #49).
- Verification DB `cogito-test` (port 6767), Redis 6379. Env override note: unset `GOOGLE_MEET_*` for the suite.
- **COMPLETED: all PRs merged to main via #50–#57.** Plan moved to `docs/plans/completed/REVIEW-FIXES-2.md`.

## PR A — Rate limiting & request path

- Task A.1 RPC rate-limit paths (R1) — DONE (#50, merged). Path matching extracted to `rate-limit-paths.ts`; unit-tested via `matchRateLimitPath`; source-text test updated. Note: HTTP-level 429 loop tests hang bun test on this stack — pre-existing evlog+ioredis interaction, reproduced on main; documented in plan execution note.

## PR B — Booking withdraw fixes

- Task B.1 solo withdraw cancels (R2) — DONE (#51, merged). Solo CONFIRMED/SCHEDULED/AWAITING_ADMIN_ROOM_APPROVAL → CANCELLED + hold zeroed + meeting cancelled; unit tests.
- Task B.2 meeting cancel outside tx (R3) — DONE (#51, merged). `cancelMeeting` flag; provider call after `db.transaction` resolves; ordering assertion in unit test.

## PR C — Uploads & payment

- Task C.1 presigned POST policy conditions (R4) — DONE (#52, merged). Policy binds x-amz-algorithm/credential/date; unit test asserts conditions match form fields.
- Task C.2 REFUNDED webhook reversal + Xendit status (R5) — DONE (#52, merged). `mapXenditStatus` REFUNDED; reversal via `wallet.compensate` compensate_deduct with key `refund.{id}.reverse`; `PaymentWalletPort` gained `compensate` — plan's `deduct` suggestion replaced: deduct only releases holds, cannot reverse a credit; integration payment-flow + refund-flow green.

## PR D — Reliability

- Task D.1 outbox reclaim attempts gate (R6) — DONE (#53, merged). SQL stale branch requires `attempts < MAX_DISPATCH_ATTEMPTS`; integration test in notification-email-g17.
- Task D.2 webhook idempotency short TTL (R7) — DONE (#53, merged). `claim(key, 120)`; new webhook-idempotency-ttl.test.ts with mocked services.
- Task D.3 waitForMeetUrl keeps created event (R8) — DONE (#53, merged). try/catch around poll; warn log; row stays 'created' with meetingUrl null; unit test.
- Task D.4 escape eventName + seed-invite print (R9/R10) — DONE (#53, merged). escapeHtml on eventName in adminReview body; seed-invite prints fresh-invite hint instead of the hash; unit tests.

## PR G — CI pipeline hardening (added during execution)

- DONE (#54, merged). Lint job auto-applies `oxlint --fix` + `oxfmt --write` and commits fixes; `apps/server/src/` tests now run in CI (separate process — the webhook TTL test's `mock.module` would shadow `@cogito-app/api` for parallel API tests); labeler fixed (needed `pull-requests: write`; config also needed per-label `any:` syntax); `workflow_dispatch` added to ci.yml. Fixed all 7 `no-shadow` warnings + prefer-set-has/toSorted/no-map-spread (68 → 58 benign warnings; no errors). Also fixed stale fixtures that surfaced once server tests ran in CI (env-xendit missing REDIS_URL; allowlist asserted pre-#48 x-real-ip behavior).

## PR E — Coverage hardening

- storage.ts ≥90% — DONE (#57, merged): 100%
- availability.types.ts ≥90% — DONE (#57, merged): 100%
- request-id.ts ≥90% — DONE (#57, merged): 100%
- meeting/index.ts ≥90% — DONE (#57, merged): 100% (rewritten to avoid process-wide `mock.module` on provider modules that broke google-meeting.provider.test.ts in CI's shared process)
- auth.handler.ts ≥90% — DONE (#57, merged): 100%
- google-meeting.provider.ts ≥90% — DONE (#57, merged): 96.8% (R8 test restores the calendar-get mock after itself)
- auth.errors.ts ≥90% — DONE (#57, merged): 100%
- auth.repo.ts ≥90% — DONE (#57, merged): 100%
- fallback.provider.ts ≥90% — DONE (#57, merged): 100%
- Also fixed a pre-existing CI flake found during PR E: `session_note` added to `resetDatabase` truncate list (CASCADE lock contention timed out the G10 override-preview test).

## PR F — Small PRD gaps

- Task F.1 KB total balance (U13) — DONE (#56, merged). `knowledgeBankEligible` compares/returns totalBalance; held marks count toward the 35 threshold; unit + handler + integration green.
- Task F.2 group-series withdraw guard (U4) — DONE (#56, merged). `withdraw` rejects `type SERIES && targetGroupSize > 1` with `BookingSeriesNoOptOutError` / `BOOKING_SERIES_NO_OPT_OUT` mapped to CONFLICT before any wallet movement; solo-series withdraw unaffected; unit + errors + group-series integration green.

## Final verification (main @ 9851ad8)

- Full suite: 1747 pass / 0 fail (API) + 44 pass / 0 fail (server tests) = 1791 total, 0 fail.
- Coverage: packages/api lines 98.2% (≥ 90 gate), overall 98.0% (≥ 80 gate).
- check-types, lint (0 errors, 58 benign warnings), oxfmt all clean.
