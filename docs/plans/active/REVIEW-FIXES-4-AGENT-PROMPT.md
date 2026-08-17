# Fresh-Context Agent Prompt — Wave-4 Audit Execution (REVIEW-FIXES-4)

Use this prompt to dispatch a fresh-context agent to execute the REVIEW-FIXES-4 plan. Copy everything between the markers into the agent prompt.

---

You are executing the plan at `docs/plans/active/REVIEW-FIXES-4.md` in the monorepo `/Users/miapalovaara/cogito/app` (Bun + Elysia + oRPC + Drizzle + PostgreSQL + Redis; monorepo with `packages/` and `apps/`). Work from a fresh worktree off `origin/main` (e.g. `/Users/miapalovaara/cogito/wt-review-fixes4`, branch `fix/review-fixes-4`). Create your own worktree; do not reuse stale ones.

Use superpowers `executing-plans` (or `subagent-driven-development`). Implement PRs P1–P4 task-by-task, TDD (failing tests first), conventional commits, docs updates in the same PR (AGENTS.md rule 11). Track every task in `.superpowers/sdd/REVIEW-FIXES-4/progress.md`.

## Global facts you must honor

- RPC HTTP paths are the oRPC procedure keys with slashes (`/rpc/auth/getProfile`), NOT dotted names; request bodies use the `{"json": <input>}` envelope; responses come back as `{"json": <data>, "meta": [...]}`.
- Verify per task: `bun run check-types`, `bun run lint`, `bunx oxfmt --check`, targeted tests.
- Full suite (plain run, GOOGLE_MEET unset):
  `GOOGLE_MEET_ENABLED=false GOOGLE_MEET_REFRESH_TOKEN= GOOGLE_MEET_CLIENT_ID= GOOGLE_MEET_CLIENT_SECRET= GOOGLE_CLIENT_EMAIL= GOOGLE_PRIVATE_KEY= bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts`
  plus `bun test --env-file apps/server/.env apps/server/src/` in a SEPARATE process (webhook TTL test uses `mock.module`, which shadows `@cogito-app/api` process-wide).
- Coverage gates: `packages/api` >= 90% lines, overall >= 80%. Baseline: API 1803 pass / 0 fail, server 44 pass / 0 fail; api 97.6%, overall 97.5%.
- Docker for DB+Redis: `bun run db:start` (Postgres 6767, Redis 6379). Local `.env` files are gitignored — copy `apps/server/.env` + `apps/server/.env.test` from the main checkout into the worktree (add `REDIS_URL=redis://localhost:6379` if missing; `DATABASE_URL` must point at a dedicated `cogito-test*` DB, NOT `cogito-app`).
- Every PR updates `docs/CONTEXT.md` (wave-4 findings table), the plan checkboxes/status in `docs/plans/active/REVIEW-FIXES-4.md`, and any API/MODULE/RUNBOOK references it touches.

## Key audit facts (verified 2026-08-17; trust these, re-verify cheaply if needed)

- Backend money bugs: C1 `markParticipantNoShow` group branch `booking.service.ts:1419-1514` (1486-1493 whole-booking NO_SHOW, strands other holds); C2 H-2 reschedule bypass `booking.service.ts:1576-1604` (no current-session check); C3 `completeSingleSession` missing start-time guard `booking.service.ts:1015-1027` vs series guard `:1112-1114`; H1 reschedule-accept stale deadline `booking.service.ts:1685-1689` + `:1780-1786` + expire `:3148-3152,3263-3299`; H2 tutor-lateness both-ways flaw `booking.repo.ts:651-679` + `booking.service.ts:1516-1552`; H3 `relocateRoom` no transition `room.service.ts:173-227` vs assignRoom `:157-159`; H4 REFUNDED webhook wedge `payment.service.ts:297-321` + `wallet.repo.ts:194-209` (atomicCompensateDeduct requires available >= amount → throw inside tx → webhook 500 loop); H5 support SLA flat 12h `constants.ts:11` + `support.service.ts:76,114-137`; H6 `applyOverride` no meeting cancel `admin-booking.service.ts:252-402`; M1 override marks no-op when affectedParticipants empty `admin-booking.service.ts:195-250`; M2 expire NO_SHOW releases not forfeits `booking.service.ts:3263-3299`; M3 proposer cancel bypasses group-series no-opt-out `booking.service.ts:731-855`; M4 releaseExpiredHolds no transition `booking.service.ts:3342-3392`; M5 reconfirm-decline/withdraw no deadline refresh `booking.service.ts:2264-2318,2467-2478`; M6 cancelRoomBooking doesn't cancel booking `room.service.ts:229-253`; M7 withdraw from room-approval leaves requested roomBooking live; M8 withdraw reprice throws `booking.service.ts:375-381`; M9 KB endpoint not student-only `wallet.router.ts:35-42`.
- Docs/plans: REVIEW-FIXES-3 still active (move to completed, D1); PRD-GAPS-PHASE3 header over-claims (D2); phantom `rescheduleSelf`/`approveReschedule` (D3); DEFERRED-OPS 1.4 says 7 bare `.select()` but 0 remain (D4); CONTEXT plans table + API lists + C6 status stale (D5–D8); plans README index stale (D9); `.superpowers/sdd` untracked (D10).
- Third-party: Xendit provider `xendit-payment.provider.ts:60-188` uses the **legacy v3 shape** (amount/payment_method/success_redirect_url; parses `data.actions[].url`; statuses PENDING/PAID/…; webhook expects `event_id`). Current API (`api-version: 2024-11-11`) needs request_amount/channel_code/channel_properties/customer, top-level response with `actions[]{type,value,descriptor}`, statuses SUCCEEDED/REQUIRES_ACTION/AUTHORIZED/CANCELED, webhook `data.payment_id`. Verified against the Xendit OpenAPI (docs.xendit.co/apidocs/create-payment-request). No refund call in `PaymentProvider` (`payment.service.ts:31-38`) — `adminRefund` only credits Marks (`admin-booking.service.ts:483-576`).
- Resend provider is correct (`resend-email.provider.ts`); missing prod guard (RESEND_API_KEY optional, silent stub). Google Meet provider OAuth+SA paths correct (`google-meeting.provider.ts`); missing `GOOGLE_IMPERSONATED_USER` guard + `.env.prod.example` broken. R2 presigned POST correct (`storage.ts`); missing prod guard + `R2_PUBLIC_URL` coupling + env examples.

## PR order (each independently mergeable, conventional commits, wait for CI green)

- **P1** — Docs/planning reconciliation (docs-only, plus `.superpowers/sdd` disposition decision): move REVIEW-FIXES-3 to `completed/`; fix PRD-GAPS-PHASE3 header/intro/migration numbers/phantom names; DEFERRED-OPS 1.4; CONTEXT plans table + API lists + C6 status + execution order + wave-4 findings table; plans README; RUNBOOK env swap section; decide + record `.superpowers/sdd` disposition (recommended: keep as execution ledger, commit/archive untracked BACKEND-HARDENING history). Commit `docs: reconcile plans, CONTEXT, and README with verified wave-4 audit (D1-D10)`.
- **P2** — Backend money-correctness + lifecycle (TDD). Tasks 2.1–2.17 exactly as the plan: group no-show per-participant (C1); H-2 reschedule guard (C2); completeSession start guard (C3); reschedule accept deadline bump (H1); tutor lateness window+signals (H2); relocateRoom transition (H3); REFUNDED webhook reconciliation not throw (H4); support SLA business-hours WIB + escalation hook + auto-ack (H5); override meeting cancel + marks-action-requires-participants (H6/M1); expire NO_SHOW forfeit not release (M2); group-series cancel guard (M3); releaseExpiredHolds transition-or-skip (M4); deadline refresh (M5/M7); cancelRoomBooking cancels booking (M6); withdraw reprice fallback (M8); KB studentProcedure + L1/L2/L3. Commits per task.
- **P3** — Xendit provider rewrite (TDD) against `api-version: 2024-11-11` + refund port + status/webhook rework + timestamp verification + env redirect requirements (3.1–3.7). Before QA, ask the user for Xendit sandbox keys; gate production on a sandbox E2E. Commit `fix(payment): rewrite Xendit provider for the 2024-11-11 API + provider refunds (X1)`.
- **P4** — Fail-loud guards + ops docs: RESEND_API_KEY required in prod (4.1); GOOGLE_MEET complete-credential + impersonation guard + boot probe + env examples (4.2); R2 prod guard + R2_PUBLIC_URL + env examples (4.3); G2 email verification as a separate scoped PR, only after 4.1 (4.4). Commit per guard.

## Report per PR

For each merged PR report: commit hash, test counts (targeted + full suite), coverage deltas, PR URL, CI status. When all PRs land: full suite + coverage gates, move `REVIEW-FIXES-4.md` to `docs/plans/completed/`, update `docs/plans/README.md`, update the SDD ledger, and give a final summary table.

---
