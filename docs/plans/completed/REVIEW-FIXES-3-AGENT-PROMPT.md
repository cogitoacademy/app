# Fresh-Context Agent Prompt — Wave-3 Audit Execution (REVIEW-FIXES-3)

Use this prompt to dispatch a fresh-context agent to execute the REVIEW-FIXES-3 plan. Copy everything between the markers into the agent prompt.

---

You are executing the plan at `docs/plans/active/REVIEW-FIXES-3.md` in the monorepo `/Users/miapalovaara/cogito/app` (Bun + Elysia + oRPC + Drizzle + PostgreSQL + Redis; monorepo with `packages/` and `apps/`). Work from a fresh worktree off `origin/main` (e.g. `/Users/miapalovaara/cogito/wt-review-fixes3`, branch `fix/review-fixes-3`). The old worktrees were cleaned up; create your own.

Use the superpowers `executing-plans` workflow (or `subagent-driven-development`). Implement PRs P1–P6 task-by-task, TDD (failing tests first), conventional commits, and docs updates in the same PR (AGENTS.md rule 11). Track every task in `.superpowers/sdd/REVIEW-FIXES-3/progress.md`.

## Global facts you must honor

- RPC HTTP paths are the oRPC procedure keys with slashes (`/rpc/auth/getProfile`), NOT dotted names; request bodies use the `{"json": <input>}` envelope; responses come back as `{"json": <data>, "meta": [...]}`.
- Verify per task: `bun run check-types`, `bun run lint`, `bunx oxfmt --check`, targeted tests.
- Full suite (plain run, GOOGLE_MEET unset):
  `GOOGLE_MEET_ENABLED=false GOOGLE_MEET_REFRESH_TOKEN= GOOGLE_MEET_CLIENT_ID= GOOGLE_MEET_CLIENT_SECRET= GOOGLE_CLIENT_EMAIL= GOOGLE_PRIVATE_KEY= bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts`
  plus `bun test --env-file apps/server/.env apps/server/src/` in a SEPARATE process (the webhook idempotency TTL test uses `mock.module`, which shadows `@cogito-app/api` process-wide).
- Coverage gates: `packages/api` >= 90% lines, overall >= 80%. Baseline: API 1747 pass / 0 fail, server 44 pass / 0 fail; api 98.2%, overall 98.0%.
- Docker for DB+Redis: `bun run db:start` (Postgres 6767, Redis 6379). Local `.env` files are gitignored — copy `apps/server/.env` + `apps/server/.env.test` from the main checkout into the worktree (add `REDIS_URL=redis://localhost:6379` to `.env` if missing; `DATABASE_URL` must point at a dedicated `cogito-test*` DB, NOT `cogito-app`).
- Every PR updates `docs/CONTEXT.md` (wave-3 findings table), the plan checkboxes/status in `docs/plans/active/REVIEW-FIXES-3.md`, and any API/MODULE/RUNBOOK references it touches. When all PRs land, move the plan to `docs/plans/completed/` and update `docs/plans/README.md`.

## PR order (each independently mergeable, conventional commits, wait for CI green)

- **P1** — Docs reconciliation (docs-only): move `docs/plans/active/BACKEND-CLEANUP.md` → completed; fix CONTEXT plans-table contradictions; refresh PRD-GAPS-PHASE3 and FRONTEND-GAPS-SPEC statuses (PR #55 coverage, F13 backend note, branch names); DEFERRED-OPS 1.4 partial note; plans README. Commit `docs: reconcile plans and CONTEXT with verified wave-3 audit (D1-D4)`.
- **P2** — PR #55 blocker report (REPORT ONLY, no edits to `f/frontend-prd-gaps`): post a precise review comment on PR #55 with: (1) `booking.service.ts:1407` TS6133 unused `proposedEndAt` (red CI, test job never ran); (2) migration 0020 renames achievement columns (`event_date→awarding_date`, `image_url→evidence_url`) but `schema/achievement.ts`/`achievement.repo.ts`/`types.ts` still use old names — applying it breaks achievement CRUD; (3) undeclared F18/J2/dead-components section deletions in FRONTEND-GAPS-SPEC; (4) stray `.qa-marks-before/` + `artifacts/` (~2.7 MB) at repo root; (5) backend surface riding the PR (+482 lines multiparty reschedule, `studentProcedure`, admin-tutor edit review, 3 migrations). Commit `docs: record PR #55 blocker report (wave-3 P2)`.
- **P3** — Backend money-correctness (TDD): 3.1 offline bookings no longer auto-NO_SHOW at session start (B1/U12: bump deadlineAt to scheduledEndAt+grace on SCHEDULED or exclude offline/SCHEDULED from deadline jobs; resolve U12 decision in PRD-GAPS-PHASE3); 3.2 refund-webhook/admin-refund double-credit race (B2: post-lock re-read or conditional UPDATE + compensate only from a credit-state row); 3.3 solo/solo-series withdraw always cancels (B3: SOLO branch before generic regressable, zero hold); 3.4 `tutorAccept` rejects past `deadlineAt` (B4); 3.5 partial-group reprice failure falls back to EXPIRED (B5, no wedge); 3.6 unique `payment_record.provider_reference` (B6, migration 0022 + onConflictDoNothing); 3.7 withdraw only decrements headcount for confirmed participants (B7); 3.8 reconfirmation-deadline repricing (B8/U3) + spend-limited admin refund (B9/U8). Commits per task, e.g. `fix(booking): offline bookings no longer auto-expire at session start (B1, U12)`.
- **P4** — CI/CD hardening: 4.1 labeler v7 config (`changed-files:`/`any-glob-to-any-file:`) + `gh label create` for server/web/docs/infrastructure/dependencies/github-actions + backfill PRs #55–58; 4.2 remove `|| true` from CD webhook curls + `--max-time 30` + RUNBOOK deploy-secrets section; 4.3 root `.dockerignore`; 4.4 Dockerfiles non-root USER, pin `nginx:alpine` digest, web HEALTHCHECK; 4.5 `stop_grace_period: 30s` on compose postgres + RUNBOOK shutdown-noise note; 4.6 guard lint auto-commit (pull_request only, skip `github-actions[bot]`); 4.7 `redis.quit()` + force-exit timer in `gracefulShutdown`; 4.8 ci.yml least-privilege permissions, lint cache, fail when lcov missing.
- **P5** — Remaining backend U-items: U1 admin manual meeting-link entry (interplay with retry-failed-meetings); U2 student self-reschedule pre-H-2; U5 per-participant no-show marking; U6 admin per-session series cancel with Marks choice; U7 per-session tutor reschedule (coordinate with PR #55's per-session work); U10 achievement field parity (issuer/visibility/category enum; coordinate with migration 0020); U14 room availability in booking creation (`requestedRoomId`); 5.8 hygiene (7 bare `.select()` in booking.repo, unused `BookingTransition`). Each TDD.
- **P6** — Frontend F-items + auth (only AFTER PR #55 merges; re-verify F-statuses first): F8 per-session series completion UI; F13 tutor payout view; F14 group-series disclaimer display; F16 public achievements (new public procedure + landing); G2 email verification; C6 password policy upper/lower/digit.

## Key audit facts (verified 2026-08-16, trust these; re-verify cheaply if needed)

- Backend money bugs: B1 `booking.service.ts:834` + `room.service.ts:114-116` + `booking.service.ts:2713-2904`; B2 `payment.service.ts:271-299` vs `admin-booking.service.ts:496-504`; B3 `booking.service.ts:2079-2116`; B4 `booking.service.ts:783-856`; B5 `booking.service.ts:2737-2772`; B6 `payment.service.ts:146-159` + `payment-record.ts:31` (non-unique index); B7 `booking.service.ts:1964-2010`.
- CI/CD: labeler config `.github/labeler.yml` is wrong for actions/labeler@v7 (bare globs inside `any:`; needs `changed-files:` → `any-glob-to-any-file:`) AND labels don't exist; `COOLIFY_STAGING_WEBHOOK`/`COOLIFY_PROD_WEBHOOK` undefined (0 repo secrets) + `|| true` swallows; no root `.dockerignore`; Dockerfiles as root, `nginx:alpine` unpinned, no web HEALTHCHECK; no `stop_grace_period` in compose; shared ioredis never quit on shutdown (`apps/server/src/index.ts:74-89`).
- PR #55 (`f/frontend-prd-gaps`, HEAD `9714173`): red CI (TS6133), migration 0020 schema mismatch, spec deletions, stray artifacts — REPORT ONLY.

## Report per PR

For each merged PR report: commit hash, test counts (targeted + full suite), coverage deltas, PR URL, CI status. When all PRs land: full suite + coverage gates, move `REVIEW-FIXES-3.md` to `docs/plans/completed/`, update `docs/plans/README.md`, update the SDD ledger, and give a final summary table.

---
