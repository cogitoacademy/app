# Cogito Runbook

Last updated: 2026-08-16

For manual tutor-invite delivery, copy the visible latest link. After reloading the page, use **Generate & copy link** on a pending invitation history entry; this safely rotates the token instead of persisting plaintext secrets.

**Generate & copy link** never sends email. Use the separate **Send again** action when an admin intentionally wants Resend to deliver a replacement link.

## Starting the Server

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

| Variable                 | Required | Description                                         |
| ------------------------ | -------- | --------------------------------------------------- |
| `DATABASE_URL`           | Yes      | PostgreSQL connection string                        |
| `BETTER_AUTH_SECRET`     | Yes      | Auth secret key                                     |
| `BETTER_AUTH_URL`        | Yes      | Base URL for auth cookies                           |
| `CORS_ORIGIN`            | Yes      | Allowed CORS origin                                 |
| `PAYMENT_WEBHOOK_SECRET` | Yes      | Xendit webhook verification token                   |
| `REDIS_URL`              | Yes      | Redis URL (required since #48 — mandatory for boot) |
| `GOOGLE_CLIENT_EMAIL`    | No       | Google service account email                        |
| `GOOGLE_PRIVATE_KEY`     | No       | Google service account private key                  |
| `GOOGLE_CALENDAR_ID`     | No       | Google Calendar ID for meeting creation             |
| `RESEND_API_KEY`         | No       | Resend API key for email delivery                   |
| `RESEND_FROM_EMAIL`      | No       | Sender email address                                |
| `XENDIT_SECRET_KEY`      | No       | Xendit API secret key                               |
| `XENDIT_WEBHOOK_TOKEN`   | No       | Xendit webhook verification token                   |

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
