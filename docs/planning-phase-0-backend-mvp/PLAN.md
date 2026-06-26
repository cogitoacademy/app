# Cogito Phase 0 — Backend MVP Plan

**Status:** Phase 0 + Phase 0.5 complete. Infrastructure set up. Ready for Phase 1.
**Date:** 2026-06-19 (created), 2026-06-26 (last updated)
**Source of truth:** `docs/prd.tex` (v1.4)
**Scope:** Production-grade backend that satisfies PRD FR-01..FR-24 as an MVP — minimal, scalable, iterable.

This document versions the complete design so implementation can proceed without re-deriving decisions. When a decision changes, update this file and bump the version note at the bottom.

---

## Table of Contents

1. [Current State Critique](#1-current-state-critique)
2. [Architecture Overview](#2-architecture-overview)
3. [User Flows](#3-user-flows)
4. [Database Design](#4-database-design)
5. [API Design](#5-api-design)
6. [Decoupling Strategy: Ports + Events](#6-decoupling-strategy-ports--events)
7. [Folder Structure](#7-folder-structure)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)
9. [Performance Notes](#9-performance-notes)
10. [Build Phases](#10-build-phases)
11. [Local Deployment & Docker](#11-local-deployment--docker)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [CONTEXT.md Fixes](#13-contextmd-fixes)
14. [Decision Log](#14-decision-log)

---

## 1. Current State Critique

Analysis of the existing codebase before adding the PRD backend.

### Structural problems

- **7 separate DB connection pools.** `auth-router.ts:10`, `tutor-router.ts:9`, `tutor-public-router.ts:7`, `admin-router.ts:10`, `admin-tutor-router.ts:9`, `invite-router.ts:8` each call `createDb()`. Only `achievement-router.ts` + `todo.ts` import the singleton. Wastes connections; transactions on pool A can't see uncommitted writes on pool B. Standardize on the singleton.
- **`createDb()` runs at import time** (`packages/db/src/index.ts:7`) — any import opens a pool. Fine for server, bad for tests.
- **`context.ts:13`** returns `auth: null` — dead placeholder.
- **Free-text status columns** (`role`, `status`, `modality`, `onboardingStatus`, `entryType`, `actorType`). No `CHECK` constraints. App-only validation → corrupt data possible via direct DB or buggy writes.
- **No real migrations.** `db:push` only; `packages/db/src/migrations/` doesn't exist. Not production-safe.
- **`evlog` Better-Auth middleware** (`apps/server/src/index.ts:58`) is an external dep doing critical work; document it.

### Schema integrity bugs

| #   | File:line                                             | Bug                                                                                                                         |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | `schema/audit-log.ts:10-12`                           | `actorId` `notNull` + `onDelete: "set null"` — user delete will throw. **Must fix.**                                        |
| 2   | `schema/wallet.ts:14-16`                              | No `CHECK(totalBalance = heldBalance + availableBalance)`. Invariant is app-only.                                           |
| 3   | `schema/wallet.ts:26-49`                              | No idempotency key on ledger — double-ledgering possible. PRD DL-04 + NFR require immutable, idempotent-by-event-id ledger. |
| 4   | `schema/wallet.ts:10`, `schema/student-profile.ts:10` | `id` has no `$defaultFn`; callers hand-roll `crypto.randomUUID()`. Inconsistent with `uuidPrimaryKey`.                      |
| 5   | `schema/tutor-profile.ts:30`                          | `inviteId notNull` but no DB guarantee `invite.status='accepted'`.                                                          |
| 6   | `schema/achievement.ts:30`                            | `status` free text; states `draft\|pending_review\|approved\|rejected\|archived` per PRD §Achievements not enforced.        |
| 7   | `schema/todo.ts`                                      | Dead code, no `userId`, public CRUD, not in PRD. Remove for MVP.                                                            |

### Performance bottlenecks

- **N+1** `auth-router.ts:25-32` — two parallel queries for student + tutor profile; one `with` query is enough.
- **In-memory filtering** `tutor-public-router.ts:55-72` — `search` + `expertise` filtered in JS after fetching up to 50 rows. Won't scale; `expertise` should use jsonb `@>`, `search` should use `ILIKE`/trigram.
- **No pagination** `achievement-router.ts:138-147` `adminList` returns everything.
- **Open-ended selects** — no `select({ columns })` projections; rows are wide.

### Code improvisation / inconsistencies

- `throw new Error()` in `achievement-router.ts:90,119` instead of `ORPCError` — breaks client error shape.
- `submitForReview` (`tutor-router.ts`) does status update + audit insert **without a transaction**. Only `invite-router.ts:86` uses `db.transaction()`.
- `modality === "both"` uses online floors only (`tutor-router.ts:30-32`) — should check the stricter floor per size.
- Floor prices hardcoded in router — move to config/env (economics constants, DL-22).
- `setRole` doesn't audit, doesn't guard against demoting the last admin.
- `CONTEXT.md` claims GET/PATCH/DELETE methods but **every route is POST** (oRPC convention). Doc is wrong.
- No tests for: expired invite, concurrent claim race, wallet ledger integrity, booking state machine, notification dispatch, idempotency.

### What's already good

- Layering `db → auth → api → server` is clean.
- oRPC + Better Auth + Drizzle stack is sound and matches PRD's "tech owned separately" governance.
- `invite-router.claim` is the gold-standard pattern (transaction + audit + state guard via `where` clause). Replicate it everywhere.
- OpenAPI/Scalar already wired.
- Test exists for invite→onboarding→publish lifecycle (360 lines) — a real template to follow.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web   React 19 + TanStack Router/Query  (unchanged)    │
└─────────────────────────────────────────────────────────────┘
                       │ oRPC over /rpc (cookies)
┌─────────────────────────────────────────────────────────────┐
│  apps/server  Elysia :3001                                   │
│   • CORS, evlog, identifyUser                                │
│   • /api/auth/*  → Better Auth handler                       │
│   • /rpc/*       → oRPC RPCHandler                           │
│   • /openapi.json + /api-reference (Scalar)                  │
│   • POST /webhooks/payments/*  → PaymentRecord idempotency   │
│   • onShutdown drains email queue                            │
└─────────────────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────────────────┐
│  packages/api   oRPC routers + shared services (modules)     │
│   modules/  (thin router + service + types per domain)       │
│   shared/ports/  (interfaces — dependency inversion)         │
│   shared/events/ (nanoevents bus — post-commit async)        │
│   lib/      (db singleton, transactions, errors, money)      │
└─────────────────────────────────────────────────────────────┘
                       │
┌────────────────┬──────────────┬───────────────┐
│ packages/db    │ packages/auth│ packages/env  │
│ Drizzle schema │ Better Auth  │ Zod env       │
│ + migrations   │ + signup hook│               │
└────────────────┴──────────────┴───────────────┘
                       │
                PostgreSQL 16 (Docker :6767 dev)
```

### Stack (unchanged)

- **Server:** Elysia
- **DB:** PostgreSQL 16 + Drizzle ORM
- **API:** oRPC (all-POST convention preserved)
- **Auth:** Better Auth 1.6.11 (runs in-app, writes to your Postgres — not a PaaS). Google primary + email/password fallback. No new auth tables needed — the existing `account` table already supports multiple providers per user (`providerId` + `accountId`).
- **Frontend:** React 19 + TanStack Router/Query (unchanged)
- **Event bus:** nanoevents (post-commit async side effects)
- **Email:** in-process Bun queue, retry 3x, dedupe by `eventKey`
- **Payment:** `PaymentPort` + `StubPaymentProvider` (real provider swap later)
- **Meeting:** `MeetingPort` + `FallbackProvider` (manual link; Google API post-MVP)
- **Migrations:** `drizzle-kit generate` + `migrate`; SQL committed to git

### Auth architecture (Google primary + email/password fallback)

**Better Auth is a library, not a SaaS.** It runs inside the Elysia server and writes users, sessions, and accounts to _your_ Postgres via Drizzle. No external auth service is called at runtime except during the OAuth redirect handshake itself. After login, the session is entirely yours — stored in the `session` table, validated by `auth.api.getSession(headers)` on each request.

**How Google login works with the existing schema:**

- The `account` table (`packages/db/src/schema/auth.ts:41`) already supports multiple auth methods per user. A user who signs up with Google gets an `account` row with `providerId="google"`, `accountId=<google sub>`, and OAuth tokens. A user who signs up with email/password gets an `account` row with `providerId="credential"` and a hashed `password`. **Same `user` row, linked via `userId`.** Zero DB schema changes needed.
- Downstream, a session is a session — `createContext()`, `protectedProcedure`, `adminProcedure`, and the `auth.me` router don't care how the user authenticated. Google login works transparently with the rest of the app.
- The wallet auto-create hook (`packages/auth/src/index.ts:61`) fires on signup. During Phase 0, make the hook trigger on `newSession?.user?.id` existence instead of `ctx.path.startsWith("/sign-up")` so it works for every signup method (social + credential).

**Code change (`packages/auth/src/index.ts`):**

```ts
socialProviders: {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  },
},
// keep emailAndPassword: { enabled: true }
```

**Env additions (`packages/env/server.ts`):** `GOOGLE_CLIENT_ID` (string, min 1), `GOOGLE_CLIENT_SECRET` (string, min 1).

**Frontend (`apps/web` login page):** Add "Continue with Google" button above the email/password form. Better Auth React client: `authClient.signIn.social({ provider: "google" })`.

**Google Cloud setup (one-time manual, before first staging login works):**

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application).
2. Authorized JavaScript origins: `http://localhost:3000` (dev), staging URL, prod URL.
3. Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google`, `https://staging.yourdomain.com/api/auth/callback/google`, `https://app.yourdomain.com/api/auth/callback/google`. (Better Auth callback path is `/api/auth/callback/{provider}`.)
4. Copy Client ID + Secret → add to `apps/server/.env` (local) and Coolify env vars (staging + prod).

**Tutor invite flow:** Works identically with either auth method. The `claim` router matches on `session.user.email` — provider-agnostic. An invited tutor can accept via Google login or email/password.

**Not a runtime dependency in deploy:** Google OAuth is only contacted during the login redirect handshake. The server doesn't reach out to Google for any background process. No Docker/CD changes; just env vars.

---

## 3. User Flows

### 3.1 Student journey (happy path)

```mermaid
flowchart TD
    A[Visitor] -->|Signup| B[Student account]
    B -->|Wallet auto-created 0 Marks| C{Has Marks?}
    C -->|No| D[Purchase package]
    D -->|Payment webhook OK| E[Ledger credit]
    C -->|Yes| F[Browse tutors]
    E --> F
    F -->|Select tutor+slot| G{Solo or Group?}
    G -->|Solo| H[Create solo booking]
    G -->|Group/Series| I[Invite registered users]
    H --> J[Hold Marks + notify tutor]
    I -->|12h confirm window| J
    J --> K{Tutor decision}
    K -->|Accept| L{Online?}
    K -->|Decline| Z1[Release hold + notify]
    L -->|Online| M[Meeting link pending → created]
    L -->|Offline| N[Admin room approval]
    N -->|Room OK| M
    N -->|No room| Z2[Cancel + release]
    M --> O[Scheduled]
    O -->|Session start| P{Completed?}
    P -->|Tutor completes| Q[Deduct held → split Marks]
    P -->|Tutor no-show 15m| R[Report → admin override → release]
    Q --> S[Done: audit + notify]
    R --> S
```

### 3.2 Solo booking sequence (with transactions marked)

```mermaid
sequenceDiagram
    participant S as Student
    participant API as bookingRouter
    participant WS as WalletPort
    participant BS as BookingService
    participant NS as InAppNotificationPort
    participant DB as Postgres (tx)
    participant Bus as EventBus (nanoevents)
    participant ES as EmailSubscriber
    participant T as Tutor

    S->>API: createSolo(tutorId, slot, modality)
    API->>DB: BEGIN tx
    API->>WS: hold(walletId, amount, eventKey='booking.{id}.hold')
    WS->>DB: SELECT wallet FOR UPDATE
    WS->>DB: UPDATE wallet SET held+=, available-=
    WS->>DB: INSERT ledgerEntry (hold)  -- UK(walletId,eventKey) idempotent
    API->>BS: create(booking draft→awaiting_tutor_review)
    BS->>DB: INSERT booking + participant + stateHistory
    API->>NS: write(tutor, 'booking_request')  -- in-tx
    NS->>DB: INSERT notification (in-tx, atomic)
    API->>DB: COMMIT
    API-->>S: { bookingId, status }
    Note over API,Bus: AFTER commit — fire-and-forget
    API->>Bus: emit("booking.created", { bookingId, tutorId })
    Bus->>ES: on("booking.created")
    ES->>ES: enqueue email (retry 3x, dedupe by eventKey)
    ES->>T: email (async)
    T->>API: acceptBooking(bookingId)
    API->>DB: BEGIN tx
    BS->>DB: UPDATE booking → confirmed/scheduled
    BS->>DB: INSERT stateHistory + audit
    API->>DB: COMMIT
    Note over API: If online + all confirmed → MeetingService.createEvent (post-commit, fallback OK)
```

### 3.3 Group booking with repricing (FR-08, FR-16)

```mermaid
sequenceDiagram
    participant P as Proposer
    participant I1 as Invitee 1
    participant I2 as Invitee 2
    participant I3 as Invitee 3
    participant API as bookingRouter
    participant BS as BookingService
    participant Cron as Expiry Sweeper

    P->>API: createGroup(target=5, invitees=[I1,I2,I3,...])
    API->>API: hold proposer Marks (size-5 price)
    API->>API: create participants (pending)
    API->>I1,I2,I3: invite (in-app + email)
    I1->>API: confirmInvite (hold own Marks)
    I2->>API: confirmInvite
    Note over I3: deadline = now+12h
    Cron->>API: deadline reached, headcount=3
    API->>BS: recompute price for size 3
    BS-->>API: newPerStudent (higher)
    API->>API: booking → awaiting_reconfirmation
    API->>I1,I2: reconfirm(newPrice) (email critical)
    I1->>API: reconfirm accept
    I2->>API: reconfirm accept
    API->>BS: all reconfirmed → awaiting_tutor_review
    Note over API: tutor accept → confirmed → (offline? admin room) → scheduled
    alt any rejects/no-response in 12h
        Cron->>API: reconfirm deadline expired
        API->>API: booking → expired, release all holds (within 12h)
    end
```

### 3.4 Tutor invite → onboarding → publish (FR-23, FR-24)

```mermaid
stateDiagram-v2
    [*] --> invited: admin creates invite
    invited --> accepted: user claims (email match)
    invited --> expired: deadline passes
    invited --> revoked: admin revokes
    accepted --> draft: tutorProfile created
    draft --> pending_review: submit (required fields OK)
    pending_review --> changes_requested: admin requests changes
    changes_requested --> pending_review: tutor resubmits
    pending_review --> approved_unpublished: admin approves (not yet visible)
    approved_unpublished --> published: admin publishes
    published --> approved_unpublished: admin unpublishes
    published --> suspended: admin suspends (audit reason)
    suspended --> approved_unpublished: admin restores
    approved_unpublished --> [*]
    published --> [*]: visible in discovery, receives bookings
```

---

## 4. Database Design

### 4.1 ER Diagram (core entities)

```mermaid
erDiagram
    user ||--|| wallet : "1:1 auto-create"
    user ||--o| studentProfile : "1:1"
    user ||--o| tutorProfile : "1:1"
    user ||--o{ availabilitySlot : "tutor owns"
    user ||--o{ booking : "proposer"
    user ||--o{ bookingParticipant : "participant"
    user ||--o{ paymentRecord : "payer"
    user ||--o{ notification : "recipient"
    user ||--o{ achievement : "submitter"
    user ||--o{ supportTicket : "reporter"
    user ||--o{ auditLog : "actor"

    wallet ||--o{ ledgerEntry : "immutable log"
    wallet ||--o{ paymentRecord : "funds"
    wallet ||--o{ refundRecord : "cash corrections"

    tutorProfile ||--o{ booking : "tutor of"
    tutorProfile }o--|| tutorInvite : "created from"

    booking ||--o{ bookingParticipant : "has"
    booking ||--o{ bookingStateHistory : "immutable"
    booking ||--o{ bookingSession : "series children"
    booking ||--o| meetingEvent : "0..1"
    booking ||--o| roomBooking : "offline only"
    booking ||--o{ bookingRescheduleProposal : "FR-15"
    booking }o--o| room : "offline target"

    paymentRecord ||--o{ refundRecord : "cash corrections"
    ledgerEntry }o--o| booking : "references"

    notification ||--o{ notificationDispatch : "email attempts"
    supportTicket }o--|| booking : "about"
    supportTicket }o--o| auditLog : "resolved by override"

    markPackage ||--o{ paymentRecord : "purchased"
```

### 4.2 Booking state machine (canonical — PRD §Booking State Model)

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> awaiting_marks_hold: submit
    awaiting_marks_hold --> awaiting_tutor_review: hold OK
    awaiting_tutor_review --> declined: tutor declines → release
    awaiting_tutor_review --> confirmed: tutor accepts (online, solo)
    awaiting_tutor_review --> reschedule_proposed: tutor wants new slot
    reschedule_proposed --> awaiting_reconfirmation: student accepts slot
    reschedule_proposed --> declined: student rejects
    confirmed --> awaiting_admin_room_approval: offline only
    confirmed --> scheduled: online, all confirmed
    awaiting_admin_room_approval --> scheduled: admin assigns room
    awaiting_admin_room_approval --> reschedule_proposed: admin proposes new slot
    awaiting_admin_room_approval --> cancelled: no room
    awaiting_participant_confirmation --> awaiting_reconfirmation: headcount<target,≥2
    awaiting_participant_confirmation --> expired: headcount<2
    awaiting_reconfirmation --> confirmed: all reconfirm
    awaiting_reconfirmation --> expired: deadline missed → release
    confirmed --> cancelled: before H-2 → release
    confirmed --> late_cancelled: after H-2 → deduct
    confirmed --> no_show: start passed, no attendance
    scheduled --> cancelled: before H-2
    scheduled --> late_cancelled: after H-2
    scheduled --> no_show
    scheduled --> completed: tutor completes → deduct+split
    awaiting_marks_hold --> expired
    awaiting_tutor_review --> expired
    awaiting_participant_confirmation --> awaiting_tutor_review: full headcount
    declined --> [*]: terminal
    cancelled --> [*]
    late_cancelled --> [*]
    no_show --> [*]
    expired --> [*]
    completed --> [*]
    completed --> [*]: admin override may move terminal states (audit required)
```

### 4.3 Schema (18 tables, grouped by module)

| Module      | Tables                                                                                                                         | Notes                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **auth**    | `user, session, account, verification`                                                                                         | Better Auth owns                         |
| **wallet**  | `wallet, ledgerEntry, markPackage, paymentRecord, refundRecord`                                                                | money core, immutable ledger             |
| **profile** | `studentProfile, tutorProfile, tutorInvite, achievement`                                                                       | per-user data                            |
| **tutor**   | `availabilitySlot`                                                                                                             | tutor supply                             |
| **booking** | `booking, bookingParticipant, bookingStateHistory, bookingSession, bookingRescheduleProposal, room, roomBooking, meetingEvent` | state machine + offline + online meeting |
| **ops**     | `notification, notificationDispatch, supportTicket, auditLog`                                                                  | cross-cutting                            |

### 4.4 Existing tables — fixes

- **`auditLog`**: `actorId` nullable + `onDelete: "set null"` (fix bug). Add `CHECK (actor_type IN (...))`, `CHECK (action IN (...))` (or keep `action` free + index). Add `beforeState jsonb`, `afterState jsonb`.
- **`wallet`**: add `CHECK (total_balance = held_balance + available_balance)`. Use `uuidPrimaryKey`.
- **`ledgerEntry`**: use `uuidPrimaryKey`. Add `UNIQUE (wallet_id, event_key, source_reference)` for idempotency. Add `CHECK (entry_type IN ('credit','hold','release','deduct','compensate_credit','compensate_deduct'))`. Add `CHECK (amount > 0)`. Add `balance_after_wallet_total`, `balance_after_wallet_held` (snapshot, per DL-04 immutable).
- **`studentProfile`**: `uuidPrimaryKey`. Add `CHECK (grade_level IN (...))` or leave free (PRD doesn't constrain).
- **`tutorProfile`**: `CHECK (modality IN ('online','offline','both'))`, `CHECK (onboarding_status IN ('draft','pending_review','changes_requested','approved_unpublished','published','suspended'))`. Move `prices` to a typed shape `Record<1|2|3|4|5|6, number>` (still jsonb).
- **`tutorInvite`**: `CHECK (status IN ('invited','accepted','expired','revoked'))`. Add `revokedBy`, `revokedAt` for audit symmetry.
- **`achievement`**: `CHECK (status IN ('draft','pending_review','approved','rejected','archived'))`. Align fields with PRD §Achievements (title, category enum, summary, issuer, dateEarned, proofUrl, publicNote, visibility).
- **`todo`**: **drop.**

### 4.5 New tables

**`markPackage`** (seed data, admin-editable later)

- `id uuid PK`, `code text unique` (starter/learner/explorer/pioneer), `marks integer notNull`, `priceIdr integer notNull`, `isActive bool default true`, `createdAt`, `updatedAt`.

**`paymentRecord`**

- `id uuid PK`, `userId fk→user`, `walletId fk→wallet`, `packageId fk→markPackage nullable`, `provider text` (e.g. 'stub','midtrans'), `providerReference text` (order/invoice id), `providerEventId text` (webhook event id, **unique** for idempotency), `amountIdr integer`, `marks integer`, `status text CHECK in ('pending','succeeded','failed','refunded')`, `receiptUrl text`, `failureReason text`, `createdAt`, `updatedAt`.
- Indexes: `userId`, `providerReference`, `status`.

**`refundRecord`**

- `id uuid PK`, `paymentId fk→paymentRecord`, `walletId`, `providerReference`, `providerEventId unique`, `amountIdr integer`, `marks integer`, `reason text`, `actorId fk→user nullable`, `createdAt`. No update.

**`availabilitySlot`**

- `id uuid PK`, `tutorId fk→user` (tutor), `startDate timestamptz` + `endDate timestamptz` (explicit windows), `modality text CHECK in ('online','offline','both')`, `isRecurring bool`, `recurrenceRule text nullable`, `isActive bool default true`, `createdAt`,`updatedAt`.
- Index `(tutorId, startTimestamptz)`.
- Unique `(tutorId, startTimestamptz, endTimestamptz)` to prevent dupes.

**`booking`**

- `id uuid PK`, `type text CHECK in ('solo','group','series')`, `modality text CHECK in ('online','offline')`, `tutorId fk→user`, `proposerId fk→user`, `targetGroupSize integer CHECK 1-6`, `minConfirmedHeadcount integer default 2` (1 for solo), `confirmedHeadcount integer default 0`, `currentState text CHECK in (15 states from PRD §Booking State Model)`, `previousState text`, `stateReason text`, `deadlineAt timestamptz nullable`, `scheduledStartAt timestamptz`, `scheduledEndAt timestamptz`, `timezone text` (IANA), `roomId fk→room nullable`, `priceSnapshot jsonb` (`{ perStudent, baseline, tutorShare, cogitoTake }`), `originalMarks integer`, `repricedMarks integer nullable`, `holdAmount integer`, `refundedAmount integer default 0`, `cancellationReason text`, `rescheduleMeta jsonb`, `overrideMeta jsonb`, `notificationFlags jsonb`, `seriesParentId fk→booking nullable` (for series sessions), `createdAt`, `updatedAt`.
- Indexes: `tutorId+currentState`, `proposerId+currentState`, `currentState+deadlineAt` (for expiry sweeps), `seriesParentId`, `scheduledStartAt`.

**`bookingSession`** (series child rows)

- `id uuid PK`, `seriesBookingId fk→booking`, `scheduledStartAt`, `scheduledEndAt`, `currentState`, `holdAmount`, `priceSnapshot`. Index `seriesBookingId`.

**`bookingParticipant`**

- `id uuid PK`, `bookingId fk→booking cascade`, `userId fk→user`, `role text CHECK in ('proposer','invitee')`, `confirmationState text CHECK in ('pending','confirmed','declined','reconfirmed','withdrawn_pre_h2','withdrawn_post_h2','no_show')`, `heldAmount integer default 0`, `heldLedgerId fk→ledgerEntry nullable`, `confirmedAt timestamptz nullable`, `declinedAt`, `reconfirmedAt`, `withdrawnAt`, `withdrawnReason text`, `attendanceState text CHECK in ('present','late','absent','unknown')`, `createdAt`, `updatedAt`.
- Unique `(bookingId, userId)`.
- Index `(userId, confirmationState)` (for "my bookings").

**`bookingStateHistory`** (immutable)

- `id uuid PK`, `bookingId fk→booking`, `fromState text`, `toState text`, `reason text`, `actorId fk→user nullable`, `actorType text`, `metadata jsonb`, `createdAt`. No update.

**`bookingRescheduleProposal`**

- `id uuid PK`, `bookingId fk→booking`, `proposedBy fk→user`, `proposedStartAt`, `proposedEndAt`, `status text CHECK in ('pending','accepted','rejected','expired')`, `createdAt`, `decidedAt`. (Supports FR-15.)

**`room`**

- `id uuid PK`, `name text`, `location text`, `capacity integer`, `isActive bool default true`, `createdAt`, `updatedAt`. Index `isActive`.

**`roomBooking`** (room occupancy — for availability checks)

- `id uuid PK`, `roomId fk→room`, `bookingId fk→booking`, `startAt timestamptz`, `endAt timestamptz`, `status text CHECK in ('requested','confirmed','relocated','cancelled')`, `createdAt`, `updatedAt`. Unique partial index `roomId, startAt, endAt WHERE status='confirmed'` to prevent double-booking.

**`meetingEvent`**

- `id uuid PK`, `bookingId fk→booking`, `provider text CHECK in ('google_meet','manual','pending')`, `externalEventId text nullable`, `meetingUrl text nullable`, `attendeeEmails jsonb string[]`, `status text CHECK in ('pending','created','failed','manual','cancelled')`, `errorReason text`, `createdBy fk→user nullable`, `createdAt`, `updatedAt`. Index `bookingId`.

**`notification`** (durable in-app, source of record per DL-05)

- `id uuid PK`, `userId fk→user cascade`, `bookingId fk→booking nullable`, `category text CHECK in ('booking','payment','refund','schedule','achievement','system','override')`, `title text`, `body text`, `severity text CHECK in ('info','action','critical')`, `isRead bool default false`, `readAt timestamptz nullable`, `eventKey text` (dedupe key), `metadata jsonb`, `createdAt`. Index `(userId, isRead, createdAt)`, `eventKey`.

**`notificationDispatch`** (email attempts, immutable-ish)

- `id uuid PK`, `notificationId fk→notification cascade`, `channel text CHECK in ('email')`, `recipientEmail text`, `providerMessageId text nullable`, `status text CHECK in ('queued','sent','failed','suppressed')`, `attempts integer default 0`, `lastError text`, `createdAt`, `sentAt`. Index `notificationId`, `status`.

**`supportTicket`** (FR: report tutor lateness/no-show + SLA queue per OQ-04)

- `id uuid PK`, `reporterId fk→user`, `bookingId fk→booking`, `category text CHECK in ('tutor_no_show','tutor_late','student_emergency','payment_wallet','platform_error','offline_room','admin_correction')`, `reason text`, `status text CHECK in ('open','acknowledged','resolved','escalated')`, `slaDeadlineAt timestamptz`, `acknowledgedAt timestamptz nullable`, `resolvedAt timestamptz nullable`, `overrideId fk→auditLog nullable`, `createdAt`, `updatedAt`. Index `(status, slaDeadlineAt)` for the admin queue.

**`auditLog`** (extended)

- Add `beforeState jsonb`, `afterState jsonb`. Fix `actorId` nullable + `onDelete: "set null"`. Index `(targetType, targetId, createdAt)`.

> Total: ~18 tables (7 existing kept + 11 new). `todo` dropped.

### 4.6 Migrations

Switch from `db:push` to `drizzle-kit generate` + `drizzle-kit migrate`. Commit SQL files to `packages/db/src/migrations/`. Add `db:migrate` script to root. Seed `markPackage`, `room`, admin user via `apps/server/src/seed-packages.ts`.

---

## 5. API Design

Procedures stay oRPC (all POST). Each module router is thin: validate → authorize → call service in one tx → audit + notify in same tx → return. Every mutating handler runs inside `db.transaction()`.

### 5.1 `authRouter` (protected) — refine existing

- `me` → `{ user, studentProfile, tutorProfile, wallet: {total,held,available} }` in one query.
- `getProfile`, `updateProfile` (tx-wrapped upsert, validate parent email).

### 5.2 `walletRouter` (protected)

- `get` → wallet + recent ledger (paginated cursor).
- `listLedger` → `{ walletId?, bookingId?, eventKey?, cursor, limit }`.
- `listPackages` → public-mark package cards (Starter/Learner/Explorer/Pioneer).
- `knowledgeBankEligible` → `{ eligible: totalBalance >= 35, balance }`. (No deduction — DL-16.)
- `competitionCalendarLink` → returns public URL (DL-03, FR-11).

### 5.3 `paymentRouter` (protected + public webhook)

- `createPurchase` (protected) → `{ packageCode }` → `PaymentService.createIntent` → returns `{ paymentId, providerReference, providerCheckoutUrl? }`. Marks not credited.
- `getPurchase` (protected) → status of own payment.
- **`webhook`** (public, signature-verified in real impl; stub accepts signed body) → `PaymentService.confirmFromWebhook`. Idempotent via `providerEventId` UK. On success: tx → insert/credit ledger (`eventKey='purchase.{paymentId}'`) → notification (in-app + email per matrix). On failure: update paymentRecord, no ledger.

### 5.4 `tutorRouter` (protected, tutor role)

- `getMyProfile`, `updateMyProfile` (tx), `submitForReview` (tx + audit).
- `listAvailability`, `upsertAvailability`, `deleteAvailability`.
- `listIncomingBookings` → bookings where `tutorId=me` and `currentState in (awaiting_tutor_review, reschedule_proposed, awaiting_admin_room_approval)`, paginated.
- `acceptBooking`, `declineBooking` (tx: state transition + audit + notification).
- `proposeReschedule` (tx: → `reschedule_proposed` + `bookingRescheduleProposal` row + notification).
- `completeSession` (tx: `scheduled→completed`, convert held→deduct via `WalletService`, write `sessionNote`, compute split via `PricingService`, audit, notifications).
- `saveSessionNote` (sanitized rich text; stored as sanitized HTML or TipTap JSON).

### 5.5 `tutorDiscoveryRouter` (protected, any logged-in user)

- `listPublished` → SQL filtering: `ILIKE` on displayName/bio, jsonb `@>` on expertise, `modality` filter, paginated. Projection only needed columns.
- `getProfile` → `{ tutorId }` → full published profile + prices + availability summary + next available slots.

### 5.6 `bookingRouter` (protected, student)

- `createSolo` → validate available Marks ≥ price (size 1) → tx: insert booking (`draft→awaiting_marks_hold→awaiting_tutor_review`), `WalletService.hold`, `bookingParticipant`, `bookingStateHistory`, audit, notification to tutor. `deadlineAt = now+12h`.
- `createGroup` → `{ tutorId, targetGroupSize, slot, modality, roomPreferenceId?, inviteeUserIds[], }`. Hold proposer's Marks. Create `bookingParticipant` rows for invitees (`pending`). Send invitations (in-app + email per matrix).
- `createSeries` → up to 4 sessions validated. Parent `booking` (type=series) + child `bookingSession` rows. Hold all upfront.
- `confirmInvite` → invitee accepts; validate own available Marks; `WalletService.hold`; participant → `confirmed`.
- `declineInvite`.
- `reconfirm` → after repricing, participant reconfirms new price.
- `withdraw` → pre-H-2 (group one-off): release hold, repricing, → `awaiting_reconfirmation` for others. Post-H-2: late-cancel path.
- `cancel` (own) → allowed iff `scheduledStartAt - now > 2h` (H-2). Release held. State → `cancelled`.
- `reschedule` (own) → same H-2 guard.
- `get`, `listMine`, `listSessions` (series children).
- `reportTutorNoShow` → creates `supportTicket` (category `tutor_no_show`), `slaDeadlineAt = now+30m/4h`, audit; **does not** move Marks (PRD TC-37).

### 5.7 `adminRouter` (admin) — extend existing

- `listUsers`, `setRole` (tx + audit + last-admin guard).
- `listBookings`, `getBooking` (full state history + participants + ledger refs + meeting + room).
- `listOverridesQueue` → `supportTicket` joined with booking, sorted by urgency (`slaDeadlineAt asc, scheduledStartAt asc`).
- `applyOverride` → `OverrideService`: requires `{ bookingId, category, reason, participantIds[], marksAction, userNote, internalNote }`. Tx: booking state change + `WalletService` per `marksAction` (`none|release_held|compensate_credit|reverse_deduction|partial_return|manual_followup`) + audit (before/after) + notifications.
- `assignRoom` / `relocateRoom` / `cancelOffline` → `awaiting_admin_room_approval → scheduled|cancelled`. Updates `roomBooking`, audit, notifications.
- `setManualMeetingLink` → `meetingEvent` `status='manual'`, `meetingUrl` set. Notification.
- `reconcilePayment` → view payment + ledger + spent marks + balance; `refundPayment` (cash, only for actual payment errors per DL-12) → `refundRecord` + provider call (stub) + audit.
- `listAchievements`, `reviewAchievement` (audit added).

### 5.8 `adminTutorRouter` (admin) — extend existing

- `createInvite` (tx: insert invite + audit + send email). `resendInvite`, `revokeInvite` (tx). `listInvites`.
- `listTutorProfiles`, `reviewTutorProfile` (state machine validated via `canTransition`; `request_changes`/`suspend` require `adminNote`).

### 5.9 `inviteRouter` (public + protected) — keep, refine

- `verify`, `claim` (already good). Add expired/revoked explicit error codes.

### 5.10 `notificationRouter` (protected)

- `list` → paginated, unread first. `markRead`, `markAllRead`. `unreadCount`.

### 5.11 `achievementRouter` — keep, fix

Fix `throw new Error` → `ORPCError`, add audit on `adminReview`, align fields with PRD.

### 5.12 OpenAPI tags (extend)

`System, Auth, Wallet, Payments, Tutors, Tutor Discovery, Bookings, Admin, Admin Tutor, Invites, Notifications, Achievements, Support, Webhooks`.

### 5.13 Error model

Central `lib/errors.ts`:

- `NOT_FOUND`, `FORBIDDEN`, `UNAUTHORIZED`, `CONFLICT`, `PRECONDITION_FAILED` (state machine violation), `UNPROCESSABLE_CONTENT` (validation), `INTERNAL_SERVER_ERROR`.
- Every error carries `{ code, message, fieldErrors?, details? }`. Frontend `orpc.ts` already toasts on `queryCache.onError`.

---

## 6. Decoupling Strategy: Ports + Events

### 6.1 Why direct service import is coupled

```
booking/booking.service.ts
  import { WalletService } from "../wallet/wallet.service"   ← compile-time dep
```

Four concrete problems:

1. **Compile-time dependency.** Booking can't compile without wallet. Change wallet's API → booking breaks.
2. **Test friction.** To unit-test `BookingService.create`, must mock `WalletService`. Without an interface, TS structural typing is implicit/fragile.
3. **Circular import risk.** If wallet ever needs to know about bookings (it does — `ledgerEntry.bookingId` references booking), cycle.
4. **Hidden orchestration.** "Booking creates → holds marks → audits → notifies" is invisible from the module's public surface.

### 6.2 When event-driven is necessary for this PRD

| NFR                                                                                                             | Implication                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "Booking, wallet, and notification updates that belong together must be written **atomically** where possible." | In-app notification write + audit + ledger entry = **synchronous, same tx**. Events can't help here. |
| "In-app notifications are durable records; **email is asynchronous** and must not block booking writes."        | Email dispatch = **async, post-commit**. This is where events earn their keep.                       |

**Verdict:** Pure EDD is not necessary and would hurt the core booking/wallet/audit loop. A **hybrid** is correct: synchronous commands via ports (decoupled at compile time) + async events for post-commit side effects (email, meeting, provider callbacks).

### 6.3 Ports (dependency inversion)

```
shared/ports/
  wallet.port.ts     interface WalletPort { hold(tx,...): ...; release(...); deduct(...); credit(...); compensate(...) }
  audit.port.ts      interface AuditPort  { record(tx,...): ... }
  notification.port.ts interface InAppNotificationPort { write(tx, userId, event): ... }
  meeting.port.ts    interface MeetingPort { createEvent(bookingId): Promise<MeetingEvent> }
  pricing.port.ts    interface PricingPort { validatePrices(...); computeSplit(...) }
  payment.port.ts    interface PaymentPort { createIntent(...); confirmFromWebhook(...) }
  room.port.ts       interface RoomPort { checkAvailability(...); confirm(...); relocate(...); cancel(...) }
  support.port.ts    interface SupportPort { createTicket(...); listQueue(...); acknowledge(...); resolve(...) }
```

```
modules/booking/booking.service.ts
  import type { WalletPort, AuditPort, InAppNotificationPort, PricingPort } from "../../shared/ports"
  export class BookingService {
    constructor(
      private wallet: WalletPort,        // injected, not imported
      private audit: AuditPort,
      private notify: InAppNotificationPort,
      private pricing: PricingPort,
    ) {}
  }
```

```
index.ts (root composition)
  const wallet = new WalletService(db)
  const audit = new AuditService(db)
  const notify = new NotificationService(db, emailQueue)
  const pricing = new PricingService(floorPrices)
  const booking = new BookingService(wallet, audit, notify, pricing)
```

### 6.4 Events (post-commit async)

```
shared/events/
  bus.ts              nanoevents instance
  types.ts            BookingCreated, BookingConfirmed, BookingCancelled,
                     MeetingDue, PaymentSucceeded, RefundIssued, TutorInvited, ...
```

```
modules/booking/booking.service.ts
  async createSolo(...) {
    await db.transaction(async tx => {
      // synchronous: hold, insert booking, audit, in-app notify
      this.wallet.hold(tx, ...)
      this.audit.record(tx, ...)
      this.notify.write(tx, ...)   // in-app notification row, in-tx
      await tx.insert(booking)...
    })
    // AFTER commit — fire-and-forget, never awaited in request path
    bus.emit("booking.created", { bookingId, tutorId, ... })
  }
```

```
modules/notification/email.subscriber.ts
  bus.on("booking.created", async (e) => emailQueue.enqueue(e))   // email only
  bus.on("booking.confirmed", async (e) => emailQueue.enqueue(e))
  bus.on("meeting.due", async (e) => meetingProvider.createEvent(e))
```

**nanoevents caveat:** handlers run synchronously in the emitter's call stack. If a subscriber throws, it can propagate back into the request unless emits are wrapped. Email subscribers are defensive (try/catch + log + `notificationDispatch.status='failed'` write). This keeps the booking request path safe.

### 6.5 What stays direct (and why)

- `WalletService` internally uses `db` directly (owns wallet tables).
- `BookingService` internally uses `db` directly for booking tables.
- Cross-module = always via port (sync) or event (async). Never a direct import of another module's service class.

This is **dependency inversion**, not "event-driven everything". The right amount of EDD for this PRD.

---

## 7. Folder Structure

Centralized schema in `packages/db`, fine-grained modules in `packages/api`, top-level `tests/`, ports + nanoevents for decoupling.

```
packages/
  db/
    src/
      schema/
        auth.ts              user, session, account, verification
        wallet.ts            wallet, ledgerEntry, markPackage, paymentRecord, refundRecord
        profile.ts           studentProfile, tutorProfile, tutorInvite, achievement
        tutor.ts             availabilitySlot
        booking.ts           booking, bookingParticipant, bookingStateHistory,
                            bookingSession, bookingRescheduleProposal
        room.ts              room, roomBooking
        meeting.ts           meetingEvent
        ops.ts               notification, notificationDispatch, supportTicket, auditLog
        relations.ts         all Drizzle relations (cross-module joins)
        index.ts             re-export all
      migrations/            generated SQL, committed to git
      index.ts               createDb (lazy), db singleton
      drizzle.config.ts
      seed/                  markPackage, rooms, admin user, floor prices
    package.json

  api/
    src/
      index.ts               o, procedures, root appRouter composition,
                             wires ports → services → routers
      context.ts              session + db + injected services
      lib/                   cross-module infra (no business logic)
        db.ts                re-export db singleton
        tx.ts                withTx, runInTx
        errors.ts            ORPCError factory
        money.ts             Marks/IDR integer helpers
        time.ts              UTC store, WIB render, H-2, business hours
        idempotency.ts        UK-based retry helper
        sanitize.ts          rich-text sanitizer for session notes
      shared/
        ports/               service interfaces (dependency inversion)
          wallet.port.ts
          audit.port.ts
          notification.port.ts
          meeting.port.ts
          pricing.port.ts
          payment.port.ts
          room.port.ts
          support.port.ts
        events/              domain event types + bus
          bus.ts             nanoevents instance
          types.ts           BookingCreated, BookingConfirmed, ...
        floor-prices.ts      ONLINE/OFFLINE floor tables + extra-take config
        packages.ts          Starter/Learner/Explorer/Pioneer constants
        notification-matrix.ts  which events → in-app only vs +email
      modules/
        wallet/
          module.ts          exports walletRouter + WalletService (impl of WalletPort)
          wallet.service.ts  hold/release/deduct/credit/compensate (tx-bound)
          wallet.router.ts   get, listLedger, listPackages, knowledgeBankEligible
          wallet.types.ts    zod input/output schemas
        payment/
          module.ts
          payment.service.ts interface PaymentPort + StubPaymentProvider
          payment.router.ts  createPurchase, getPurchase
          webhook.router.ts  POST /webhooks/payments/:provider (idempotent)
        pricing/
          module.ts
          pricing.service.ts validatePrices, computeSplit (pure, impl of PricingPort)
        auth/
          module.ts
          auth.router.ts     me, getProfile, updateProfile
        profile/
          module.ts
          profile.router.ts  studentProfile + tutorProfile reads
        tutor/
          module.ts
          tutor.service.ts   onboarding submit/validation, publish gate
          tutor.router.ts     getMyProfile, updateMyProfile, submitForReview,
                            availability CRUD
          discovery.router.ts listPublished, getProfile (SQL filtering)
        invite/
          module.ts
          invite.router.ts   verify, claim (tx + audit)
        booking/
          module.ts          exports bookingRouter + BookingService
          booking.service.ts state machine: canTransition (pure),
                            transition, reprice, create/confirm/withdraw
          booking.router.ts  createSolo/Group/Series, cancel, reschedule,
                            confirmInvite, declineInvite, reconfirm, withdraw,
                            get, listMine, listSessions
          tutor-actions.router.ts  acceptBooking, declineBooking,
                            proposeReschedule, completeSession, saveSessionNote
          booking.types.ts   state enum, input schemas, price snapshot type
          expiry-sweep.ts    background job: 12h windows → expired + release
        room/
          module.ts
          room.service.ts    availability check, confirm/relocate/cancel
          room.router.ts     admin-only: assignRoom, relocateRoom, cancelOffline
        meeting/
          module.ts
          meeting.service.ts interface MeetingPort
          fallback.provider.ts  manual link entry, 'pending' state
          # google.provider.ts   post-MVP
        notification/
          module.ts
          notification.service.ts  write in-tx (impl of InAppNotificationPort),
                                  email dispatch via event bus
          email.queue.ts          in-process Bun queue + retry + dedupe
          email.subscriber.ts     bus.on(...) → enqueue
          notification.router.ts  list, markRead, markAllRead, unreadCount
        support/
          module.ts
          support.service.ts  reportTutorNoShow, SLA computation, escalation
          support.router.ts   report, admin queue list
        admin/
          module.ts
          admin.router.ts        listUsers, setRole, listBookings, getBooking
          override.router.ts     applyOverride (OverrideService), reconcilePayment,
                                refundPayment, listOverridesQueue
          admin-tutor.router.ts  createInvite, resendInvite, revokeInvite,
                                listTutorProfiles, reviewTutorProfile
          admin-achievement.router.ts  list, review (with audit)
        audit/
          module.ts
          audit.service.ts   record(tx, ...) — impl of AuditPort, always in caller tx
    tests/                   ← TOP-LEVEL
      unit/
        pricing.test.ts          pure split math, TC-06
        booking-state.test.ts    canTransition matrix, all 15 states
        wallet.test.ts           ledger invariants (mock db)
      integration/
        wallet-ledger.test.ts    hold/release/deduct with real DB
        payment-idempotency.test.ts  webhook twice → one credit
        booking-solo.test.ts     TC-11
        booking-group-reprice.test.ts  TC-18
        booking-series.test.ts   TC-23..34
        invite-onboarding.test.ts  TC-08..10
        override-audit.test.ts   TC-37, TC-39
        notification-dispatch.test.ts  TC-21
      helpers/
        db.ts                  test-only createDb, truncate
        factories.ts           user/wallet/booking factories
    package.json

  auth/      Better Auth config (unchanged)
  env/       server + web env
  config/    tsconfig, oxlint
  ui/        Selia (unchanged)

apps/
  server/
    src/
      index.ts              Elysia: /rpc (oRPC), /api/auth/*, webhooks,
                            openapi, cron interval for expiry sweep
      openapi.ts
      webhooks/
        payments.ts         thin: verify signature → payment.webhook.router
      seed.ts
      seed-packages.ts
      seed-invite.ts
```

### Request lifecycle (canonical: create solo booking)

```
HTTP POST /rpc/booking.createSolo
  └─ Elysia (CORS, evlog, identifyUser)
     └─ oRPC createContext → auth.api.getSession(headers) → { session, db }
        └─ bookingRouter.createSolo (protectedProcedure)
           ├─ zod validate input
           ├─ BookingService.createSolo(input, session.user)
           │  ├─ db.transaction
           │  │  ├─ pricing.validatePrices(...)        [PricingPort, sync]
           │  │  ├─ wallet.hold(tx, ...)               [WalletPort, sync, in-tx]
           │  │  ├─ db.insert(booking + participant + stateHistory)
           │  │  ├─ audit.record(tx, ...)              [AuditPort, sync, in-tx]
           │  │  └─ notify.write(tx, tutorId, ...)     [InAppNotificationPort, in-tx]
           │  └─ bus.emit("booking.created", {...})    [nanoevents, post-commit, fire-and-forget]
           └─ return { bookingId }
                ↓ (async, separate stack)
           email.subscriber.on("booking.created") → enqueue → EmailQueue
              └─ send mail, retry 3x, dedupe by eventKey
              └─ on failure: INSERT notificationDispatch (status='failed')
```

HTTP response returns the moment `COMMIT` succeeds. Email is already in-flight in another task.

---

## 8. Edge Cases & Error Handling

From PRD §Operational Edge Cases + analysis. Each maps to a test.

| #   | Case                                               | Handling                                                                                                                                                                                      |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Payment success but browser closes before redirect | Webhook credits once via `providerEventId` UK; no client-side credit path.                                                                                                                    |
| 2   | Webhook arrives twice                              | `INSERT … ON CONFLICT (provider_event_id) DO NOTHING`; check status before crediting.                                                                                                         |
| 3   | Tutor declines after Marks held                    | `declineBooking` tx: state→`declined`, `WalletService.release`, audit, notify student.                                                                                                        |
| 4   | Student self-service cancel/reschedule after H-2   | Route checks `scheduledStartAt - now <= 2h` → `PRECONDITION_FAILED` with "late-cancel blocked, contact support".                                                                              |
| 5   | Group confirmed headcount < 2 at deadline          | Background sweep (cron/interval) → `expired`, release all holds within 12h.                                                                                                                   |
| 6   | Repricing happens >1×                              | Each reconfirm cycle creates a new `bookingStateHistory` entry; price recomputed from current `confirmedHeadcount`; new `notification` per cycle (dedupe by `eventKey` includes cycle index). |
| 7   | Confirmed participant withdraws pre-H-2            | Release their hold; recompute; → `awaiting_reconfirmation`; notify remaining.                                                                                                                 |
| 8   | Confirmed participant withdraws post-H-2           | Late-cancel path: their Marks deducted (forfeit), no repricing, no refund unless override.                                                                                                    |
| 9   | Offline booking accepted but no room               | Admin: `relocateRoom` or `cancelOffline` (release holds, audit).                                                                                                                              |
| 10  | Invite opened by wrong logged-in user              | `claim` checks `invite.email === session.user.email` (case-insensitive) → `FORBIDDEN`.                                                                                                        |
| 11  | Invite expired/revoked                             | `verify` + `claim` reject with explicit message.                                                                                                                                              |
| 12  | Existing user receives invite                      | `claim` attaches tutor access to existing user; no duplicate user; `tutorProfile` created.                                                                                                    |
| 13  | Tutor onboarding incomplete                        | `submitForReview` validates required fields; `published` only via admin; discovery filter `onboardingStatus='published'`.                                                                     |
| 14  | Email delivery fails                               | `NotificationService` writes in-app row (succeeds); email job retried 3× then `failed` in `notificationDispatch`; booking write unaffected.                                                   |
| 15  | Admin override on terminal state                   | `OverrideService` requires `reason` + `category`; writes audit **before** ledger change; compensating entry only.                                                                             |
| 16  | Concurrent invite claim (race)                     | `tx.update(...).where(status='invited' AND expiresAt>now)` returns null on second claim → `CONFLICT`.                                                                                         |
| 17  | Double-ledgering (bug)                             | `UNIQUE(wallet_id, event_key, source_reference)` prevents; `WalletService` treats conflict as no-op + logs.                                                                                   |
| 18  | Wallet invariant violation                         | `CHECK(total=held+available)` at DB; `WalletService` always updates all three atomically.                                                                                                     |
| 19  | Series 5th session                                 | `createSeries` input zod: `sessions: z.array(...).max(4)`.                                                                                                                                    |
| 20  | Group series participant tries opt-out             | `withdraw` route: if booking is `type=series AND group`, → `FORBIDDEN` unless admin override.                                                                                                 |
| 21  | Group invitee lacks Marks for series hold          | `confirmInvite` checks `availableMarks >= sum(perSessionMarks × 4)`; else `PRECONDITION_FAILED` + redirect to top-up.                                                                         |
| 22  | Tutor no-show report before 15 min                 | `reportTutorNoShow` rejects if `now < scheduledStartAt + 15m` → `PRECONDITION_FAILED`.                                                                                                        |
| 23  | Tutor no-show report — admin verifies              | `applyOverride` with `category=tutor_no_show`, `marksAction=release_held` for all participants; state → `cancelled` (or `no_show`).                                                           |
| 24  | 12h response window expiry                         | Background sweeper runs every ~5 min: bookings in awaiting states where `deadlineAt < now` → `expired` + release holds.                                                                       |
| 25  | Marks purchase after booking needs top-up          | `bookingRouter.createSolo` returns `PRECONDITION_FAILED` with `code='INSUFFICIENT_MARKS'` + `packageCode` suggestion; frontend routes to `/balance`.                                          |
| 26  | Pricing below floor                                | `PricingService.validatePrices` → `UNPROCESSABLE_CONTENT` listing each invalid size.                                                                                                          |
| 27  | Modality both — floor validation                   | Validate against **the higher floor per size** between online/offline.                                                                                                                        |
| 28  | Knowledge Bank with <35 Marks                      | `knowledgeBankEligible` returns `{eligible:false}`; frontend shows threshold copy; no deduction ever.                                                                                         |
| 29  | Demoting last admin                                | `setRole` tx: count admins; if `<=1` and demoting an admin → `CONFLICT`.                                                                                                                      |
| 30  | Booking state machine illegal transition           | `BookingService.canTransition` returns false → `PRECONDITION_FAILED`.                                                                                                                         |

### Error handling strategy

- All service methods throw `ORPCError` subclasses (mapped to HTTP by oRPC).
- All mutating routers wrapped in `db.transaction()`; service errors abort tx.
- `AuditService.record` never throws into caller (if it fails, tx aborts — by design).
- `NotificationService` in-app write is in tx; email enqueue is **after commit** (Bun task) so email failure can't roll back a successful booking.
- Server-level `onError` logs structured (evlog) and returns sanitized error to client.

---

## 9. Performance Notes

- **Single DB pool**: import `db` from `@cogito-app/db` everywhere. Remove 6 `createDb()` calls.
- **Indexes** as specified per table; hot paths: my bookings (`(userId, confirmationState)`), tutor's incoming (`(tutorId, currentState)`), expiry sweep (`(currentState, deadlineAt)`), admin queue (`(status, slaDeadlineAt)`).
- **Projections**: use `.select({...})` for list endpoints (don't fetch jsonb blobs like `priceSnapshot` for list views).
- **Cursor pagination** for ledger and notifications (not offset).
- **Background expiry sweeper**: single `setInterval` in the server (Bun) every 5 min; or a cron route `POST /admin/cron/expire` guarded by a shared secret. MVP: in-process interval with `onShutdown` clear.
- **Email queue**: in-process array + `Bun.spawn` worker; retries with backoff; dedupe by `notificationId`. No Redis for MVP. NFR: email must not block booking writes → enqueue after commit.
- **Avoid N+1**: `auth.me` fetches user + studentProfile + tutorProfile + wallet in one `db.query.user.findFirst({ with: { studentProfile, tutorProfile, wallet } })`.
- **Tutor discovery SQL filtering**: `ILIKE` (no trigram for MVP; pg_trgm is a later optimization), `expertise @> ARRAY[...]`.
- **Connection limits**: one pool, `max=10` dev / env-tunable for prod.
- **Transactions**: keep them short; never hold a tx across an HTTP call to Google/payment provider. Provider calls happen **outside** tx; only the **result** is written in a tx (webhook handler).
- **Immutable tables** (`ledgerEntry`, `auditLog`, `bookingStateHistory`, `notificationDispatch`, `refundRecord`): no `UPDATE`/`DELETE` paths in code.
- **Money**: `integer` Marks, no float. IDR `integer` (rupiah, no decimals). `PricingService` uses integer math; `floor(extra/5)` is integer division.
- **Time**: all `timestamptz` UTC; render WIB (`Asia/Jakarta`) on frontend; H-2 = `scheduledStartAt - 2h` compared in UTC.
- **Idempotency**: every external-triggered write carries `sourceReference` + `eventKey`; DB unique enforces; service treats conflict as success-of-first.

---

## 10. Build Phases

Each slice = schema migration + modules + tests + CONTEXT.md update. Slice is "done" when its tests pass and `bun run check` is green.

### Phase 0 — Foundation fixes ✅ COMPLETE

1. ✅ Remove `todo` table + router.
2. ✅ Standardize single `db` singleton; delete 6 `createDb()` calls.
3. ✅ Fix `auditLog.actorId` nullable + onDelete.
4. ✅ Add `uuidPrimaryKey` to wallet/ledgerEntry/studentProfile.
5. ✅ Add `CHECK` constraints to existing enum-ish columns (audit actor_type, ledger entry_type + amount + actor_type, tutor invite status, tutor profile modality + onboarding_status, achievement status).
6. ✅ Add `CHECK(total=held+available)` + ledger idempotency `UNIQUE(wallet_id, event_key, source_reference)`.
7. ✅ Switch to `drizzle-kit generate` + `db:migrate`; commit initial migration.
8. ✅ Add `lib/` (db, tx, errors, money, time) + `shared/ports/` (8 interfaces) + `shared/events/` (nanoevents bus + 10 domain event types).
9. ✅ Wrap `submitForReview`, `reviewTutorProfile`, `setRole` in tx + audit.
10. ✅ Tests: existing invite test still green; add ledger-invariant test (7 tests), audit-on-setRole test (2 tests).

### Phase 0.5 — Module Refactoring ✅ COMPLETE

Restructured from "business logic in routers" to "thin routers → services → ports" with dependency injection.

1. ✅ Split server entrypoint: `index.ts` (bootstrap) + `routes.ts` (mount + `/health`) + `middleware.ts` (identifyUser).
2. ✅ Extract `procedures.ts` from `index.ts`; `index.ts` becomes composition root barrel.
3. ✅ Create 10 domain modules: `auth`, `wallet`, `admin`, `admin-tutor`, `tutor`, `tutor-discovery`, `invite`, `achievement`, `audit`, `pricing`.
4. ✅ Each module: thin router (validate → authorize → `context.services.{module}.{method}()`) + service (functional factory with port DI) + types (zod schemas).
5. ✅ Composition root (`services.ts`): instantiate all services with port dependencies, export `ServiceRegistry`.
6. ✅ Context injection: `context.services` available to all procedures.
7. ✅ Decouple auth from wallet: removed Better Auth hook, lazy wallet creation via `WalletService.getOrCreate()` on first `auth.me`.
8. ✅ `/health` endpoint with DB ping.
9. ✅ SQL-level filtering in tutor discovery (ILIKE + jsonb `@>` replaces in-memory filtering).
10. ✅ Delete old flat `routers/` directory.
11. ✅ All 32 existing tests pass after refactoring.

### Phase 0.6 — Infrastructure ✅ COMPLETE

1. ✅ GitHub Actions CI: 4 parallel jobs (lint, typecheck, build, test+coverage) with PostgreSQL service container.
2. ✅ Lefthook pre-commit hooks: pre-commit (lint + format), pre-push (typecheck).
3. ✅ Bun test coverage: `lcov` reporter, 50% threshold, ignore patterns for non-source files.
4. ✅ Custom lcov coverage PR comment script (`.github/scripts/coverage-comment.ts`).
5. ✅ Dependabot config for weekly dependency updates.
6. ✅ `oxlint --format=github` for inline PR annotations.
7. ✅ Integration tests refactored to use `createRouterClient` (no HTTP server needed in CI).
8. ✅ Updated `.env.example` with documented env vars.
9. ✅ Cache Bun dependencies in CI via `actions/cache`.

**Deferred (private repo limitations):**

- CodeRabbit AI PR review — free for public repos only; defer until repo goes public or budget allows.
- Codecov dashboard — free for public repos only; using custom PR comment script instead.
- CodeQL security scanning — requires GitHub Advanced Security license for private repos; using `oxlint` + Dependabot instead.

### Phase 1 — Wallet & Payment (FR-03, FR-04, FR-12, DL-04, DL-16, DL-24) ✅ COMPLETE

- ✅ `markPackage`, `paymentRecord`, `refundRecord` tables.
- ✅ `WalletService` extensions (listLedger, knowledgeBankEligible).
- ✅ `PaymentService` (stub provider) + idempotent webhook.
- ✅ `walletRouter`, `paymentRouter` + webhook route.
- ✅ `auth.me` returns wallet (already in place).
- ✅ Tests: TC-03, TC-04, TC-35, TC-32.

### Phase 2 — Tutor Discovery & Availability (FR-06, FR-19, FR-23, FR-24) — NEXT

- `availabilitySlot` table.
- Refactor `tutor-public-router` → `tutorDiscoveryRouter` with SQL filtering + projections.
- `tutorRouter` availability CRUD.
- Floor-price validation fixed (both modality stricter floor).
- Tests: TC-05, TC-07, TC-10.

### Phase 3 — Booking Core: Solo (FR-07, FR-14, FR-15, FR-21 fallback, FR-22)

- `booking`, `bookingParticipant`, `bookingStateHistory`, `bookingRescheduleProposal`, `room`, `roomBooking`, `meetingEvent` tables.
- `BookingService` state machine (pure `canTransition` + `transition`).
- `bookingRouter.createSolo`, `cancel`, `reschedule`, `get`, `listMine`.
- Tutor `acceptBooking`, `declineBooking`, `proposeReschedule`, `completeSession`, `saveSessionNote`.
- Admin `assignRoom`, `setManualMeetingLink`.
- `MeetingService` fallback impl.
- `NotificationService` + `notification` table + email queue.
- Tests: TC-11, TC-13, TC-14, TC-15, TC-16, TC-17, TC-20, TC-21, TC-36 (fallback), TC-37, TC-38.

### Phase 4 — Booking: Group + Series (FR-08, FR-16, FR-20, FR-22 group, DL-07, DL-13, DL-17, DL-19, DL-20)

- `bookingSession` (series children) table.
- `createGroup`, `confirmInvite`, `declineInvite`, `reconfirm`, `withdraw`.
- Repricing logic in `BookingService` + `PricingService`.
- Expiry sweeper (cron/interval) for 12h windows.
- `createSeries`, series cancel rules, group-series no-opt-out guard.
- Tests: TC-12, TC-18, TC-19, TC-23..34 (all series cases).

### Phase 5 — Admin Override & Support (FR-10, FR-13, DL-08, DL-12, OQ-04, OQ-06, OQ-07, OQ-08)

- `supportTicket` table.
- `reportTutorNoShow`, `adminRouter.listOverridesQueue`, `applyOverride`, `reconcilePayment`, `refundPayment`.
- SLA computation + escalation to WhatsApp (link/copy for MVP; no WhatsApp API).
- Tests: TC-37, TC-39, override-audit, payment-reconciliation.

### Phase 6 — Polish & Production-readiness

- OpenAPI tags cleanup; Scalar review.
- Rate limiting on auth + payment webhook (Bun middleware or `@elysiajs/rate-limit`).
- Structured logging (evlog) on every service error.
- ✅ Health check `/health` with DB ping (done in Phase 0.5).
- ✅ CI: `bun run check` + `bun test` on PR (done in Phase 0.6).
- Production env review (secrets, CORS, secure cookies already set).
- CONTEXT.md final rewrite.
- Dockerfiles for server + web (for Coolify deployment).
- CD pipeline (`cd.yml`) for staging + production deploys.

---

## 11. Local Deployment & Docker

### 11.1 Decisions (locked)

- **Local dev:** Docker Postgres 16 only. Web + server run natively via Bun for fast HMR.
- **Migrations:** `drizzle-kit migrate` replaces `db:push`. SQL files committed.

### 11.2 Current setup (to be adjusted)

- `packages/db/docker-compose.yml` runs PostgreSQL 16 on port 6767.
- `bun run dev` orchestrates web + server + db watch via Turborepo.
- `bun run db:push` syncs schema directly — **replace with `db:migrate`** in Phase 0.

### 11.3 Proposed local dev workflow

1. `docker compose up -d db` — starts Postgres only.
2. `bun install`
3. `bun run db:migrate` — applies committed migrations.
4. `bun run seed` — creates admin user.
5. `bun run seed-packages` — inserts markPackage rows.
6. `bun run dev` — starts web (:3000) + server (:3001) natively via Turborepo.
7. `bun run db:studio` — Drizzle Studio for inspecting data.

### 11.4 Docker files

- **Keep `packages/db/docker-compose.yml`** for local Postgres (port 6767, volume for persistence).
- **Add `apps/server/Dockerfile`** for production deployment (Coolify builds from this). See §11.7.
- **Add `apps/web/Dockerfile`** for production static hosting (Vite build + nginx). Same CD pattern, second Coolify app.
- **Optional `docker-compose.override.yml`** later if Redis/email mock needed (not for MVP).

### 11.5 Environment files

- `apps/server/.env` (gitignored) — loaded by `@cogito-app/env/server` via dotenv.
- `apps/web/.env` (gitignored) — `VITE_SERVER_URL=http://localhost:3001`.
- `apps/server/.env.example` — committed template; update with new env vars (see §13).
- **CI secrets** — `DATABASE_URL` (ephemeral Postgres), `BETTER_AUTH_SECRET` (test value), etc. (see §12).
- **Prod secrets** — set per-environment in Coolify app settings (never in repo). See §12.3.

### 11.6 Production hosting (locked)

- **Platform:** Coolify v4 on a self-managed VPS (Hetzner/DigitalOcean). Coolify is a self-hosted PaaS — it builds from the repo Dockerfile, deploys containers, manages Postgres as a service, and exposes a deploy API.
- **Postgres:** Coolify managed Postgres service on the same VPS (Docker container, automated backups via Coolify). One Postgres service per environment (staging, production).
- **Frontend (`apps/web`):** static Vite build, deployed as a second Coolify app per environment (served by nginx in its own Dockerfile).
- **Environments:** staging (tracks `main`) + production (deploys on `v*` tags). Two Coolify applications per environment (server + web) = four Coolify apps total, two Postgres services.
- **Why not PaaS (Railway/Fly):** user has self-hosting experience and prefers controlling the VPS. Coolify gives PaaS-like DX without the recurring per-service pricing.

### 11.7 Server Dockerfile (`apps/server/Dockerfile`)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

# Copy workspace manifests first for layer cache
COPY package.json bun.lock turbo.json ./
COPY apps/server/package.json apps/server/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/config/package.json packages/config/

# Install all deps (workspace-aware, includes devDeps for build)
RUN bun install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/server/ apps/server/

# Build server (tsdown) — produces apps/server/dist
RUN bun run --filter server build

# --- runtime stage ---
FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
COPY --from=base /app /app
ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "apps/server/dist/index.js"]
```

### 11.8 Web Dockerfile (`apps/web/Dockerfile`)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN bun install --frozen-lockfile
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN bun run --filter web build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`apps/web/nginx.conf` (to be created): SPA fallback to `index.html`, gzip, cache headers for hashed assets.

---

## 12. CI/CD Pipeline

### 12.1 Decisions (locked)

- **CI:** GitHub Actions (repo is `cogitoacademy/app`, no existing `.github/`).
- **CD:** Coolify v4 on a self-managed VPS. GH Actions builds Docker image → pushes to GHCR → calls Coolify deploy API. Staging tracks `main`; production deploys on `v*` tags.
- **Migrations:** CI runs `drizzle-kit migrate` against the target DB **before** triggering Coolify deploy. If migrate fails, deploy is skipped and the old version stays live.
- **Postgres (prod):** Coolify managed Postgres service on the same VPS, one per environment.

### 12.2 Pipeline structure (GitHub Actions)

**Workflow 1: `ci.yml` — runs on every PR and push to main**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install --frozen-lockfile
      - run: bun run check # oxlint + oxfmt
      - run: bun run check-types # tsc -b across workspaces

  test:
    runs-on: ubuntu-latest
    needs: check
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: cogito-test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:password@localhost:5432/cogito-test
      BETTER_AUTH_SECRET: ci-test-secret-at-least-32-chars-long-xxxxx
      BETTER_AUTH_URL: http://localhost:3001
      CORS_ORIGIN: http://localhost:3000
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install --frozen-lockfile
      - run: bun run db:migrate # validates migrations apply cleanly
      - run: bun run seed # validates seed scripts run
      - run: bun test # unit + integration tests
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/cogito-test
```

**Workflow 2: `cd.yml` — build image, run migrations, trigger Coolify deploy**

Runs after CI passes. `push: main` → staging; `push: tag v*` → production.

```yaml
name: CD
on:
  push:
    branches: [main] # → staging
    tags: ["v*"] # → production

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write # push to GHCR
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Determine environment (staging vs production)
        id: env
        run: |
          if [[ "${{ github.ref }}" == refs/tags/v* ]]; then
            echo "name=production" >> $GITHUB_OUTPUT
            echo "db_url_secret=PROD_DATABASE_URL" >> $GITHUB_OUTPUT
            echo "coolify_server_app_id=${{ secrets.COOLIFY_PROD_SERVER_APP_ID }}" >> $GITHUB_OUTPUT
            echo "coolify_web_app_id=${{ secrets.COOLIFY_PROD_WEB_APP_ID }}" >> $GITHUB_OUTPUT
            echo "image_tag=$(echo ${{ github.ref }} | sed 's|refs/tags/||')" >> $GITHUB_OUTPUT
          else
            echo "name=staging" >> $GITHUB_OUTPUT
            echo "db_url_secret=STAGING_DATABASE_URL" >> $GITHUB_OUTPUT
            echo "coolify_server_app_id=${{ secrets.COOLIFY_STAGING_SERVER_APP_ID }}" >> $GITHUB_OUTPUT
            echo "coolify_web_app_id=${{ secrets.COOLIFY_STAGING_WEB_APP_ID }}" >> $GITHUB_OUTPUT
            echo "image_tag=main-${{ github.sha }}" >> $GITHUB_OUTPUT
          fi

      - name: Build & push server image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/server/Dockerfile
          push: true
          tags: |
            ghcr.io/cogitoacademy/cogito-server:${{ steps.env.outputs.image_tag }}
            ghcr.io/cogitoacademy/cogito-server:${{ steps.env.outputs.name }}-latest

      - name: Build & push web image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: |
            ghcr.io/cogitoacademy/cogito-web:${{ steps.env.outputs.image_tag }}
            ghcr.io/cogitoacademy/cogito-web:${{ steps.env.outputs.name }}-latest

      - name: Run migrations against target DB
        env:
          DATABASE_URL: ${{ secrets[steps.env.outputs.db_url_secret] }}
        run: |
          bun install --frozen-lockfile
          bun run db:migrate
        # Migrations run BEFORE Coolify pulls the new image.
        # If this fails, the deploy steps below are skipped (if: success()).

      - name: Trigger Coolify server deploy
        if: success()
        env:
          COOLIFY_TOKEN: ${{ secrets.COOLIFY_API_TOKEN }}
          COOLIFY_BASE_URL: ${{ secrets.COOLIFY_BASE_URL }}
        run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer $COOLIFY_TOKEN" \
            -H "Content-Type: application/json" \
            "$COOLIFY_BASE_URL/api/v1/applications/${{ steps.env.outputs.coolify_server_app_id }}/deploy"

      - name: Trigger Coolify web deploy
        if: success()
        env:
          COOLIFY_TOKEN: ${{ secrets.COOLIFY_API_TOKEN }}
          COOLIFY_BASE_URL: ${{ secrets.COOLIFY_BASE_URL }}
        run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer $COOLIFY_TOKEN" \
            -H "Content-Type: application/json" \
            "$COOLIFY_BASE_URL/api/v1/applications/${{ steps.env.outputs.coolify_web_app_id }}/deploy"
```

### 12.3 Secrets required in GitHub

| Secret                          | Used by                  | Value (MVP)                                                    |
| ------------------------------- | ------------------------ | -------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`            | test job                 | fixed 32+ char test string (hardcoded in workflow env)         |
| `DATABASE_URL`                  | test job                 | set by `services.postgres` env (not a secret)                  |
| `COOLIFY_API_TOKEN`             | cd.yml deploy            | generated in Coolify admin → API tokens                        |
| `COOLIFY_BASE_URL`              | cd.yml deploy            | your Coolify instance URL (e.g. `https://coolify.yourvps.com`) |
| `COOLIFY_STAGING_SERVER_APP_ID` | cd.yml (staging)         | Coolify staging server app ID                                  |
| `COOLIFY_STAGING_WEB_APP_ID`    | cd.yml (staging)         | Coolify staging web app ID                                     |
| `COOLIFY_PROD_SERVER_APP_ID`    | cd.yml (prod)            | Coolify prod server app ID                                     |
| `COOLIFY_PROD_WEB_APP_ID`       | cd.yml (prod)            | Coolify prod web app ID                                        |
| `STAGING_DATABASE_URL`          | cd.yml migrate (staging) | Coolify staging Postgres connection string                     |
| `PROD_DATABASE_URL`             | cd.yml migrate (prod)    | Coolify prod Postgres connection string                        |
| `PAYMENT_WEBHOOK_SECRET`        | cd.yml (later)           | added when payment provider chosen                             |

**Per-environment app env vars (set in Coolify, not in GitHub):** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the app's public URL), `CORS_ORIGIN` (web frontend URL), `NODE_ENV`, `DATABASE_URL` (injected by Coolify Postgres linkage), plus payment/email/meeting stub vars from §13.

### 12.4 Test isolation in CI

- Ephemeral Postgres service container per job (clean DB every run).
- `bun run db:migrate` applies migrations from scratch — validates they're idempotent and apply cleanly.
- Integration tests truncate relevant tables between suites via `tests/helpers/db.ts`.
- Unit tests (`pricing`, `booking-state`) don't touch the DB; run in any job.

### 12.5 Pre-commit hook (optional, local convenience)

- Use `husky` or a simple `.git/hooks/pre-commit` script running `bun run check` before commit.
- Not required (CI is the gate), but reduces friction of pushing red code.
- Add in Phase 6 polish if desired.

### 12.6 Migration execution (production)

1. CD job `build-and-deploy` runs after CI passes, on `main` (staging) or `v*` tag (prod).
2. Step "Run migrations": `bun run db:migrate` with `DATABASE_URL` from the matching secret (`STAGING_DATABASE_URL` / `PROD_DATABASE_URL`).
3. Drizzle Kit applies pending SQL files in order; tracks applied in `__drizzle_migrations` table.
4. **If migration fails:** the step exits non-zero → `if: success()` on the deploy steps is false → Coolify deploy calls are skipped → old version stays live, DB untouched (Drizzle tracks which migrations applied; the failed one is not marked).
5. **If migration succeeds:** Coolify deploy API is called → Coolify pulls the new image from GHCR → rolls the container. The healthcheck (`/health` with DB ping) gates the rollout.
6. **Zero-downtime note:** for breaking schema changes, split into additive migration → deploy new code → backfill → drop-old migration in a later release. The Phase 0 schema is net-new, so this isn't a concern yet.
7. **Rollback:** Coolify keeps prior image versions; one-click rollback in the dashboard redeploys the prior tag. Additive migrations are safe to roll back to; drop-column migrations are not — hence the expand/contract rule.

### 12.7 One-time Coolify setup (manual, on the VPS)

1. Install Coolify v4 on the VPS (their one-liner script).
2. Create two Coolify **Postgres services**: `cogito-staging-db`, `cogito-prod-db`. Note each `DATABASE_URL`.
3. Create four Coolify **applications** (Dockerfile type, pointing at GHCR):
   - Staging server: image `ghcr.io/cogitoacademy/cogito-server:staging-latest`, port 3001.
   - Staging web: image `ghcr.io/cogitoacademy/cogito-web:staging-latest`, port 80.
   - Prod server: image `ghcr.io/cogitoacademy/cogito-server:production-latest`, port 3001.
   - Prod web: image `ghcr.io/cogitoacademy/cogito-web:production-latest`, port 80.
4. Link each server app to its Postgres service (Coolify injects `DATABASE_URL`).
5. Set per-app env vars in Coolify: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NODE_ENV=production`, plus stub vars from §13.
6. Generate a Coolify API token; save as `COOLIFY_API_TOKEN` in GitHub secrets.
7. Save `COOLIFY_BASE_URL`, `COOLIFY_STAGING_SERVER_APP_ID`, `COOLIFY_STAGING_WEB_APP_ID`, `COOLIFY_PROD_SERVER_APP_ID`, `COOLIFY_PROD_WEB_APP_ID`, `STAGING_DATABASE_URL`, `PROD_DATABASE_URL` in GitHub secrets.
8. Configure Coolify healthcheck on each server app: path `/health`, port 3001, so Coolify gates the rollout on it.

### 12.8 Deploy safety summary

- **Migrate first, deploy second.** Migrate step gates the deploy steps via `if: success()`.
- **Tag-gated prod.** Prod only deploys on `v*` tags; staging tracks `main`. You tag manually after smoke-testing staging.
- **Healthcheck-gated rollout.** Coolify won't mark the deploy live until `/health` returns 200 (DB ping).
- **Rollback.** Coolify dashboard → redeploy prior image tag. Additive migrations are rollback-safe.
- **Idempotent migrations.** Drizzle tracks applied migrations in `__drizzle_migrations`; re-running `db:migrate` is a no-op if everything's applied.

### 12.9 What ships now vs. deferred

| Item                                   | Now                                 | Deferred                    |
| -------------------------------------- | ----------------------------------- | --------------------------- |
| Lint + format (oxlint/oxfmt)           | Yes (`ci.yml`)                      | —                           |
| Typecheck (tsc -b)                     | Yes (`ci.yml`)                      | —                           |
| Unit tests                             | Yes (`ci.yml`)                      | —                           |
| Integration tests (ephemeral Postgres) | Yes (`ci.yml`)                      | —                           |
| Migration apply validation             | Yes (against ephemeral in `ci.yml`) | —                           |
| Build Docker images (server + web)     | Yes (`cd.yml`)                      | —                           |
| Push images to GHCR                    | Yes (`cd.yml`)                      | —                           |
| Run migrations against staging/prod    | Yes (`cd.yml`)                      | —                           |
| Trigger Coolify deploy                 | Yes (`cd.yml`)                      | —                           |
| Real payment provider                  | —                                   | Swap stub impl when chosen  |
| Google Meet automation                 | —                                   | Swap fallback impl post-MVP |
| E2E tests (Playwright)                 | —                                   | Phase 6+                    |

---

## 13. CONTEXT.md Fixes

When implementing, rewrite `docs/CONTEXT.md` to:

- Correct "DB Schema (5 tables)" → list all ~18 tables with one-line each.
- Correct "API Routers" HTTP methods (all POST, oRPC convention).
- Add `modules/` + `shared/ports/` + `shared/events/` description.
- Add `webhooks/`, `migrations/`, `seed-packages` entries.
- Add new routers (wallet, payment, booking, notification, admin-monitor).
- Update env section with new vars (see below).
- Replace "NOT Yet Built" section with a "Phase 0 build status" table updated as slices ship.
- Remove `todo` references.
- Add `db:migrate` command; note `db:push` is dev-only.

### New env vars (`packages/env/server.ts`)

```
# Auth (Google)
GOOGLE_CLIENT_ID=...           # Google OAuth 2.0 Client ID
GOOGLE_CLIENT_SECRET=...       # Google OAuth 2.0 Client Secret

# Payments
PAYMENT_PROVIDER=stub          # stub|midtrans|xendit
PAYMENT_WEBHOOK_SECRET=...
MEETING_PROVIDER=fallback      # fallback|google
GOOGLE_SERVICE_ACCOUNT_JSON=   # blank for MVP
EMAIL_PROVIDER=stub            # stub|resend|ses
EMAIL_FROM="Cogito <noreply@cogitoacademy.id>"
SUPPORT_WHATSAPP=+62 881-0119-90195
SUPPORT_SLA_BUSINESS_MIN=30
SUPPORT_SLA_AFTER_MIN=240
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=21:00
BUSINESS_DAYS=1-6
CRON_EXPIRY_INTERVAL_MS=300000
FLOOR_PRICES_ONLINE_1=42 ... FLOOR_PRICES_OFFLINE_6=27   (or load from config table)
```

---

## 14. Decision Log

| ID   | Decision                                                                                                                    | Rationale                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Stack unchanged: Elysia + Postgres + Drizzle + oRPC + Better Auth                                                           | Already in place; matches PRD governance (tech owned separately).                                                                                                                                                                                                            |
| D-02 | Centralized schema in `packages/db`                                                                                         | Single source for Drizzle Kit migrations + cross-module relations.                                                                                                                                                                                                           |
| D-03 | Fine-grained modules (14)                                                                                                   | Easy navigation; each domain self-contained.                                                                                                                                                                                                                                 |
| D-04 | Ports (interfaces) for sync cross-module calls                                                                              | Dependency inversion; booking testable without DB; no circular imports.                                                                                                                                                                                                      |
| D-05 | nanoevents for post-commit async (email, meeting, provider callbacks)                                                       | NFR requires email to not block booking writes; minimal EDD.                                                                                                                                                                                                                 |
| D-06 | Payment: stub interface now; real provider swap later                                                                       | Schema provider-agnostic; unblocks booking/wallet without vendor.                                                                                                                                                                                                            |
| D-07 | Meeting: fallback-first (manual link); Google API post-MVP                                                                  | OQ-05 requires fallback; API setup needs client meeting.                                                                                                                                                                                                                     |
| D-08 | Migrations: `drizzle-kit generate` + `migrate`; SQL committed                                                               | Production-safe schema evolution.                                                                                                                                                                                                                                            |
| D-09 | Money: integer Marks + integer IDR; pure PricingService                                                                     | No float math; `floor(extra/5)` integer division.                                                                                                                                                                                                                            |
| D-10 | Time: `timestamptz` UTC; WIB client render; H-2 in UTC                                                                      | NFR compliance.                                                                                                                                                                                                                                                              |
| D-11 | Idempotency: DB unique keys (`providerEventId`, `(walletId,eventKey,sourceReference)`)                                      | NFR: external events idempotent by event id.                                                                                                                                                                                                                                 |
| D-12 | Immutable tables: no UPDATE path (`ledgerEntry`, `auditLog`, `bookingStateHistory`, `notificationDispatch`, `refundRecord`) | DL-04 immutable ledger; audit integrity.                                                                                                                                                                                                                                     |
| D-13 | Event bus: nanoevents                                                                                                       | User choice; mature, typed, tiny.                                                                                                                                                                                                                                            |
| D-14 | Tests: top-level `packages/api/src/tests/` with `unit/` + `integration/`                                                    | User choice.                                                                                                                                                                                                                                                                 |
| D-15 | Tests: top-level `packages/api/src/tests/` with `unit/` + `integration/`                                                    | User choice.                                                                                                                                                                                                                                                                 |
| D-16 | Local dev: Docker Postgres + native Bun app                                                                                 | Fast HMR; matches current setup; minimal host deps.                                                                                                                                                                                                                          |
| D-17 | CI: GitHub Actions                                                                                                          | Repo is on GitHub; service containers for Postgres work cleanly.                                                                                                                                                                                                             |
| D-18 | CD: Coolify v4 on self-managed VPS; GH Actions builds → GHCR → Coolify deploy API                                           | User has self-hosting experience; PaaS-like DX without recurring per-service pricing.                                                                                                                                                                                        |
| D-19 | Migrations: CI runs `drizzle-kit migrate` pre-deploy                                                                        | Standard for small teams; validates migrations apply cleanly in CI against ephemeral DB; gates deploy on success.                                                                                                                                                            |
| D-20 | Postgres: Coolify managed Postgres service on same VPS                                                                      | Cheapest; automated backups via Coolify; one service per env (staging/prod).                                                                                                                                                                                                 |
| D-21 | Environments: staging (tracks `main`) + production (deploys on `v*` tags)                                                   | Allows smoke-testing before prod; tag-gated prod is safer for real money flows.                                                                                                                                                                                              |
| D-22 | Artifacts: Docker images for server + web, pushed to GHCR                                                                   | Portable; Coolify builds/pulls from GHCR; same image runs locally if needed.                                                                                                                                                                                                 |
| D-23 | Deploy trigger: GH Actions calls Coolify deploy API (not Coolify watching the branch)                                       | User choice; keeps build + migrate + deploy in one auditable CI run.                                                                                                                                                                                                         |
| D-24 | Healthcheck: `/health` with DB ping gates Coolify rollout                                                                   | Catches a bad deploy that starts but can't reach the DB.                                                                                                                                                                                                                     |
| D-25 | Auth: Google primary + email/password fallback via Better Auth (in-app library, not SaaS)                                   | PRD doesn't mandate a method; Google covers most Indonesian users; email/password keeps accessibility. Existing `account` table already supports multi-provider — zero DB schema changes. Wallet hook removed in Phase 0.5; lazy creation via `WalletService.getOrCreate()`. |
| D-26 | Module architecture: 10 domain modules with functional factory services + port DI                                           | Thin routers (validate → authorize → call service) + services (business logic) + types (zod). Functional factories (`createTutorService({db, pricing, audit})`) match codebase style (no classes). DI via oRPC context (`context.services`).                                 |
| D-27 | Auth → Wallet decoupling: lazy creation (Option C)                                                                          | Removed Better Auth `after` hook. Wallet created on first `auth.me` via `WalletService.getOrCreate(userId)`. Idempotent — no race, no wasted rows. Auth package has zero knowledge of wallet schema.                                                                         |
| D-28 | Service style: functional factories, not classes                                                                            | Matches existing codebase (Elysia, oRPC, Better Auth, Drizzle all use factories). No `this` binding issues. Services are stateless — all state in PostgreSQL.                                                                                                                |
| D-29 | CI: GitHub Actions with 4 parallel jobs, Bun cache, PostgreSQL service, custom coverage comment                             | Private repo: Codecov/CodeRabbit/CodeQL all require paid plans. Using `oxlint --format=github` + custom lcov PR comment script + Dependabot — all free for private repos.                                                                                                    |
| D-30 | Pre-commit: Lefthook (Go binary, fast, parallel)                                                                            | Pre-commit: oxlint + oxfmt on staged files (~1s). Pre-push: typecheck only (tests in CI, not locally).                                                                                                                                                                       |

---

### Version notes

- v0.1 (2026-06-19): Initial draft. Full design, diagrams, schema, API, edge cases, build phases, draft deployment/CI sections (pending clarification).
- v0.2 (2026-06-19): Finalized Sections 11 (Docker Postgres + native Bun) and 12 (GitHub Actions CI-only, CD deferred). Decisions D-16..D-19 added.
- v0.3 (2026-06-19): Locked CD: Coolify v4 on self-managed VPS, GH Actions builds Docker images → GHCR → Coolify deploy API, Coolify managed Postgres, staging + prod, CI runs migrations first. Added `apps/server/Dockerfile` + `apps/web/Dockerfile` specs, full `cd.yml`, Coolify setup steps, deploy safety, secrets list. Decisions D-18..D-24 revised/added.
- v0.4 (2026-06-19): Locked auth: Google primary + email/password fallback. Added §2 auth architecture subsection (Better Auth is a library not a SaaS; `account` table already supports OAuth; zero DB schema changes). Added Google env vars to §13. Decision D-25 added.
- v0.5 (2026-06-26): Phase 0 + Phase 0.5 + Phase 0.6 complete. Added Phase 0.5 (module refactoring: 10 domain modules, functional factory services, port DI, auth→wallet decoupling, server split, `/health` endpoint) and Phase 0.6 (infrastructure: GitHub Actions CI, Lefthook, coverage, Dependabot). Decisions D-26..D-30 added. Table count corrected (26 total, 15 new). Booking transition matrix derived. Series child state machine: independent. Refund status: CHECK-constrained column. Floor prices: runtime-editable config table (deferred to Phase 1). Status updated to "Phase 0 + Phase 0.5 complete. Infrastructure set up. Ready for Phase 1."
