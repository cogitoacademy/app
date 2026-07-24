# Cogito App — Codebase Context

Last updated: 2026-07-24

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

## DB Schema (18 tables)

### `user` (auth.ts) — CHECK(role IN ('student','tutor','admin'))

### `session` / `account` / `verification` (auth.ts) — Better Auth owned

### `wallet` (wallet.ts) — CHECK(total=held+available), uuid PK

### `ledgerEntry` (wallet.ts) — UNIQUE(wallet_id,event_key,source_reference), CHECK entry types

### `studentProfile` (student-profile.ts) — uuid PK

### `tutorProfile` (tutor-profile.ts) — CHECK modality + onboarding_status

### `tutorInvite` (tutor-invite.ts) — CHECK status, revoked_by/at fields

### `achievement` (achievement.ts) — CHECK status

### `auditLog` (audit-log.ts) — CHECK actor_type, before/after state jsonb

### `booking` (booking.ts) — status state machine, deadline_at, hold_amount

### `bookingParticipant` (booking.ts) — confirmation_state, attendance

### `bookingSession` (booking.ts) — series child sessions with independent state

### `bookingStateHistory` (booking.ts) — state transition audit trail

### `bookingRescheduleProposal` (booking.ts) — tutor-proposed reschedule

### `paymentRecord` (payment.ts) — payment status tracking

### `refundRecord` (payment.ts) — refund/correction tracking

### `notification` (notification.ts) — in-app notification records

### `notificationDispatch` (notification.ts) — email dispatch tracking

## API Modules (18)

All procedures are POST (oRPC convention). Auth via session cookies.

### Auth Module (protected)

- `me`, `getProfile`, `updateProfile`

### Admin Module (admin)

- `listUsers`, `setRole`

### AdminTutor Module (admin)

- `createInvite`, `listInvites`, `resendInvite`, `revokeInvite`
- `listTutorProfiles`, `reviewTutorProfile`

### Tutor Module (protected)

- `getMyProfile`, `updateMyProfile`, `submitForReview`

### TutorDiscovery Module (protected)

- `listPublished`, `getProfile`

### Invite Module (public + protected)

- `verify` (public), `claim` (protected)

### Achievement Module (protected + admin)

- `list`, `create`, `update`, `delete`
- `adminList`, `adminReview`

### Wallet Module (protected + admin)

- `hold`, `release`, `deduct`, `credit`, `compensate`
- `getOrCreate`, `listLedger`, `knowledgeBankEligible`, `listPackages`

### Pricing Module (internal)

- `calculateSoloPrice`, `calculateGroupPrice`, `calculateSeriesPrice`, `validateFloorPrice`

### Booking Module (protected + admin)

- `create`, `confirm`, `withdraw`, `cancel`
- `createGroup`, `confirmInvite`, `reconfirm`, `withdrawGroup`
- `createSeries`, `completeSession`

### Payment Module (public webhook + protected)

- `createCheckout`, `listPackages` (protected)
- `handleWebhook` (public)

### Notification Module (protected)

- `list`, `markRead`, `markAllRead`

### Scheduler Module (internal)

- `onExpireBookings`, `onReleaseHolds`, `onSendNotificationEmail`

## Auth Config

- Email/password enabled. Google OAuth optional (conditional on env vars, after foundation hardening).
- Wallet created lazily via `WalletService.getOrCreate()` on first `auth.me` call.
- Cookies: sameSite=lax (dev) / none (production, requires CSRF — after foundation hardening), secure=true (production), httpOnly=true.
- `CogitoUser` type exported with role field.
- **Pending (foundation hardening):** password policy (min 8, upper/lower/digit), session expiry (7 days), conditional OAuth. **Email verification (G2) deferred** to production-readiness / PRD-gaps branch (additive; depends on Resend wiring + frontend route).

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): 4 parallel jobs (lint, typecheck, build, test+coverage)
- **CD** (after infrastructure branch): build → push to GHCR → Coolify auto-deploys
- **Lefthook** pre-commit: oxlint + oxfmt. Pre-push: typecheck.
- **Dependabot**: weekly npm + GitHub Actions updates.
- **Coverage**: 90% for `packages/api`, 80% overall (after foundation hardening)
- **Health**: `GET /health` with DB ping + Redis ping (after production readiness)
- **Deployment platform**: Coolify (self-hosted PaaS on Hetzner VPS)

## Active Plans

| Plan                                      | Branch                             | Status                                                                   |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `docs/plans/CONSOLIDATION-PLAN.md`        | `improvement/consolidation`        | Complete (merge to main pending)                                         |
| `docs/plans/FOUNDATION-HARDENING.md`      | `improvement/foundation-hardening` | Next to execute (after consolidation merges to main)                     |
| `docs/plans/PRODUCTION-READINESS-PLAN.md` | `improvement/production-readiness` | After foundation hardening, parallel with infrastructure                 |
| `docs/plans/INFRASTRUCTURE-PLAN.md`       | `improvement/infrastructure`       | After foundation hardening, parallel with production readiness (Coolify) |
| `docs/plans/PRD-GAPS-SPEC.md`             | `feature/prd-gaps` (future)        | Reference spec, after all three above merge to main                      |
| `docs/plans/EXECUTION-PLAN-v2.md`         | —                                  | Superseded                                                               |
| `docs/plans/REFACTORING-PLAN.md`          | —                                  | Historical reference                                                     |

### Execution Order

```
1. Consolidation (complete) → merge to main
2. Foundation Hardening (9 stories, ~12 days) → establishes solid baseline
3. Production Readiness + Infrastructure (parallel, ~10 + ~4 days)
4. PRD Gaps (G1-G18, ~15 days) → feature completeness
```

Foundation Hardening must complete before production-readiness and infrastructure because it fixes data integrity, security, and auth issues that those plans depend on.

## Known Bugs

### Existing bugs (planned in PRODUCTION-READINESS-PLAN.md)

| ID  | Bug                                                  | Priority |
| --- | ---------------------------------------------------- | -------- |
| B1  | Triple session validation per request                | P1       |
| B2  | Meeting creation failure leaves booking in scheduled | P0       |
| B3  | Refund correction stores bookingId as paymentId      | P0       |
| B4  | Series bookings never expire (no deadlineAt)         | P0       |
| B5  | No CSRF protection on mutations                      | P0       |
| N1  | Scheduler onReleaseHolds calls expireBookings        | P1       |
| N2  | Scheduler onSendNotificationEmail is a no-op         | P1       |
| N3  | Scheduler not shut down gracefully                   | P1       |
| N4  | expireBookings doesn't expire series sessions        | P2       |
| N5  | listLedger ignores bookingId/eventKey filters        | P2       |
| N7  | Refund createCorrection uses Date.now() in event key | P1       |
| N8  | withdraw doesn't release other participants' holds   | P2       |
| N9  | adminBooking.listBookings returns null cursor        | P2       |
| N15 | applyOverride doesn't update booking.holdAmount      | P1       |

### New findings (planned in FOUNDATION-HARDENING.md)

| ID  | Bug                                                                    | Priority | Story |
| --- | ---------------------------------------------------------------------- | -------- | ----- |
| A1  | Group booking cancel doesn't release invitee holds                     | P0       | 1     |
| A2  | Group booking tutorDecline doesn't release invitee holds               | P0       | 1     |
| A3  | expireBookings doesn't release invitee holds                           | P0       | 1     |
| A4  | withdraw→cancel doesn't release other participants' holds              | P0       | 1     |
| A5  | confirmedHeadcount not decremented on withdraw                         | P0       | 1     |
| A6  | holdAmount not zeroed on cancel/decline/expire                         | P0       | 1     |
| A7  | Series cancel doesn't cascade to bookingSession rows                   | P0       | 1     |
| B1  | RESCHEDULE_PROPOSED has no expiry — booking stuck forever              | P0       | 2     |
| B2  | AWAITING_ADMIN_ROOM_APPROVAL/SCHEDULED not in expiry cron              | P0       | 2     |
| C1  | booking.get() IDOR — no ownership check                                | P0       | 3     |
| C2  | booking.listSessions() IDOR — no ownership check                       | P0       | 3     |
| C3  | Tutor actions lack tutorProcedure role guard                           | P1       | 3     |
| C4  | resendInvite doesn't invalidate old token                              | P1       | 3     |
| C5  | OpenAPI spec exposed without auth                                      | P1       | 3     |
| C6  | No password policy                                                     | P1       | 4     |
| D1  | Wallet ledger insert not atomic with balance update                    | P0       | 5     |
| D2  | 8 read-then-write race conditions without optimistic lock              | P1       | 5     |
| D3  | Payment webhook out-of-order delivery — user not credited              | P0       | 5     |
| D4  | Booking creation has no idempotency key                                | P1       | 7     |
| E1  | notification.write() swallows all errors silently                      | P1       | 6     |
| E2  | Google Meet + Resend calls have no timeout                             | P1       | 6     |
| E3  | No statement_timeout on DB pool                                        | P1       | 6     |
| E4  | No uncaughtException handler                                           | P1       | 6     |
| E5  | Webhook timestamp validation disabled outside production               | P1       | 6     |
| F1  | Unbounded string inputs (no .max()) — DoS vector                       | P2       | 4     |
| F2  | Unbounded array inputs (no .max())                                     | P2       | 4     |
| F3  | Dates not validated to be in the future                                | P2       | 4     |
| G1  | No session expiry configured                                           | P1       | 4     |
| G2  | No email verification flow (DEFERRED to production-readiness/PRD-gaps) | P1       | 4     |
| G3  | Google OAuth credentials fall back to empty string                     | P2       | 4     |
| G4  | No CSRF token (sameSite=none in production)                            | P0       | 4     |
| H1  | CSP incomplete — production-breaking (no connect-src)                  | P0       | 8     |
| I1  | findBookingsExpiringByDeadline has no LIMIT — OOM risk                 | P1       | 8     |
| I2  | Missing composite index for overlap check query                        | P2       | 8     |
| I3  | Dev DB logging may expose sensitive params                             | P2       | 8     |
| J1  | No React error boundary — blank page on crash                          | P1       | 9     |
| J2  | No auth session expiry handling on frontend                            | P1       | 9     |
| J3  | 4 dead frontend components                                             | P2       | 9     |
| J4  | `any` type casts in route files                                        | P2       | 9     |
| K1  | No constant-time comparison for signatures/tokens                      | P2       | 6     |
| K2  | No body size limit on webhook endpoints                                | P2       | 6     |
| K3  | Scheduler jobs have no retry attempts                                  | P2       | 8     |
| K4  | DRAFT and AWAITING_MARKS_HOLD are unreachable dead states              | P3       | 2     |
| K5  | repricedMarks column is dead — never set or read                       | P3       | 2     |
| K6  | timezone field stored but never used                                   | P3       | 2     |
| K7  | metrics.ts has no TTL eviction for stale path entries                  | P3       | 9     |

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
