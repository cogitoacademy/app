# SDD ledger — plan: docs/plans/completed/BACKEND-HARDENING-PHASE2.md

Wave plan (file-disjoint parallel dispatch):

- Wave 1: Agent A (server infra + security: env/server.ts, webhooks/, routes.ts, seed.ts, lib/idempotency.ts, PR5.6 env, PR5.8 routes, PR4 env vars + /uploads route) | Agent B (booking money: modules/booking/_, modules/room/_, services.ts room wiring, PR5.1/5.4/5.5/5.7)
- Wave 2: Agent C (email/payment: modules/notification/_, modules/payment/_, modules/scheduler/_, apps/server/src/scheduler.ts, PR5.3) | Agent D (upload: lib/storage.ts, modules/upload/_, routers.ts, services.ts upload wiring)
- Shared files are wave-disjoint. services.ts: B in wave 1, D in wave 2. env+routes: A only.

## Wave 1 results (2026-08-14)

- Agent A (security, on fix/backend-hardening-phase2): DONE — commits 3732169..4cf0fb5 (8 commits: 1.1-1.4, 5.6 env, 5.8 routes, 4.1 env+/uploads route). Concerns C1 (use .env.test), C2 (g4 test assertion — FIXED by B commit b34f045), C3 (evlog bun-test hang — workaround: test pure helpers), C4 (payment/index.ts fallback → Agent C), C5 (oxfmt — resolved).
- Agent B (money, same branch): HALTED mid-work — 4 commits landed (a492fbe 2.1, 7ab20bb 2.2, fc3be8f 2.3, b34f045 g4 fix); dirty tree reverted (routeTree.gen.ts junk + g4 assertion revert). Remaining B work: 5.1, 5.4, 5.5, 5.7 → re-dispatched as Agent B2 in worktree wt-money.
- Plan doc updated to v1.2: PR 6 added (6.1-6.6) from phase-1 SDD ledger scan (P1-1..P1-9) + parked items. Commit 6de2527.
- Verified: branch suite for B's tasks 27 pass / 0 fail (booking-g4, booking-solo, room-g14).

## Infrastructure (parallel worktrees)

- DBs migrated: cogito-test-b, cogito-test-c, cogito-test-d (drizzle-kit ENV_FILE override).
- Redis isolated: 6380 (B2), 6381 (C), 6382 (D).
- Worktrees: /Users/miapalovaara/cogito/wt-money (fix/prd-money-correctness), wt-email (fix/email-outbox), wt-upload (fix/file-upload) — all forked from 6de2527.
- Env per worktree: apps/server/.env.test.local (gitignored).

## Wave 2 (dispatched in parallel)

- B2 (money, wt-money): 5.1, 5.4, 5.5, 5.7, 6.3, 6.4, 6.5
- C (email/payment, wt-email): 3.1, 3.2, 5.3, C4, 6.1, 6.2
- D (upload, wt-upload): 4.1, 6.6

## Wave 2 results + integration (final)

- B2 (money): DONE — 10 commits (4d8d682..83b5845): 5.1, 5.4, 5.5, 5.7, 6.3, 6.4, 6.5. Suite 1596/1/0.
- C (email/payment): DONE_WITH_CONCERNS — 8 commits (54d737b..1d8ced0): 3.1, 3.2, 5.3, C4, 6.1, 6.2. Suite 1595/1/0. Concerns: (1) pre-existing lint error in google-meeting.provider resolved by B2's meeting rewrite; (2) admin-refund notification gap → FIXED during integration (commit 0c13007 + 2 unit tests); (3) REFUNDED webhook processing required relaxing PAID/SETTLED early-returns — idempotency tests green.
- D (upload): DONE — 3 commits (ad98881..38c1368): 4.1 storage+upload module, 6.6 .env.example. Suite 1586/1/0.
- Integration on fix/backend-hardening-phase2: merged money (ff) + email (clean) + upload (clean). Full suite 1643/1/0, check-types clean, lint 0 errors.
- Note: main worktree (/Users/miapalovaara/cogito/app) had unexplained dirty state (partial reverts of A's tests/routes at 18:54) — left untouched; real work lives in commits.
- CI: PR #46 — Lint failed first run (6 files unformatted per oxfmt; 4 pre-existing on main) → fixed in commit 22fa4b8 → all checks green → **MERGED to main** (squash, ec8b16c).
