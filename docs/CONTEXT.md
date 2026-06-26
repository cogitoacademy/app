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

## DB Schema (25 tables)

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

### `availabilitySlot` (availability-slot.ts)

- id (uuid PK), tutorId FK→user, startDate timestamptz, endDate timestamptz, modality (`online` | `offline` | `both`), isRecurring bool default false, recurrenceRule text nullable, isActive bool default true, createdAt, updatedAt.
- Index: `(tutorId, startDate)` for discovery queries.
- Overlap guard rejects intersecting active windows for same tutor.
- `recurrenceRule` stored but not expanded (Phase 2 backend only).

### `booking` (booking.ts)

- id (uuid PK), type (`solo` | `group` | `series`), modality (`online` | `offline`), tutorId FK→user, proposerId FK→user, targetGroupSize (1-6), minConfirmedHeadcount, confirmedHeadcount, currentState (15 states), previousState, stateReason, deadlineAt, scheduledStartAt, scheduledEndAt, timezone, roomId, priceSnapshot jsonb, originalMarks, repricedMarks, holdAmount, refundedAmount, cancellationReason, rescheduleMeta, overrideMeta, notificationFlags, seriesParentId, timestamps.
- Indexes: tutorId+state, proposerId+state, state+deadline, seriesParentId, scheduledStartAt.

### `bookingParticipant` (booking.ts)

- id (uuid PK), bookingId FK→booking cascade, userId FK→user cascade, role (`proposer` | `invitee`), confirmationState, heldAmount, heldLedgerId, confirmedAt, declinedAt, reconfirmedAt, withdrawnAt, withdrawnReason, attendanceState, timestamps.
- Unique per booking+user. Index: userId+confirmationState.

### `bookingStateHistory` (booking.ts)

- id (uuid PK), bookingId FK→booking cascade, fromState, toState, reason, actorId FK→user set null, actorType, metadata jsonb, createdAt. Immutable.

### `bookingRescheduleProposal` (booking.ts)

- id (uuid PK), bookingId FK→booking cascade, proposedBy FK→user, proposedStartAt, proposedEndAt, status (`pending` | `accepted` | `rejected` | `expired`), createdAt, decidedAt.

### `room` (booking.ts)

- id (uuid PK), name, location, capacity, isActive, timestamps. Index isActive.

### `roomBooking` (booking.ts)

- id (uuid PK), roomId FK→room cascade, bookingId FK→booking cascade, startAt, endAt, status (`requested` | `confirmed` | `relocated` | `cancelled`), timestamps. Indexes: roomId, bookingId, startAt.

### `meetingEvent` (booking.ts)

- id (uuid PK), bookingId FK→booking cascade, provider (`google_meet` | `manual` | `pending`), externalEventId, meetingUrl, attendeeEmails jsonb, status (`pending` | `created` | `failed` | `manual` | `cancelled`), errorReason, createdBy FK→user set null, timestamps.

### `notification` (notification.ts)

- id (uuid PK), userId FK→user cascade, bookingId FK→booking cascade nullable, category (`booking` | `payment` | `refund` | `schedule` | `achievement` | `system` | `override`), title, body, severity (`info` | `action` | `critical`), isRead, readAt, eventKey (dedupe), metadata jsonb, createdAt. Index: userId+isRead+createdAt, eventKey.

### `notificationDispatch` (notification.ts)

- id (uuid PK), notificationId FK→notification cascade, channel (`email`), recipientEmail, providerMessageId, status (`queued` | `sent` | `failed` | `suppressed`), attempts, lastError, createdAt, sentAt.

### `bookingSession` (booking.ts)

- id (uuid PK), seriesBookingId FK→booking cascade, scheduledStartAt, scheduledEndAt, currentState (`scheduled` | `completed` | `cancelled` | `no_show` | `late_cancelled`), holdAmount, priceSnapshot jsonb, timestamps.
- Index: seriesBookingId, scheduledStartAt.

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
- `listAvailability` → POST /tutor/availability — list own active slots
- `upsertAvailability` → POST /tutor/availability/upsert — create or update a slot (overlap guard)
- `deleteAvailability` → POST /tutor/availability/delete — soft-delete a slot

### `tutorsRouter` (protected)

- `listPublished` → POST /tutors/list — paginated published tutors with filters (search, expertise, modality) and `upcomingSlots`
- `getProfile` → POST /tutors/profile — full published tutor profile + future active slots

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

### `bookingRouter` (protected)

- `createSolo` → POST /booking/solo/create — hold Marks, create booking + participant + history + notification
- `createGroup` → POST /booking/group/create — hold proposer Marks, create invitee participants, send invitations
- `createSeries` → POST /booking/series/create — hold all session Marks upfront, create bookingSession children
- `confirmInvite` → POST /booking/invite/confirm — invitee confirms, holds Marks, auto-transitions when full
- `declineInvite` → POST /booking/invite/decline — invitee declines
- `reconfirm` → POST /booking/reconfirm — accept/reject new price after repricing
- `withdraw` → POST /booking/withdraw — participant withdraws (pre-H2 release, post-H2 late-cancel)
- `get` → POST /booking/get — full booking with participants, history, meeting, roomBookings
- `listMine` → POST /booking/list-mine — paginated bookings where user is proposer
- `listSessions` → POST /booking/sessions/list — child sessions for series booking
- `cancel` → POST /booking/cancel — release held Marks, transition to cancelled/late_cancelled
- `proposeReschedule` → POST /booking/reschedule/propose — student proposes new slot

### `tutorActionsRouter` (protected, tutor)

- `acceptBooking` → POST /tutor/booking/accept — tutor accepts; online → scheduled + meeting created
- `declineBooking` → POST /tutor/booking/decline — tutor declines, release held Marks
- `completeSession` → POST /tutor/booking/complete — deduct held Marks, transition to completed

### `roomRouter` (protected / admin)

- `list` → POST /rooms/list — active rooms (any authed user)
- `create` → POST /admin/rooms/create — admin creates room
- `assign` → POST /admin/rooms/assign — admin assigns room to offline booking

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

| Phase       | Scope                                                                                                                               | Status                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Phase 0     | Schema integrity, single db pool, migrations                                                                                        | Complete               |
| Phase 0.5   | Module refactor (services + ports + DI)                                                                                             | Complete               |
| Phase 0.6   | CI/Lefthook/coverage                                                                                                                | Complete               |
| **Phase 1** | **Wallet & Payment (mark packages, payment records, wallet router, payment router, idempotent webhook)**                            | **Complete (backend)** |
| **Phase 2** | **Tutor availability + discovery refactor**                                                                                         | **Complete (backend)** |
| **Phase 3** | **Booking core (solo): booking tables, state machine, createSolo, accept/decline, complete, notifications, meeting fallback, room** | **Complete (backend)** |
| **Phase 4** | **Booking group + series: createGroup, confirmInvite, reconfirm, withdraw, createSeries, bookingSession, expiry sweeper** | **Complete (backend)** |
| Phase 5     | Admin override + support                                                                                 | Pending                |
| Phase 6     | Polish + Docker/CD                                                                                                                  | Pending                |

### Still Missing

- Frontend real wallet data + purchase flow
- Admin override/refund flows
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
