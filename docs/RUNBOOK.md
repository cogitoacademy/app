# Cogito Runbook

Last updated: 2026-07-28

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
bun run db:start         # Starts PostgreSQL on port 6767
```

### Run Migrations

```bash
bun run db:migrate       # Apply pending migrations
bun run db:generate      # Generate new migration from schema changes
```

### Seed the Database

```bash
bun run db:seed          # Seeds mark packages and test data
```

Production guard: `NODE_ENV=production bun run db:seed` will exit with error.

### Reset the Database

```bash
# Stop and remove the Docker container, then recreate:
docker compose down -v
bun run db:start
bun run db:migrate
bun run db:seed
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
# Returns: { "status": "ok", "db": "ok", "redis": "ok" }
```

If Redis is unavailable, the app degrades gracefully:
- Sessions fall back to database lookup
- Rate limiting uses in-memory store
- Circuit breaker state resets on restart
- BullMQ jobs error but app starts

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
- `connection timeout` — Check `DATABASE_URL` in `.env`.

### Redis Connection Errors
- `ECONNREFUSED` — Redis not running. Start Redis or set `REDIS_URL` to empty for in-memory fallback.
- App starts without Redis but with degraded features (see above).

## Rollback a Deployment

1. SSH into the server
2. Find the current deployment: `docker ps | grep cogito`
3. Roll back to previous image:
   ```bash
   docker tag cogito-app:previous cogito-app:rollback
   docker stop cogito-app-container
   docker run -d --name cogito-app-container cogito-app:rollback
   ```
4. Verify health: `curl http://localhost:3001/health`
5. If database migration was part of the deployment, check migration status:
   ```bash
   bun run db:studio  # Check migration table
   ```
6. Roll back migrations if needed (rare — coordinate with DBA)

## Environment Variables

Key environment variables (see `.env.example` for full list):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Auth secret key |
| `BETTER_AUTH_URL` | Yes | Base URL for auth cookies |
| `CORS_ORIGIN` | Yes | Allowed CORS origin |
| `PAYMENT_WEBHOOK_SECRET` | Yes | Xendit webhook verification token |
| `REDIS_URL` | No | Redis URL (falls back to in-memory) |
| `GOOGLE_CLIENT_EMAIL` | No | Google service account email |
| `GOOGLE_PRIVATE_KEY` | No | Google service account private key |
| `GOOGLE_CALENDAR_ID` | No | Google Calendar ID for meeting creation |
| `RESEND_API_KEY` | No | Resend API key for email delivery |
| `RESEND_FROM_EMAIL` | No | Sender email address |
| `XENDIT_SECRET_KEY` | No | Xendit API secret key |
| `XENDIT_WEBHOOK_TOKEN` | No | Xendit webhook verification token |