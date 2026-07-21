# Cogito Backend — Consolidation Plan

**Status:** Active — first branch to execute
**Branch:** `improvement/consolidation`
**Created from:** `main` (after current work merges)
**Date:** 2026-07-21
**Depends on:** Current branch merged to main
**Blocks:** `improvement/production-readiness` must branch from this after merge

This branch restructures the architecture first, so that subsequent bug fixes and feature work land on the clean structure.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Phase 1: Extract Co-Located Services](#3-phase-1-extract-co-located-services)
4. [Phase 2: Unify Handlers](#4-phase-2-unify-handlers)
5. [Phase 3: Consumer-Driven Ports](#5-phase-3-consumer-driven-ports)
6. [Phase 4: pg → postgres.js Migration](#6-phase-4-pg--postgresjs-migration)
7. [Phase 5: createModule Pattern](#7-phase-5-createmodule-pattern)
8. [Phase 6: Dead Code + Error Helpers](#8-phase-6-dead-code--error-helpers)
9. [Phase 7: Verify](#9-phase-7-verify)
10. [Risk Register](#10-risk-register)
11. [Execution Checklist](#11-execution-checklist)

---

## 1. Overview

### Why This Branch First

The handler/service/port restructuring touches every module. Doing it before bug fixes means:

- Bug fixes land on the new structure (no merge conflicts from reorganizing files)
- `services.ts` changes are done once, not twice
- `pg → postgres.js` migration is cleaner on the new structure
- Consumer-driven ports make cross-module dependencies explicit and self-documenting
- Subsequent branches don't need to navigate the old dual-handler pattern

### Phase Summary

| Phase | Focus                                                 | Tasks                                        | Days |
| ----- | ----------------------------------------------------- | -------------------------------------------- | ---- |
| 1     | Extract co-located services                           | 6 modules                                    | 0.5  |
| 2     | Unify handlers (merge `.handler.ts` + `.handlers.ts`) | 14 modules                                   | 2-3  |
| 3     | Consumer-driven ports (remove `shared/ports/`)        | 5 port files                                 | 1    |
| 4     | pg → postgres.js                                      | 1 migration + verify                         | 1-2  |
| 5     | createModule pattern                                  | 18 modules + simplify services.ts            | 0.5  |
| 6     | Dead code + error helpers                             | Cleanup                                      | 0.5  |
| 7     | Verify                                                | Full test suite, typecheck, build, benchmark | 0.5  |

**Total: ~6-8 days**

### Architecture After This Branch

```
modules/{module}/
  {module}.router.ts     ← oRPC route definitions (thin, no logic)
  {module}.handler.ts    ← DI factory + { context, input } adapters (unified)
  {module}.service.ts    ← Pure business logic + consumer port interfaces (inline)
  {module}.repo.ts       ← Data access (SQL queries)
  {module}.types.ts      ← Zod input/output schemas
  index.ts               ← createModule() factory function

shared/ports/            ← REMOVED (ports are now inline in consumer services)
```

No more `*.handlers.ts` (plural) files. No more `shared/ports/` directory. No more `pg` dependency. `services.ts` reduced from ~240 lines to ~60 lines.

### Module Structure: Before → After

**Before (5 files per module, 2 handler files):**

```
modules/{module}/
  {module}.router.ts      ← route definitions
  {module}.handler.ts     ← DI factory + business logic wrapper (SINGULAR)
  {module}.handlers.ts    ← { context, input } adapters (PLURAL)
  {module}.service.ts     ← pure business logic (sometimes co-located in handler.ts)
  {module}.repo.ts        ← data access
  {module}.types.ts       ← zod schemas
```

**After (4 files per module, 1 handler file):**

```
modules/{module}/
  {module}.router.ts      ← route definitions (thin)
  {module}.handler.ts     ← DI factory + { context, input } adapters (UNIFIED)
  {module}.service.ts     ← pure business logic + consumer port interfaces
  {module}.repo.ts        ← data access
  {module}.types.ts       ← zod schemas
```

---

## 2. Architecture Decisions

### AD-1: Handler Unification (Not Inlining)

**Decision:** Merge `.handler.ts` + `.handlers.ts` → single `.handler.ts`. Keep handler as a separate layer from the router.

**Rationale:**

- Router should be pure route definitions — no logic, no `context.session` extraction
- Handler is the HTTP transport adapter — maps `{ context, input }` → `(userId, input)`
- Service is pure business logic — no HTTP, no DB
- This gives clean separation: Router (HTTP) → Handler (transport) → Service (logic) → Repo (data)
- The current dual-handler pattern exists because `.handler.ts` was a DI wrapper and `.handlers.ts` was the transport adapter. Merging them eliminates the redundancy.

**What a unified handler looks like:**

```ts
// modules/wallet/wallet.handler.ts
import type { Context } from "../../context";
import type { WalletService } from "./wallet.service";

export function createWalletHandler(wallet: WalletService) {
  return {
    get: async ({ context }: { context: Context }) => {
      const w = await wallet.getOrCreate(context.session!.user.id);
      return { id: w.id, totalBalance: w.totalBalance, ... };
    },
    hold: async ({ context, input }: { context: Context; input: HoldInput }) => {
      return wallet.hold(context.session!.user.id, input);
    },
    // ... all methods that the router calls
  };
}
export type WalletHandler = ReturnType<typeof createWalletHandler>;
```

### AD-2: Consumer-Driven Port Interfaces

**Decision:** Each consuming module defines its own narrow port interface inline in its service file. Remove `shared/ports/` directory entirely.

**Rationale:**

- Consumer-driven ports follow Interface Segregation Principle — each module declares only what it needs
- No manual sync between port files and service implementations
- Adding a method to `WalletService` doesn't require updating any port file
- TypeScript structural typing verifies that the provider satisfies all consumer interfaces at the `services.ts` wiring site
- Reduces ~500 lines of port files to ~30 lines of inline interfaces

**What a consumer-driven port looks like:**

```ts
// modules/booking/booking.service.ts
import type { WalletSnapshot, HoldParams, ReleaseParams, DeductParams, CreditParams, CompensateParams } from "../wallet/wallet.service";

interface BookingWalletPort {
  hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}

export function createBookingService(deps: {
  db: DbType;
  repo: BookingRepo;
  wallet: BookingWalletPort;    // ← only what booking needs
  pricing: BookingPricingPort;  // ← only what booking needs
  audit: BookingAuditPort;      // ← only what booking needs
  notification: BookingNotificationPort;
  meeting: BookingMeetingPort;
}) { ... }
```

TypeScript automatically verifies that `wallet.service` satisfies `BookingWalletPort` at the `services.ts` wiring site. If it doesn't, you get a compile error.

**Where types come from:** Types like `HoldParams`, `WalletSnapshot` are defined in the **provider's service file** (`wallet.service.ts`) and imported by consumers. No separate types file needed — the service is the single source of truth.

### AD-3: ServiceRegistry Consistency

**Decision:** `ServiceRegistry` uses Handler types for modules with HTTP endpoints, Service types for modules without.

```ts
export interface ServiceRegistry {
  auth: AuthHandler;
  admin: AdminHandler;
  adminTutor: AdminTutorHandler;
  tutor: TutorHandler;
  discovery: DiscoveryHandler;
  invite: InviteHandler;
  achievement: AchievementHandler;
  wallet: WalletHandler;
  booking: BookingHandler;
  payment: PaymentHandler;
  notification: NotificationHandler;
  adminBooking: AdminBookingHandler;
  refund: RefundHandler;
  room: RoomHandler;
  email: EmailService; // no HTTP endpoints, no handler
  pricing: PricingService; // no HTTP endpoints, no handler (pure computation)
  scheduler: SchedulerService; // no HTTP endpoints, background jobs only
  audit: AuditService; // no HTTP endpoints, port implementation only
}
```

Routers access handlers via `context.services.{module}.{method}`. Other modules access services via DI through their consumer-driven ports.

### AD-4: createModule Pattern

**Decision:** Each module exports a `createModule` function in `index.ts`. Keep manual wiring in `services.ts`.

**Rationale:** 18 modules is manageable with explicit wiring. A module registry adds indirection without reducing complexity. The `createModule` pattern reduces per-module wiring from ~8 lines to ~3 lines while keeping dependencies explicit.

---

## 3. Phase 1: Extract Co-Located Services

**Goal:** Move `createXxxService` functions that are currently inside `xxx.handler.ts` into their own `xxx.service.ts` files.

Six modules have their service factory co-located in the handler file. Before we can unify handlers, these services need their own files.

### Current State (6 modules with co-located services)

| Module      | Service in handler file?                                     | Current files                                                                     |
| ----------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| auth        | Yes — `createAuthService` in `auth.handler.ts`               | `.handler.ts` + `.handlers.ts` + `.repo.ts` + `.service.ts` (exists but separate) |
| admin       | Yes — `createAdminService` in `admin.handler.ts`             | `.handler.ts` + `.handlers.ts` + `.repo.ts`                                       |
| adminTutor  | Yes — `createAdminTutorService` in `admin-tutor.handler.ts`  | `.handler.ts` + `.handlers.ts` + `.repo.ts`                                       |
| tutor       | Yes — `createTutorService` in `tutor.handler.ts`             | `.handler.ts` + `.handlers.ts` + `.repo.ts`                                       |
| invite      | Yes — `createInviteService` in `invite.handler.ts`           | `.handler.ts` + `.handlers.ts` + `.repo.ts`                                       |
| achievement | Yes — `createAchievementService` in `achievement.handler.ts` | `.handler.ts` + `.handlers.ts` + `.repo.ts`                                       |

### 1.1 auth module

**Files:** `modules/auth/auth.handler.ts` → extract `createAuthService` to `modules/auth/auth.service.ts`

The auth module already has `auth.service.ts` with `validateUpdateInput`. Move `createAuthService` and the service methods (`me`, `getProfile`, `updateProfile`) into the existing `auth.service.ts`. Leave the handler as a thin DI wrapper.

**Acceptance:** `auth.service.ts` contains `createAuthService` and all service methods. `auth.handler.ts` only contains `createAuthHandler` (thin wrapper). Tests pass.

### 1.2 admin module

**Files:** `modules/admin/admin.handler.ts` → extract `createAdminService` to `modules/admin/admin.service.ts`

`admin.handler.ts` currently has both `createAdminHandler` and `createAdminService`. Move `createAdminService`, `listUsers`, and `setRole` (including the transaction logic) into a new `admin.service.ts`.

**Acceptance:** `admin.service.ts` created with `createAdminService`. `admin.handler.ts` only contains `createAdminHandler`. Tests pass.

### 1.3 adminTutor module

**Files:** `modules/admin-tutor/admin-tutor.handler.ts` → extract `createAdminTutorService` to `modules/admin-tutor/admin-tutor.service.ts`

**Acceptance:** Same pattern as admin. Tests pass.

### 1.4 tutor module

**Files:** `modules/tutor/tutor.handler.ts` → extract `createTutorService` to `modules/tutor/tutor.service.ts`

**Acceptance:** Same pattern. Tests pass.

### 1.5 invite module

**Files:** `modules/invite/invite.handler.ts` → extract `createInviteService` to `modules/invite/invite.service.ts`

**Acceptance:** Same pattern. Tests pass.

### 1.6 achievement module

**Files:** `modules/achievement/achievement.handler.ts` → extract `createAchievementService` to `modules/achievement/achievement.service.ts`

**Acceptance:** Same pattern. Tests pass.

### 1.7 Verify extraction

- Run full test suite
- Verify all modules still work
- Verify `services.ts` wiring is unchanged (it already imports from both handler and service)

**Acceptance:** `bun run check-types && bun run build && bun test` all pass. Every module that had a co-located service now has a separate `service.ts` file.

---

## 4. Phase 2: Unify Handlers

**Goal:** Merge `.handler.ts` + `.handlers.ts` into a single `.handler.ts` per module. Delete all `.handlers.ts` files.

### Why Unify

The current two-file handler pattern serves two purposes:

- `.handler.ts` — DI factory that wraps service methods
- `.handlers.ts` — `{ context, input }` adapter that bridges HTTP transport to service methods

These should be one file. The DI factory and the transport adapter are tightly coupled — every method in the handler has a corresponding method in the handlers. Merging them eliminates the redundancy.

### What Each Unified Handler Looks Like

```ts
// modules/admin/admin.handler.ts (AFTER unification)
import type { Context } from "../../context";
import type { z } from "zod";
import type { listUsersInput, setRoleInput } from "./admin.types";
import type { AdminService } from "./admin.service";

type ListUsersInput = z.infer<typeof listUsersInput>;
type SetRoleInput = z.infer<typeof setRoleInput>;

export function createAdminHandler(admin: AdminService) {
  return {
    listUsers: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListUsersInput;
    }) => {
      return admin.listUsers(input ?? {});
    },
    setRole: async ({
      context,
      input,
    }: {
      context: Context;
      input: SetRoleInput;
    }) => {
      return admin.setRole(context.session!.user.id, input);
    },
  };
}
export type AdminHandler = ReturnType<typeof createAdminHandler>;
```

This is exactly what the `.handler.ts` DI wrapper + `.handlers.ts` adapter currently do — just in one file.

### Modules to Refactor

#### 2.1 auth module

**Files:** `auth.handler.ts` + `auth.handlers.ts` → `auth.handler.ts` (unified)

- Merge `authHandlers` methods into `createAuthHandler`
- Delete `auth.handlers.ts`
- Update `auth.router.ts` to import from `auth.handler.ts`

**Acceptance:** `auth.handlers.ts` deleted. Auth tests pass.

#### 2.2 admin module

**Files:** `admin.handler.ts` + `admin.handlers.ts` → `admin.handler.ts` (unified)

- Merge `adminHandlers` methods into `createAdminHandler`
- Delete `admin.handlers.ts`
- Update `admin.router.ts`

**Acceptance:** `admin.handlers.ts` deleted. Admin tests pass.

#### 2.3 adminTutor module

**Files:** `admin-tutor.handler.ts` + `admin-tutor.handlers.ts` → `admin-tutor.handler.ts` (unified)

**Acceptance:** `admin-tutor.handlers.ts` deleted. AdminTutor tests pass.

#### 2.4 tutor module

**Files:** `tutor.handler.ts` + `tutor.handlers.ts` → `tutor.handler.ts` (unified)

**Acceptance:** `tutor.handlers.ts` deleted. Tutor tests pass.

#### 2.5 tutorDiscovery module

**Files:** `discovery.handler.ts` + `discovery.handlers.ts` → `discovery.handler.ts` (unified)

**Acceptance:** `discovery.handlers.ts` deleted. Discovery tests pass.

#### 2.6 invite module

**Files:** `invite.handler.ts` + `invite.handlers.ts` → `invite.handler.ts` (unified)

**Acceptance:** `invite.handlers.ts` deleted. Invite tests pass.

#### 2.7 achievement module

**Files:** `achievement.handler.ts` + `achievement.handlers.ts` → `achievement.handler.ts` (unified)

**Acceptance:** `achievement.handlers.ts` deleted. Achievement tests pass.

#### 2.8 wallet module

**Files:** `wallet.handlers.ts` → rename to `wallet.handler.ts`

Wallet has no `.handler.ts` (singular) — only `.handlers.ts`. Wrap in a `createWalletHandler` DI factory and rename.

**Acceptance:** `wallet.handlers.ts` deleted, `wallet.handler.ts` created. Wallet tests pass.

#### 2.9 booking module

**Files:** `booking.handlers.ts` → rename to `booking.handler.ts`

Booking has no `.handler.ts` (singular). Wrap `bookingHandlers` + `tutorActionsHandlers` in a `createBookingHandler` DI factory.

**Acceptance:** `booking.handlers.ts` deleted, `booking.handler.ts` created. Booking tests pass.

#### 2.10 payment module

**Files:** `payment.handlers.ts` → rename to `payment.handler.ts`

Same pattern as wallet.

**Acceptance:** `payment.handlers.ts` deleted, `payment.handler.ts` created. Payment tests pass.

#### 2.11 notification module

**Files:** `notification.handler.ts` + `notification.handlers.ts` → `notification.handler.ts` (unified)

Current `notification.handler.ts` is just a thin `.bind()` wrapper. Merge with the context adapters from `notification.handlers.ts`.

**Acceptance:** `notification.handlers.ts` deleted. Notification tests pass.

#### 2.12 adminBooking module

**Files:** `admin-booking.handler.ts` + `admin-booking.handlers.ts` → `admin-booking.handler.ts` (unified)

**Acceptance:** `admin-booking.handlers.ts` deleted. AdminBooking tests pass.

#### 2.13 refund module

**Files:** `refund.handler.ts` + `refund.handlers.ts` → `refund.handler.ts` (unified)

Current `refund.handler.ts` is a thin wrapper. Merge with context adapters.

**Acceptance:** `refund.handlers.ts` deleted. Refund tests pass.

#### 2.14 room module

**Files:** `room.handlers.ts` → rename to `room.handler.ts`

Same pattern as wallet.

**Acceptance:** `room.handlers.ts` deleted, `room.handler.ts` created. Room tests pass.

### 2.15 Update all router imports

Every router that imports from `xxx.handlers.ts` needs to import from `xxx.handler.ts` instead:

```ts
// Before:
import { bookingHandlers, tutorActionsHandlers } from "./booking.handlers";

// After:
import { bookingHandler, tutorActionsHandler } from "./booking.handler";
// Or: the unified handler exports both under one object
```

### 2.16 Update services.ts

Update `services.ts` to:

- Remove all `import { xxxHandlers }` statements
- Remove all `import { createXxxHandler }` statements (if the handler now needs different args)
- Wire handlers through the unified `createXxxHandler` functions
- Update `ServiceRegistry` type to use unified handler types

**Acceptance:** `bun run check-types` passes. No `.handlers.ts` files remain in the codebase.

---

## 5. Phase 3: Consumer-Driven Ports

**Goal:** Remove `shared/ports/` directory. Each consuming module defines its own narrow port interface inline.

### Current State

`shared/ports/` contains 5 port files:

- `audit.port.ts` — used by admin, adminTutor, tutor, invite, achievement, adminBooking, refund
- `wallet.port.ts` — used by booking, payment, adminBooking, refund, auth
- `pricing.port.ts` — used by booking, tutor
- `notification.port.ts` — used by booking
- `meeting.port.ts` — used by booking

Each port file is ~100 lines, defining both the interface and the param/result types.

### 3.1 Move param/result types to provider service files

For each port, the param and result types (`HoldParams`, `ReleaseParams`, `WalletSnapshot`, etc.) should be defined in the **provider's service file**, not the port file.

**Example — wallet:**

```ts
// modules/wallet/wallet.service.ts (types stay here, single source of truth)
export interface HoldParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
  bookingId?: string;
}
export interface WalletSnapshot {
  id: string;
  totalBalance: number;
  heldBalance: number;
  availableBalance: number;
}
// ... all other param/result types
```

**Affected files:** Move types from `shared/ports/wallet.port.ts` → `modules/wallet/wallet.service.ts`, `shared/ports/audit.port.ts` → `modules/audit/audit.service.ts`, etc.

**Acceptance:** All param/result types defined in provider service files. No type imports from `shared/ports/` remain in any module.

### 3.2 Add consumer-driven port interfaces inline

For each consuming module, add a narrow port interface in its service file:

**Example — booking:**

```ts
// modules/booking/booking.service.ts
import type { WalletSnapshot, HoldParams, ReleaseParams, DeductParams, CreditParams, CompensateParams } from "../wallet/wallet.service";
import type { AuditParams } from "../audit/audit.service";
import type { PricingResult } from "../pricing/pricing.service";
import type { NotificationParams } from "../notification/notification.service";
import type { MeetingResult } from "../meeting/meeting.provider";

interface BookingWalletPort {
  hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}

interface BookingAuditPort {
  record(params: AuditParams): Promise<void>;
}

interface BookingPricingPort {
  calculateSoloPrice(input: PricingInput): PricingResult;
  calculateGroupPrice(input: PricingInput): PricingResult;
  validateFloorPrice(price: number, modality: string, groupSize: number): boolean;
}

interface BookingNotificationPort {
  write(params: NotificationParams): Promise<void>;
}

interface BookingMeetingPort {
  createMeeting(input: MeetingInput): Promise<MeetingResult>;
  cancelMeeting(meetingId: string): Promise<void>;
}

export function createBookingService(deps: {
  db: DbType;
  repo: BookingRepo;
  wallet: BookingWalletPort;
  pricing: BookingPricingPort;
  audit: BookingAuditPort;
  notification: BookingNotificationPort;
  meeting: BookingMeetingPort;
}) { ... }
```

**Modules that need port interfaces:**

| Module       | Needs ports from                              |
| ------------ | --------------------------------------------- |
| auth         | wallet                                        |
| admin        | audit                                         |
| adminTutor   | audit                                         |
| tutor        | audit, pricing                                |
| invite       | audit                                         |
| achievement  | audit                                         |
| booking      | wallet, pricing, audit, notification, meeting |
| payment      | wallet                                        |
| adminBooking | audit, wallet, refund                         |
| refund       | audit, wallet                                 |

**Acceptance:** Each consuming module has inline port interfaces that declare only the methods it needs.

### 3.3 Delete shared/ports/ directory

Delete the following files:

- `shared/ports/audit.port.ts`
- `shared/ports/wallet.port.ts`
- `shared/ports/pricing.port.ts`
- `shared/ports/notification.port.ts`
- `shared/ports/meeting.port.ts`

Update all imports across the codebase to point to the new locations:

- Types → provider service files
- Port interfaces → consumer service files (inline)

**Acceptance:** `shared/ports/` directory deleted. All imports resolve. `bun run check-types` passes.

### 3.4 Verify port migration

- Run full test suite
- Run type check — TypeScript will catch any port mismatches at the `services.ts` wiring site
- Verify that `wallet.service` satisfies `BookingWalletPort`, `PaymentWalletPort`, `AuthWalletPort`, etc.

**Acceptance:** `bun run check-types && bun run build && bun test` all pass.

---

## 6. Phase 4: pg → postgres.js Migration

**Goal:** Replace the `pg` driver with `postgres.js` for better performance, TypeScript support, and Drizzle compatibility.

### 4.1 Install postgres.js and update dependencies

**Files:** `packages/db/package.json`, root `package.json`

- Add `postgres` package (postgres.js)
- Remove `pg` and `@types/pg` from dependencies
- Update `drizzle-orm` if needed (Drizzle 0.36+ has native `postgres.js` support)

**Acceptance:** `bun install` succeeds. No `pg` references in `packages/db/package.json`.

### 4.2 Replace connection pool

**Files:** `packages/db/src/index.ts`

```ts
// Before:
import pg from "pg";
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 20 });
export const db = drizzle(pool, { schema });

// After:
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
const client = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });
```

**Acceptance:** DB connection works. `bun run db:studio` connects successfully.

### 4.3 Update all repo files

**Files:** All `*.repo.ts` files in `modules/*/`

- Replace any `pg`-specific syntax
- Verify all Drizzle queries still work with `postgres.js`
- Test each repo method individually

**Acceptance:** All repo methods work with `postgres.js`. No `pg` imports remain.

### 4.4 Add query logging in development

**Files:** `packages/db/src/index.ts`

```ts
const client = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  ...(env.NODE_ENV === "development" && {
    onquery: (query: { sql: string; params: unknown[] }) => {
      console.log(`[DB] ${query.sql} | ${JSON.stringify(query.params)}`);
    },
  }),
});
```

**Acceptance:** Dev server logs show each query with params.

### 4.5 Update Docker and test configuration

- Verify Docker PostgreSQL works with `postgres.js`
- Update test helpers that imported `pg` directly
- Run `bun run db:migrate` and `bun run db:generate`

**Acceptance:** Tests pass with `postgres.js`. Migrations apply cleanly.

### 4.6 Verify migration

- Run full test suite: `bun test`
- Type check: `bun run check-types`
- Build: `bun run build`
- Linter: `bun run check`
- Manual smoke test

**Acceptance:** All green. No `pg` references anywhere in the codebase.

---

## 7. Phase 5: createModule Pattern

**Goal:** Simplify `services.ts` by giving each module a factory function.

### 5.1 Create index.ts for each module

For each module, create `modules/{module}/index.ts`:

```ts
// modules/wallet/index.ts
import type { DbType } from "../../lib/db";
import { createWalletRepo } from "./wallet.repo";
import { createWalletService } from "./wallet.service";
import { createWalletHandler } from "./wallet.handler";

export function createWalletModule(deps: { db: DbType }) {
  const repo = createWalletRepo(deps.db);
  const service = createWalletService(repo, deps.db);
  const handler = createWalletHandler(service);
  return { repo, service, handler };
}

export type WalletModule = ReturnType<typeof createWalletModule>;
```

Modules that need cross-module dependencies declare them in their deps:

```ts
// modules/booking/index.ts
export function createBookingModule(deps: {
  db: DbType;
  wallet: BookingWalletPort; // consumer-driven port
  pricing: BookingPricingPort;
  audit: BookingAuditPort;
  notification: BookingNotificationPort;
  meeting: BookingMeetingPort;
}) {
  const repo = createBookingRepo(deps.db);
  const service = createBookingService({ repo, ...deps });
  const handler = createBookingHandler(service);
  return { repo, service, handler };
}
```

**Modules to create index.ts for:** auth, admin, adminTutor, tutor, tutorDiscovery, invite, achievement, wallet, pricing, booking, payment, notification, scheduler, adminBooking, refund, room, meeting, email

**Acceptance:** Each module has `index.ts` with `createModule` function. TypeScript compiles.

### 5.2 Simplify services.ts

Replace the current 240-line `services.ts` with ~60 lines:

```ts
// services.ts
import { db } from "./lib/db";
import { env } from "@cogito-app/env/server";
import { createAuthModule } from "./modules/auth";
import { createAdminModule } from "./modules/admin";
import { createAdminTutorModule } from "./modules/admin-tutor";
import { createTutorModule } from "./modules/tutor";
import { createDiscoveryModule } from "./modules/tutor-discovery";
import { createInviteModule } from "./modules/invite";
import { createAchievementModule } from "./modules/achievement";
import { createWalletModule } from "./modules/wallet";
import { createPricingModule } from "./modules/pricing";
import { createBookingModule } from "./modules/booking";
import { createPaymentModule } from "./modules/payment";
import { createNotificationModule } from "./modules/notification";
import { createSchedulerModule } from "./modules/scheduler";
import { createAdminBookingModule } from "./modules/admin-booking";
import { createRefundModule } from "./modules/refund";
import { createRoomModule } from "./modules/room";
import { createMeetingModule } from "./modules/meeting";
import { createEmailModule } from "./modules/email";

// Infrastructure modules (no HTTP endpoints)
const audit = createAuditModule({ db });
const pricing = createPricingModule({ db });
const email = createEmailModule({ resendApiKey: env.RESEND_API_KEY, emailFrom: env.EMAIL_FROM });

// Business modules (with cross-module dependencies)
const wallet = createWalletModule({ db, audit: audit.service });
const auth = createAuthModule({ db, wallet: wallet.service });
const admin = createAdminModule({ db, audit: audit.service });
const adminTutor = createAdminTutorModule({ db, audit: audit.service });
const tutor = createTutorModule({ db, pricing: pricing.service, audit: audit.service });
const discovery = createDiscoveryModule({ db });
const invite = createInviteModule({ db, audit: audit.service });
const achievement = createAchievementModule({ db, audit: audit.service });
const notification = createNotificationModule({ db, email: email.service });
const meeting = createMeetingModule({ db, ...meetingConfig });
const payment = createPaymentModule({ db, wallet: wallet.service, provider: paymentProvider });
const room = createRoomModule({ db });
const booking = createBookingModule({
  db,
  wallet: wallet.service,
  pricing: pricing.service,
  audit: audit.service,
  notification: notification.service,
  meeting: meeting.service,
});
const adminBooking = createAdminBookingModule({ db, audit: audit.service, wallet: wallet.service, refundRepo });
const refund = createRefundModule({ db, audit: audit.service, wallet: wallet.service });
const scheduler = createSchedulerModule({ booking: booking.service, ... });

export const services = {
  auth: auth.handler,
  admin: admin.handler,
  adminTutor: adminTutor.handler,
  tutor: tutor.handler,
  discovery: discovery.handler,
  invite: invite.handler,
  achievement: achievement.handler,
  wallet: wallet.handler,
  booking: booking.handler,
  payment: payment.handler,
  notification: notification.handler,
  adminBooking: adminBooking.handler,
  refund: refund.handler,
  room: room.handler,
  email: email.service,
  pricing: pricing.service,
  scheduler: scheduler.service,
  audit: audit.service,
};

export type Services = typeof services;
```

**Note:** TypeScript verifies structural compatibility at every wiring site. If `wallet.service` doesn't implement `BookingWalletPort`, you get a compile error on the `wallet: wallet.service` line.

**Acceptance:** `services.ts` is ~60 lines. All dependencies explicit and type-checked.

### 5.3 Verify createModule pattern

- Run full test suite
- Verify all routes still work
- Check dependency graph is visible in `services.ts`

**Acceptance:** `bun run check-types && bun run build && bun test` all pass.

---

## 8. Phase 6: Dead Code + Error Helpers

### 6.1 Remove duplicate `createFallbackMeetingProvider`

**Files:** `modules/meeting/google-meeting.provider.ts`, `modules/meeting/manual-meeting.provider.ts`

- Extract shared `createFallbackMeetingProvider` to `modules/meeting/meeting.utils.ts`
- Remove duplicate from both files
- Import from shared location

**Acceptance:** Single source of truth for fallback meeting provider logic.

### 6.2 Consolidate error helpers

**Files:** `lib/errors.ts`, all modules

- Verify all modules use error helpers (`badRequest()`, `notFound()`, `forbidden()`, etc.)
- Replace any remaining `new ORPCError()` calls with helpers
- Ensure consistent error codes across modules

**Acceptance:** `grep -r "new ORPCError" packages/api/src/modules/` returns zero results.

### 6.3 Remove dead code

**Files:** Multiple

- Remove `@hookform/resolvers` from dependencies (zero imports)
- Remove `midtrans` enum value from payment provider types
- Remove `withTx` from `lib/tx.ts` if unused after consolidation
- Run `bunx depcheck` on `packages/api`

**Acceptance:** `depcheck` shows no unused dependencies. No dead code files remain.

### 6.4 Verify cleanup

- `bun run check && bun run check-types && bun run build && bun test` all pass
- No `.handlers.ts` files remain in any module
- No files in `shared/ports/` directory
- `services.ts` is ~60 lines
- All imports resolve correctly

**Acceptance:** Full green CI run.

---

## 9. Phase 7: Verify

### 7.1 Full test suite with coverage

```bash
bun run check
bun run check-types
bun run build
bun test
bun run test:coverage
```

### 7.2 Manual smoke test

Start dev server and test:

- Auth: login, get profile
- Wallet: check balance, purchase
- Booking: create solo booking
- Admin: set role
- Discovery: list tutors

### 7.3 Benchmark query performance

Run `EXPLAIN ANALYZE` on key queries to verify `postgres.js` hasn't regressed:

- `SELECT * FROM wallet WHERE user_id = $1`
- `SELECT * FROM booking WHERE status = 'pending' AND deadline_at < now()`
- `SELECT * FROM tutor_profile WHERE onboarding_status = 'published'`

**Acceptance:** No performance regression. Key queries use indexes.

### 7.4 Verify port migration

- Every module that depends on another module declares its own port interface
- `shared/ports/` directory does not exist
- `services.ts` wiring site catches any type mismatches at compile time
- Consumer port interfaces are narrow — each only declares methods it uses

**Acceptance:** No `shared/ports/` directory. All cross-module dependencies are explicit and type-checked.

---

## 10. Risk Register

| #   | Risk                                                              | Likelihood | Impact | Mitigation                                                                                                                                                       |
| --- | ----------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Handler unification misses a method                               | Low        | High   | TypeScript catches all missing methods at compile time. Run full test suite after each module.                                                                   |
| R2  | Consumer port interface omits a method that provider has          | Low        | Medium | TypeScript catches this at the `services.ts` wiring site. If `wallet.service` doesn't satisfy `BookingWalletPort`, compile error.                                |
| R3  | Provider changes a method signature                               | Medium     | High   | All consumers that declare that method in their port interface will get compile errors. This is a feature, not a bug — it surfaces breaking changes immediately. |
| R4  | `postgres.js` migration breaks Drizzle ORM compatibility          | Medium     | High   | Test all queries before/after. Drizzle 0.36+ supports `postgres.js`. Verify version.                                                                             |
| R5  | `createModule` pattern creates circular dependency                | Low        | Medium | TypeScript catches this at compile time. Keep dependency graph explicit in `services.ts`.                                                                        |
| R6  | Moving types from `shared/ports/` to service files breaks imports | Medium     | Low    | Use IDE "Find all references" to update every import. TypeScript catches missing imports.                                                                        |
| R7  | `DbOrTx` type compatibility with `postgres.js` transactions       | Medium     | High   | Test transactions explicitly. The type may need adjustment.                                                                                                      |
| R8  | Dual handler pattern causes confusion during merge                | Low        | Low    | Each module is merged individually and tested. The pattern is mechanical: take `xxx.handlers.ts` content, put it inside `createXxxHandler`.                      |

---

## 11. Execution Checklist

### Phase 1: Extract Co-Located Services

- [ ] 1.1 Extract `createAuthService` from `auth.handler.ts` to `auth.service.ts`
- [ ] 1.2 Extract `createAdminService` from `admin.handler.ts` to `admin.service.ts`
- [ ] 1.3 Extract `createAdminTutorService` from `admin-tutor.handler.ts` to `admin-tutor.service.ts`
- [ ] 1.4 Extract `createTutorService` from `tutor.handler.ts` to `tutor.service.ts`
- [ ] 1.5 Extract `createInviteService` from `invite.handler.ts` to `invite.service.ts`
- [ ] 1.6 Extract `createAchievementService` from `achievement.handler.ts` to `achievement.service.ts`
- [ ] 1.7 Verify extraction (full test suite)

### Phase 2: Unify Handlers

- [ ] 2.1 Unify auth handler (merge `auth.handler.ts` + `auth.handlers.ts`)
- [ ] 2.2 Unify admin handler
- [ ] 2.3 Unify adminTutor handler
- [ ] 2.4 Unify tutor handler
- [ ] 2.5 Unify tutorDiscovery handler
- [ ] 2.6 Unify invite handler
- [ ] 2.7 Unify achievement handler
- [ ] 2.8 Unify wallet handler (rename `wallet.handlers.ts` → `wallet.handler.ts`, add DI factory)
- [ ] 2.9 Unify booking handler (rename + add DI factory)
- [ ] 2.10 Unify payment handler
- [ ] 2.11 Unify notification handler
- [ ] 2.12 Unify adminBooking handler
- [ ] 2.13 Unify refund handler
- [ ] 2.14 Unify room handler
- [ ] 2.15 Update all router imports
- [ ] 2.16 Update services.ts
- [ ] Verify: all module tests pass, no `.handlers.ts` files remain

### Phase 3: Consumer-Driven Ports

- [ ] 3.1 Move param/result types from `shared/ports/` to provider service files
- [ ] 3.2 Add consumer-driven port interfaces inline in each consuming service
- [ ] 3.3 Delete `shared/ports/` directory
- [ ] 3.4 Verify port migration (full test suite + type check)

### Phase 4: pg → postgres.js

- [ ] 4.1 Install postgres.js, remove pg
- [ ] 4.2 Replace connection pool in db/index.ts
- [ ] 4.3 Update all repo files for postgres.js syntax
- [ ] 4.4 Add query logging in development
- [ ] 4.5 Update Docker and test configuration
- [ ] 4.6 Verify migration (full test suite, typecheck, build)

### Phase 5: createModule Pattern

- [ ] 5.1 Create index.ts with createModule for each module
- [ ] 5.2 Simplify services.ts using createModule calls (~60 lines)
- [ ] 5.3 Verify createModule pattern (full test suite)

### Phase 6: Dead Code + Error Helpers

- [ ] 6.1 Remove duplicate createFallbackMeetingProvider
- [ ] 6.2 Consolidate error helpers (no raw `new ORPCError`)
- [ ] 6.3 Remove dead code and unused dependencies
- [ ] 6.4 Verify cleanup (full CI run)

### Phase 7: Verify

- [ ] 7.1 Full test suite (check, types, build, test, coverage)
- [ ] 7.2 Manual smoke test (auth, wallet, booking, admin, discovery)
- [ ] 7.3 Benchmark query performance (no regressions)
- [ ] 7.4 Verify port migration (no `shared/ports/`, all types checked)

---

### Version Notes

- v1.0 (2026-07-21): Created. Handler inlining, pg→postgres.js, createModule, dead code.
- v2.0 (2026-07-21): Rewritten. Handler unification (not inlining), consumer-driven ports (not shared/ports/), 7 phases, ~6-8 days.
