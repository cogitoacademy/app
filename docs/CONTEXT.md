# Cogito App — Codebase Context

Last updated: 2026-06-27

## Architecture

Monorepo (Turborepo + Bun workspaces). PostgreSQL 16 (Docker port 6767). Drizzle ORM. Elysia server. oRPC (not tRPC). Better Auth 1.6.11. React 19 + TanStack Router/Query/Form. Selia UI (TailwindCSS v4 + @base-ui/react).

**5-layer architecture:** Router → Handler → Service → Repository → Port

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
│   ├── api/                 # Business logic (5-layer modules)
│   │   └── src/
│   │       ├── procedures.ts # publicProcedure, protectedProcedure, adminProcedure
│   │       ├── routers.ts    # appRouter composition
│   │       ├── services.ts   # Composition root: wire repos → handlers → ports
│   │       ├── context.ts    # Per-request: { session, services }
│   │       ├── lib/          # errors, db, tx (DbOrTx type)
│   │       ├── shared/
│   │       │   ├── ports/    # AuditPort, PricingPort, WalletPort
│   │       │   └── constants.ts
│   │       └── modules/      # 10 domain modules (5-layer each)
│   ├── auth/                # Better Auth config (pure, no wallet coupling)
│   ├── config/              # Shared TS config
│   ├── db/                  # Drizzle schema + migrations
│   ├── env/                 # Zod-validated env vars
│   └── ui/                  # Selia component library (22+ components)
├── docs/                    # PRD, plans, context
└── designs/                 # .pen design files
```

## 5-Layer Architecture

Every module follows: **Router → Handler → Service → Repository → Port**

| Layer      | Responsibility                                      | DB?            | File                          |
| ---------- | --------------------------------------------------- | -------------- | ----------------------------- |
| Router     | oRPC route, zod validation, auth middleware         | No             | `{module}.router.ts`          |
| Handler    | Orchestration: repo + service + ports, transactions | No (delegates) | `{module}.handler.ts`         |
| Service    | Pure business logic (validation, state)             | No             | `{module}.service.ts`         |
| Repository | Data access (SQL queries only)                      | Yes            | `{module}.repo.ts`            |
| Port       | Cross-module interface (DI boundary)                | No             | `shared/ports/{name}.port.ts` |

**Request flow:** `POST /rpc/admin.setRole → Router → Handler.setRole() → adminRepo.getById + adminService.validateRoleChange + db.transaction(adminRepo.updateRole + auditPort.record)`

## DB Schema (11 tables)

### `user` (auth.ts) — CHECK(role IN ('student','tutor','admin'))

### `session` / `account` / `verification` (auth.ts) — Better Auth owned

### `wallet` (wallet.ts) — CHECK(total=held+available), uuid PK

### `ledgerEntry` (wallet.ts) — UNIQUE(wallet_id,event_key,source_reference), CHECK entry types

### `studentProfile` (student-profile.ts) — uuid PK

### `tutorProfile` (tutor-profile.ts) — CHECK modality + onboarding_status

### `tutorInvite` (tutor-invite.ts) — CHECK status, revoked_by/at fields

### `achievement` (achievement.ts) — CHECK status

### `auditLog` (audit-log.ts) — CHECK actor_type, before/after state jsonb

## API Modules (10)

All procedures are POST (oRPC convention). Auth via session cookies.

### `auth` (protected)

- `me` → { user, profile, tutorProfile, wallet } — wallet lazy-created via getOrCreate
- `getProfile` → student profile
- `updateProfile` → upsert student profile

### `admin` (admin)

- `listUsers` → paginated user list
- `setRole` → set role with audit + last-admin guard

### `adminTutor` (admin)

- `createInvite`, `listInvites`, `resendInvite`, `revokeInvite`
- `listTutorProfiles`, `reviewTutorProfile` (publish/suspend/request_changes)

### `tutor` (protected)

- `getMyProfile`, `updateMyProfile` (price floor validation), `submitForReview`

### `tutors` (protected) — tutor discovery

- `listPublished` → SQL filtering (ILIKE + jsonb @>), paginated

### `invite` (public + protected)

- `verify` (public) → validate token
- `claim` (protected) → create tutor profile, set role, audit

### `achievement` (protected + admin)

- `list`, `create`, `update`, `delete` (protected, pending only)
- `adminList` (admin, paginated), `adminReview` (admin, with audit)

## Auth Config

- Email/password enabled. No OAuth yet.
- Wallet created lazily via `WalletService.getOrCreate()` on first `auth.me` call.
- Cookies: sameSite=none, secure=true, httpOnly=true (production).
- `CogitoUser` type exported with role field.

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): 4 parallel jobs (lint, typecheck, build, test+coverage)
- **Lefthook** pre-commit: oxlint + oxfmt. Pre-push: typecheck.
- **Dependabot**: weekly npm + GitHub Actions updates.
- **Coverage**: Bun `--coverage` with lcov reporter, 10% threshold, custom PR comment script.
- **Health**: `GET /health` with DB ping.

## Execution Plan

Active plan: `docs/plans/EXECUTION-PLAN-v2.md`
Design reference: `docs/planning-phase-0-backend-mvp/PLAN.md`

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
