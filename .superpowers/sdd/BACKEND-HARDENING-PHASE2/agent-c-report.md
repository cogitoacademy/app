# Agent C — Backend Hardening Phase 2 Implementation Report

Branch: `fix/email-outbox` (worktree `/Users/miapalovaara/cogito/wt-email`)
Commit range: `54d737b`..`1d8ced0` (8 commits, all locally committed, nothing pushed)

## Global Constraints

Followed: conventional commits per green step; `@cogito-app/...` package imports; 4-layer pattern; `DbOrTx`; bounded zod untouched; tests always run with `REDIS_URL=redis://localhost:6381 bun test --env-file apps/server/.env.test.local` (dedicated DB `cogito-test-c`, Redis 6381). No changes to `modules/booking/*`, `modules/room/*`, `modules/meeting/*`, `modules/admin-booking/*`, `lib/sanitize.ts`, `env/server.ts`, `routes.ts`, `seed.ts`, `apps/web`, or `docs/`. `packages/api/src/services.ts` changed only on the `createPaymentModule` wiring lines.

## Per-Task Status

### Task 3.1 — Email outbox (DONE)

- **Files:** `packages/api/src/modules/notification/notification.repo.ts`, `notification.service.ts`, `notification/index.ts`; `packages/api/src/modules/scheduler/scheduler.service.ts`; `apps/server/src/scheduler.ts`; `send-notification-email.job.ts`; tests.
- **What:** `writeInternal` now only inserts the dispatch row with `status='queued'` (inline `emailPort.send` removed). Added `dispatchQueuedEmails(limit=50)` consumer on the notification service (marks sent / suppressed / failed+attempts increment). Repo gained `listQueuedDispatches`, `incrementDispatchAttempts`, `findNotificationById`, and `updateDispatchStatusById` (the existing `updateDispatchStatus` keys on `notificationId`, which is wrong for the consumer — it uses the dispatch row id). `createNotificationService` gained an optional `{ db }` deps param (threaded via `createNotificationModule({ db, email })`) so the consumer can open a connection; existing `write`/`writeBestEffort` signatures unchanged, so the booking module is unaffected. `apps/server/src/scheduler.ts` `onSendNotificationEmail` now calls `services.notification.dispatchQueuedEmails(50)`. `SchedulerHandlers.onSendNotificationEmail` signature changed to `() => Promise<{sent, failed}>` (job carries no data).
- **Tests:** unit tests rewritten to outbox behavior (send NOT called during write; dispatch queued), new `dispatchQueuedEmails` consumer suite, repo method tests, scheduler handler signature tests, G17 integration now asserts `status='queued'` after write and the consumer consuming rows (stub email provider ⇒ `suppressed`).

### Task 3.2 — FAILED/EXPIRED package re-purchase (DONE)

- **Files:** `packages/api/src/modules/payment/payment.service.ts`; `payment.service.test.ts`, `payment-flow.test.ts`.
- **What:** `createIntent` on an existing FAILED/EXPIRED payment resets it to `PENDING` and re-creates a fresh intent (same `providerReference`, idempotent for Xendit) instead of throwing `PackageAlreadyPurchasedError`. PENDING still reused; PAID/SETTLED/REFUNDED still throw.

### Task 5.3 — Payment/refund notifications (DONE with deviation — see Concerns #2)

- **Files:** `packages/api/src/modules/payment/index.ts` (NotificationPort dep), `payment.service.ts` (writes), `services.ts` (wiring), tests.
- **What:** consumer-driven `PaymentNotificationPort` wired at `services.ts`. `confirmFromWebhook` writes a `category=payment`, `emailRequired=true`, `eventKey=payment.{id}.credited` notification on credit, and a `category=refund`, `emailRequired=true`, `eventKey=payment.{id}.refunded` notification on a REFUNDED transition. To make the refund path reachable, the terminal early-returns for PAID/SETTLED now allow a REFUNDED webhook through (consistent with `ALLOWED_TRANSITIONS`). `EMAIL_SUPPORTED_CATEGORIES` already included `payment`/`refund` — no change needed. Payer gets in-app row + queued email dispatch (verified in integration tests).

### Concern C4 — No silent stub fallback (DONE)

- **Files:** `packages/api/src/modules/payment/index.ts`, `services.ts`, new `payment-module.test.ts`.
- **What:** `createPaymentModule` now takes `provider: "xendit" | "stub"` and asserts: `provider=xendit` without `xenditConfig` throws (no silent stub fallback); unknown provider throws. `services.ts` passes `env.PAYMENT_PROVIDER` and only builds `xenditConfig` when `PAYMENT_PROVIDER=xendit` AND keys are present. Env superRefine already fails startup for `xendit` without keys; the module assert is belt-and-suspenders.

### Task 6.1 — Webhook IP allowlist spoof (DONE)

- **Files:** `apps/server/src/webhooks/payments.ts`, `apps/server/src/webhooks/allowlist.test.ts`.
- **What:** `ipAllowed(request, allowlist, trustProxy)` now delegates to `getClientIp` from `packages/api/src/lib/request-id.ts` (XFF first hop only when `TRUST_PROXY`, else `x-real-ip`/`unknown`). Webhook handler calls `ipAllowed(request, allowlist, env.TRUST_PROXY)`. Tests cover spoofed XFF blocked when `trustProxy=false`, real `x-real-ip` allowed, first XFF hop honored when `trustProxy=true`.

### Task 6.2 — Support-ticket SLA auto-escalation (DONE)

- **Files:** `packages/api/src/modules/support/support.repo.ts`, `support.service.ts`; `packages/api/src/modules/scheduler/scheduler.service.ts`; new `escalate-support-tickets.job.ts`; `apps/server/src/scheduler.ts`; tests.
- **What:** new BullMQ repeatable job `escalate-support-tickets` (every 15 min) → `onEscalateSupportTickets` → `services.support.escalatePastSlaTickets()`, which finds open tickets past `slaDeadline`, moves them to `in_progress`, and writes an `audit_log` entry (`action=support_ticket_escalated`, `actorType=system`). **No DB migration / schema change** — reused the existing `status` column (`open` → `in_progress`) per the plan's "reuse status" option; this is the minimal approach consistent with the schema (which uses `db:push`, no per-task migrations; the check constraint already permits `in_progress`). Integration test asserts a ticket backdated past SLA is escalated and audited; a within-SLA ticket is untouched.

## Test Counts

- Full suite: `REDIS_URL=redis://localhost:6381 bun test --env-file apps/server/.env.test.local packages/api/src/tests/ apps/server/src/openapi.test.ts` → **1595 pass / 1 skip / 0 fail** (baseline at fork: 1566 pass / 1 skip / 0 fail; +29 tests, 0 failures).
- `bun run check-types`: passes (3 tasks success).
- `bun run lint`: exits 1 due to ONE pre-existing error outside owned files (see Concerns #1). All owned files lint clean (`bunx oxlint` on notification/payment/support/scheduler/webhooks/tests: 38 warnings, 0 errors).

## Concerns

1. **Pre-existing lint error (not owned):** `bun run lint` fails with `eslint(preserve-caught-error)` in `packages/api/src/modules/meeting/google-meeting.provider.ts:129` (meeting module — explicitly do-not-modify, unchanged since before the fork). Verified pre-existing by stashing all my changes. Report to the plan owner; it blocks a fully green `bun run lint` gate.
2. **Admin-refund notification gap:** the actual admin-refund path is `admin-booking.service.ts#adminRefund` (module not owned — cannot modify). The refund notification is instead written by the payment module when a payment transitions to REFUNDED via webhook (`confirmFromWebhook`), which is the production path for Xendit refund events. `admin-booking.adminRefund` still does not emit a refund notification — a follow-up owned by whoever owns `modules/admin-booking/*` is required for the admin-initiated path (in-app + email).
3. **Webhook early-return relaxation (5.3 supporting change):** to make the REFUNDED transition processable, the PAID/SETTLED terminal early-returns in `confirmFromWebhook` now short-circuit only when the incoming status is not REFUNDED. All existing payment-flow idempotency tests (duplicate webhook 200, SETTLED-after-PAID, already-PAID) stay green — verified.
4. **Formatting follow-ups:** the pre-commit `oxfmt` hook occasionally left unstaged formatting changes; captured as separate `style:` commits (`d6f396f`, `1d8ced0`). `apps/web/src/routeTree.gen.ts` is regenerated by the web `check-types` build and was restored (not committed).
