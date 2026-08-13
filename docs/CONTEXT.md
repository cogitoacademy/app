# Cogito App — Codebase Context

Last updated: 2026-08-11

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
- Cookies: sameSite=strict (production) / lax (development), secure=true (production), httpOnly=true. Same-origin subdomain sharing works because `app.cogitoacademy.id` and `cogitoacademy.id` share the same site.
- `CogitoUser` type exported with role field.
- **Pending (foundation hardening):** password policy (min 8, upper/lower/digit), session expiry (7 days), conditional OAuth. **Email verification (G2) deferred** to production-readiness / PRD-gaps branch (additive; depends on Resend wiring + frontend route).

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): 4 parallel jobs (lint, typecheck, build, test+coverage)
- **CD** (after infrastructure branch): build → push to GHCR → Coolify auto-deploys
- **Lefthook** pre-commit: oxlint + oxfmt. Pre-push: typecheck.
- **Dependabot**: weekly npm + GitHub Actions updates.
- **Coverage**: 90% for `packages/api`, 80% overall (after foundation hardening)
- **Health**: `GET /health` with DB ping (Redis ping not yet implemented — see DEFERRED-OPS-TASKS 1.6)
- **Deployment platform**: Coolify (self-hosted PaaS on Hetzner VPS)
- **Scheduler boot**: The BullMQ worker + 3 repeatable jobs only start when the server runs with `SCHEDULER_ENABLED=true` **and** `REDIS_URL` set (via `initScheduler()`, wired in server bootstrap). Without both, the scheduler logs `scheduler_skip` and booking-expiry/hold-release/email jobs never run.

## Plans

Plans live in `docs/plans/` (active + completed) and `docs/archive/` (superseded/historical). See `docs/plans/README.md` for the index.

| Plan                                                              | Branch                             | Status                                                                             |
| ----------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/plans/completed/CONSOLIDATION-PLAN.md`                      | `improvement/consolidation`        | Merged to main (#16)                                                               |
| `docs/plans/completed/CONSOLIDATION-PHASE2-ERROR-ARCHITECTURE.md` | `improvement/consolidation`        | Merged to main (#16)                                                               |
| `docs/plans/completed/CONSOLIDATION-PHASE2.5-GAPS.md`             | `improvement/consolidation`        | Merged to main (#16)                                                               |
| `docs/plans/completed/FOUNDATION-HARDENING.md`                    | `improvement/foundation-hardening` | Merged to main (#17)                                                               |
| `docs/plans/completed/PRODUCTION-READINESS-PLAN.md`               | `improvement/production-readiness` | Merged to main (#18)                                                               |
| `docs/plans/completed/INFRASTRUCTURE-PLAN.md`                     | `improvement/infrastructure`       | Merged to main (#19)                                                               |
| `docs/plans/active/DEFERRED-OPS-TASKS.md`                         | main (post-merge)                  | Active — code gaps (1.4/1.5/1.7/1.8 done in BACKEND-HARDENING PRs B/C) + ops tasks |
| `docs/plans/active/PRD-GAPS-SPEC.md`                              | `feature/prd-gaps` (future)        | Reference spec, next to execute — G19 implemented (PR C), G20 fixed (PR C)         |
| `docs/plans/active/FRONTEND-GAPS-SPEC.md`                         | `feature/frontend-gaps` (future)   | Frontend gap spec, parallel with PRD Gaps                                          |
| `docs/archive/EXECUTION-PLAN-v2.md`                               | —                                  | Superseded                                                                         |
| `docs/archive/REFACTORING-PLAN.md`                                | —                                  | Historical reference                                                               |

### Execution Order

```
1. Consolidation (merged #16) → main
2. Foundation Hardening (merged #17) → main
3. Production Readiness + Infrastructure (merged #18 + #19) → main
4. Deferred Ops Tasks (code gaps, manual verification, production ops) → next PR(s)
5. PRD Gaps Backend (G1-G19, ~30 days) → feature/prd-gaps branch
6. Frontend Gaps (UI for admin override, lateness report, reschedule, etc.) → parallel with / after PRD Gaps
```

Production Readiness (#18) and Infrastructure (#19) merged to main. Deferred ops tasks are active code gaps. Next: PRD Gaps (feature completeness).

## Role E2E Readiness Snapshot (2026-08-12)

Use this section as the current role-readiness baseline. Re-audit only after the related backend or frontend plans materially change.

### Student

**Primary promotion flow is ready:** email/password auth -> tutor discovery -> solo booking -> Marks hold -> booking list/detail -> cancellation. Profile, balance/top-up, basic achievements, notification bell, calendar export, and WhatsApp contact surfaces are also present.

**Not full PRD complete:** group/series booking UI, invite confirmation/decline/reconfirmation UI, reschedule accept/reject, lateness/no-show reporting, public achievements, email verification, and session-expiry UX remain open. The notification center and Knowledge Bank gating UX are now implemented.

### Tutor

The tutor workspace now has the primary management surfaces: tutor-only onboarding, a weekly-first availability page, an incoming booking list, and booking detail actions for accept, decline, and complete. Weekly availability is materialized into concrete future slots through the selected end date (up to 52 weeks); one-time custom slots remain available for exceptions or force majeure. The incoming list uses the tutor-owned booking query rather than proposer-only `booking.listMine`.

The primary Tutor E2E flow has been manually verified with seeded accounts, including availability, incoming booking review, Google Meet link creation, student notification/state, and completion. Tutor rescheduling, lateness/no-show support, session notes, payout, and individual series completion remain backend-dependent gaps.

### Admin

Backend is ready for user role management, tutor invite/review, achievement moderation, basic booking list/history/override/refund, room list/create/assign, and refund corrections. Achievement moderation is the safest next Admin UI quick win.

Do not prioritize the full booking operations console or offline room workflow until the backend gaps for queue urgency/pagination (G8), wallet lookup (G9), override preview (G10), and room availability/approval (G13-G14) are resolved.

### Backend Gap Groups

- Ready now: student solo/group/series booking primitives, wallet/ledger/packages/Knowledge Bank, achievements, notifications, tutor onboarding/availability/incoming-booking actions, and the admin capabilities listed above.
- Still blocking later flows: support/lateness tickets (G1), group repricing (G4), series cancellation rules (G5), reschedule ownership and accept/reject (G6), rich notes (G7), admin queue/wallet/preview (G8-G10), meeting attendance/gating (G11-G12), offline rooms (G13-G14), disclaimer (G15), payout (G16), full notification matrix (G17), series completion (G18), and pricing extra-take correctness (G19).

### Current Execution Order

1. Complete Admin Tutor invite -> claim -> onboarding -> review -> publish E2E and verify published discovery.
2. Complete Student series booking UI and its booking detail/session presentation.
3. Complete group invite accept/decline and reconfirmation UI; group creation and debounced student lookup are implemented.
4. Keep achievement moderation/public surfacing at the end of the frontend queue.
5. Defer admin booking override and offline-room UI until their backend blockers are closed.

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
| K3  | Scheduler jobs have no retry attempts                                  | P2       | 8     | Fixed — all 3 jobs have `attempts: 3` + exponential backoff (no DLQ)                           |
| K4  | DRAFT and AWAITING_MARKS_HOLD are unreachable dead states              | P3       | 2     | Accepted (dead states, no action needed)                                                       |
| K5  | repricedMarks column is dead — never set or read                       | P3       | 2     | Accepted (dead column, no action needed)                                                       |
| K6  | timezone field stored but never used                                   | P3       | 2     | Accepted (stored, no action needed)                                                            |
| K7  | metrics.ts has no TTL eviction for stale path entries                  | P3       | 9     | Open                                                                                           |

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
