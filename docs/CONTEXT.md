# Cogito App — Codebase Context

Last updated: 2026-06-26

## Architecture

Monorepo (Turborepo + Bun workspaces). PostgreSQL 16 (Docker port 6767). Drizzle ORM. Elysia server. oRPC (not tRPC). Better Auth 1.6.11. React 19 + TanStack Router/Query/Form. Selia UI (TailwindCSS v4 + @base-ui/react).

```
cogito-app/
├── apps/
│   ├── server/          # Elysia HTTP server (port 3001)
│   └── web/             # Vite + React 19 + TanStack Router
├── packages/
│   ├── api/             # oRPC routers (business logic)
│   ├── auth/            # Better Auth config + hooks
│   ├── config/          # Shared TS config
│   ├── db/              # Drizzle schema + migrations
│   ├── env/             # Zod-validated env vars (server + web)
│   └── ui/              # Selia component library (22 components)
├── docs/                # PRD, plans, context
└── designs/             # .pen design files
```

## Packages

| Package                  | Purpose                  | Key Exports                                                                                                                                                                        |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cogito-app/db`         | Drizzle ORM + PostgreSQL | `createDb()`, `db`, all schema tables                                                                                                                                              |
| `@cogito-app/auth`       | Better Auth setup        | `auth`, `createAuth()`, `CogitoUser` type                                                                                                                                          |
| `@cogito-app/api`        | oRPC routers             | `appRouter`, `AppRouter`, `AppRouterClient`, procedures                                                                                                                            |
| `@cogito-app/env/server` | Server env validation    | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NODE_ENV`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `COMPETITION_CALENDAR_URL`, `KNOWLEDGE_BANK_URL` |
| `@cogito-app/env/web`    | Web env validation       | `VITE_SERVER_URL`                                                                                                                                                                  |
| `@cogito-app/ui`         | Selia UI components      | 22 components from `@cogito-app/ui/components/selia/*`                                                                                                                             |

## DB Schema (10 tables)

### `user` (auth.ts)

- id (text PK), name, email (unique), emailVerified, image, role (default "student"), createdAt, updatedAt
- Roles: `student` | `tutor` | `admin`
- HasOne: wallet, studentProfile. HasMany: sessions, accounts

### `session` / `account` / `verification` (auth.ts)

- Standard Better Auth tables. Sessions FK → user. Accounts FK → user.

### `wallet` (wallet.ts)

- id, userId (unique FK → user), totalBalance (default 0), heldBalance (default 0), availableBalance (default 0), timestamps
- Auto-created on signup via auth hook

### `ledgerEntry` (wallet.ts)

- id, walletId (FK → wallet), bookingId, eventKey, entryType, actorType, amount, beforeBalance, afterBalance, reason, sourceReference, createdAt
- Indexes: walletId, eventKey, bookingId

### `studentProfile` (student-profile.ts)

- id, userId (unique FK → user), phoneNumber, schoolName, gradeLevel, parentName, parentPhone, parentEmail, timestamps

### `achievement` (achievement.ts)

- id (uuid), userId (FK → user), eventName, category, award, level, eventDate (date), location, description, subjects (jsonb string[]), imageUrl, status (default "pending"), adminNote, timestamps
- Indexes: userId, status

### `markPackage` (mark-package.ts)

- id (uuid PK), code unique (starter/learner/explorer/pioneer), name, marks, priceIdr, isActive, timestamps

### `paymentRecord` (payment-record.ts)

- id (uuid PK), userId FK→user, walletId FK→wallet, packageId FK→markPackage nullable, provider (stub/midtrans/xendit), providerReference, providerEventId unique, amountIdr, marks, status (pending/succeeded/failed/refunded), receiptUrl, failureReason, timestamps

### `refundRecord` (payment-record.ts)

- id (uuid PK), paymentId FK→paymentRecord, walletId FK→wallet, providerReference, providerEventId unique, amountIdr, marks, reason, actorId FK→user nullable, createdAt. Schema-only until Phase 5.

## API Routers (oRPC)

### Procedures

- `publicProcedure` — no auth
- `protectedProcedure` — requires session.user
- `adminProcedure` — requires session.user.role === "admin"

### `authRouter` (protected)

- `me` → POST /auth/me — `{ user, profile, tutorProfile, wallet }`
- `getProfile` → POST /auth/profile — studentProfile or NOT_FOUND
- `updateProfile` → POST /auth/profile — upsert studentProfile (phone, school, grade, parent fields)

### `adminRouter` (admin)

- `listUsers` → GET /admin/users — paginated user list
- `setRole` → POST /admin/users/role — set user role (student/tutor/admin)

### `adminTutorRouter` (admin)

- `createInvite` → POST /admin/tutor-invites — invite a tutor by email
- `listInvites` → GET /admin/tutor-invites — paginated, filterable by status
- `resendInvite` → POST /admin/tutor-invites/resend — regenerate token + reset expiry
- `revokeInvite` → POST /admin/tutor-invites/revoke — revoke pending invite
- `listTutorProfiles` → GET /admin/tutor-profiles — paginated, filterable by status
- `reviewTutorProfile` → POST /admin/tutor-profiles/review — approve/reject/publish/suspend

### `achievementRouter`

- `list` (protected) → GET /achievements — user's own achievements
- `create` (protected) → POST /achievements — insert achievement
- `update` (protected) → PATCH /achievements/{id} — update only if status === "pending"
- `delete` (protected) → DELETE /achievements/{id} — delete only if status === "pending"
- `adminList` (admin) → GET /admin/achievements — all achievements, optional status filter
- `adminReview` (admin) → POST /admin/achievements/review — approve/reject with adminNote

### `tutorRouter` (protected)

- `getMyProfile` → GET /tutor/profile — own tutor profile
- `updateMyProfile` → PATCH /tutor/profile — update profile (not if published)
- `submitForReview` → POST /tutor/profile/submit — submit draft for admin review

### `inviteRouter`

- `verify` (public) → POST /invites/verify — validate invite token
- `claim` (protected) → POST /invites/claim — claim invite, create tutor profile

### `walletRouter` (protected)

- `get` → POST /wallet/get — `{ totalBalance, heldBalance, availableBalance }`
- `listLedger` → POST /wallet/ledger — paginated ledger entries
- `listPackages` → POST /wallet/packages — active mark packages
- `knowledgeBankEligible` → POST /wallet/knowledge-bank — `{ eligible, balance, threshold }`
- `competitionCalendarLink` → POST /wallet/competition-calendar — `{ url }`

### `paymentRouter` (protected)

- `createPurchase` → POST /payment/purchase — `{ packageCode }` → `{ paymentId, providerReference, checkoutUrl }`
- `getPurchase` → POST /payment/get — `{ paymentId }` → payment record

### Webhooks

- `POST /webhooks/payments/:provider` — signature-verified payment webhook (idempotent via `providerEventId`)
- `GET /webhooks/payments/stub/checkout?ref=...` — dev shortcut that auto-confirms a stub payment

### `todoRouter` (public, no auth) — removed

- todo table and router removed before MVP.

## OpenAPI Reference

Interactive API docs available at `http://localhost:3001/api-reference` (Scalar UI).
OpenAPI spec generated by `@orpc/openapi` with `ZodToJsonSchemaConverter`.
Each route has `.route()` metadata: method, path, summary, description, tags.
Tags: `System`, `Auth`, `Admin`, `Achievements`, `Tutor`, `Tutor Invites`, `Tutor Profiles`, `Wallet`, `Payments`, `Webhooks`.

## Auth Config

- Email/password enabled. No OAuth yet.
- On signup: auto-creates wallet (0 balance).
- Cookies: sameSite=none, secure=true, httpOnly=true.
- `CogitoUser` type exported with role field.

## Frontend Routes

| Route                | Component                                     | Auth |
| -------------------- | --------------------------------------------- | ---- |
| `/`                  | Redirect (authed → /dashboard, else → /login) | —    |
| `/login`             | SignIn/SignUp form toggle                     | No   |
| `/_app`              | Layout + AppSidebar                           | Yes  |
| `/_app/dashboard`    | DashboardPage (mock data)                     | Yes  |
| `/_app/balance`      | BalancePage (mock wallet)                     | Yes  |
| `/_app/achievements` | AchivementsPage (live API)                    | Yes  |
| `/_app/tutors`       | TutorsPage (placeholder)                      | Yes  |
| `/_app/profile`      | ProfilePage (live API)                        | Yes  |
| `/_app/todos`        | TodoPage (no sidebar link)                    | Yes  |

## Frontend Key Files

- `apps/web/src/hooks/use-role.ts` — queries `auth.me`, returns { role, user, profile, isLoading }
- `apps/web/src/lib/auth-client.ts` — Better Auth React client
- `apps/web/src/utils/orpc.ts` — oRPC client + TanStack Query setup
- `apps/web/src/components/dashboard/app-sidebar.tsx` — Sidebar with nav items
- `apps/web/src/components/dashboard/pages/balance-page.tsx` — Mock balance + package cards + Knowledge Bank section
- `apps/web/src/components/dashboard/pages/achivements-page.tsx` — Full achievement CRUD UI

## Build Status

| Phase       | Scope                                                                                                    | Status                 |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| Phase 0     | Schema integrity, single db pool, migrations                                                             | Complete               |
| Phase 0.5   | Module refactor (services + ports + DI)                                                                  | Complete               |
| Phase 0.6   | CI/Lefthook/coverage                                                                                     | Complete               |
| **Phase 1** | **Wallet & Payment (mark packages, payment records, wallet router, payment router, idempotent webhook)** | **Complete (backend)** |
| Phase 2     | Tutor availability + discovery refactor                                                                  | Next                   |
| Phase 3     | Booking core (solo)                                                                                      | Pending                |
| Phase 4     | Booking group + series                                                                                   | Pending                |
| Phase 5     | Admin override + support                                                                                 | Pending                |
| Phase 6     | Polish + Docker/CD                                                                                       | Pending                |

### Still Missing

- Frontend real wallet data + purchase flow
- Tutor availability + discovery SQL filters
- Booking state machine + all booking tables
- Notification table + email queue
- Admin override/refund flows
- Production Dockerfiles + CD pipeline

## PRD Reference

Full PRD: `docs/prd.tex`
Key decisions: see Decision Log (DL-01 through DL-26)
Open questions: All resolved (OQ-01 through OQ-08)

## Common Commands

```bash
bun install                # Install deps
bun run dev                # Dev all (web + server + db watch)
bun run dev:web            # Dev web only
bun run dev:server         # Dev server only
bun run db:start           # Start PostgreSQL Docker
bun run db:migrate         # Apply migrations
bun run db:studio          # Drizzle Studio
bun run db:generate        # Generate migrations
bun run seed-packages      # Seed mark packages
bun run lint               # Oxlint
bun run format             # Oxfmt
bun run check              # Lint + format
```
