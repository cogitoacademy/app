# SDD ledger — plan: docs/plans/active/BACKEND-REVIEW-HARDENING.md

Execution (single agent, sequential): worktree `/Users/miapalovaara/cogito/wt-backend-review`, branch `fix/backend-review-hardening`.

- Baseline: `7e9ff5c`. Verification DB `cogito-test-review` (port 6767), Redis 6379 (dev compose now includes Redis — Task 1.1).

## PR 1 — Infra & request-path hardening
- 1.1 Redis mandatory — DONE (compose redis service, env schema requires REDIS_URL, test-setup + .env files updated)
- 1.2 getClientIp (M5) — DONE (socket address via `server.requestIP`; spoofable headers ignored when untrusted)
- 1.3 auth body limit (L8) — DONE (parse:none + readBodyWithLimit on /api/auth/*)
- 1.4 seed password override (L9) — DONE (SEED_TUTOR_PASSWORD/SEED_STUDENT_PASSWORD)

## PR 2 — Booking money correctness
- 2.1 withdraw from confirmed group → reprice+reconfirm (C1) — DONE (new transitions CONFIRMED/SCHEDULED/AWAITING_ADMIN_ROOM_APPROVAL → AWAITING_RECONFIRMATION; meeting cancel on regress; no more whole-booking cancel)
- 2.2 atomic confirmInvite headcount (H2) — DONE (SQL increment + re-read, `incrementBookingConfirmedHeadcount`)
- 2.3 unique reprice keys (H3) — DONE (per-student price in eventKey; duplicate updateParticipantState removed)
- 2.4 advisory locks (H4) — DONE (`lockTutorForBooking` pg_advisory_xact_lock in all 4 create flows)
- 2.5 reconfirm decline releases hold (H5) — DONE (release + decrement + reprice; EXPIRED if < MIN)
- 2.6 cancel proposer-only (M1) — DONE
- 2.7 session cancel proposer-only (M2) — DONE
- 2.8 intra-series overlap (M3) — DONE
- 2.9 invitee validation (M4 + U11) — DONE (dedupe/self/headcount/registered-user)
- 2.10 bounded scheduler batches (M16) — DONE (`mapLimit` concurrency 5, batch 100)

## PR 3 — Admin money correctness
- 3.1 last-admin row locks (H6) — DONE (lockAdminRows FOR UPDATE + in-tx count)
- 3.2 compensate reconciliation (H7) — DONE (release-then-credit/deduct; participant held_amount cleared; holdAmount recomputed)
- 3.3 conditional refund update (M6) — DONE (updatePaymentStatusIfRefundable in-tx)
- 3.4 deterministic correction key (M7) — DONE (sha256 payload key + sourceReference)
- 3.5 corrections pagination (M15) — DONE (entryType array filter in SQL)
- 3.6 override nits (L7) — DONE (BookingOverrideConflictError 409; marksAction from participant sums; deduct error reports heldBalance)

## PR 4 — Module security fixes
- 4.1 availability upsert ownership (H1) — DONE (tutorId predicate + not-found)
- 4.2 availability overlap lock (L6) — DONE (advisory lock in upsert + weekly)
- 4.3 student search gate (M8) — DONE (role=student + 30/min rate limit)
- 4.4 invite token hashing (M10) — DONE (sha256 digest at rest, plaintext once at create/resend, migration 0017)
- 4.5 userNote/eventName escaping (M11) — DONE
- 4.6 validation lows (L2–L5) — DONE (support bookingId ownership, notification composite cursor, room date ranges, achievement eventDate, prices cap)

## PR 5 — Meeting & email reliability
- 5.1 meeting retry live (M12) — DONE (no immediate manual clobber; manual fallback after 3 failed attempts)
- 5.2 OAuth refresh in breaker + cache (M13) — DONE
- 5.3 atomic outbox claim (M14) — DONE (status 'sending' claim + stale reclaim; Resend Idempotency-Key; migration 0018)
- 5.4 timeout nits (L1) — DONE (waitForMeetUrl timeout; withTimeout clears timer)

## PR 6 — Uploads
- 6.1 presigned POST (M9) — DONE (content-length-range policy; authenticated size-bounded dev POST /uploads/*)

## Final verification
- Full suite 1658 pass / 0 fail; coverage API 95.3% / overall 95.4%; check-types clean; oxlint 0 errors.
- Pre-existing runtime issue documented (with-body RPC over HTTP 400 on Bun 1.3.14 stack; identical on main).
