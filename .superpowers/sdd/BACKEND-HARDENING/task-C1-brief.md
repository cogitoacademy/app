### Task C1: Wire `initScheduler()` into server startup (CRITICAL)

**Files:**

- Modify: `apps/server/src/index.ts`

**Interfaces:**

- Consumes: `initScheduler` from `./scheduler` (already exported, `apps/server/src/scheduler.ts:11`).
- Produces: BullMQ worker + 3 repeatable jobs (`expire-bookings` 5min, `release-expired-holds` 10min, `send-notification-email` 60s) actually start when `SCHEDULER_ENABLED=true`.

- [ ] **Step 1:** Add import and call.

Edit `apps/server/src/index.ts` line 7:

```ts
import { shutdownScheduler } from "./scheduler";
```

→

```ts
import { initScheduler, shutdownScheduler } from "./scheduler";
```

Edit after `const server = app.listen(...)` (line 62–64), before `gracefulShutdown`:

```ts
await initScheduler();
```

- [ ] **Step 2:** Verify types and that the server boots with scheduler disabled.

Run: `bun run check-types`
Run: `SCHEDULER_ENABLED=false REDIS_URL= bun --env-file apps/server/.env apps/server/src/index.ts 2>&1 | grep scheduler_skip` (with timeout) — or rely on CI.
Expected: log `scheduler_skip` (disabled path) and server starts; no crash.

- [ ] **Step 3:** Verify scheduler path with Redis available locally.

Run (with Redis from Task B2):

```bash
REDIS_URL=redis://localhost:6379 SCHEDULER_ENABLED=true timeout 15 bun --env-file apps/server/.env apps/server/src/index.ts 2>&1 | grep scheduler_initialized
```

Expected: `scheduler_initialized` log; graceful shutdown on timeout/SIGINT.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "fix(scheduler): boot BullMQ worker and repeatable jobs on server start"
```

### Task C2: Fix dead payment rate-limit path
