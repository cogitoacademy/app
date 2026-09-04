# @cogito-app/db

Drizzle ORM schema and migrations for Cogito, driven by the `postgres` (postgres.js) driver.

## Schema (`src/schema/`, 18 files — 32 tables)

| File | Tables |
| ---- | ------ |
| `auth.ts` | `user`, `session`, `account`, `verification` (Better Auth) |
| `booking.ts` | `booking`, `bookingParticipant`, `bookingStateHistory`, `bookingRescheduleProposal`, `bookingSession`, `sessionNote`, `room`, `roomBooking`, `meetingEvent` |
| `notification.ts` | `notification`, `notificationDispatch` |
| `payment-record.ts` | `paymentRecord`, `refundRecord` |
| `tutor-subject.ts` | `subjectCategory`, `tutorProfileSubject` |
| `wallet.ts` | `wallet`, `ledgerEntry` |
| plus one table each: | `achievement`, `availability-slot`, `contact-request`, `economy-config`, `mark-package`, `student-profile`, `support-ticket`, `tutor-invite`, `tutor-payout`, `tutor-profile`, `audit-log` |

`src/schema/index.ts` re-exports the full schema (used by Better Auth's Drizzle adapter via `@cogito-app/db/schema`).

## Migrations (`src/migrations/`)

43 generated SQL migrations (0000–0042) via `drizzle-kit generate`, applied with:

```
bun run db:migrate
```

The driver is `postgres` (postgres.js) with `drizzle-orm/postgres-js`; the client config in `src/index.ts` sets `statement_timeout: 30_000` and redacts credential-shaped values from logged connection details. `DB_SSL_ENABLED` / `DB_SSL_REJECT_UNAUTHORIZED` control TLS, with a boot warning when SSL verification is disabled in production-like envs (`warnIfInsecureProductionSsl`).

## Scripts

| Script | Purpose |
| ------ | ------- |
| `db:migrate` | Apply migrations (`drizzle-kit migrate`) |
| `db:generate` | Generate a new migration from schema changes |
| `db:push` | Push schema without migrations (dev) |
| `db:studio` | Drizzle Studio UI |
| `db:start` / `db:stop` / `db:down` | Local Postgres via docker compose (test DB via `db:test`) |

Export surface: `@cogito-app/db` (client + helpers) and `@cogito-app/db/schema`.
