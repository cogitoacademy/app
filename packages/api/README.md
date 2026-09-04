# @cogito-app/api

The Cogito backend: HTTP surface, application logic, and jobs. Built on oRPC (`@orpc/server`) over Elysia, served by `apps/server`.

## Architecture

Each feature lives in a standalone module with a 4-layer split, following the consumer-driven port pattern (no `shared/ports/` directory — a module exports the port types it consumes and the `index.ts` wires them):

```
Router (oRPC procedures) → Handler (request shaping, auth, errors) → Service (business rules) → Repository (SQL via Drizzle)
```

- `src/routers.ts` — oRPC `appRouter` composition tree (grouped by module, e.g. `auth.*`, `admin.tutor.*`, `tutor.*`).
- `src/services.ts` — composition root: creates every module with its `db`/Redis/external-provider dependencies and exposes `services()` + `ServiceRegistry`/`HandlerRegistry` types to the server.
- `src/procedures.ts` — oRPC procedure templates: `publicProcedure`, `protectedProcedure` (auth), `verifiedProcedure` (verified email), `adminProcedure` (admin role), `verifiedStudentProcedure`.
- `src/context.ts` — per-request context (session, services, headers); refreshes cached `role`/`emailVerified` from the DB.
- `src/shared/` — cross-cutting constants (e.g. `USER_ROLE`) and helpers used by multiple modules.

## Module map (`src/modules/`, 26 modules)

| Module               | Purpose                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`               | Sign-in/sign-up session flow, profile queries, wallet snapshot port                                                                                |
| `admin`              | Admin operations (bookings overview, dashboard stats)                                                                                              |
| `admin-booking`      | Admin booking management (create/modify/cancel)                                                                                                    |
| `admin-mark-package` | Admin management of purchased mark-packages                                                                                                        |
| `admin-tutor`        | Admin tutor management (approval, onboarding status, profiles)                                                                                     |
| `achievement`        | Student/portfolio achievements with optimistic-lock versioning                                                                                     |
| `audit`              | Append-only audit-log service                                                                                                                      |
| `booking`            | Booking lifecycle: state machine, sessions, rooms, reschedules, tutor actions                                                                      |
| `contact`            | Contact-us requests                                                                                                                                |
| `content`            | Sanity CMS-backed content (competitions, student resources)                                                                                        |
| `economy`            | Economy configuration (pricing parameters, mark-package settings)                                                                                  |
| `email`              | Email port: Resend provider + dev stub provider                                                                                                    |
| `invite`             | Tutor invites (hashed token, onboarding completion)                                                                                                |
| `meeting`            | Meeting provider: Google Meet with fallback to manual-link provider                                                                                |
| `notification`       | Notification records + outbox-style dispatch                                                                                                       |
| `payment`            | Payments: Xendit/Midtrans/stub providers, checkout, webhook reversal handling                                                                      |
| `pricing`            | Pricing calculation port built on `economy` config                                                                                                 |
| `refund`             | Refund records and refund lifecycle                                                                                                                |
| `room`               | Rooms + room bookings with overlap guards                                                                                                          |
| `scheduler`          | BullMQ queue/worker: booking expiry, hold release, SLA escalation, notification emails, tutor lateness, failed-meeting retries (`scheduler/jobs/`) |
| `support`            | Support tickets with SLA deadlines and escalation                                                                                                  |
| `tutor`              | Tutor profiles, availability, experiences, onboarding status                                                                                       |
| `tutor-discovery`    | Discovery/search for tutors                                                                                                                        |
| `tutor-subjects`     | Subject taxonomy + subject-selection rules (1–7 subjects)                                                                                          |
| `upload`             | Signed upload flow (local `POST /uploads/*` or R2 presigned PUT)                                                                                   |
| `wallet`             | Wallet + ledger entries (Marks)                                                                                                                    |

## lib/ utilities (`src/lib/`)

| Utility                    | Purpose                                                                        |
| -------------------------- | ------------------------------------------------------------------------------ |
| `rate-limit`               | Redis-backed fixed-window rate limiting                                        |
| `idempotency`              | Redis-backed idempotency-store (`claim`/`complete`) for booking + webhooks     |
| `circuit-breaker`          | Redis-backed circuit breaker (closed/open/half-open) for external providers    |
| `redis`                    | Redis client wrapper with in-process fallback + logging (namespace `cogito:*`) |
| `db` / `db-health`         | Drizzle client + health check                                                  |
| `locks`                    | Advisory-style DB locks for booking/tutor flows                                |
| `retry`                    | Retry helper with backoff                                                      |
| `logger`                   | Structured JSON logger                                                         |
| `metrics`                  | In-memory request metrics with TTL + cleanup                                   |
| `errors` / `domain-errors` | Shared error types + `DomainError` base                                        |
| `handler-utils`            | Handler plumbing (status codes, pagination helpers)                            |
| `request-id`               | Request-ID extraction/validation                                               |
| `sanitize`                 | HTML sanitization (`escapeHtml` etc.)                                          |
| `security-headers`         | Response security header helpers                                               |
| `tokens`                   | Signed token helpers                                                           |
| `storage`                  | Storage port: local disk + Cloudflare R2 implementations                       |
| `url-schema`               | URL scheme validation                                                          |
| `tx`                       | Transaction-wrapping helper for services                                       |

## Tests (`src/tests/`)

- `unit/` — one test file per module layer (`<module>.router.test.ts`, `.handler.test.ts`, `.service.test.ts`, `.repo.test.ts`, `.errors.test.ts`), plus lib utilities (`rate-limit.test.ts`, `idempotency.test.ts`, `circuit-breaker.test.ts`, …).
- `integration/` — DB-backed flows; `helpers/test-client.ts` builds an oRPC client against `appRouter` with a safety check that the target DB is a test database; `helpers/factories.ts` provides row factories.
- `test-setup.ts` — defaults env vars (test DB URL, Redis URL, auth secrets) for local runs.
- CI enforces a **100% line coverage gate** on `packages/api` plus 100% overall lines/functions/branches (`.github/scripts/coverage-comment.ts`). Run the suite with `bun run test:coverage` or the per-package script `bun run test` in this package (`scripts/run-test-suite.mjs`).
