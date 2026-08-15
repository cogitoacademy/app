# SDD ledger — plan: docs/plans/active/REVIEW-FIXES-2.md

Wave plan (dispatched by a fresh agent with zero context — this ledger tracks execution):

- Baseline: main `30f805e` (merge of #48). Docs synced by `chore/docs-sync` (PR TBD).
- Verification DB `cogito-test` (port 6767), Redis 6379. Env override note: unset `GOOGLE_MEET_*` for the suite.

## PR A — Rate limiting & request path

- Task A.1 RPC rate-limit paths (R1) — DONE (path matching extracted to `rate-limit-paths.ts`; unit-tested via `matchRateLimitPath`; source-text test updated. Note: HTTP-level 429 loop tests hang bun test on this stack — pre-existing evlog+ioredis interaction, reproduced on main; documented in plan execution note. Also noted pre-existing env-xid/allowlist test failures from missing REDIS_URL in fixtures, out of CI scope.)

## PR B — Booking withdraw fixes

- Task B.1 solo withdraw cancels (R2) — status:
- Task B.2 meeting cancel outside tx (R3) — status:

## PR C — Uploads & payment

- Task C.1 presigned POST policy conditions (R4) — status:
- Task C.2 REFUNDED webhook reversal + Xendit status (R5) — status:

## PR D — Reliability

- Task D.1 outbox reclaim attempts gate (R6) — status:
- Task D.2 webhook idempotency short TTL (R7) — status:
- Task D.3 waitForMeetUrl keeps created event (R8) — status:
- Task D.4 escape eventName + seed-invite print (R9/R10) — status:

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

- Task F.1 KB total balance (U13) — status:
- Task F.2 group-series withdraw guard (U4) — status:
