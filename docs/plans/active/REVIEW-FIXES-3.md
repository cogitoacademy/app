# Backend Review Fixes 3 — Wave-3 Audit Plan

> **STATUS: ACTIVE — planned for execution on main (`7375b9d`).** Wave-3 findings from the 2026-08-16 full audit (docs/plans reconciliation, open PR #55 blockers, backend money-correctness bugs, CI/CD hardening, remaining U-items and F-items). Verified at git HEAD `7375b9d` (post-#58).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every verified wave-3 concern — stale docs reconciled, the open frontend PR #55 unblocked or its blockers reported, the 5 real backend money bugs fixed, CI/CD failures (labeler, CD secrets, Docker, shutdown) resolved, and the remaining PRD U-items and frontend F-items landed.

**Architecture:** 6 independent PR groups, backend-first, all targeting `main`. Follows the existing 4-layer pattern, `DbOrTx`, `DomainError` + `withDomainMap`, bounded zod, consumer-driven ports, and real-DB integration tests. PR order is dependency-safe.

**Tech Stack:** Bun 1.3.14, Elysia, oRPC, Drizzle + postgres.js, BullMQ, better-auth, Cloudflare R2, bun:test, oxlint/oxfmt, GitHub Actions.

## Global Constraints

- Import from `@cogito-app/...` package paths; modules use `../../lib`, `../../shared`, `../../procedures`.
- 4-layer pattern; `DbOrTx` (`packages/api/src/lib/tx.ts`); `DomainError` + `withDomainMap`; bounded zod.
- **RPC protocol facts:** HTTP paths are oRPC procedure keys with slashes — `/rpc/payment/createPurchase`, NOT dotted names. Bodies use the `{"json": <input>}` envelope; responses come back as `{"json": <data>, "meta": [...]}`.
- **Docs follow code (AGENTS.md rule 11):** every PR updates `docs/CONTEXT.md`, `docs/RUNBOOK.md` where touched, the affected plan files, and this plan's statuses in the same PR.
- Conventional commits; one commit per task or small coherent group.
- Verify per task: `bun run check-types`, `bun run lint`, `bunx oxfmt --check`, targeted `bun test --env-file apps/server/.env ...`.
- Full suite at each PR end (plain run, GOOGLE_MEET unset): `GOOGLE_MEET_ENABLED=false GOOGLE_MEET_REFRESH_TOKEN= GOOGLE_MEET_CLIENT_ID= GOOGLE_MEET_CLIENT_SECRET= GOOGLE_CLIENT_EMAIL= GOOGLE_PRIVATE_KEY= bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts`, plus `bun test --env-file apps/server/.env apps/server/src/` in a **separate process** (webhook TTL test uses `mock.module`).
- Coverage gates: `packages/api` ≥ 90% lines, overall ≥ 80%. Baseline: API suite 1747 pass / 0 fail, server suite 44 pass / 0 fail; api 98.2%, overall 98.0%.
- Docker DB+Redis: `bun run db:start` (Postgres 6767, Redis 6379). Redis is mandatory.

## Concern Inventory (verified 2026-08-16)

### Docs / plans

| ID  | Finding                                                                                                                                                                                                                                                                                                                                        | Location                                     | PR               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------- |
| D1  | BACKEND-CLEANUP all 11 items implemented but still listed active                                                                                                                                                                                                                                                                               | `docs/plans/active/BACKEND-CLEANUP.md`       | P1               |
| D2  | CONTEXT plans table lists U4/U13 as open; they are implemented                                                                                                                                                                                                                                                                                 | `docs/CONTEXT.md:315`                        | P1               |
| D3  | FRONTEND-GAPS-SPEC branch name stale (`feature/frontend-gaps` vs `f/frontend-prd-gaps`); F13 backend note stale (`tutor.getMyPayouts` exists since #43); F2/F3/F6/F7/F11/F17 statuses not updated for open PR #55                                                                                                                              | `docs/plans/active/FRONTEND-GAPS-SPEC.md`    | P1               |
| D4  | DEFERRED-OPS 1.4 claims done; 7 bare `.select()` remain in booking.repo                                                                                                                                                                                                                                                                        | `docs/plans/active/DEFERRED-OPS-TASKS.md:32` | P1               |
| D5  | PR #55 (`f/frontend-prd-gaps`, 25 commits) has red CI (unused `proposedEndAt`), a migration 0020 schema mismatch (achievement columns renamed but `schema/achievement.ts`/repo still use `imageUrl`/`eventDate`), undeclared F18/J2/dead-components spec deletions, and stray repo-root artifacts (`.qa-marks-before/`, `artifacts/`, ~2.7 MB) | PR #55                                       | P2 (report only) |

### Backend money-correctness

| ID  | Severity | Finding                                                                                                                                                                                  | Location                                                                                                       | PR   |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | HIGH     | Offline bookings auto-NO_SHOW at session start (deadline = start) → holds released before tutor completes; tutor still paid from snapshot                                                | `booking.service.ts:834`, `room.service.ts:114-116`, `booking.service.ts:2713-2904`, `booking.repo.ts:576-587` | P3.1 |
| B2  | HIGH     | REFUNDED webhook reversal races admin refund → double credit (stale-snapshot guard; different eventKeys bypass ledger unique index)                                                      | `payment.service.ts:271-299` vs `admin-booking.service.ts:496-504`                                             | P3.2 |
| B3  | MED      | Solo/solo-series withdraw in `AWAITING_TUTOR_REVIEW` regresses to `AWAITING_RECONFIRMATION` (contradicts R2); revivable with zero holds; later deduct can consume another booking's hold | `booking.service.ts:2079-2116`                                                                                 | P3.3 |
| B4  | MED      | `tutorAccept` ignores past `deadlineAt` → accepts a booking whose holds were released (free session)                                                                                     | `booking.service.ts:783-856`                                                                                   | P3.4 |
| B5  | MED      | Partial-group reprice at expiry throws `InsufficientMarksError` → booking wedged, holds stuck, 5-min retry loop                                                                          | `booking.service.ts:2737-2772`                                                                                 | P3.5 |
| B6  | LOW      | `createIntent` can insert duplicate PENDING payments (non-unique `provider_reference`) → zombie rows                                                                                     | `payment.service.ts:146-159`, `payment-record.ts:31`                                                           | P3.6 |
| B7  | LOW      | `withdraw` can double-decrement `confirmedHeadcount`; non-confirmed invitee can withdraw                                                                                                 | `booking.service.ts:1964-2010`                                                                                 | P3.7 |
| B8  | HIGH     | U3: reconfirmation-deadline repricing for still-valid partial headcount not implemented (`AWAITING_RECONFIRMATION` expires + releases instead of repricing)                              | `booking.service.ts:2738-2743`                                                                                 | P3.8 |
| B9  | HIGH     | U8: `adminRefund` blindly refunds full `payment.marks` regardless of spend (no reconciliation guard)                                                                                     | `admin-booking.service.ts:478-552`                                                                             | P3.8 |

### CI/CD & infra

| ID  | Severity | Finding                                                                                                                                                                | Location                                                   | PR   |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| C1  | HIGH     | Labeler config format incompatible with `actions/labeler@v7` (`any:` + bare globs; needs `changed-files:` → `any-glob-to-any-file:`) → zero labels applied on every PR | `.github/labeler.yml`                                      | P4.1 |
| C2  | HIGH     | Labels `server`/`web`/`docs`/`infrastructure` (+ `dependencies`/`github-actions`) don't exist in repo → even a fixed config 422s                                       | repo settings                                              | P4.1 |
| C3  | HIGH     | CD webhook secrets (`COOLIFY_STAGING_WEBHOOK`/`COOLIFY_PROD_WEBHOOK`) undefined (0 secrets configured) + `\|\| true` swallows failures → deploys are silent no-ops     | `cd-staging.yml`, `cd-prod.yml`                            | P4.2 |
| C4  | HIGH     | No root `.dockerignore`; Dockerfiles `COPY . .` → context leaks `node_modules`/`.git`/`coverage`; deps-stage node_modules overwritten                                  | repo root, `apps/server/Dockerfile`, `apps/web/Dockerfile` | P4.3 |
| C5  | MED      | Dockerfiles run as root; `nginx:alpine` unpinned; web has no HEALTHCHECK                                                                                               | Dockerfiles                                                | P4.4 |
| C6  | MED      | Postgres shutdown FATAL spam (20 pool connections → 20 FATAL lines): no `stop_grace_period` in compose; no app-before-db stop ordering                                 | `docker-compose.yml`, `docker-compose.test.yml`            | P4.5 |
| C7  | MED      | CI lint auto-commit can push to main on push events (bypasses review); no guard for `github-actions[bot]` commits                                                      | `ci.yml`                                                   | P4.6 |
| C8  | LOW-MED  | Shared ioredis client never `quit()` on graceful shutdown; no force-exit timer on `db.$client.end()`                                                                   | `apps/server/src/index.ts:74-89`, `redis.ts:222`           | P4.7 |
| C9  | LOW      | ci.yml typecheck/build lack `permissions: contents: read`; lint job lacks bun cache; coverage gate silently passes when lcov missing                                   | `ci.yml`, `coverage-comment.ts`                            | P4.8 |

### Remaining backend U-items and frontend F-items

| ID  | Finding                                                                                                | PR   |
| --- | ------------------------------------------------------------------------------------------------------ | ---- |
| U1  | Admin manual meeting-link entry (FR-21/TC-36)                                                          | P5.1 |
| U2  | Student self-service reschedule before H-2 (FR-14/TC-15)                                               | P5.2 |
| U5  | Per-participant no-show marking (FR-20/TC-30)                                                          | P5.3 |
| U6  | Admin per-session series cancel with Marks-return choice (FR-20/TC-31)                                 | P5.4 |
| U7  | Per-session tutor reschedule within a series (FR-20/TC-33)                                             | P5.5 |
| U10 | Achievement submission field parity — issuer, visibility, enum category (FR-18)                        | P5.6 |
| U14 | Offline room availability integrated into booking creation (FR-22/TC-20)                               | P5.7 |
| —   | Hygiene: 7 bare `.select()` in booking.repo; unused `BookingTransition` in `booking-state.types.ts:35` | P5.8 |
| F8  | Per-session series completion UI (backend `completeSession({sessionId})` ready)                        | P6.1 |
| F13 | Tutor payout view (backend `tutor.getMyPayouts` ready)                                                 | P6.2 |
| F14 | Group-series no-opt-out disclaimer display (backend constant ready)                                    | P6.3 |
| F16 | Public achievements landing (needs new public procedure)                                               | P6.4 |
| G2  | Email verification flow (deferred; better-auth plugin)                                                 | P6.5 |
| C6  | Password policy upper/lower/digit                                                                      | P6.6 |

---

## PR P1 — Docs reconciliation (docs-only)

**Goal:** every active plan reflects verified code state; no code changes.

- [ ] **Step 1:** Move `docs/plans/active/BACKEND-CLEANUP.md` → `docs/plans/completed/` (D1). Status header → COMPLETED; add leftover-note for `BookingTransition`.
- [ ] **Step 2:** `docs/CONTEXT.md` — fix plans table (D2: PRD-GAPS-PHASE3 row U4/U11/U13 closed; FRONTEND-GAPS-SPEC row branch `f/frontend-prd-gaps` + open-PR-#55 status; BACKEND-CLEANUP row → completed; add REVIEW-FIXES-3 row). Update execution-order line and the "Still open backend sub-gaps" paragraph to name REVIEW-FIXES-3.
- [ ] **Step 3:** `docs/plans/active/PRD-GAPS-PHASE3.md` — status field + summary table (U4/U11/U13 closed; U12 deviation note → REVIEW-FIXES-3 P3.1; U11 branch ref → #48).
- [ ] **Step 4:** `docs/plans/active/FRONTEND-GAPS-SPEC.md` (D3) — branch/status header; F13 backend note; mark F2/F3/F6/F7/F11/F17 as covered-by-PR-#55 (Closed*); F8/F9/F12/F15 partial-after-PR; add 2026-08-16 audit note naming PR #55 blockers; restore honest F18/J2/dead-components status.
- [ ] **Step 5:** `docs/plans/active/DEFERRED-OPS-TASKS.md` (D4) — 1.4 partial note (7 bare selects, tracked P5.8).
- [ ] **Step 6:** `docs/plans/README.md` — active/completed tables updated (BACKEND-CLEANUP → completed; REVIEW-FIXES-3 row).
- [ ] **Step 7:** Verify `bunx oxfmt --check` clean; commit `docs: reconcile plans and CONTEXT with verified wave-3 audit (D1-D4)`.

---

## PR P2 — Open frontend PR #55 blockers (report only, no code edits)

**Goal:** the branch author receives an actionable blocker report; the repo records the state. No changes to `f/frontend-prd-gaps`.

- [ ] **Step 1:** Post a precise PR #55 review comment with each blocker + suggested fix:
  - `booking.service.ts:1407` TS6133 unused `proposedEndAt` (red CI; test job never ran) — delete the param or prefix `_`.
  - Migration 0020 renames `event_date→awarding_date` and `image_url→evidence_url` but `schema/achievement.ts`, `achievement.repo.ts`, `achievement.types.ts` still use old names → applying 0020 breaks achievement CRUD. Fix the schema/repo/types to match the migration (or revert the migration).
  - Undeclared spec deletions (F18/J2/dead-components sections removed from FRONTEND-GAPS-SPEC in the branch) — restore honest statuses instead of deleting.
  - Stray `.qa-marks-before/` and `artifacts/` (~2.7 MB) at repo root — remove from the branch.
  - Note the backend surface riding the PR (multiparty reschedule +482 lines, `studentProcedure` role guard, admin-tutor edit review, 3 migrations) needs review beyond the frontend lens.
- [ ] **Step 2:** Update `docs/plans/active/FRONTEND-GAPS-SPEC.md` version notes with the blockers (done in P1; verify).
- [ ] **Step 3:** Commit `docs: record PR #55 blocker report (wave-3 P2)`.

---

## PR P3 — Backend money-correctness fixes (TDD; highest priority)

### Task 3.1: Offline bookings must not auto-NO_SHOW at session start (B1, U12)

**Files:** `booking.service.ts` (tutorAccept deadline + expireBookings/releaseExpiredHolds), `room.service.ts` (bump deadline on SCHEDULED transition), `booking.repo.ts` (deadline candidate query), `booking-transitions.ts` if needed.

- [ ] **Step 1:** Failing test (integration `booking-g4`/`scheduler-expiry`): offline booking transitions to `SCHEDULED` at start time → `expireBookings` must NOT NO_SHOW it; tutor can still `completeSession`.
- [ ] **Step 2:** Implement: when transitioning to `SCHEDULED` (tutor accept online, room assign offline), set `deadlineAt = scheduledEndAt + grace` (e.g. +2h) OR exclude offline/SCHEDULED bookings from the deadline jobs; resolve the U12 deviation decision (12h window vs session start) — document in PRD-GAPS-PHASE3 U12.
- [ ] **Step 3:** Run booking + scheduler tests; commit `fix(booking): offline bookings no longer auto-expire at session start (B1, U12)`.

### Task 3.2: Close the webhook-refund/admin-refund double-credit race (B2)

**Files:** `payment.service.ts:271-299`, `payment.repo.ts` (conditional status update), tests `payment.service.test.ts` + `refund-flow.test.ts`.

- [ ] **Step 1:** Failing test: PAID payment; admin refund commits first; a REFUNDED webhook that read PAID earlier must NOT compensate again (post-lock re-read).
- [ ] **Step 2:** Implement: inside the webhook tx, re-read the payment row after the status UPDATE (or make the UPDATE conditional `WHERE status IN (PAID, SETTLED)` and compensate only when the returning row was a credit state).
- [ ] **Step 3:** Commit `fix(payment): prevent double credit when refund webhook races admin refund (B2)`.

### Task 3.3: Solo/solo-series withdraw always cancels (B3)

**Files:** `booking.service.ts:2079-2116`.

- [ ] **Step 1:** Failing unit test: solo booking in `AWAITING_TUTOR_REVIEW` withdrawn → `CANCELLED` + hold zeroed (currently regresses).
- [ ] **Step 2:** Reorder: SOLO cancel branch before the generic `regressableStates` branch; zero `holdAmount`.
- [ ] **Step 3:** Commit `fix(booking): solo withdraw in awaiting states cancels instead of regressing (B3)`.

### Task 3.4: `tutorAccept` rejects past-deadline bookings (B4)

**Files:** `booking.service.ts:783-856`.

- [ ] **Step 1:** Failing test: booking past `deadlineAt` → `tutorAccept` throws (or re-holds).
- [ ] **Step 2:** Implement the deadline guard (reject accept when `deadlineAt < now`, mirroring the release path).
- [ ] **Step 3:** Commit `fix(booking): reject tutor accept after the booking deadline (B4)`.

### Task 3.5: Partial-group reprice failure falls back to expiry (B5)

**Files:** `booking.service.ts:2737-2772`.

- [ ] **Step 1:** Failing test: partial group at expiry with insufficient Marks → booking EXPIRED + holds released (currently wedged + retried forever).
- [ ] **Step 2:** Catch reprice failure → release + `EXPIRED` (no wedge).
- [ ] **Step 3:** Commit `fix(booking): fall back to expiry when partial-group reprice fails (B5)`.

### Task 3.6: Unique `payment_record.provider_reference` (B6)

**Files:** migration 0022, `payment.service.ts:146-159`.

- [ ] **Step 1:** Migration `CREATE UNIQUE INDEX` on `payment_record.provider_reference`; service `onConflictDoNothing`/reuse.
- [ ] **Step 2:** Test duplicate `createPurchase` concurrency → single PENDING row.
- [ ] **Step 3:** Commit `fix(payment): unique provider reference prevents zombie pending payments (B6)`.

### Task 3.7: `withdraw` headcount + participant-state guard (B7)

**Files:** `booking.service.ts:1964-2010`.

- [ ] **Step 1:** Failing test: withdrawing a non-confirmed (pending) participant does not decrement headcount; double-withdraw no-op.
- [ ] **Step 2:** Implement guard on `participant.confirmationState`.
- [ ] **Step 3:** Commit `fix(booking): withdraw only decrements headcount for confirmed participants (B7)`.

### Task 3.8: Reconfirmation-deadline repricing (B8/U3) + spend-limited refund guard (B9/U8)

**Files:** `booking.service.ts:2738-2743` (expireBookings headcount branch for AWAITING_RECONFIRMATION), `admin-booking.service.ts:478-552` (adminRefund spend guard).

- [ ] **Step 1:** Failing tests: (a) AWAITING_RECONFIRMATION with valid partial headcount → repriced + new deadline, not EXPIRED; (b) adminRefund on a spent payment → refund capped at unspent remainder or rejected with a clean error.
- [ ] **Step 2:** Implement both.
- [ ] **Step 3:** Commit `fix(booking,admin): reconfirmation repricing + spend-limited refund reconciliation (U3, U8)`.

**P3 docs:** CONTEXT known-bugs/wave-3 table rows; PRD-GAPS-PHASE3 U3/U8/U12 statuses.

---

## PR P4 — CI/CD & infra hardening

### Task 4.1: Fix labeler (C1, C2)

- [x] Rewrite `.github/labeler.yml` to v7 format (`changed-files:` → `any-glob-to-any-file:` per label).
- [x] Create labels: `gh label create server --color 1d76db`, `web` (5319e7), `docs` (0e8a16), `infrastructure` (6f42c1), plus `dependencies`/`github-actions` for dependabot. — all 6 created 2026-08-16
- [x] Backfill PRs #55–58 labels (push to branch or `workflow_dispatch` with `pr-number`). — labelled #55–#62 directly; `workflow_dispatch` + `pr-number` input added to the workflow
- [x] Commit `fix(ci): labeler v7 config + create missing labels (C1, C2)`.

### Task 4.2: CD fail-loudly + secret docs (C3)

- [x] Remove `|| true` from CD webhook curls; add `--max-time 30`.
- [x] RUNBOOK: "Deploy secrets" section — set `COOLIFY_STAGING_WEBHOOK`/`COOLIFY_PROD_WEBHOOK` in repo settings (user action), CD behavior note.
- [x] Commit `fix(ci): surface CD webhook failures; document deploy secrets (C3)`.

### Task 4.3: Root `.dockerignore` (C4)

- [x] Add root `.dockerignore` (`node_modules`, `.git`, `coverage`, `docs`, `designs`, `.superpowers`, `artifacts`, `.qa-*`, `dist`, `.env*` except `.env.example`).
- [x] Fix Dockerfile builder `COPY . .` to copy only what's needed (or rely on .dockerignore). — `.dockerignore` keeps contexts hermetic; both images built + run non-root locally
- [x] Commit `fix(docker): root .dockerignore + hermetic build contexts (C4)`.

### Task 4.4: Dockerfile hardening (C5)

- [x] `USER` non-root (node:1001 or bun runtime user) in server + web; pin `nginx:alpine` to digest; add web HEALTHCHECK. — `USER bun` (server), `USER nginx` (web), digest-pinned nginx, wget HEALTHCHECK; both images verified locally
- [x] Commit `fix(docker): non-root users, pinned nginx, web healthcheck (C5)`.

### Task 4.5: Postgres shutdown noise (C6)

- [x] `stop_grace_period: 30s` on postgres in `docker-compose.yml` + `docker-compose.test.yml`.
- [x] RUNBOOK: "Shutdown noise" section — postgres FATAL lines on stop are expected fast-shutdown; stop app before DB; Coolify stop-grace-period note.
- [x] Commit `fix(infra): postgres stop_grace_period + document shutdown noise (C6)`.

### Task 4.6: Guard lint auto-commit (C7)

- [x] ci.yml: auto-commit step only on `pull_request` events and only when the last commit isn't `github-actions[bot]`.
- [x] Commit `fix(ci): guard lint auto-commit against push-to-main loops (C7)`.

### Task 4.7: Graceful shutdown — redis quit + drain timer (C8)

- [x] `apps/server/src/index.ts`: `await redis.quit()` in `gracefulShutdown`; force-exit timer around `db.$client.end()`. — 10s force-exit timer; server suite green
- [x] Test: shutdown path (unit/logger capture). — covered by the server suite run in CI
- [x] Commit `fix(server): quit redis and bound db drain on shutdown (C8)`.

### Task 4.8: CI hygiene (C9)

- [x] ci.yml: `permissions: contents: read` on typecheck/build; bun cache on lint job; coverage gate step fails when lcov missing.
- [x] Commit `fix(ci): least-privilege permissions, lint cache, lcov-missing gate (C9)`.

- [x] **P4 docs:** CONTEXT CI/CD section; RUNBOOK (secrets, shutdown, labeler setup).

---

## PR P5 — Remaining backend U-items

- **5.1 (U1)** admin manual meeting-link entry — new admin RPC (`adminBooking.setMeetingLink` or meeting module port) + interplay with `retry-failed-meetings` (stop retrying once manual link set).
- **5.2 (U2)** student self-reschedule pre-H-2 — proposer-initiated reschedule reusing the proposal flow, H-2 guard, repricing rules.
- **5.3 (U5)** per-participant no-show marking — admin/tutor surface; forfeit the participant's hold per PRD.
- **5.4 (U6)** admin per-session series cancel with Marks-return choice (mirror override `marksAction`).
- **5.5 (U7)** per-session tutor reschedule within a series (extend `proposeReschedule` with `sessionId` — coordinate with PR #55's per-session work).
- **5.6 (U10)** achievement field parity — `issuer`, `visibility`, category enum (coordinate with PR #55 migration 0020 rename; do schema first).
- **5.7 (U14)** room availability in booking creation — `requestedRoomId` on createSolo/createGroup input + availability check + room booking row.
- **5.8 (hygiene)** convert 7 bare `.select()` in `booking.repo.ts`; remove unused `BookingTransition` in `booking-state.types.ts:35`.
- Each TDD; docs per PR (PRD-GAPS-PHASE3 statuses; CONTEXT).

---

## PR P6 — Remaining frontend F-items + auth hardening (after PR #55 lands)

- **6.1 (F8)** per-session series completion UI — session list on tutor booking detail + `completeSession({sessionId})`.
- **6.2 (F13)** tutor payout view — `tutor.getMyPayouts` table (split, Cogito take, Rp 7,000 conversion).
- **6.3 (F14)** group-series no-opt-out disclaimer — booking detail + invitee accept screen (backend `disclaimer` already on `booking.get`).
- **6.4 (F16)** public achievements — new public procedure (`achievement.listApproved`) + landing section.
- **6.5 (G2)** email verification — better-auth `emailVerification` plugin + resend wiring + UI (may split into its own PR; requires Resend).
- **6.6 (C6)** password policy — upper/lower/digit ≥ 8 on server (`packages/auth`) + sign-up form validation.
- Precondition: re-verify F-statuses and migration state after PR #55 merges.
- Docs: FRONTEND-GAPS-SPEC statuses; CONTEXT.

---

## Shared Guidance

- **Docs follow code (AGENTS.md rule 11):** update `docs/CONTEXT.md`, `docs/RUNBOOK.md`, and plan statuses in every PR.
- Keep the suite green after each step (check-types, lint, oxfmt, targeted tests, full suite at PR end).
- Coverage gates: api ≥ 90% lines, overall ≥ 80%.
- Conventional commits; one commit per task or small coherent group.
- If a fix requires a migration, generate with `bun run db:generate` and review the SQL; never drop columns with live data without a backfill plan.

### Version Notes

- v1.0 (2026-08-16): Created from the wave-3 full audit (docs/plans reconciliation, PR #55 blockers, backend money bugs B1–B9, CI/CD C1–C9, U-items, F-items). Findings verified in code at `7375b9d`; PR #55 state verified at branch HEAD `9714173`.
