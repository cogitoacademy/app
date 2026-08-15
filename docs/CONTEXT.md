# Cogito App — Codebase Context

Last updated: 2026-08-14

## Architecture

Monorepo (Turborepo + Bun workspaces). PostgreSQL 16 (Docker port 6767). Drizzle ORM. Elysia server. oRPC (not tRPC). Better Auth 1.6.11. React 19 + TanStack Router/Query/Form. Selia UI (TailwindCSS v4 + @base-ui/react).

**4-layer architecture (after consolidation):** Router → Handler → Service → Repository

```
cogito-app/
├── apps/
│   ├── server/              # Elysia HTTP server (port 3001)
│   │   └── src/
│   │       ├── index.ts     # Bootstrap: init logger → create server → listen
│   │       ├── routes.ts    # Mount: evlog + cors + /api/auth + /rpc + /health
│   │       └── middleware.ts # identifyUser (evlog/better-auth)
│   └── web/                 # Vite + React 19 + TanStack Router
├── packages/
│   ├── api/                 # Business logic (4-layer modules)
│   │   └── src/
│   │       ├── procedures.ts # publicProcedure, protectedProcedure, adminProcedure (tutorProcedure after foundation hardening)
│   │       ├── routers.ts    # appRouter composition
│   │       ├── services.ts   # Composition root: createModule() calls (~60 lines)
│   │       ├── context.ts    # Per-request: { session, services }
│   │       ├── lib/          # errors, db, tx (DbOrTx type), idempotency, circuit-breaker, rate-limit
│   │       ├── shared/
│   │       │   └── constants.ts  # NO shared/ports/ — ports are inline in consumer services
│   │       └── modules/      # Domain modules (4-layer each)
│   ├── auth/                # Better Auth config (pure, no wallet coupling)
│   ├── config/              # Shared TS config
│   ├── db/                  # Drizzle schema + migrations (postgres.js driver)
│   ├── env/                 # Zod-validated env vars
│   └── ui/                  # Selia component library (22+ components)
├── docs/                    # PRD, plans, context
└── designs/                 # .pen design files
```

## 4-Layer Architecture

**Router → Handler → Service → Repository**

| Layer      | Responsibility                                         | DB? | File                  |
| ---------- | ------------------------------------------------------ | --- | --------------------- |
| Router     | oRPC route definition, zod validation, auth middleware | No  | `{module}.router.ts`  |
| Handler    | DI factory + `{ context, input }` transport adapters   | No  | `{module}.handler.ts` |
| Service    | Pure business logic + consumer port interfaces         | No  | `{module}.service.ts` |
| Repository | Data access (SQL queries only)                         | Yes | `{module}.repo.ts`    |

Each module also has:

- `{module}.types.ts` — Zod input/output schemas
- `index.ts` — `createModule()` factory function

**No `shared/ports/` directory.** Cross-module dependencies use consumer-driven port interfaces defined inline in the consuming service. Types (`HoldParams`, `WalletSnapshot`, etc.) are defined in the provider's service file and imported by consumers.

### Consumer-Driven Port Pattern

Each consuming module declares only the methods it needs from another module:

```ts
// booking.service.ts — declares what booking needs from wallet
interface BookingWalletPort {
  hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}
```

TypeScript verifies structural compatibility at the `services.ts` wiring site when `wallet.service` is passed as `BookingWalletPort`.

### Handler Pattern

Each handler is a DI factory that creates `{ context, input }` adapters:

```ts
// wallet.handler.ts
export function createWalletHandler(wallet: WalletService) {
  return {
    get: async ({ context }: { context: Context }) => {
      const w = await wallet.getOrCreate(context.session!.user.id);
      return { id: w.id, totalBalance: w.totalBalance, ... };
    },
    hold: async ({ context, input }: { context: Context; input: HoldInput }) => {
      return wallet.hold(context.session!.user.id, input);
    },
  };
}
export type WalletHandler = ReturnType<typeof createWalletHandler>;
```

### Request Flow

```
POST /rpc/booking.create
  → Router: protectedProcedure.input(createBookingSchema).handler(bookingHandler.create)
  → Handler: extract userId from context, delegate to bookingService.createSolo(userId, input)
  → Service: validate, calculate price, call wallet.hold (via BookingWalletPort), create booking
  → Repo: INSERT INTO booking, INSERT INTO booking_participant
```

### ServiceRegistry

```ts
export interface ServiceRegistry {
  auth: AuthHandler; // Handler type for modules with HTTP endpoints
  admin: AdminHandler;
  wallet: WalletHandler; // Handler type (was WalletPort before)
  booking: BookingHandler; // Handler type (was BookingService before)
  pricing: PricingService; // Service type (no HTTP endpoints)
  audit: AuditService; // Service type (no HTTP endpoints)
  // ...
}
```

Routers access handlers via `context.services.{module}.{method}`. Other modules access services via DI through their consumer-driven ports.

## Infrastructure

- **Database:** PostgreSQL 16 via `postgres.js` (consolidated — driver migration complete)
- **Redis:** Shared instance for sessions, idempotency, rate limiting, circuit breaker state, BullMQ persistence (after production readiness)
- **Scheduler:** BullMQ with Redis persistence for booking expiry, hold release, email dispatch
- **Email:** Resend (production) / stub (development) via EmailService
- **Meeting:** Google Meet (production) / manual link fallback via CircuitBreaker
- **Deployment:** Coolify on Hetzner VPS (after infrastructure branch)

## DB Schema (27 tables)

### `user` (auth.ts) — CHECK(role IN ('student','tutor','admin'))

### `session` / `account` / `verification` (auth.ts) — Better Auth owned

### `wallet` (wallet.ts) — CHECK(total=held+available), uuid PK

### `ledgerEntry` (wallet.ts) — UNIQUE(wallet_id,event_key,source_reference), CHECK entry types

### `studentProfile` (student-profile.ts) — uuid PK

### `tutorProfile` (tutor-profile.ts) — CHECK modality + onboarding_status

### `availabilitySlot` (availability-slot.ts) — tutor availability windows (one-time + weekly-generated)

### `tutorInvite` (tutor-invite.ts) — CHECK status, revoked_by/at fields

### `achievement` (achievement.ts) — CHECK status

### `auditLog` (audit-log.ts) — CHECK actor_type, before/after state jsonb

### `booking` (booking.ts) — status state machine, deadline_at, hold_amount

### `bookingParticipant` (booking.ts) — confirmation_state, attendance

### `bookingSession` (booking.ts) — series child sessions with independent state

### `bookingStateHistory` (booking.ts) — state transition audit trail

### `bookingRescheduleProposal` (booking.ts) — tutor-proposed reschedule; status pending/accepted/rejected/expired

### `sessionNote` (booking.ts) — notes on completed sessions (author_id + booking_id)

### `room` (booking.ts) — offline rooms, is_active flag

### `roomBooking` (booking.ts) — room assignment with status requested/confirmed/relocated/cancelled

### `meetingEvent` (booking.ts) — meeting links (google_meet/manual), status + error_reason

### `paymentRecord` (payment-record.ts) — payment status tracking

### `refundRecord` (payment-record.ts) — refund/correction tracking, UNIQUE(provider_event_id)

### `markPackage` (mark-package.ts) — purchasable mark packages

### `notification` (notification.ts) — in-app notification records

### `notificationDispatch` (notification.ts) — email dispatch tracking

### `supportTicket` (support-ticket.ts) — lateness/no-show + issue reports; status + sla_deadline

## API Modules (16 routers + internal modules)

All procedures are POST (oRPC convention). Auth via session cookies.

### Auth Module (protected)

- `me`, `getProfile`, `updateProfile`, `searchStudents`

### Admin Module (admin)

- `listUsers`, `setRole`, `getWallet`, `listLedgerEntries`, `getTutorPayouts`

### AdminTutor Module (admin)

- `createInvite`, `listInvites`, `resendInvite`, `revokeInvite`
- `listTutorProfiles`, `reviewTutorProfile`

### Tutor Module (tutor)

- `getMyProfile`, `updateMyProfile`, `submitForReview`
- `listAvailability`, `upsertAvailability`, `createWeeklyAvailability`, `deleteAvailability`
- `getMyPayouts`

### TutorDiscovery Module (protected)

- `listPublished`, `getProfile`

### Invite Module (public + protected)

- `verify` (public), `claim` (protected)

### Achievement Module (protected + admin)

- `list`, `create`, `update`, `delete`
- `adminList`, `adminReview`

### Wallet Module (protected)

- `get`, `listLedger`, `listPackages`, `knowledgeBankEligible`, `competitionCalendarLink`
- (`hold`/`release`/`deduct`/`credit`/`compensate` are service-layer only — not exposed over RPC)

### Pricing Module (internal)

- `calculateSoloPrice`, `calculateGroupPrice`, `calculateSeriesPrice`, `validateFloorPrice`

### Booking Module (protected)

- `createSolo`, `get`, `listMine`, `cancel`
- `acceptReschedule`, `rejectReschedule`, `cancelSession`
- `addSessionNote`, `getSessionNotes`
- `createGroup`, `createSeries`, `confirmInvite`, `declineInvite`, `reconfirm`, `withdraw`
- `listSessions`

### TutorActions Module (tutor)

- `listBookings`, `proposeReschedule`, `acceptBooking`, `declineBooking`, `completeSession`, `markAttendance`

### Payment Module (protected + public webhook)

- `createPurchase`, `getPurchase` (protected)
- `POST /webhooks/payments/:provider` (public — signature + IP allowlist + timestamp validation)

### Room Module (protected + admin)

- `list`, `checkAvailability` (protected)
- `create`, `assign`, `relocate`, `cancelBooking` (admin)

### Notification Module (protected)

- `list`, `getUnreadCount`, `markAsRead`, `markAllAsRead`

### AdminBooking Module (admin)

- `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`

### Refund Module (admin)

- `createCorrection`, `listCorrections`

### Support Module (protected + admin)

- `createTicket`, `listTickets` (protected)
- `adminListTickets`, `adminResolveTicket` (admin)

### Upload Module (protected)

- `createUploadUrl` — validates content-type allowlist + filename, returns a signed PUT URL (Cloudflare R2) or a local `/uploads/*` URL (dev); `GET /uploads/*` served by the server when `R2_PUBLIC_URL` is unset

### Scheduler Module (internal)

- BullMQ repeatable jobs: `expire-bookings` (5m), `release-expired-holds` (10m), `check-tutor-lateness` (5m), `send-notification-email` (60s — consumes the email outbox via `dispatchQueuedEmails`; failed rows are retried up to 3 attempts), `escalate-support-tickets` (15m), `retry-failed-meetings` (5m — re-creates Google Meet for CONFIRMED online bookings whose meeting creation failed, up to 3 attempts)

Internal-only modules with no RPC procedures: `audit`, `email`, `meeting`, `pricing`, `scheduler`.

## Auth Config

- Email/password enabled. Google OAuth optional (conditional on env vars, after foundation hardening).
- Wallet created lazily via `WalletService.getOrCreate()` on first `auth.me` call.
- Cookies: sameSite=strict (production) / lax (development), secure=true (production), httpOnly=true. Same-origin subdomain sharing works because `app.cogitoacademy.id` and `cogitoacademy.id` share the same site.
- `CogitoUser` type exported with role field.
- **Pending (foundation hardening):** password policy (min 8, upper/lower/digit) — still open (C6); conditional Google OAuth — implemented (gated on env vars). Session expiry is set (7 days, `expiresIn`). **Email verification (G2) deferred** (additive; depends on Resend wiring + frontend route).

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): 4 parallel jobs (lint, typecheck, build, test+coverage)
- **CD** (after infrastructure branch): build → push to GHCR → Coolify auto-deploys
- **Lefthook** pre-commit: oxlint + oxfmt. Pre-push: typecheck.
- **Dependabot**: weekly npm + GitHub Actions updates.
- **Coverage**: 90% for `packages/api`, 80% overall (after foundation hardening)
- **Health**: `GET /health` with DB ping (Redis ping not yet implemented — see DEFERRED-OPS-TASKS 1.6)
- **Deployment platform**: Coolify (self-hosted PaaS on Hetzner VPS)
- **Scheduler boot**: The BullMQ worker + 6 repeatable jobs (`expire-bookings` 5m, `release-expired-holds` 10m, `check-tutor-lateness` 5m, `send-notification-email` 60s, `escalate-support-tickets` 15m, `retry-failed-meetings` 5m — wired in `apps/server/src/scheduler.ts`) only start when the server runs with `SCHEDULER_ENABLED=true` **and** `REDIS_URL` set (via `initScheduler()`, wired in server bootstrap). Without both, the scheduler logs `scheduler_skip` and the booking-expiry/hold-release/email/SLA jobs never run. `send-notification-email` consumes the email outbox (`notification.dispatchQueuedEmails`): notification writes queue dispatch rows (`status='queued'`) inside the DB transaction and the scheduler sends them, so no email I/O happens inside open transactions.

## Plans

Plans live in `docs/plans/` (active + completed) and `docs/archive/` (superseded/historical). See `docs/plans/README.md` for the index.

| Plan                                                              | Branch                             | Status                                                                                |
| ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/plans/completed/CONSOLIDATION-PLAN.md`                      | `improvement/consolidation`        | Merged to main (#16)                                                                  |
| `docs/plans/completed/CONSOLIDATION-PHASE2-ERROR-ARCHITECTURE.md` | `improvement/consolidation`        | Merged to main (#16)                                                                  |
| `docs/plans/completed/CONSOLIDATION-PHASE2.5-GAPS.md`             | `improvement/consolidation`        | Merged to main (#16)                                                                  |
| `docs/plans/completed/FOUNDATION-HARDENING.md`                    | `improvement/foundation-hardening` | Merged to main (#17)                                                                  |
| `docs/plans/completed/PRODUCTION-READINESS-PLAN.md`               | `improvement/production-readiness` | Merged to main (#18)                                                                  |
| `docs/plans/completed/INFRASTRUCTURE-PLAN.md`                     | `improvement/infrastructure`       | Merged to main (#19)                                                                  |
| `docs/plans/completed/PRD-GAPS-SPEC.md`                           | main (merged)                      | Merged to main (#36, #39–#43) — all G1–G20 landed; B-series fixes in #46              |
| `docs/plans/completed/BACKEND-HARDENING-PHASE2.md`                | main (merged)                      | Merged to main (#46) — all 6 PRs implemented (security, money correctness, outbox, uploads, PRD-correctness) |
| `docs/plans/active/DEFERRED-OPS-TASKS.md`                         | main (post-merge)                  | Active — code gaps 1.1–1.8 done; §2 Redis session caching deferred; §3/§4 ops pending |
| `docs/plans/active/PRD-GAPS-PHASE3.md`                            | main (future PRs)                  | Active — planned: 12 untracked PRD deviations (U1–U12) + B4 (U13) from the 2026-08-14 audit |
| `docs/plans/active/BACKEND-CLEANUP.md`                            | main (future PR)                   | Active — planned: dead code, silent failure modes, test-quality nits                    |
| `docs/plans/active/FRONTEND-GAPS-SPEC.md`                         | `feature/frontend-gaps` (future)   | Active — 4 closed, 3 partial, 10 open                                                 |
| `docs/archive/EXECUTION-PLAN-v2.md`                               | —                                  | Superseded                                                                            |
| `docs/archive/REFACTORING-PLAN.md`                                | —                                  | Historical reference                                                                  |

### Execution Order

```
1. Consolidation (merged #16) → main
2. Foundation Hardening (merged #17) → main
3. Production Readiness + Infrastructure (merged #18 + #19) → main
4. Deferred Ops Tasks (code gaps 1.1–1.8) → merged to main; §2 Redis session caching deferred
5. PRD Gaps Backend (G1–G20) → merged to main (#35, #36, #39–#43)
6. Backend Hardening Phase 2 (BACKEND-HARDENING-PHASE2.md, PRs 1–6) → merged to main (#46)
7. PRD Gaps Phase 3 (PRD-GAPS-PHASE3.md — U1–U14) + Backend Cleanup (BACKEND-CLEANUP.md) → next to execute
8. Frontend Gaps (FRONTEND-GAPS-SPEC — 10 open: F1–F3, F6, F7, F9, F11–F14; F8/F16/F17 partial) → after / parallel with #7
9. Production Ops (DEFERRED-OPS-TASKS §3 manual verification, §4 production ops) → requires live env + Coolify
```

Production Readiness (#18) and Infrastructure (#19) merged to main. Deferred ops code gaps (1.1–1.8) are merged; Redis session caching remains deferred. PRD gaps backend (G1–G20) landed on main, and **BACKEND-HARDENING-PHASE2 (PRs 1–6) merged to main via #46** — security hardening, group-booking money correctness, late-cancel penalty, email outbox, R2 uploads, group-series, deadline repricing, payment notifications, meeting event lifecycle, SLA escalation. The only open item from that plan is Task 5.2 (B4 — Knowledge Bank total-balance). Next: **PRD-GAPS-PHASE3 (U1–U14)** and **BACKEND-CLEANUP**, then the open frontend gaps, then production ops.

## Role E2E Readiness Snapshot (2026-08-14)

Use this section as the current role-readiness baseline. Re-audit only after the related backend or frontend plans materially change.

**2026-08-14 update:** Backend PRD gaps (G1–G20) landed on main (#35, #36, #39–#43). Tutor reschedule (propose/accept/reject) and session notes are now backend-ready; group invite accept/decline/reconfirm UI and admin override/room UI remain frontend work (FRONTEND-GAPS-SPEC).

### Student

**Primary promotion flow is ready:** email/password auth -> tutor discovery -> solo booking -> Marks hold -> booking list/detail -> cancellation. Profile, balance/top-up, basic achievements, notification bell, calendar export, and WhatsApp contact surfaces are also present.

**Not full PRD complete:** group/series booking UI, invite confirmation/decline/reconfirmation UI, reschedule accept/reject UI (F7), lateness/no-show reporting UI (F3), public achievements (F16), email verification, and session-expiry UX remain open. Backend support for reschedule accept/reject and lateness/no-show reporting (G1/G6) has landed. The notification center and Knowledge Bank gating UX are now implemented.

### Tutor

The tutor workspace now has the primary management surfaces: tutor-only onboarding, a weekly-first availability page, an incoming booking list, and booking detail actions for accept, decline, and complete. Weekly availability is materialized into concrete future slots through the selected end date (up to 52 weeks); one-time custom slots remain available for exceptions or force majeure. The incoming list uses the tutor-owned booking query rather than proposer-only `booking.listMine`.

The primary Tutor E2E flow has been manually verified with seeded accounts, including availability, incoming booking review, Google Meet link creation, student notification/state, and completion. Tutor reschedule, session notes, payout, and individual series completion are now backend-ready (G6/G7/G16/G18); their UI is tracked in FRONTEND-GAPS-SPEC (F6/F7/F9/F13/F8). Lateness/no-show support is backend-ready via `support.createTicket` (G1) with the report UI still pending (F3).

### Admin

Backend is ready for user role management, tutor invite/review, achievement moderation, the full booking operations console (queue/override preview/refund), room list/create/assign/relocate, wallet/ledger lookup, tutor payouts, and refund corrections. Achievement moderation is the safest next Admin UI quick win.

The admin override queue, wallet/ledger view, override preview, room assignment → scheduled transition + notifications, and room availability/approval backend (G8–G10, G13–G14) have landed; the corresponding admin UI remains frontend work (F1/F2/F11/F12). Remaining backend sub-gaps are tracked in `docs/plans/active/PRD-GAPS-PHASE3.md` (U1–U14) and `docs/plans/active/BACKEND-CLEANUP.md`.

### Backend Gap Groups

- Ready now (merged to main): student solo/group/series booking primitives, reschedule propose/accept/reject, session notes, group invite confirm/decline/reconfirm, wallet/ledger/packages/Knowledge Bank, purchases, achievements, notifications, tutor onboarding/availability/payouts/incoming-booking actions, support tickets (G1), and the admin capabilities listed above (G8–G10, G16–G18).
- Still open backend sub-gaps (tracked in `docs/plans/active/PRD-GAPS-PHASE3.md`): Knowledge Bank total-balance eligibility (B4/U13), offline room availability not integrated into booking creation (G13/U14), plus the 12 untracked PRD deviations found by the 2026-08-14 PRD-vs-code audit (U1–U12: manual meeting-link entry, student self-reschedule, reconfirmation-deadline repricing, group-series full withdrawal, per-participant no-show, admin per-session cancel, per-session reschedule, refund reconciliation guard, business-hours SLA windows, achievement field parity, group invitee validation, offline room deadline). Dead-code/silent-failure items tracked in `docs/plans/active/BACKEND-CLEANUP.md`.

### Current Execution Order

1. Complete Admin Tutor invite -> claim -> onboarding -> review -> publish E2E and verify published discovery.
2. Complete Student series booking UI and its booking detail/session presentation.
3. Complete group invite accept/decline and reconfirmation UI; group creation and debounced student lookup are implemented.
4. Keep achievement moderation/public surfacing at the end of the frontend queue.
5. Admin booking override and offline-room UI (F1/F2/F11/F12) — backend landed (G8–G10, G13–G14); these are now open frontend gaps.

## Known Bugs

### Existing bugs (planned in `docs/plans/completed/PRODUCTION-READINESS-PLAN.md`)

| ID  | Bug                                                | Priority | Status    |
| --- | -------------------------------------------------- | -------- | --------- |
| B5  | No CSRF protection on mutations                    | P0       | **Fixed** |
| N3  | Scheduler not shut down gracefully                 | P1       | **Fixed** |
| N8  | withdraw doesn't release other participants' holds | P2       | **Fixed** |

The following bugs from the production-readiness plan are **fixed** (see completed plan for details): B1 (double session validation), B2 (meeting rollback), B3 (refund correction), B4 (series deadline), N1 (release holds), N2 (send emails), N4 (series sessions), N5 (listLedger filters), N7 (randomUUID), N15 (holdAmount update), B6 (overlap check in tx). N9 (pagination) was also fixed by PR #28 — `listBookingsByState` in `admin-booking.repo.ts:31-33` now consumes the cursor (`gt(booking.id, cursor)`).

### Frontend error UX TODO

- Map oRPC/Zod input-validation issues to field-specific, non-technical messages across every form. Raw transport errors such as `Input validation failed` must never be shown directly to users. The solo-booking form currently provides a readable fallback, but a shared mapper remains to be implemented.

**Remaining deferred items** are tracked in `docs/plans/active/DEFERRED-OPS-TASKS.md`:

- Redis session caching (2.2) — not yet implemented
- BullMQ dead-letter queue — retry backoff is implemented, but no DLQ exists yet

**Fixed by PR #28 (`improvement/foundation-critical-fixes`):**

- Redis rate limiting and composition-root wiring
- Atomic idempotency get-or-set flow
- Migration journal, missing indexes, and booking-participant uniqueness
- Notification scheduling, BullMQ retry backoff, and Redis health check
- Admin and student booking pagination cursor consumption
- Wallet atomic balance guards and explicit wallet repository columns
- Admin override correctness and optimistic locking
- Payment/refund bounds and pending-provider retry handling
- Series future-slot validation and Tutor booking route guard
- Discovery search escaping and nginx security headers

### New findings (planned in `docs/plans/completed/FOUNDATION-HARDENING.md`)

Status column: **Fixed** = verified in code on main after #17 merge; **Open** = not yet implemented.

| ID  | Bug                                                                    | Priority | Story | Status                                                                                         |
| --- | ---------------------------------------------------------------------- | -------- | ----- | ---------------------------------------------------------------------------------------------- |
| A1  | Group booking cancel doesn't release invitee holds                     | P0       | 1     | Fixed                                                                                          |
| A2  | Group booking tutorDecline doesn't release invitee holds               | P0       | 1     | Fixed                                                                                          |
| A3  | expireBookings doesn't release invitee holds                           | P0       | 1     | Fixed                                                                                          |
| A4  | withdraw→cancel doesn't release other participants' holds              | P0       | 1     | Fixed                                                                                          |
| A5  | confirmedHeadcount not decremented on withdraw                         | P0       | 1     | Fixed                                                                                          |
| A6  | holdAmount not zeroed on cancel/decline/expire                         | P0       | 1     | Fixed                                                                                          |
| A7  | Series cancel doesn't cascade to bookingSession rows                   | P0       | 1     | Fixed                                                                                          |
| B1  | RESCHEDULE_PROPOSED has no expiry — booking stuck forever              | P0       | 2     | Fixed                                                                                          |
| B2  | AWAITING_ADMIN_ROOM_APPROVAL/SCHEDULED not in expiry cron              | P0       | 2     | Fixed                                                                                          |
| C1  | booking.get() IDOR — no ownership check                                | P0       | 3     | Fixed                                                                                          |
| C2  | booking.listSessions() IDOR — no ownership check                       | P0       | 3     | Fixed                                                                                          |
| C3  | Tutor actions lack tutorProcedure role guard                           | P1       | 3     | Fixed                                                                                          |
| C4  | resendInvite doesn't invalidate old token                              | P1       | 3     | Fixed                                                                                          |
| C5  | OpenAPI spec exposed without auth                                      | P1       | 3     | Fixed                                                                                          |
| C6  | No password policy                                                     | P1       | 4     | Open                                                                                           |
| D1  | Wallet ledger insert not atomic with balance update                    | P0       | 5     | Fixed                                                                                          |
| D2  | 8 read-then-write race conditions without optimistic lock              | P1       | 5     | Fixed                                                                                          |
| D3  | Payment webhook out-of-order delivery — user not credited              | P0       | 5     | Fixed                                                                                          |
| D4  | Booking creation has no idempotency key                                | P1       | 7     | Fixed                                                                                          |
| E1  | notification.write() swallows all errors silently                      | P1       | 6     | Fixed                                                                                          |
| E2  | Google Meet + Resend calls have no timeout                             | P1       | 6     | Fixed                                                                                          |
| E3  | No statement_timeout on DB pool                                        | P1       | 6     | **Fixed** (`packages/db/src/index.ts:20` — `statement_timeout: 30_000`)                        |
| E4  | No uncaughtException handler                                           | P1       | 6     | **Fixed** (`apps/server/src/index.ts:24`)                                                      |
| E5  | Webhook timestamp validation disabled outside production               | P1       | 6     | Fixed                                                                                          |
| F1  | Unbounded string inputs (no .max()) — DoS vector                       | P2       | 4     | Fixed                                                                                          |
| F2  | Unbounded array inputs (no .max())                                     | P2       | 4     | Fixed                                                                                          |
| F3  | Dates not validated to be in the future                                | P2       | 4     | Fixed                                                                                          |
| G1  | No session expiry configured                                           | P1       | 4     | **Fixed** (`packages/auth/src/index.ts:39` — `expiresIn: 60*60*24*7`)                          |
| G2  | No email verification flow (DEFERRED to production-readiness/PRD-gaps) | P1       | 4     | Open                                                                                           |
| G3  | Google OAuth credentials fall back to empty string                     | P2       | 4     | Fixed                                                                                          |
| G4  | No CSRF token (sameSite=none in production)                            | P0       | 4     | Fixed (sameSite=strict in production)                                                          |
| H1  | CSP incomplete — production-breaking (no connect-src)                  | P0       | 8     | **Fixed** (`packages/api/src/lib/security-headers.ts:15` — `connect-src 'self' ${corsOrigin}`) |
| I1  | findBookingsExpiringByDeadline has no LIMIT — OOM risk                 | P1       | 8     | Fixed                                                                                          |
| I2  | Missing composite index for overlap check query                        | P2       | 8     | Fixed                                                                                          |
| I3  | Dev DB logging may expose sensitive params                             | P2       | 8     | Fixed                                                                                          |
| J1  | No React error boundary — blank page on crash                          | P1       | 9     | Fixed (`apps/web/src/components/error-boundary.tsx`)                                           |
| J2  | No auth session expiry handling on frontend                            | P1       | 9     | Open                                                                                           |
| J3  | 4 dead frontend components                                             | P2       | 9     | Fixed                                                                                          |
| J4  | `any` type casts in route files                                        | P2       | 9     | Fixed                                                                                          |
| K1  | No constant-time comparison for signatures/tokens                      | P2       | 6     | Fixed                                                                                          |
| K2  | No body size limit on webhook endpoints                                | P2       | 6     | Fixed                                                                                          |
| K3  | Scheduler jobs have no retry attempts                                  | P2       | 8     | Fixed — all 4 jobs have `attempts: 3` + exponential backoff (no DLQ)                           |
| K4  | DRAFT and AWAITING_MARKS_HOLD are unreachable dead states              | P3       | 2     | Accepted (dead states, no action needed)                                                       |
| K5  | repricedMarks column is dead — never set or read                       | P3       | 2     | Accepted (dead column, no action needed)                                                       |
| K6  | timezone field stored but never used                                   | P3       | 2     | Accepted (stored, no action needed)                                                            |
| K7  | metrics.ts has no TTL eviction for stale path entries                  | P3       | 9     | Open                                                                                           |

### 2026-08-14 audit additions (implemented in `docs/plans/completed/BACKEND-HARDENING-PHASE2.md` via PR #46)

Status: verified at git HEAD `ec8b16c` (post-#46 merge). B3/B6/B8/B9 are **Fixed**; B4 remains **Open** (tracked as U13 in `docs/plans/active/PRD-GAPS-PHASE3.md`).

> Note: these B-IDs are distinct from the B1–B6/N-series IDs in the production-readiness plan above (same letter, different findings).

| ID  | Finding                                                                                                                                                                                           | Severity | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| B3  | Group booking with 2 ≤ headcount < target EXPIRES at the 12h deadline instead of repricing + reconfirming (FR-16/TC-18) — `expireBookings` `booking.service.ts:2009-2048` has no headcount branch | High     | **Fixed (#46)** — headcount branch reprices to `AWAITING_RECONFIRMATION` + 12h deadline + notify. Reconfirmation-deadline sub-case → U3 |
| B4  | Knowledge Bank eligibility uses `availableBalance` not total balance (DL-16) — `wallet.service.ts:431`                                                                                            | Medium   | **Open** — tracked U13 in `docs/plans/active/PRD-GAPS-PHASE3.md` |
| B6  | No payment/refund notifications at all (notification matrix rows unfulfilled) — `payment.service.ts` writes none                                                                                  | Medium   | **Fixed (#46)** — `payment.{id}.credited`/`.refunded` (+ admin refund payer notify) |
| B8  | Group-series creation flow missing entirely — `createSeries` hardcodes `targetGroupSize:1` (FR-20 TC-24/25/27/28/30/32-34) — `booking.service.ts:1881`                                            | Medium   | **Fixed (#46)** — `createGroupSeries` with upfront per-session holds |
| B9  | `cancelSession` after H-2 throws instead of forfeiting Marks (series rules) — `booking.service.ts:1134-1140`                                                                                      | Low-Med  | **Fixed (#46)** — post-H2 cancelSession forfeits the session hold |

**Security items (all resolved in #46 unless noted):**

- ✅ Stub payment checkout flag-gated (`STUB_WEBHOOK_ALLOWED` + `NODE_ENV != production` + provider check)
- ✅ `TRUST_PROXY` handling — `getClientIp` uses `x-forwarded-for` first hop only when trusted
- ✅ Seed script production guard (`SEED_ALLOWED_IN_PROD` + `SEED_ADMIN_PASSWORD` min 12 chars)
- ✅ Webhook idempotency atomic — `IdempotencyStore.claim` keyed on verified payload event id
- ✅ Invite (10/min) + booking creation (30/min) rate limits
- ✅ `PAYMENT_PROVIDER=xendit` requires Xendit credentials (no silent stub fallback)
- ✅ Unbounded `reason` inputs bounded (`.max(500)`) + `escapeHtml` in email bodies (adminNote interpolation tracked in BACKEND-CLEANUP)
- ✅ OpenAPI spec auth-gated in non-production; read-time body-size enforcement (413)
- Remaining: no invite/booking creation rate limits apply to `/api/auth/*`; password policy (C6) still open.

## Redis Key Namespace Map

Redis keys follow the pattern `cogito:{namespace}:{key}`. When `REDIS_URL` is set, all stateful services use Redis for persistence. Without Redis, they fall back to in-memory stores (for development and CI).

| Namespace     | Key Pattern                | Used By          | TTL / Eviction               |
| ------------- | -------------------------- | ---------------- | ---------------------------- |
| `cogito:idem` | `{prefix}:{parts}`         | IdempotencyStore | 24h TTL (Redis EX)           |
| `cogito:rl`   | `{keyPrefix}:{identifier}` | rateLimit        | Window TTL (Redis EXPIRE)    |
| `cogito:cb`   | `{name}`                   | CircuitBreaker   | 2× resetTimeout (Redis HSET) |
| `cogito:sess` | Better Auth managed        | Session store    | 7 days (Better Auth config)  |
| `cogito-jobs` | BullMQ managed             | Scheduler        | Per-job repeat interval      |

### In-Memory Fallback

Each stateful service (`IdempotencyStore`, `rateLimit`, `CircuitBreaker`) checks for Redis availability at runtime. If `REDIS_URL` is unset or the Redis connection fails, the service transparently falls back to an in-memory implementation:

- **IdempotencyStore**: `Map<string, { result, timestamp }>` with periodic cleanup and max-entries eviction.
- **rateLimit**: `Map<string, { count, resetAt }>` with periodic cleanup and max-entries eviction.
- **CircuitBreaker**: In-memory `state`, `failureCount`, `lastFailureTime`, `halfOpenAttempts` fields.

The in-memory fallback ensures all tests pass without a Redis service in CI.

### Adding Redis to a New Feature

1. Define your key pattern in `COGITO_NS` (in `packages/api/src/lib/redis.ts`).
2. Accept an optional `redis?: RedisClient` parameter in your service constructor.
3. Try Redis operations in a `try/catch`, falling back to in-memory on failure.
4. Test both paths: unit tests use `InMemoryRedis`, integration tests (if any) use real Redis.

## How to Add a New Module

Follow the 4-layer architecture: **Router → Handler → Service → Repository**.

### 1. Create the module directory

```
packages/api/src/modules/{module}/
├── {module}.types.ts    # Zod input/output schemas
├── {module}.errors.ts   # DomainError subclasses
├── {module}.repo.ts     # Data access (SQL queries only)
├── {module}.service.ts  # Business logic + consumer port interfaces
├── {module}.handler.ts  # DI factory: { context, input } → service calls
├── {module}.router.ts   # oRPC route definitions
└── index.ts             # createModule() factory function
```

### 2. Define types and errors

```ts
// {module}.types.ts
import { z } from "zod";
export const createSomethingInput = z.object({ name: z.string().min(1) });
export type CreateSomethingInput = z.infer<typeof createSomethingInput>;

// {module}.errors.ts
import { DomainError } from "../../lib/domain-errors";
export class SomethingNotFoundError extends DomainError {
  constructor(id: string) {
    super("SOMETHING_NOT_FOUND", `Something ${id} not found`);
  }
}
```

### 3. Create the repository

```ts
// {module}.repo.ts
import type { DbOrTx } from "../../lib/tx";
export interface SomethingRepo {
  findById(db: DbOrTx, id: string): Promise<Row | null>;
  create(db: DbOrTx, data: CreateData): Promise<Row>;
}
```

### 4. Create the service with consumer-driven ports

```ts
// {module}.service.ts
export function createSomethingService(deps: {
  repo: SomethingRepo;
  auditPort: AuditPort;     // Only the methods this module needs
  walletPort: WalletPort;   // Only the methods this module needs
}) { ... }
```

### 5. Create the handler

```ts
// {module}.handler.ts
export function createSomethingHandler(service: SomethingService) {
  return {
    create: async ({ context, input }) => { ... },
  };
}
```

### 6. Create the router

```ts
// {module}.router.ts
import { publicProcedure, protectedProcedure } from "../../procedures";
export const somethingRouter = {
  create: protectedProcedure.input(createSomethingInput).handler(...),
};
```

### 7. Wire into the composition root

Add to `packages/api/src/services.ts`:

- Import and call `createSomethingService({ repo, auditPort, walletPort })`
- Import and call `createSomethingHandler(service)`
- Add to `ServiceRegistry` type

Add to `packages/api/src/routers.ts`:

- Add `something: somethingRouter` to `appRouter`

### 8. Add DB schema and migration

In `packages/db/src/schema/`:

- Define the table with `pgTable`, checks, and indexes
- Export from `packages/db/src/schema/index.ts`
- Run `bun run db:generate` to create a migration

### 9. Add tests

Create `packages/api/src/tests/unit/{module}.service.test.ts` and `packages/api/src/tests/unit/{module}.handler.test.ts` with:

- Mock `DbOrTx` as `{ transaction: mock(async (fn) => fn(tx)) }` plus repo mocks
- Test each service method for happy path and error cases
- Test handler input validation and authorization

### Key Conventions

- **No `shared/ports/` directory** — ports are consumer-driven interfaces defined inline in the consuming service file.
- **`DbOrTx`** type from `packages/api/src/lib/tx.ts` — pass `db` for reads, `tx` inside transactions.
- **`ORPCError`** from `@orpc/server` for HTTP error responses.
- **`DomainError`** subclass for business logic errors — mapped in handlers via `withDomainMap()`.
- **Consumer-driven port interfaces** — each module declares only the methods it needs from other modules.
- **Redis integration** — optional `redis?: RedisClient` parameter with in-memory fallback.
- **Circuit breaker** — wrap external service calls (email, meeting) with `CircuitBreaker` from `../../lib/circuit-breaker`.

## Common Commands

```bash
bun install                # Install deps
bun run dev                # Dev all (web + server)
bun run dev:web            # Dev web only
bun run dev:server         # Dev server only
bun run db:start           # Start PostgreSQL Docker
bun run db:migrate         # Apply migrations
bun run db:generate        # Generate migrations
bun run db:studio          # Drizzle Studio
bun run check              # Oxlint + Oxfmt
bun run check-types        # TypeScript check (all workspaces)
bun run build              # Build server + web
bun run test               # Run tests
bun run test:coverage      # Run tests with coverage
```
