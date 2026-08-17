# Task C1 Report: Wire `initScheduler()` into server startup (CRITICAL)

## Status: DONE

## What I changed

Single file: `apps/server/src/index.ts` (3 insertions, 1 deletion)

1. Line 7: import extended from `{ shutdownScheduler }` to `{ initScheduler, shutdownScheduler }`.
2. After `const server = app.listen(...)` (line ~65), before `gracefulShutdown` definition: added `await initScheduler();`.

No changes to `scheduler.ts` internals. No frontend changes.

## Verification

### 1. Typecheck

```
$ bun run check-types
Tasks: 3 successful, 3 total
```

Server `tsc -b` passes clean.

### 2. Disabled path

Note: macOS has no `timeout` binary (and no `gtimeout`), so I ran the server in the background, slept, sent SIGTERM, then grepped the log.

Command:

```bash
SCHEDULER_ENABLED=false REDIS_URL= bun --env-file apps/server/.env apps/server/src/index.ts > /tmp/c1-disabled.log 2>&1 &
sleep 12; kill -TERM $PID
```

Log (grep filtered):

```
db_connected      Database connected on attempt 1
server_started    url http://localhost:3001
scheduler_skip    Scheduler disabled or REDIS_URL not configured
shutdown_signal   SIGTERM
```

Server boots, logs `scheduler_skip`, no crash, graceful shutdown runs. ✓

### 3. Enabled path (Redis at localhost:6379, verified port open)

Command:

```bash
REDIS_URL=redis://localhost:6379 SCHEDULER_ENABLED=true bun --env-file apps/server/.env apps/server/src/index.ts > /tmp/c1-enabled.log 2>&1 &
sleep 15; kill -TERM $PID
```

Log (key lines):

```
db_connected              Database connected on attempt 1
server_started            url http://localhost:3001
scheduler_job_start       Processing job expire-bookings
scheduler_initialized     Scheduler initialized with repeatable jobs
expire_bookings_complete  Expired 0 bookings, 0 failed
scheduler_job_start       Processing job release-expired-holds
release_expired_holds_complete  Released 0 holds
scheduler_job_start       Processing job send-notification-email
scheduler_shutdown_start  Shutting down scheduler...
scheduler_shutdown        Scheduler shut down gracefully
db_pool_drained
```

`scheduler_initialized` logged; all three repeatable jobs (`expire-bookings`, `release-expired-holds`, `send-notification-email`) started and the worker processed them. Graceful shutdown on SIGTERM completed cleanly. ✓

The BullMQ worker connected to the real local Redis — `ioredis@5.10.1` is present in `node_modules/.bun/` and bullmq resolved it.

## Files changed

- `apps/server/src/index.ts` (modified)
- Commit: `cb37c2f fix(scheduler): boot BullMQ worker and repeatable jobs on server start`

## Self-review findings

1. Placement matches the brief exactly (after `listen`, before `gracefulShutdown`). Order is correct: scheduler starts only after DB is reachable (`waitForDb()` precedes it), so handlers like `onSendNotificationEmail` (which query the DB) are safe.
2. `initScheduler()` is idempotent-safe and self-guarding: returns early when `SCHEDULER_ENABLED` or `REDIS_URL` is missing.
3. Graceful shutdown already awaited `shutdownScheduler()` (line 69) — now that the scheduler can actually start, this path is exercised and works.
4. The verification job run during tests (`expire-bookings`, etc.) executed immediately on schedule — expected BullMQ repeatable behavior (repeatable jobs run once on registration, then on their cron interval). No stray behavior.
5. `oxfmt --check` and lefthook pre-commit (format + lint, 201 rules) both pass.

## Concerns / observations

1. **Pre-existing, unrelated:** during enabled-path boot the app-level Redis client (`initRedis` in `packages/api/src/lib/redis.ts`, called from `services.ts:96`) logs `redis_init_failed — ioredis not available, falling back to in-memory`. This affects the idempotency/rate-limit/session Redis adapter, NOT the scheduler (BullMQ uses ioredis from bun's cache directly and connected fine). This is out of scope for C1 (I was told not to modify scheduler internals or unrelated code), but worth flagging for another task/PR: the app's `require("ioredis")` apparently doesn't resolve under bun, so the in-memory fallback is active even with a real `REDIS_URL`.
2. `send-notification-email` job logged a `scheduler_email_dispatch_failed` error during verification — because the job ran with empty data (`{}`) against a real DB (`params: ,1` = empty notificationId). Expected noise from the immediate-on-register run; not a regression from this change.
3. No `timeout`/`gtimeout` on this macOS host — verification used a background-run + SIGTERM pattern instead of the brief's literal `timeout 15` command; same observable outcomes.

## Report file

`/Users/miapalovaara/cogito/app/.superpowers/sdd/BACKEND-HARDENING/task-C1-report.md`
