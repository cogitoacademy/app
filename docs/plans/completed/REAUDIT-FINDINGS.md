# Post-Finalization Re-Audit — Findings & Fix Plan

| Field   | Value                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Status  | Completed (2026-08-26)                                                                                        |
| Created | 2026-08-26                                                                                                   |
| Trigger | Re-audit after PR #106 (backend finalization) merged as `9919264`                                            |
| Method  | Two read-only review workers (API-layer + server-layer), all HIGH/MEDIUM findings lead-verified against code |
| Branch  | `fix/rea-audit-findings`                                                                                     |
| Scope   | Correctness + security + deployment wiring gaps found in the re-audit                                        |

## Context

PR #106 fixed the 10 documented gaps + 26 audit findings (F1–F25/S1–S14). This re-audit verifies those fixes landed correctly **and** hunts for new concerns. Result: 20/21 merged fixes VERIFIED correct; 2 new code findings (1 HIGH, 1 MEDIUM), 1 HIGH env-template drift, 1 MEDIUM doc claim drift, plus 10 deployment-readiness gaps that feed the deployment plan.

## Verified-sound summary (from the re-audit)

- Email-verification gate, invite admin-demotion guard, escaped withdraw reason, outbox predicate, tutor-row headcount exclusion, lateness sweep (offline included), meeting deadline bumps, per-payment FIFO refunds, room-assign guards, achievement archive/restore, role-scope tightening, seed prices (PRD OQ-01), scheduler fail-loud, content-proxy hardening, S4 rate-limit matching, migration down-section removal — all VERIFIED in code with regression tests.
- BullMQ repeatable jobs dedupe by name/pattern across replicas — no double-firing risk with 2 instances (confirmed by BullMQ semantics).

## Implemented in the current worktree (2026-08-26)

- [x] N1 — synchronized the booking-level group hold/snapshot even when the per-student price is unchanged; added a flat-price reconfirmation regression test.
- [x] N2 — allowed an admin to move a suspended tutor to `changes_requested` or `approved_unpublished`, while keeping direct `publish` from `suspended` blocked; added state-machine tests.
- [x] W1 — corrected the production `BETTER_AUTH_URL` example to `https://api.cogitoacademy.id`.
- [x] W2 — added the standalone `seed-packages` production/staging guard and test; the RUNBOOK claim is now true.
- [x] N3 — synchronized confirmed offline room assignments on booking-level reschedule accept/reject/expiry, with conflict/missing fallback to room approval; added room and booking tests.
- [x] Booking UX follow-up — fixed the one-session group pre-submit hold check and visible hold summary, added deadline countdown/refetch behavior, updated the seeded availability window to support the fixed 90-minute session, and made the browser suite repeatable across seeded booking runs.
- [x] Economy UI follow-up — parse locale-formatted IDR NumberField values safely, allow safe in-progress edits, render save errors without a missing Selia Field context, reset test defaults between runs, and verify the six-spec browser suite end to end (10 tests).
- [x] W4/W5 + RUNBOOK RPC drift — removed the stale webhook header, documented the scheduler health check, and corrected the reschedule procedure paths used by the smoke runbook.

## Verification pass (2026-08-26)

- Browser E2E: 10 pass, 0 fail across six specs. Covered student/tutor/admin
  role boundaries, online group acceptance, tutor decline reason, unauthorized
  booking detail access, future-booking economy snapshots, and invalid negative
  IDR input.
- Backend targeted integration: 67 pass, 0 fail across group reschedule,
  offline room approval, meeting lifecycle/retry, expiry/no-show, group
  repricing, H-2 rules, withdrawal, and room-request flows.
- Full API suite: 2,187 pass, 0 fail across 190 files. Unit coverage for the
  changed booking/room/admin-tutor services: 317 pass, 0 fail.
- Operational finding: the local Google Meet boot probe reports an
  expired/revoked token. The fallback behavior is correct and tested, but real
  Google Meet creation must be re-credentialed before a marketing recording.

Already verified before this worktree change: N4 (`createContext` refreshes `emailVerified` from the user row on every request).

## Findings

| ID  | Severity | Area         | Location                                                                                                      | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Why it matters                                                                                                                                        | Remediation                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **HIGH** | Correctness  | `booking.service.ts:2602-2636` (reconfirm F3 branch) + `repriceGroupForHeadcount` early-return (~line 386)    | When the per-student price is **equal** at the old and new headcounts (legacy flat price maps; economics rounding coincidences), the F3 headcount-change branch fires on every reconfirm accept: `snapshotHeadcount` derives from `b.holdAmount`/`perStudent`, the reprice early-returns **without** updating `holdAmount`, so the mismatch persists → all participants reset to `confirmed` + fresh 12h window, forever. Booking never reaches `AWAITING_TUTOR_REVIEW`. | Group booking stuck in reconfirm→reset→reconfirm loop; holds locked indefinitely; no admin surface; students never get a session.                     | Re-derive snapshot headcount from per-participant held amounts (sum of `heldAmount` / perStudent) instead of `b.holdAmount`; when the price is equal, still sync `holdAmount`/snapshot (or skip the reissue branch entirely when the confirmed count matches the participant-held count). Add a regression test with a flat legacy price map (per-student equal at sizes 2 and 3). |
| N2  | MEDIUM   | Admin-Tutor  | `admin-tutor.service.ts` `REVIEW_ACTION_TABLE` (lines 157-176) + `tutor.service.ts` `validateSubmitForReview` | `suspend` is allowed from `published` only, and **no action leaves `suspended`** (`approve_unpublished`/`publish` require `pending_review`/`changes_requested`/`approved_unpublished`; tutor `submitForReview` requires `draft`/`changes_requested`).                                                                                                                                                                                                                    | A suspended tutor (PRD FR-24 allows suspension) can never be reinstated — permanent hidden profile; admin gets no error explaining why restore fails. | Add `suspended → [approve_unpublished, changes_requested]` to `REVIEW_ACTION_TABLE` (or an explicit `restore` action), and/or let tutor `submitForReview` accept `suspended` after re-editing.                                                                                                                                                                                     |
| W1  | **HIGH** | Env template | `infra/.env.prod.example:5`                                                                                   | `BETTER_AUTH_URL=https://cogitoacademy.id` — every other source (RUNBOOK, coolify-setup.md, CONTEXT, staging example) uses `https://api.cogitoacademy.id`.                                                                                                                                                                                                                                                                                                               | Copy-paste drift: a deploy following this example sets the auth cookie domain to the apex, breaking cookie-based auth.                                | Change to `https://api.cogitoacademy.id`.                                                                                                                                                                                                                                                                                                                                          |
| W2  | MEDIUM   | Docs         | `docs/RUNBOOK.md:217`                                                                                         | RUNBOOK claims `NODE_ENV=production bun run seed-packages` exits with error; the prod guard only exists in `seed.ts`, not `seed-packages.ts`.                                                                                                                                                                                                                                                                                                                            | False safety claim — an operator relying on it could run `seed-packages` against prod.                                                                | Add the same `seedAllowed` guard to `seed-packages.ts` (or fix the doc).                                                                                                                                                                                                                                                                                                           |
| N3  | Low-Med  | Room         | `room.service.ts:141-153,213-220`                                                                             | The `RESCHEDULE_PROPOSED` carve-out lets an admin insert a CONFIRMED `roomBooking` (at the proposal time) before the proposal is accepted; if the proposal later REJECTS, the room row keeps the proposal's time while the booking returns to its original schedule — room time and session time diverge; room stays booked for the wrong window.                                                                                                                        | Availability pollution + double-book risk for other offline bookings.                                                                                 | On proposal rejection/expiry, update the confirmed roomBooking row back to the original schedule (or cancel it).                                                                                                                                                                                                                                                                   |
| N4  | Low      | Auth         | `procedures.ts` requireVerifiedStudent + `context.ts`                                                         | `emailVerified` read from the session cookie (60s `SESSION_COOKIE_CACHE_MAX_AGE`), so a just-verified user can be gated up to 60s.                                                                                                                                                                                                                                                                                                                                       | Minor UX friction on fresh OTP verification; no security impact.                                                                                      | Re-fetch `emailVerified` from DB alongside `role` in `createContext`.                                                                                                                                                                                                                                                                                                              |
| W3  | MEDIUM   | Webhook      | `apps/server/src/webhooks/payments.ts:44`                                                                     | `POST /webhooks/payments/:provider` accepts arbitrary `provider` URL segment (signature path selection); bounded by signature + IP allowlist — defense-in-depth only, **no code change needed**, but `WEBHOOK_ALLOWED_IPS` MUST be set at deploy.                                                                                                                                                                                                                        | Feed into deployment checklist (see Deployment gaps D2).                                                                                              |
| W4  | LOW      | Docs         | `docs/API-REFERENCE.md:481`                                                                                   | Stale `x-event-id` header documented; code reads only `x-callback-token` (xendit) / `x-webhook-signature`.                                                                                                                                                                                                                                                                                                                                                               | Doc drift.                                                                                                                                            | Remove `x-event-id` from the webhook Input list.                                                                                                                                                                                                                                                                                                                                   |
| W5  | LOW      | Docs         | `infra/monitoring.md:14`                                                                                      | Health JSON example omits `checks.scheduler` (added in #106).                                                                                                                                                                                                                                                                                                                                                                                                            | Doc drift.                                                                                                                                            | Add the scheduler check to the example.                                                                                                                                                                                                                                                                                                                                            |
| W6  | LOW      | Ops          | `apps/server/src/webhooks/payments.ts:66`                                                                     | Non-xendit providers validate `x-timestamp` OR `date` — a provider sending a different `Date` format 408s every webhook. Only stub uses this today.                                                                                                                                                                                                                                                                                                                      | Defense-in-depth note.                                                                                                                                | No change; note for future providers.                                                                                                                                                                                                                                                                                                                                              |
| W9  | LOW      | Ops          | `packages/api/src/lib/rate-limit.ts:104`                                                                      | Redis outage → in-memory rate-limit fallback per process; 2 replicas each allow 2× the limit.                                                                                                                                                                                                                                                                                                                                                                            | Degraded-mode note.                                                                                                                                   | Document in RUNBOOK §Redis (multi-instance dilution).                                                                                                                                                                                                                                                                                                                              |
| W12 | LOW      | Server       | `apps/server/src/index.ts:20-26`                                                                              | `unhandledRejection` logs but does not exit; a rejected promise in a request path leaves the process running with possibly-corrupt state.                                                                                                                                                                                                                                                                                                                                | Health stays `ok` despite corruption.                                                                                                                 | Consider `process.exit(1)` on unhandledRejection in production.                                                                                                                                                                                                                                                                                                                    |

## Doc drift (no code change)

- [x] RUNBOOK manual smoke section now uses the current RPC paths (`/rpc/booking/proposeReschedule`, `/rpc/tutorActions/proposeReschedule`).
- [x] CONTEXT known-bugs table + API-REFERENCE RPC paths verified correct after #106.

## Deployment-readiness gaps (feed `DEPLOYMENT-FINALIZATION` plan)

1. **No automated DB backup path** (pg_dump/snapshot job) — the Coolify Postgres volume is the only persistence. Mandatory before real payments.
2. **`WEBHOOK_ALLOWED_IPS` not enforced by env schema** in prod with `PAYMENT_PROVIDER=xendit` — empty allowlist = all IPs allowed (signature still gates). Add a prod superRefine.
3. **`SCHEDULER_ENABLED=true` not forced in prod-like envs** — a prod server started without it silently skips all jobs. Add a prod env guard or boot alert.
4. **No automated `db:migrate` step in the deploy pipeline** — RUNBOOK has manual instructions only; CD pushes the image without a migration gate.
5. No secret-rotation / leak-review step in the deploy (Coolify env is the vault — confirm SOPS is the source).
6. Migrations-on-deploy decision also affects rollback ordering (revert code → run down SQL → re-migrate) — documented consistently.
7. Log rotation (10m×3) configured; `METRICS_TOKEN` set but no metric ingestion/alert integration beyond Uptime Kuma polling `/health`.
8. Coolify's bundled Postgres is non-TLS (transport plaintext on the private Docker network — acceptable single-VPS; note for managed DB later).
9. `seed-packages` re-run on prod before payments go live; delete stale `mark_package` rows first (`onConflictDoNothing`).
10. S7 (CD webhook secret unset → curl exit 6) still blocking every main push deploy.

## Tasks

### Task 1: Fix N1 — reconfirm reissue loop (HIGH) — COMPLETE (2026-08-26)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts` (F3 branch ~2602-2636; add a participant-held-sum headcount derivation)
- Test: extend `packages/api/src/tests/unit/booking.service.test.ts` or the reprice integration test — add a **flat legacy price map** case (per-student equal at sizes 2 and 3) asserting the booking finalizes to `AWAITING_TUTOR_REVIEW` after the headcount-change reissue (no loop).
- Docs: `docs/MODULE-REFERENCE.md` booking reconfirm rule (snapshot headcount derivation)

**Steps:**

1. Write the failing test (flat map; 3→2 headcount; assert finalize).
2. Run — expect the loop (test times out or never reaches tutor review).
3. Implement: derive snapshot headcount from sum of participant `heldAmount` (exclude tutor row); when the price is equal, sync `holdAmount` so the derivation matches; keep the reissue branch.
4. Run full `packages/api` suite — PASS.
5. Commit `fix(booking): prevent reconfirm reissue loop when per-student price is unchanged`

### Task 2: Fix N2 — suspended tutor restore path (MEDIUM) — COMPLETE (2026-08-26)

**Files:**

- Modify: `packages/api/src/modules/admin-tutor/admin-tutor.service.ts` (`REVIEW_ACTION_TABLE` — allow `approve_unpublished`/`changes_requested` from `suspended`)
- Modify: `packages/api/src/modules/tutor/tutor.service.ts` (`validateSubmitForReview` — accept `suspended` after re-edit, or document the admin-only restore)
- Test: extend `packages/api/src/tests/unit/admin-tutor.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` admin-tutor rules (suspended restore)

**Steps:** TDD (fail → pass) as above. Commit `fix(admin-tutor): allow restoring suspended tutor profiles`.

### Task 3: Fix W1 — `.env.prod.example` BETTER_AUTH_URL (HIGH) — COMPLETE (2026-08-26)

Change `infra/.env.prod.example:5` to `https://api.cogitoacademy.id`. Commit `fix(infra): correct BETTER_AUTH_URL in prod env example`. No test; typecheck + lint.

### Task 4: Fix W2 — seed-packages prod guard (MEDIUM) — COMPLETE (2026-08-26)

**Files:** `apps/server/src/seed-packages.ts` — add the same `seedAllowed` guard from `seed.ts:23` (env + SEED_ALLOWED_IN_PROD). Test: `apps/server/src/seed.test.ts` (prod NODE_ENV exits). Docs: RUNBOOK claim becomes true.

Commit `fix(seed): add production guard to seed-packages`.

### Task 5: Fix N3 (Low-Med) — room row time drift on reschedule rejection — COMPLETE (2026-08-26)

**Files:** `packages/api/src/modules/booking/booking.service.ts` (proposal rejection/expiry paths) + `room.service.ts` (port to reset the confirmed row back to the original schedule).
Test: proposal reject → confirmed roomBooking time equals the original schedule.
Commit `fix(room): resync room booking times when a reschedule proposal is rejected`.

### Task 6: Fix N4 (LOW) — re-fetch `emailVerified` in createContext — COMPLETE (2026-08-26)

**Files:** `packages/api/src/context.ts` — add `emailVerified` to the per-request user refresh (alongside `role`).
Test: existing context tests.
Commit `fix(auth): refresh emailVerified per request`.

### Task 7: Doc drift sweep (W4/W5 + RUNBOOK RPC paths) — COMPLETE (2026-08-26)

- `docs/API-REFERENCE.md`: remove `x-event-id` webhook header.
- `infra/monitoring.md`: add `checks.scheduler` to health example.
- `docs/RUNBOOK.md`: fix RPC paths in smoke section.
  Commit `docs: align webhook/health/RPC references with code`.

### Task 8: Deployment-readiness env guards (D2/D3) — code

- `packages/env/src/server.ts`: superRefine — in prod-like envs, `PAYMENT_PROVIDER=xendit` ⇒ `WEBHOOK_ALLOWED_IPS` required; `SCHEDULER_ENABLED=true` required (or a warn).
- Tests in `packages/env` / `apps/server/src/env-*.test.ts`.
- Docs: RUNBOOK env table.
  Commit `fix(env): require webhook allowlist and scheduler in production`.

### Task 9: Deployment plan — `docs/plans/active/DEPLOYMENT-FINAL.md`

Separate plan for the deployment wave (user-approved scope): backups, CD migration gate, monitoring stack, secrets (SOPS), staging wiring, DNS/Cloudflare, drill/rollback. See the deployment discussion in the session before this plan.

## Exit gate

- `bun run test` (packages/api) green; `bun run check-types` green; `bun run lint` green.
- CI on the PR green.
- Docs updated in the same PR (AGENTS.md rule 11).
- Deployment plan (Task 9) created in `docs/plans/active/` with user-approved scope.
