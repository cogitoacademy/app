# Cogito Runbook

Last updated: 2026-08-16

For manual tutor-invite delivery, copy the visible latest link. After reloading the page, use **Generate & copy link** on a pending invitation history entry; this safely rotates the token instead of persisting plaintext secrets.

**Generate & copy link** never sends email. Use the separate **Send again** action when an admin intentionally wants Resend to deliver a replacement link.

Tutor invitation delivery should be smoke-tested in both desktop and mobile email clients. Verify the **Accept invitation & set up profile** button and fallback URL lead to `/invite?token=…`, the invited account email is correct, and the displayed expiry is explicitly labeled UTC.

## Starting the Server

### Dashboard smoke check

After a web deployment, sign in once as each supported role and open `/dashboard`:

- Student: learning welcome, next lesson, Knowledge Bank/calendar, and tutor recommendations.
- Tutor: request count, next session, availability/profile readiness, and payout total; actions link to `/tutor-bookings`, `/availability`, and `/onboarding`.
- Admin: priority operations and moderation counts; actions link to `/admin-operations`, `/admin-tutors`, and `/admin-achievements`.

The route selects the dashboard from the authenticated session role. A tutor or admin must never receive student-only wallet or booking queries from this page.

### Development

```bash
bun run dev              # Starts web + server (port 3001)
bun run dev:server       # Server only
bun run dev:web          # Web only (port 3000)
```

### Production

```bash
bun run build            # Build server + web
NODE_ENV=production bun apps/server/dist/index.js
```

The server runs on port 3001 by default (configurable via `PORT` env var).

## Database

### Start PostgreSQL (Docker)

```bash
bun run db:start         # Starts PostgreSQL (dev DB cogito-app) on port 6767
bun run db:test          # Starts isolated test PostgreSQL + Redis (docker-compose.test.yml) on port 6767
```

> Note: the dev and test PostgreSQL containers both map host port 6767 — do not run `db:start` and `db:test` simultaneously. `db:test` uses `docker-compose.test.yml` (repo root) and the test harness targets `cogito-test` via `apps/server/.env.test(.example)`.

> **Shutdown noise (C6):** stopping the Postgres container while the app still holds pooled connections prints `FATAL: terminating connection due to administrator command` lines — that is normal fast-shutdown, not a failure. Postgres has a `stop_grace_period: 30s` in both compose files; stop the app (or `docker compose stop` the app service) **before** the DB so connections drain cleanly. On Coolify, set a stop grace period ≥ 30s for the app so graceful shutdown (redis quit + DB drain) can finish before SIGKILL.

### Run Migrations

```bash
bun run db:migrate       # Apply pending migrations
bun run db:generate      # Generate new migration from schema changes
```

For isolated local test runs, the test runner migrates `cogito-test` automatically
using `apps/server/.env.test` or `apps/server/.env.test.example`.

### Seed the Database

```bash
bun run seed-packages          # Seeds mark packages and test data
```

Production guard: `NODE_ENV=production bun run seed-packages` will exit with error.

### Reset the Database

```bash
# Stop and remove the Docker container, then recreate:
docker compose down -v
bun run db:start
bun run db:migrate
bun run seed-packages
```

Test database reset:

```bash
docker compose -f docker-compose.test.yml down -v
bun run db:test
```

### Drizzle Studio (Database GUI)

```bash
bun run db:studio        # Opens Drizzle Studio on port 4983
```

## Redis

### Check Redis Connection

```bash
redis-cli ping           # Should return PONG
redis-cli info server    # Server info
```

### Application Health Check

```bash
curl http://localhost:3001/health
# Returns: { "status": "ok", "checks": { "database": "ok", "redis": "ok" }, "timestamp": "..." }
```

Redis is **mandatory** (`REDIS_URL` is required — the server won't boot without it). The in-memory stores are defensive fallbacks only when a configured Redis call fails at runtime; they are per-process and degrade cross-instance guarantees.

### Clear Rate Limit Keys

```bash
redis-cli KEYS "cogito:rl:*"       # List rate limit keys
redis-cli DEL "cogito:rl:127.0.0.1" # Clear specific key
redis-cli --scan --pattern "cogito:rl:*" | xargs redis-cli DEL  # Clear all
```

### Reset Circuit Breaker State

```bash
redis-cli KEYS "cogito:cb:*"       # List circuit breaker keys
redis-cli DEL "cogito:cb:google_meet"  # Reset Google Meet circuit
redis-cli DEL "cogito:cb:resend"       # Reset Resend circuit
redis-cli DEL "cogito:cb:xendit"       # Reset Xendit circuit
```

### Monitor BullMQ Jobs

```bash
redis-cli KEYS "cogito-jobs:*"     # List all job keys
redis-cli LLEN "cogito-jobs:wait"  # Jobs waiting
redis-cli LLEN "cogito-jobs:failed" # Failed jobs
redis-cli ZCARD "cogito-jobs:delayed" # Delayed jobs
```

## Common Errors

### `BOOKING_CONFLICT` (409)

Two bookings overlap the same tutor time slot. The overlap check uses an exclusion constraint on `tutor_id` + time range. Wait for the other booking to expire or cancel.

### `INSUFFICIENT_BALANCE` / `INSUFFICIENT_MARKS` (400)

Student's `availableBalance` is less than the required hold amount. Check wallet balance via `wallet.getOrCreate`.

### `BOOKING_STATE_TRANSITION` (409)

Invalid state machine transition. Check `booking-transitions.ts` for valid transitions.

For rescheduling, `reschedule_proposed` must return to the state captured in `booking.previousState` after unanimous acceptance or rejection. A partial acceptance must leave both the current schedule and `reschedule_proposed` state unchanged. If a decision reports that no pending proposal exists, refresh booking detail: the supplied `proposalId` may belong to a superseded proposal.

When a 24-hour reschedule proposal deadline passes, expire only the proposal. Keep the original schedule and wallet holds, restore `booking.previousState`, and do not cancel the provider meeting event.

### `BOOKING_NOT_EDITABLE` while creating a booking (400)

Confirm the chosen start is inside the selected tutor availability window and leaves the full server-fixed 90 minutes before the window ends. The web form shows the valid start range and blocks invalid submissions. Also verify the availability is active and that no non-terminal booking overlaps the requested session; declined, cancelled, and expired bookings should not keep the time blocked.

### `LAST_ADMIN` (409)

Attempted to remove the last admin role. Promote another user to admin first.

### `OPTIMISTIC_LOCK` (409)

Concurrent modification conflict. The `version` field didn't match. Retry the operation.

### Circuit Breaker Open Errors

- `Email service unavailable: 503` — Resend circuit breaker is open. Wait 2 minutes or reset manually.
- `Google Meet API timeout after 30s` — Google Meet circuit breaker is open. Wait 1 minute or reset manually.
- `Payment provider error` — Xendit circuit breaker is open. Wait 30 seconds or reset manually.

### Database Connection Errors

- `ECONNREFUSED` — PostgreSQL not running. Run `bun run db:start`.
- `ECONNREFUSED` during tests — Start the isolated test DB with `bun run db:test`.
- `connection timeout` — Check `DATABASE_URL` in `.env`.

### Test Safety Guard

- `Refusing to run tests against a non-test database` — The test harness detected a `DATABASE_URL` whose database name does not include `test`.
- `resetDatabase() is blocked outside a dedicated test database` — An integration test tried to truncate tables while pointed at a non-test database.

### Role-boundary errors

- `FORBIDDEN: Student access required` is expected when tutor/admin sessions call tutor-discovery or student booking mutations. Use `tutorActions.*` for tutor fulfillment and `adminTutor.*` for admin review.

### Redis Connection Errors

- `ECONNREFUSED` — Redis not running. Start it (`bun run db:start` brings up postgres + redis). Redis is required; the server fails fast on env validation if `REDIS_URL` is missing.

## Rollback a Deployment

Deployments are Coolify auto-deploys from GHCR images (`ghcr.io/cogitoacademy/app/{server,web}`). Rollback is done in Coolify:

1. Open the Coolify dashboard → the service (server / web)
2. Use **Rollback to previous release** (Coolify keeps the previous image/version)
3. Verify health: `curl https://cogitoacademy.id/health`
4. If a database migration was part of the deployment, check migration status:
   ```bash
   bun run db:studio  # Check migration table
   ```
5. Roll back migrations if needed (rare — coordinate with DBA)

## Environment Variables

Student account name/image editing uses the existing Better Auth session and requires no additional environment variables or database migration.

Key environment variables (see `.env.example` for full list):

| Variable                                                                                      | Required | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                | Yes      | PostgreSQL connection string                                                                  |
| `BETTER_AUTH_SECRET`                                                                          | Yes      | Auth secret key                                                                               |
| `BETTER_AUTH_URL`                                                                             | Yes      | Base URL for auth cookies                                                                     |
| `CORS_ORIGIN`                                                                                 | Yes      | Allowed CORS origin                                                                           |
| `PAYMENT_WEBHOOK_SECRET`                                                                      | Yes      | Webhook verification secret (provider-agnostic)                                               |
| `REDIS_URL`                                                                                   | Yes      | Redis URL (required since #48 — mandatory for boot)                                           |
| `GOOGLE_CLIENT_EMAIL`                                                                         | No       | Google service account email                                                                  |
| `GOOGLE_PRIVATE_KEY`                                                                          | No       | Google service account private key                                                            |
| `GOOGLE_CALENDAR_ID`                                                                          | No       | Google Calendar ID for meeting creation                                                       |
| `GOOGLE_IMPERSONATED_USER`                                                                    | No       | SA-mode impersonation address (REVIEW-FIXES-4 P4.2)                                           |
| `GOOGLE_MEET_ENABLED`                                                                         | No       | Enables Google Meet provider (default false)                                                  |
| `GOOGLE_MEET_CLIENT_ID`/`GOOGLE_MEET_CLIENT_SECRET`/`GOOGLE_MEET_REFRESH_TOKEN`               | No       | OAuth path credentials for Google Meet                                                        |
| `RESEND_API_KEY`                                                                              | No       | Resend API key (required in production — P4.1)                                                |
| `EMAIL_FROM`                                                                                  | No       | Sender address (default `noreply@cogitoacademy.id`; must be a verified Resend domain in prod) |
| `XENDIT_SECRET_KEY`                                                                           | No       | Xendit API secret key (required when `PAYMENT_PROVIDER=xendit`)                               |
| `XENDIT_WEBHOOK_TOKEN`                                                                        | No       | Xendit webhook verification token                                                             |
| `XENDIT_SUCCESS_REDIRECT_URL` / `XENDIT_FAILURE_REDIRECT_URL`                                 | No       | Required when `PAYMENT_PROVIDER=xendit` (P3.7)                                                |
| `WEBHOOK_ALLOWED_IPS`                                                                         | No       | Webhook source IP allowlist (comma-separated)                                                 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` | No       | Cloudflare R2 upload backend (required in production — P4.3)                                  |
| `SEED_ALLOWED_IN_PROD`                                                                        | No       | Seed-script production guard                                                                  |
| `STUB_WEBHOOK_ALLOWED`                                                                        | No       | Must be `true` on staging for stub-payment E2E                                                |

## Real-Provider Swap (Resend / Xendit / Google Meet / R2)

The app defaults to dev-safe stand-ins (stub email, stub payments, manual Meet fallback, local-disk uploads). Before a production launch these must be swapped for real providers. What fails **loud** vs **silent**, and what each swap requires:

| Provider    | Dev default          | Silent-failure mode if misconfigured                                                                                                  | Prod requirement (fail-loud guard PR)                                                                                     |
| ----------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Resend      | Stub (no-op email)   | **Silent** — `RESEND_API_KEY` optional, no `NODE_ENV` check; critical emails suppressed with no alert                                 | `RESEND_API_KEY` required when `NODE_ENV=production` + verified `EMAIL_FROM` domain (P4.1)                                |
| Xendit      | Stub provider        | Webhook 408/500 loops if OTP-paths or status mapping mismatch                                                                         | `XENDIT_SECRET_KEY`+`XENDIT_WEBHOOK_TOKEN`+redirect URLs when `PAYMENT_PROVIDER=xendit`; sandbox E2E before enabling (P3) |
| Google Meet | Manual link fallback | **Silent** — `GOOGLE_MEET_ENABLED=true` with broken creds falls back to manual links, events land on the wrong calendar               | Complete credential set + `GOOGLE_IMPERSONATED_USER` (SA mode) + boot probe (P4.2)                                        |
| R2          | Local `UPLOAD_DIR`   | **Silent** — prod without R2 writes to container-local disk, lost on redeploy; R2 set but `R2_PUBLIC_URL` unset → objects unreachable | All `R2_*` + `R2_PUBLIC_URL` required in production (P4.3)                                                                |

### Xendit sandbox verification checklist (L4)

Steps to validate the Xendit integration against the sandbox before enabling `PAYMENT_PROVIDER=xendit` in production:

1. Set `PAYMENT_PROVIDER=xendit`, `XENDIT_SECRET_KEY`/`XENDIT_WEBHOOK_TOKEN` to the sandbox values, and `XENDIT_SUCCESS_REDIRECT_URL`/`XENDIT_FAILURE_REDIRECT_URL`.
2. Create a purchase with `XENDIT_DEFAULT_PAYMENT_METHOD=ewallet_ovo` → confirm the returned action URL redirects to an OVO sandbox flow.
3. Verify `STUB_WEBHOOK_ALLOWED=false`; deliver a sandbox webhook with `api-version: 2024-11-11` payload shape (`data.payment_id`, `status=SUCCEEDED`) → confirm the payment transitions to PAID and Marks are credited once.
4. Check webhook timestamp validation: confirm whether Xendit sends a `Date`/`x-timestamp` header; if not, the check is provider-conditional (P3.5).
5. Test a REFUNDED webhook with spent Marks → payment marked REFUNDED + reconciliation row, no 500/retry loop (P2.7/H4).
6. Trigger a provider refund from `adminRefund` → `refund_record.provider_refund_id` populated (P3.6).
7. Only after the full sandbox E2E passes, enable in production.

### Google Meet refresh-token acquisition (X3)

For the OAuth path (`GOOGLE_MEET_CLIENT_ID` + `GOOGLE_MEET_CLIENT_SECRET` + `GOOGLE_MEET_REFRESH_TOKEN`):

1. Google Cloud Console → credentials for the workspace user → create an OAuth Client (Web).
2. Use the out-of-band flow to get a one-time code for the scopes: `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/calendar.events`.
3. Exchange the code for tokens (returns `refresh_token`):
   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d client_id=$GOOGLE_MEET_CLIENT_ID \
     -d client_secret=$GOOGLE_MEET_CLIENT_SECRET \
     -d code=$CODE \
     -d grant_type=authorization_code \
     -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
   ```
4. The `refresh_token` (not the access token) goes into `GOOGLE_MEET_REFRESH_TOKEN`; the token cache refreshes access tokens automatically at runtime.
5. Alternative: service-account mode with domain-wide delegation — set `GOOGLE_CLIENT_EMAIL` (SA), `GOOGLE_PRIVATE_KEY`, `GOOGLE_IMPERSONATED_USER` (delegated attendee), `GOOGLE_MEET_ENABLED=true`. Without `GOOGLE_IMPERSONATED_USER` events land on the SA's own calendar and never produce a Meet URL (P4.2 guard).
6. Verify the boot probe logs a successful `calendarList.get` before enabling in prod.

## Deploy Secrets (CD webhooks)

The CD workflows (`cd-staging.yml` / `cd-prod.yml`) trigger Coolify deploys via webhook. Since P4 (C3) the trigger **fails loudly** (`curl --fail --max-time 30`, no `|| true`) — if the webhook secret is missing or the request fails, the build goes red instead of silently doing nothing.

**Setup (one-time, user action):**

1. Coolify → your service → **Webhooks** tab → copy the **Deploy webhook** URL.
2. GitHub → repo **Settings → Secrets and variables → Actions**:
   - `COOLIFY_STAGING_WEBHOOK` — staging service webhook URL
   - `COOLIFY_PROD_WEBHOOK` — production service webhook URL
3. Push to `staging` (or `main`) and verify the "Trigger Coolify deploy" step is green.

Until the secrets are set, CD pushes will fail at the trigger step by design (a silent no-op deploy is worse than a red build).

## Test Environment

Tracked template:

```bash
apps/server/.env.test.example
```

Optional local override:

```bash
apps/server/.env.test
```

Default local test ports:

- Web: `3100`
- Server: `3101`
- PostgreSQL: `6767` (test container; shared with dev container — see note above)

## GHCR / Docker Deploy (CD)

The CD workflows (`cd-prod.yml`, `cd-staging.yml`) build both images (`apps/server/Dockerfile`, `apps/web/Dockerfile`) and push to `ghcr.io/cogitoacademy/app/{server,web}`.

If a push fails with `denied: installation not allowed to Create organization package`:

1. **Workflow permission (code, already fixed):** the job must declare `permissions: { contents: read, packages: write }` so the `GITHUB_TOKEN` can write to GHCR.
2. **Org-level (requires an org admin):** the `cogitoacademy` org must allow GitHub Actions to create packages. Either enable it in **Org Settings → Actions → General → Workflow permissions → "Read and write permissions"** (with "Allow GitHub Actions to create and approve pull requests" as needed), or initialize the packages once by pushing any image under `ghcr.io/cogitoacademy/app/{server,web}` with an org member account:
   ```bash
   docker pull oven/bun:1.3.14
   docker tag oven/bun:1.3.14 ghcr.io/cogitoacademy/app/server:init
   docker push ghcr.io/cogitoacademy/app/server:init   # repeat for /web
   ```
   After the packages exist, the workflows push without org changes.
