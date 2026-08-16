# Cogito App — Codebase Context

Last updated: 2026-08-16

Invitation history keeps metadata but never stores plaintext invite secrets. The latest generated link remains visible and repeatedly copyable during the current admin page session. For any pending history entry, **Generate & copy link** rotates the token, invalidates the previous link, and records the existing resend audit action.

Before submission, the admin tutor invite form checks whether the normalized email is registered and displays the user's current role and linked Better Auth methods (Google, email/password, or both). This preflight is admin-only and resets whenever the email input changes.

Booking scheduling and reschedule rules: [Booking Scheduling and Reschedule Specification](./booking-scheduling-and-reschedule-spec.md) (v1.0.0, 2026-08-16).

The authenticated `/dashboard` route is role-specific. Students retain the learning-first dashboard (next lesson, Knowledge Bank eligibility, competition calendar, and tutor recommendations). Tutors see booking decisions, upcoming sessions, availability, profile status, and payout totals. Admins see escalated booking operations plus pending tutor-profile and achievement review queues. These are frontend compositions of existing oRPC procedures; there is no dashboard-specific backend endpoint.

## Tutor invite flow

Admin create/resend produces a single-use plaintext token, stores only its SHA-256 digest, and attempts delivery through the shared Resend provider. The branded invitation email explains the tutor value proposition, uses one primary profile-setup CTA, identifies the required account email, displays a readable UTC expiry, and includes the raw claim URL as a fallback. Delivery status is returned to the admin UI; failed/stubbed delivery keeps the invite usable and exposes the one-time clipboard fallback. Claim requires an authenticated account with the same email (case-insensitive), consumes the invite and creates the tutor profile transactionally, and permits only student/tutor roles—admin cannot be silently demoted. Email/password and Google accounts share this claim path; OAuth preserves the `/invite?token=...` return URL.

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

## Domain & Policy References

### Booking creation UX

- The student booking form does not ask users to choose solo versus group up
  front. `Invite students (optional)` is always available; zero invitees uses
  the solo/solo-series RPC, while one or more invitees automatically uses the
  group/group-series RPC and updates participant count and pricing.
- Removing the final invitee automatically returns the request to solo without
  clearing the selected schedule or learning goal.

- [`marks-economy-architecture.md`](marks-economy-architecture.md) — canonical reference for the closed-loop Marks economy, package pricing, tutor honorarium/take-rate formulas, regulatory assumptions, Knowledge Bank gating, and related engineering changes.
- The Marks blueprint is a reference architecture, not a substitute for Indonesian legal, regulatory, accounting, or payment-provider review before production launch.

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

### `tutorProfile` (tutor-profile.ts) — CHECK modality + onboarding_status + profile_edit_status; keeps approved public values separate from pending reviewed edits

### `availabilitySlot` (availability-slot.ts) — tutor availability windows (one-time + weekly-generated)

### `tutorInvite` (tutor-invite.ts) — CHECK status, revoked_by/at fields

### `achievement` (achievement.ts) — CHECK status; private `evidence_url`, optional public `documentation_url`, `awarding_date`

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
- Verification evidence is owner/admin-only; optional activity documentation is the public-safe image. No public achievement endpoint exists yet.
- The achievement form uses the shared Selia calendar; selected/today states are drawn on the rounded day button rather than its square grid cell.

### Wallet Module (protected)

- `get`, `listLedger`, `listPackages`, `knowledgeBankEligible`, `competitionCalendarLink`
- (`hold`/`release`/`deduct`/`credit`/`compensate` are service-layer only — not exposed over RPC)

### Pricing Module (internal)

- `calculateSoloPrice`, `calculateGroupPrice`, `calculateSeriesPrice`, `validateFloorPrice`

### Booking Module (student mutations + shared authenticated reads)

Tutor availability is modeled as free-time windows rather than pre-sized sessions. The booking UI uses the shared Selia calendar and a cross-browser 24-hour autocomplete time field; students can enter any exact minute, but a start must leave room for the server-fixed 90-minute session inside the selected window. A one-session selection is one-time and multiple selections form a series automatically.

- `createSolo`, `get`, `listMine`, `cancel`
- `proposeReschedule`, `acceptReschedule`, `rejectReschedule`, `cancelSession`
- `addSessionNote`, `getSessionNotes`
- `createGroup`, `createSeries`, `createGroupSeries`, `confirmInvite`, `declineInvite`, `reconfirm`, `withdraw`
- `listSessions`

Tutor discovery and every student-owned booking mutation are guarded by `studentProcedure`. Tutor/admin accounts cannot browse the student tutor catalog or create/cancel/confirm/reconfirm/withdraw bookings; tutor fulfillment remains under `tutorActions.*`.

After submission, the tutor or booking proposer can propose a replacement time from the booking-detail action panel. Rescheduling is session-scoped; each proposal requires tutor and all active-student approval, and the original schedule remains active until unanimous acceptance.

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
- **Pending (foundation hardening):** password policy — **implemented (C6 closed by REVIEW-FIXES-3 P6)** — min 8 via `minPasswordLength` + upper/lower/digit via `assertPasswordPolicy` enforced in the server auth route at sign-up (`apps/server/src/routes.ts`), mirrored in the sign-up form. Conditional Google OAuth — implemented (gated on env vars). Session expiry is set (7 days, `expiresIn`). **Email verification (G2) deferred** (additive; depends on Resend wiring + frontend route).

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): 4 parallel jobs (lint, typecheck, build, test+coverage). The lint job auto-applies `oxlint --fix` + `oxfmt --write` and commits the fixes back to the PR branch before verifying, so formatting nits don't require a manual push cycle. Tests run `packages/api/src/tests/` + `apps/server/src/openapi.test.ts` in one process, and the remaining `apps/server/src/` tests in a **separate process** (the webhook idempotency TTL test uses `mock.module` for `@cogito-app/api`, which would otherwise shadow the real module for parallel API tests). Coverage gate: `packages/api` ≥ 90% lines, overall ≥ 80% (enforced by `.github/scripts/coverage-comment.ts`).
- **CD** (after infrastructure branch): build → push to GHCR → Coolify auto-deploys
- **Lefthook** pre-commit: oxlint + oxfmt. Pre-push: typecheck.
- **Labeler** (`.github/workflows/labeler.yml`): labels PRs `server`/`web`/`infrastructure`/`docs` by changed paths (`.github/labeler.yml`); needs `pull-requests: write` permission.
- **Dependabot**: weekly npm + GitHub Actions updates.
- **Coverage**: 90% for `packages/api`, 80% overall (after foundation hardening)
- **Health**: `GET /health` returns `{ status, checks: { database, redis }, timestamp }` — both DB `SELECT 1` and Redis `ping()` are checked
- **Deployment platform**: Coolify (self-hosted PaaS on Hetzner VPS)
- **Scheduler boot**: The BullMQ worker + 6 repeatable jobs (`expire-bookings` 5m, `release-expired-holds` 10m, `check-tutor-lateness` 5m, `send-notification-email` 60s, `escalate-support-tickets` 15m, `retry-failed-meetings` 5m — wired in `apps/server/src/scheduler.ts`) only start when the server runs with `SCHEDULER_ENABLED=true` **and** `REDIS_URL` set (via `initScheduler()`, wired in server bootstrap). Without both, the scheduler logs `scheduler_skip` and the booking-expiry/hold-release/email/SLA jobs never run. `send-notification-email` consumes the email outbox (`notification.dispatchQueuedEmails`): notification writes queue dispatch rows (`status='queued'`) inside the DB transaction and the scheduler sends them, so no email I/O happens inside open transactions.

## Plans

Plans live in `docs/plans/` (active + completed) and `docs/archive/` (superseded/historical). See `docs/plans/README.md` for the index.

| Plan                                                              | Branch                             | Status                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/plans/active/REVIEW-FIXES-2.md`                             | `chore/docs-sync` (future PRs)     | Active — wave-2 review fixes (rate limits, withdraw, uploads/payments, reliability) + coverage hardening     |
| `docs/plans/completed/CONSOLIDATION-PLAN.md`                      | `improvement/consolidation`        | Merged to main (#16)                                                                                         |
| `docs/plans/completed/CONSOLIDATION-PHASE2-ERROR-ARCHITECTURE.md` | `improvement/consolidation`        | Merged to main (#16)                                                                                         |
| `docs/plans/completed/CONSOLIDATION-PHASE2.5-GAPS.md`             | `improvement/consolidation`        | Merged to main (#16)                                                                                         |
| `docs/plans/completed/FOUNDATION-HARDENING.md`                    | `improvement/foundation-hardening` | Merged to main (#17)                                                                                         |
| `docs/plans/completed/PRODUCTION-READINESS-PLAN.md`               | `improvement/production-readiness` | Merged to main (#18)                                                                                         |
| `docs/plans/completed/INFRASTRUCTURE-PLAN.md`                     | `improvement/infrastructure`       | Merged to main (#19)                                                                                         |
| `docs/plans/completed/PRD-GAPS-SPEC.md`                           | main (merged)                      | Merged to main (#36, #39–#43) — all G1–G20 landed; B-series fixes in #46                                     |
| `docs/plans/completed/BACKEND-HARDENING.md`                       | main (merged)                      | Merged to main (#34–#38)                                                                                     |
| `docs/plans/completed/BACKEND-HARDENING-PHASE2.md`                | main (merged)                      | Merged to main (#46) — all 6 PRs implemented (security, money correctness, outbox, uploads, PRD-correctness) |
| `docs/plans/completed/BACKEND-REVIEW-HARDENING.md`                | `fix/backend-review-hardening`     | Merged to main (#48) — review fixes (C1, H1–H7, M1–M16, L1–L9) + Redis mandatory                             |
| `docs/plans/active/DEFERRED-OPS-TASKS.md`                         | main (post-merge)                  | Active — code gaps 1.1–1.8 done; §2 Redis session caching deferred; §3/§4 ops pending                        |
| `docs/plans/active/PRD-GAPS-PHASE3.md`                            | main (future PRs)                  | Active — U11 closed; U9 partial; U1–U8, U10, U12–U14 open (verified against code 2026-08-15)                 |
| `docs/plans/active/BACKEND-CLEANUP.md`                            | main (merged)                      | Completed — all 11 items merged (2026-08-15)                                                                 |
| `docs/plans/active/FRONTEND-GAPS-SPEC.md`                         | `feature/frontend-gaps` (future)   | Active — 4 closed, 3 partial, 10 open                                                                        |
| `docs/archive/EXECUTION-PLAN-v2.md`                               | —                                  | Superseded                                                                                                   |
| `docs/archive/REFACTORING-PLAN.md`                                | —                                  | Historical reference                                                                                         |

### Execution Order

```
1. Consolidation (merged #16) → main
2. Foundation Hardening (merged #17) → main
3. Production Readiness + Infrastructure (merged #18 + #19) → main
4. Deferred Ops Tasks (code gaps 1.1–1.8) → merged to main; §2 Redis session caching deferred
5. PRD Gaps Backend (G1–G20) → merged to main (#35, #36, #39–#43)
6. Backend Hardening Phase 2 (BACKEND-HARDENING-PHASE2.md, PRs 1–6) → merged to main (#46)
7. Backend Review Hardening (BACKEND-REVIEW-HARDENING.md) → merged to main (#48)
8. Review Fixes 2 (REVIEW-FIXES-2.md — rate limits, withdraw, uploads/payments, reliability, coverage) → next to execute
9. PRD Gaps Phase 3 (PRD-GAPS-PHASE3.md — U1–U8, U10, U12–U14 open; U11 closed, U9 partial) + Frontend Gaps (FRONTEND-GAPS-SPEC) → after / parallel with #8
10. Production Ops (DEFERRED-OPS-TASKS §2 Redis session caching, §3 manual verification, §4 production ops) → requires live env + Coolify
```

Production Readiness (#18) and Infrastructure (#19) merged to main. Deferred ops code gaps (1.1–1.8) are merged; Redis session caching remains deferred. PRD gaps backend (G1–G20) landed on main, and **BACKEND-HARDENING-PHASE2 (PRs 1–6) merged to main via #46** — security hardening, group-booking money correctness, late-cancel penalty, email outbox, R2 uploads, group-series, deadline repricing, payment notifications, meeting event lifecycle, SLA escalation. **BACKEND-REVIEW-HARDENING merged to main via #48** — the 2026-08-15 review fixes (money correctness, security, reliability, Redis mandatory). Next: **REVIEW-FIXES-2 (wave-2 findings: RPC rate-limit path bug, solo withdraw, presigned POST conditions, REFUNDED reconciliation, outbox/idempotency reliability, coverage hardening)**, then the open PRD-gap feature work, frontend gaps, then production ops.

## Role E2E Readiness Snapshot (2026-08-14)

Use this section as the current role-readiness baseline. Re-audit only after the related backend or frontend plans materially change.

**2026-08-14 update:** Backend PRD gaps (G1–G20) landed on main (#35, #36, #39–#43). Tutor reschedule (propose/accept/reject) and session notes are now backend-ready; group invite accept/decline/reconfirm UI and admin override/room UI remain frontend work (FRONTEND-GAPS-SPEC).

### Student

The student My Profile surface supports self-service account name and profile-image updates through Better Auth, alongside learning/contact fields. The sign-in email remains read-only on this page. Student identity edits do not require admin review.

**Primary promotion flow is ready:** email/password auth -> tutor discovery -> solo booking -> Marks hold -> booking list/detail -> cancellation. Profile, balance/top-up, basic achievements, notification bell, calendar export, and WhatsApp contact surfaces are also present.

Booking detail uses a task-detail layout shared by student and tutor views: a compact identity-and-status header, a single primary content flow for schedule, session actions, and activity, and a sticky metadata rail for session access, Marks, and participants. All existing lifecycle actions and data remain available without changing the booking API.

**Not full PRD complete:** group/series booking UI, invite confirmation/decline/reconfirmation UI, reschedule accept/reject UI (F7), lateness/no-show reporting UI (F3), public achievements (F16), email verification, and session-expiry UX remain open. Backend support for reschedule accept/reject and lateness/no-show reporting (G1/G6) has landed. The notification center and Knowledge Bank gating UX are now implemented.

### Tutor

The tutor workspace now has the primary management surfaces: tutor-only onboarding, a Calendly-style availability page, an incoming booking list, and booking detail actions for accept, decline, and complete. Tutors configure multiple weekly-hour ranges per weekday, copy a range to weekdays, choose modality per range, and generate concrete future windows through an end date (up to 52 weeks). Date-specific overrides supersede only the conflicting recurring occurrence, while the weekly calendar preview exposes and removes individual generated windows. Existing bookings remain intact because replacement soft-deactivates availability rather than deleting referenced rows. The incoming list uses the tutor-owned booking query rather than proposer-only `booking.listMine`.

Published tutor profiles remain editable. Bio and availability-summary edits publish immediately; trust-sensitive edits are held in `pendingProfileChanges` with a separate edit-review status, so discovery continues serving the last approved profile until an admin approves the proposal or requests revisions.

The primary Tutor E2E flow has been manually verified with seeded accounts, including availability, incoming booking review, Google Meet link creation, student notification/state, and completion. Tutor reschedule, session notes, payout, and individual series completion are now backend-ready (G6/G7/G16/G18); their UI is tracked in FRONTEND-GAPS-SPEC (F6/F7/F9/F13/F8). Lateness/no-show support is backend-ready via `support.createTicket` (G1) with the report UI still pending (F3).

### Admin

Backend is ready for user role management, tutor invite/review, achievement moderation, the full booking operations console (queue/override preview/refund), room list/create/assign/relocate, wallet/ledger lookup, tutor payouts, and refund corrections. Achievement moderation is the safest next Admin UI quick win.

The admin override queue, wallet/ledger view, override preview, room assignment → scheduled transition + notifications, and room availability/approval backend (G8–G10, G13–G14) have landed; the corresponding admin UI remains frontend work (F1/F2/F11/F12). Remaining backend sub-gaps are tracked in `docs/plans/active/PRD-GAPS-PHASE3.md` (U1–U14) and `docs/plans/active/BACKEND-CLEANUP.md`.

### Backend Gap Groups

- Ready now (merged to main): student solo/group/series booking primitives, reschedule propose/accept/reject, session notes, group invite confirm/decline/reconfirm, wallet/ledger/packages/Knowledge Bank, purchases, achievements, notifications, tutor onboarding/availability/payouts/incoming-booking actions, support tickets (G1), and the admin capabilities listed above (G8–G10, G16–G18).
- Still open backend sub-gaps (tracked in `docs/plans/active/PRD-GAPS-PHASE3.md`): Knowledge Bank total-balance eligibility (B4/U13), offline room availability not integrated into booking creation (G13/U14), plus the untracked PRD deviations from the 2026-08-14 PRD-vs-code audit (U1–U8, U10, U12: manual meeting-link entry, student self-reschedule, reconfirmation-deadline repricing, group-series full withdrawal, per-participant no-show, admin per-session cancel, per-session reschedule, refund reconciliation guard, business-hours SLA windows, achievement field parity, offline room deadline — U9 partial, U11 closed). Dead-code/silent-failure items tracked in `docs/plans/active/BACKEND-CLEANUP.md` (completed).

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

| ID  | Bug                                                                    | Priority | Story | Status                                                                                             |
| --- | ---------------------------------------------------------------------- | -------- | ----- | -------------------------------------------------------------------------------------------------- |
| A1  | Group booking cancel doesn't release invitee holds                     | P0       | 1     | Fixed                                                                                              |
| A2  | Group booking tutorDecline doesn't release invitee holds               | P0       | 1     | Fixed                                                                                              |
| A3  | expireBookings doesn't release invitee holds                           | P0       | 1     | Fixed                                                                                              |
| A4  | withdraw→cancel doesn't release other participants' holds              | P0       | 1     | Fixed                                                                                              |
| A5  | confirmedHeadcount not decremented on withdraw                         | P0       | 1     | Fixed                                                                                              |
| A6  | holdAmount not zeroed on cancel/decline/expire                         | P0       | 1     | Fixed                                                                                              |
| A7  | Series cancel doesn't cascade to bookingSession rows                   | P0       | 1     | Fixed                                                                                              |
| B1  | RESCHEDULE_PROPOSED has no expiry — booking stuck forever              | P0       | 2     | Fixed                                                                                              |
| B2  | AWAITING_ADMIN_ROOM_APPROVAL/SCHEDULED not in expiry cron              | P0       | 2     | Fixed                                                                                              |
| C1  | booking.get() IDOR — no ownership check                                | P0       | 3     | Fixed                                                                                              |
| C2  | booking.listSessions() IDOR — no ownership check                       | P0       | 3     | Fixed                                                                                              |
| C3  | Tutor actions lack tutorProcedure role guard                           | P1       | 3     | Fixed                                                                                              |
| C4  | resendInvite doesn't invalidate old token                              | P1       | 3     | Fixed                                                                                              |
| C5  | OpenAPI spec exposed without auth                                      | P1       | 3     | Fixed                                                                                              |
| C6  | No password policy                                                     | P1       | 4     | Partial — `minPasswordLength: 8` enforced; upper/lower/digit rule open (tracked in REVIEW-FIXES-2) |
| D1  | Wallet ledger insert not atomic with balance update                    | P0       | 5     | Fixed                                                                                              |
| D2  | 8 read-then-write race conditions without optimistic lock              | P1       | 5     | Fixed                                                                                              |
| D3  | Payment webhook out-of-order delivery — user not credited              | P0       | 5     | Fixed                                                                                              |
| D4  | Booking creation has no idempotency key                                | P1       | 7     | Fixed                                                                                              |
| E1  | notification.write() swallows all errors silently                      | P1       | 6     | Fixed                                                                                              |
| E2  | Google Meet + Resend calls have no timeout                             | P1       | 6     | Fixed                                                                                              |
| E3  | No statement_timeout on DB pool                                        | P1       | 6     | **Fixed** (`packages/db/src/index.ts:20` — `statement_timeout: 30_000`)                            |
| E4  | No uncaughtException handler                                           | P1       | 6     | **Fixed** (`apps/server/src/index.ts:24`)                                                          |
| E5  | Webhook timestamp validation disabled outside production               | P1       | 6     | Fixed                                                                                              |
| F1  | Unbounded string inputs (no .max()) — DoS vector                       | P2       | 4     | Fixed                                                                                              |
| F2  | Unbounded array inputs (no .max())                                     | P2       | 4     | Fixed                                                                                              |
| F3  | Dates not validated to be in the future                                | P2       | 4     | Fixed                                                                                              |
| G1  | No session expiry configured                                           | P1       | 4     | **Fixed** (`packages/auth/src/index.ts:39` — `expiresIn: 60*60*24*7`)                              |
| G2  | No email verification flow (DEFERRED to production-readiness/PRD-gaps) | P1       | 4     | Open                                                                                               |
| G3  | Google OAuth credentials fall back to empty string                     | P2       | 4     | Fixed                                                                                              |
| G4  | No CSRF token (sameSite=none in production)                            | P0       | 4     | Fixed (sameSite=strict in production)                                                              |
| H1  | CSP incomplete — production-breaking (no connect-src)                  | P0       | 8     | **Fixed** (`packages/api/src/lib/security-headers.ts:15` — `connect-src 'self' ${corsOrigin}`)     |
| I1  | findBookingsExpiringByDeadline has no LIMIT — OOM risk                 | P1       | 8     | Fixed                                                                                              |
| I2  | Missing composite index for overlap check query                        | P2       | 8     | Fixed                                                                                              |
| I3  | Dev DB logging may expose sensitive params                             | P2       | 8     | Fixed                                                                                              |
| J1  | No React error boundary — blank page on crash                          | P1       | 9     | Fixed (`apps/web/src/components/error-boundary.tsx`)                                               |
| J2  | No auth session expiry handling on frontend                            | P1       | 9     | Open                                                                                               |
| J3  | 4 dead frontend components                                             | P2       | 9     | Fixed                                                                                              |
| J4  | `any` type casts in route files                                        | P2       | 9     | Fixed                                                                                              |
| K1  | No constant-time comparison for signatures/tokens                      | P2       | 6     | Fixed                                                                                              |
| K2  | No body size limit on webhook endpoints                                | P2       | 6     | Fixed                                                                                              |
| K3  | Scheduler jobs have no retry attempts                                  | P2       | 8     | Fixed — all 6 repeatable jobs have `attempts: 3` + exponential backoff (no DLQ)                    |
| K4  | DRAFT and AWAITING_MARKS_HOLD are unreachable dead states              | P3       | 2     | Accepted (dead states, no action needed)                                                           |
| K5  | repricedMarks column is dead — never set or read                       | P3       | 2     | Accepted (dead column, no action needed)                                                           |
| K6  | timezone field stored but never used                                   | P3       | 2     | Accepted (stored, no action needed)                                                                |
| K7  | metrics.ts has no TTL eviction for stale path entries                  | P3       | 9     | Fixed — `lib/metrics.ts` evicts entries older than 10 min (cleanup every 60s)                      |

### 2026-08-14 audit additions (implemented in `docs/plans/completed/BACKEND-HARDENING-PHASE2.md` via PR #46)

Status: verified at git HEAD `ec8b16c` (post-#46 merge). B3/B6/B8/B9 are **Fixed**; B4 remains **Open** (tracked as U13 in `docs/plans/active/PRD-GAPS-PHASE3.md`).

> Note: these B-IDs are distinct from the B1–B6/N-series IDs in the production-readiness plan above (same letter, different findings).

| ID  | Finding                                                                                                                                                                                           | Severity | Status                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| B3  | Group booking with 2 ≤ headcount < target EXPIRES at the 12h deadline instead of repricing + reconfirming (FR-16/TC-18) — `expireBookings` `booking.service.ts:2009-2048` has no headcount branch | High     | **Fixed (#46)** — headcount branch reprices to `AWAITING_RECONFIRMATION` + 12h deadline + notify. Reconfirmation-deadline sub-case → U3 |
| B4  | Knowledge Bank eligibility uses `availableBalance` not total balance (DL-16) — `wallet.service.ts:431`                                                                                            | Medium   | **Open** — tracked U13 in `docs/plans/active/PRD-GAPS-PHASE3.md`                                                                        |
| B6  | No payment/refund notifications at all (notification matrix rows unfulfilled) — `payment.service.ts` writes none                                                                                  | Medium   | **Fixed (#46)** — `payment.{id}.credited`/`.refunded` (+ admin refund payer notify)                                                     |
| B8  | Group-series creation flow missing entirely — `createSeries` hardcodes `targetGroupSize:1` (FR-20 TC-24/25/27/28/30/32-34) — `booking.service.ts:1881`                                            | Medium   | **Fixed (#46)** — `createGroupSeries` with upfront per-session holds                                                                    |
| B9  | `cancelSession` after H-2 throws instead of forfeiting Marks (series rules) — `booking.service.ts:1134-1140`                                                                                      | Low-Med  | **Fixed (#46)** — post-H2 cancelSession forfeits the session hold                                                                       |

**Security items (all resolved in #46 unless noted):**

- ✅ Stub payment checkout flag-gated (`STUB_WEBHOOK_ALLOWED` + `NODE_ENV != production` + provider check)
- ✅ `TRUST_PROXY` handling — `getClientIp` uses `x-forwarded-for` first hop only when trusted
- ✅ Seed script production guard (`SEED_ALLOWED_IN_PROD` + `SEED_ADMIN_PASSWORD` min 12 chars)
- ✅ Webhook idempotency atomic — `IdempotencyStore.claim` keyed on verified payload event id
- ✅ Invite (10/min) + booking creation (30/min) rate limits
- ✅ `PAYMENT_PROVIDER=xendit` requires Xendit credentials (no silent stub fallback)
- ✅ Unbounded `reason` inputs bounded (`.max(500)`) + `escapeHtml` in email bodies (adminNote interpolation tracked in BACKEND-CLEANUP)
- ✅ OpenAPI spec auth-gated in non-production; read-time body-size enforcement (413)
- Remaining: **Password policy upper/lower/digit (C6)** still open; RPC rate-limit path bug (R1) is **Fixed** — see the wave-2 table below.

### 2026-08-15 wave-2 findings (tracked in `docs/plans/active/REVIEW-FIXES-2.md`)

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                             | Location                                           |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| R1  | HIGH     | RPC rate-limit paths use dotted keys; real URLs are slash keys — limits never fire. **FIXED** (PR A): path matching extracted to `rate-limit-paths.ts` (`matchRateLimitPath`/`matchAuthPath`), tested in `rpc-rate-limit.test.ts`                                                                                   | `routes.ts`, `rate-limit-paths.ts`                 |
| R2  | HIGH     | Solo `withdraw` from CONFIRMED/SCHEDULED → `AWAITING_RECONFIRMATION` instead of CANCELLED (hold not zeroed, Meet link not cancelled, withdrawn student can reconfirm into a no-hold booking). **FIXED** (PR B): solo CONFIRMED/SCHEDULED/AWAITING_ADMIN_ROOM_APPROVAL → CANCELLED + hold zeroed + meeting cancelled | `booking.service.ts` (withdraw)                    |
| R3  | HIGH     | `meeting.cancelEvent` inside the withdraw tx isn't rolled back if the reprice throws. **FIXED** (PR B): provider call deferred until after `db.transaction` commits (`cancelMeeting` flag)                                                                                                                          | `booking.service.ts` (withdraw)                    |
| R4  | MED      | Presigned POST policy omits `x-amz-algorithm/credential/date` conditions — R2/S3 reject unmatched form fields. **FIXED** (PR C): policy binds all three x-amz fields                                                                                                                                                | `storage.ts` (createPresignedPost)                 |
| R5  | MED      | REFUNDED webhook keeps credited marks; `mapXenditStatus` lacks REFUNDED (real Xendit refund 500s). **FIXED** (PR C): REFUNDED webhook reverses credited marks via `compensate_deduct` (`refund.{id}.reverse` key); `mapXenditStatus` maps REFUNDED                                                                  | `payment.service.ts`, `xendit-payment.provider.ts` |
| R6  | MED      | Outbox stale-`sending` reclaim ignores the attempts budget. **FIXED** (PR D): stale reclaim requires `attempts < MAX_DISPATCH_ATTEMPTS`                                                                                                                                                                             | `notification.repo.ts` (claimPendingDispatches)    |
| R7  | MED      | Webhook idempotency claim locks the key 24h on crash. **FIXED** (PR D): claim uses a 120s TTL (processed records still stored for 24h)                                                                                                                                                                              | `payments.ts` (webhook claim)                      |
| R8  | MED      | `waitForMeetUrl` failure after successful insert → duplicate Google events on retry. **FIXED** (PR D): poll failure keeps the created row with `meetingUrl: null`                                                                                                                                                   | `google-meeting.provider.ts` (createEvent)         |
| R9  | LOW      | `eventName` unescaped in the adminReview notification body. **FIXED** (PR D): escaped via `escapeHtml`                                                                                                                                                                                                              | `achievement.service.ts` (adminReview)             |
| R10 | LOW      | `seed-invite.ts` prints the stored token hash as if it were the plaintext. **FIXED** (PR D): prints a fresh-invite hint instead                                                                                                                                                                                     | `seed-invite.ts`                                   |

## Redis Key Namespace Map

Redis keys follow the pattern `cogito:{namespace}:{key}`. **Redis is mandatory** (`REDIS_URL` is required in the env schema since #48); all stateful services use Redis for persistence. The in-memory implementations remain only as defensive fallback code when a configured Redis call fails at runtime.

| Namespace     | Key Pattern                | Used By          | TTL / Eviction               |
| ------------- | -------------------------- | ---------------- | ---------------------------- |
| `cogito:idem` | `{prefix}:{parts}`         | IdempotencyStore | 24h TTL (Redis EX)           |
| `cogito:rl`   | `{keyPrefix}:{identifier}` | rateLimit        | Window TTL (Redis EXPIRE)    |
| `cogito:cb`   | `{name}`                   | CircuitBreaker   | 2× resetTimeout (Redis HSET) |
| `cogito:sess` | Better Auth managed        | Session store    | 7 days (Better Auth config)  |

> `cogito:sess` is **reserved/unused** — Redis session caching is not implemented (Better Auth uses cookieCache + DB adapter; DEFERRED-OPS-TASKS §2).
> | `cogito-jobs` | BullMQ managed | Scheduler | Per-job repeat interval |

### In-Memory Fallback (defensive only)

Each stateful service (`IdempotencyStore`, `rateLimit`, `CircuitBreaker`) checks for Redis availability at runtime. If a configured Redis call fails, the service falls back to an in-memory implementation (with a warning log):

- **IdempotencyStore**: `Map<string, { result, timestamp }>` with periodic cleanup and max-entries eviction.
- **rateLimit**: `Map<string, { count, resetAt }>` with periodic cleanup and max-entries eviction.
- **CircuitBreaker**: In-memory `state`, `failureCount`, `lastFailureTime`, `halfOpenAttempts` fields.

Redis itself is mandatory (`REDIS_URL` is required); the fallback only keeps tests and degraded moments working, and only per-process.

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
