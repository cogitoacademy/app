# SDD ledger — plan: docs/plans/active/BACKEND-REVIEW-HARDENING.md

Execution wave (single agent, sequential — fixes are interdependent within the booking/admin money modules):

- Worktree: `/Users/miapalovaara/cogito/wt-backend-review` (branch `fix/backend-review-hardening`)
- Shared dev infra: Postgres `localhost:6767` (cogito-app / cogito-test), Redis `localhost:6379` (dev compose extended in Task 1.1)
- Baseline: `7e9ff5c`, full suite 1643 pass / 1 known-failing pre-existing

## PR 1 — Infra & request-path hardening

- Task 1.1 Redis mandatory — status:
- Task 1.2 getClientIp (M5) — status:
- Task 1.3 auth body limit (L8) — status:
- Task 1.4 seed password override (L9) — status:

## PR 2 — Booking money correctness

- Task 2.1 withdraw from confirmed group → reprice (C1) — status:
- Task 2.2 atomic confirmInvite headcount (H2) — status:
- Task 2.3 unique reprice keys (H3) — status:
- Task 2.4 advisory locks (H4) — status:
- Task 2.5 reconfirm decline releases hold (H5) — status:
- Task 2.6 cancel proposer-only (M1) — status:
- Task 2.7 session cancel proposer-only (M2) — status:
- Task 2.8 intra-series overlap (M3) — status:
- Task 2.9 invitee validation (M4 + U11) — status:
- Task 2.10 bounded scheduler batches (M16) — status:

## PR 3 — Admin money correctness

- Task 3.1 last-admin lock (H6) — status:
- Task 3.2 compensate reconciliation (H7) — status:
- Task 3.3 conditional refund update (M6) — status:
- Task 3.4 deterministic correction key (M7) — status:
- Task 3.5 corrections pagination (M15) — status:
- Task 3.6 override nits (L7) — status:

## PR 4 — Module security fixes

- Task 4.1 availability upsert ownership (H1) — status:
- Task 4.2 availability overlap lock (L6) — status:
- Task 4.3 student search gate (M8) — status:
- Task 4.4 invite token hashing (M10) — status:
- Task 4.5 userNote escaping (M11) — status:
- Task 4.6 validation lows (L2–L5) — status:

## PR 5 — Meeting & email reliability

- Task 5.1 meeting retry live (M12) — status:
- Task 5.2 OAuth refresh in breaker + cache (M13) — status:
- Task 5.3 atomic outbox claim (M14) — status:
- Task 5.4 timeout nits (L1) — status:

## PR 6 — Uploads

- Task 6.1 presigned POST (M9) — status:
