# OPS-VISIBILITY-WAVE: FAILURES.md + Observability & Ops Fixes — Implementation Plan

> **Status: COMPLETED — merged #179 (2026-09-03), deployed + sha-verified (`/health.version` == `8905ee7`).** All 11 tasks delivered: FAILURES.md, circuit breakers in `/health` (live: `checks.circuitBreakers`), DLQ retention, ops.sh fixes, pre-migrate pruning, vault-triggered infra-apply, Kuma wiring docs, CD `COOLIFY_API_BASE_URL` fix. Note: Task 10's immutable-tag doc sync was adapted — #178 reverted the native-endpoint flow, so docs record the restored PATCH flow with a history note.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every observability and ops gap found in the 2026-09-02 audit — write the full failure/recovery guide (`docs/FAILURES.md`), surface circuit breakers in `/health`, bound pre-migrate snapshots, fix the `ops.sh` DB-name bug, add the vault path to infra-apply, add DLQ queue retention, document the disk-watchdog verification, and sync docs to the immutable-tag deploy flow merged in #175–#177.

**Architecture:** One wave, three workstreams: (A) **code fixes** in `packages/api` + `apps/server` (circuit-breaker health, DLQ retention) with TDD; (B) **ops tooling** in `infra/` + `.github/workflows/` (ops.sh DB name, backup.sh pre-migrate pruning, infra-apply vault path, disk-watchdog verification doc); (C) **documentation** — the comprehensive `docs/FAILURES.md` plus doc corrections (INFRA-PLAYBOOK §1 vault claim, DEPLOYMENT.md §5 stale PATCH-flow text, MONITORING-ALERTING status). The Kuma monitor/Discord wiring is **DONE (operator, 2026-09-02)** — see `docs/KUMA-RUNBOOK.md`; the plan's Task 7 is reduced to a status-sync only.

**Tech Stack:** TypeScript (Bun), Drizzle ORM, BullMQ, Elysia, bash, Ansible, GitHub Actions, Uptime Kuma (SQLite), Cloudflare R2 (S3-compatible).

## Global Constraints

- **Docs follow code (AGENTS.md rule 11):** every behavior change updates `docs/CONTEXT.md`, `docs/RUNBOOK.md`, `docs/INFRA-PLAYBOOK.md`, `docs/plans/README.md` in the same PR.
- **100% coverage gate:** `packages/api` lines, overall lines, overall functions, overall branches must stay 100% (`.github/scripts/coverage-comment.ts`). Every new code path needs tests.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`), one PR per logical change, CI green before merge.
- **Never touch the SOPS vault contents** — only read key names via `sops -d ... | cut -d= -f1` (operator does value edits).
- **Never run destructive commands against prod** (no `dlq-clear`, no `docker image prune`, no `aws s3 rm`) from this wave's code — those are operator actions documented in FAILURES.md.
- **Kuma monitors/notifications are NOT API-expressible** — they live in Kuma's SQLite DB (`/var/lib/docker/volumes/*uptime-kuma-data*/_data/kuma.db`). The plan documents the UI steps; the operator executes them.
- **The production DB name is `postgres`, not `cogito`** (verified live 2026-09-02: `FATAL: database "cogito" does not exist`).
- **`/health` `dlqDepth` is age-aware** (24h window, `DLQ_FRESH_WINDOW_HOURS` override) — stale ledger entries never count; the raw list is bounded at 100 with no TTL.
- **Circuit breaker Redis keys:** `cogito:cb:{name}` (HSET state/failureCount/lastFailureTime/halfOpenAttempts, TTL 2× resetTimeout). Names: `resend`, `google_meet`, `xendit` (verify exact names in code before hardcoding).
- **`RedisClient` interface** (`packages/api/src/lib/redis.ts:3`): `hgetall(key): Promise<Record<string,string>>`, `eval(script, keys, args)`, `ping()`, `del()`, `exists()`. `InMemoryRedis` is the test double.
- **BullMQ `JOB_RETENTION`** (`packages/api/src/modules/scheduler/scheduler.service.ts:9`): `{ removeOnComplete: { age: 86400, count: 100 }, removeOnFail: { age: 604800, count: 50 } }`.
- **`infra-apply.yml` paths filter** currently: `infra/terraform/**`, `infra/ansible/**`, `infra/disk-watchdog.sh`, `.github/workflows/infra-apply.yml` — **`infra/secrets/**` is missing** (vault-only merges trigger nothing; INFRA-PLAYBOOK §1 claims they do).
- **Immutable-tag deploy (merged #175–#177, 2026-09-02):** `scripts/migrate-and-deploy.sh` now deploys via Coolify's native image endpoint — `POST /api/v1/applications/<uuid>/rollback` with `{"commit":"v<GIT_SHA>"}` (deploy-only access, no PATCH of application config). The CD job pulls `server:v<GIT_SHA>` onto the VPS runner first (`docker pull` + GHCR login with `packages: read`). Rollback uses the same endpoint with `v<PREV_GIT_SHA>`. `resolve_app_uuid()` reads `COOLIFY_APP_UUID` or the webhook's `uuid` query param. Fallback: `force=true` webhook when token/UUID unavailable. **Docs still stale:** `docs/DEPLOYMENT.md:341` describes the old PATCH flow; `docs/INFRA-PLAYBOOK.md` DR-1 says "repointed the tag" (now "queued native rollback"); `docs/RUNBOOK.md:1381-1388` is current (updated in #175–#177).
- **`ops.sh` SSH defaults:** `OPS_VPS=100.124.43.19`, `OPS_SSH_KEY=~/.ssh/cogito_vps`, `OPS_SSH_USER=ubuntu`; container names resolved live by prefix grep.
- **Kuma monitor #1 config (live, 2026-09-02):** `api-health`, HTTP GET `https://api.cogitoacademy.id/health`, interval 60s, `accepted_statuscodes_json='["200-299"]'`, `maxretries=0`, `retry_interval=60`, `timeout=48.0`, `keyword=''` (empty — the `"status":"ok"` keyword was never set), `expiry_notification=0`, `domain_expiry_notification=0`. Notification #1 `COGITO ALERT` (discord) exists but `monitor_notification` is **empty** — no monitor is attached to it.
- **Kuma 503-flap root cause (verified live):** 10 down heartbeats at 09:01–12:05 UTC correlate 1:1 with CD deploys (09:05, 09:08, 09:11, 09:17, 09:23, 09:28, 10:09, 12:01 UTC — `gh run list`). The API container restarts during deploy; `/health` returns 503 while the new image boots (health poll in `migrate-and-deploy.sh` allows up to 20×15s). `maxretries=0` means the first 503 is recorded as DOWN. The monitor is **not** flapping randomly — it is correctly detecting deploy restarts. Fix: `maxretries=2` + `retry_interval=60` (accepts a 503 if the next retry succeeds) and/or `retry_only_on_status_code_failure=1`.
- **Discord-not-hitting root cause (verified live):** the `COGITO ALERT` Discord notification exists in Kuma's DB but `monitor_notification` is empty — no monitor is attached to it, so nothing ever posts. The `DISCORD_WEBHOOK_URL` in `/etc/cogito/disk.env` is for the **disk watchdog** (different path, works independently). Fix: attach notification #1 to each monitor in the Kuma UI (or create monitors with the notification attached).

---

## File Structure

| File                                                      | Action     | Responsibility                                                                        |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `docs/FAILURES.md`                                        | **Create** | The comprehensive failure → detection → recovery guide (the deliverable of this wave) |
| `packages/api/src/lib/db-health.ts`                       | Modify     | Add `checkCircuitBreakers()` + include in `healthCheck()` response                    |
| `packages/api/src/tests/unit/db-health.test.ts`           | Modify     | Tests for the new breaker check                                                       |
| `packages/api/src/modules/scheduler/scheduler.service.ts` | Modify     | Add `JOB_RETENTION` to the DLQ queue options                                          |
| `packages/api/src/tests/unit/scheduler.service.test.ts`   | Modify     | Test DLQ queue retention                                                              |
| `infra/ops.sh`                                            | Modify     | Fix `db` default DB name (`cogito` → `postgres`), add `cb` command                    |
| `infra/backup.sh`                                         | Modify     | Add pre-migrate snapshot pruning (keep latest N)                                      |
| `.github/workflows/infra-apply.yml`                       | Modify     | Add `infra/secrets/**` to the paths filter                                            |
| `docs/INFRA-PLAYBOOK.md`                                  | Modify     | Correct §1 vault-apply claim; add Kuma §3b retry guidance                             |
| `docs/RUNBOOK.md`                                         | Modify     | Monitoring section: Kuma retry config, Discord attach, breaker checks                 |
| `docs/CONTEXT.md`                                         | Modify     | Deployment-wave state: this wave's changes                                            |
| `docs/plans/README.md`                                    | Modify     | Add this plan row                                                                     |
| `docs/plans/active/MONITORING-ALERTING.md`                | Modify     | Status log: Kuma wired, flap root cause, Discord attached                             |

---

### Task 1: `docs/FAILURES.md` — the complete failure & recovery guide

**Files:**

- Create: `docs/FAILURES.md`

**Interfaces:**

- Consumes: nothing (pure documentation)
- Produces: the canonical reference every later task's docs link to

- [ ] **Step 1: Write the guide skeleton with the detection matrix**

Create `docs/FAILURES.md` with this structure (content must be concrete — every failure class gets: **How you detect it** (log action, /health field, Kuma monitor, ops.sh command), **What it means**, **Recovery steps** (exact commands), **Verification**):

```markdown
# Cogito Failure & Recovery Guide

> Written 2026-09-02 from live code + VPS state. Companion to
> `docs/RUNBOOK.md` (procedures), `docs/INFRA-PLAYBOOK.md` (scenario →
> command), `docs/plans/active/DEPLOYMENT-PLAN.md` (DR). Every failure class
> below follows one pattern: **retry with backoff → dead-letter → surface →
> alert → operator recovery**. If a failure is not listed here, it is a gap —
> file it in `docs/plans/active/`.

## 0. The universal error-handling pattern (read this first)

1. **Retry** — BullMQ jobs: 3 attempts, exponential backoff 1s/2s/4s. Email
   outbox: 3 attempts + stale-`sending` reclaim (10 min). Meeting creation:
   3 attempts per booking. Webhooks: 5xx retry, 4xx dead-letter.
2. **Dead-letter** — attempts exhausted → `cogito-jobs-dlq` queue → DLQ worker
   logs `scheduler_dlq_job` (error) → bounded Redis list `cogito:dlq` (max
   100, stamped `failedAt`).
3. **Surface** — `/health` `checks.{database,redis,scheduler,dlq}` +
   `dlqDepth` (age-aware 24h); structured logs with named `action`s.
4. **Alert** — Uptime Kuma monitors → Discord (wired 2026-09-02); disk
   watchdog → Discord (≥85% warn, ≥92% prune).
5. **Recover** — the per-failure sections below.

## 1. Code-level failures

### 1.1 Domain errors (expected business failures)

- Detect: 4xx response, `ORPCError`/`DomainError` mapping in handler
- Meaning: validation/business-rule rejection — NOT an incident
- Recovery: none (by design); check the client shows the mapped message

### 1.2 Unexpected 500s

- Detect: `./infra/ops.sh logs | grep '"level":"error"'`; Kuma `api-health`
- Meaning: programmer defect or unhandled dependency failure
- Recovery: read the stack in the logs → fix → deploy (CD) → verify
  `/health` version == new sha

### 1.3 Idempotency collisions / optimistic-lock conflicts

- Detect: 409/conflict responses; `IdempotencyStore` 24h TTL keys
  (`cogito:idem:*`)
- Meaning: duplicate request or concurrent admin edit
- Recovery: none needed — the guard is the correct behavior; retry the
  request with a fresh key

### 1.4 Rate-limit hits

- Detect: 429; `cogito:rl:*` keys
- Meaning: abuse or client bug
- Recovery: wait for the window; check the client isn't looping

### 1.5 Webhook failures (Xendit)

- Detect: `./infra/ops.sh logs | grep webhook`; 4xx dead-letter rows
- Meaning: signature/IP/timestamp rejection (4xx, permanent) or provider
  retry (5xx)
- Recovery: 4xx → verify `XENDIT_WEBHOOK_TOKEN` + `WEBHOOK_ALLOWED_IPS` in
  the vault; 5xx → transient, Xendit retries

### 1.6 Outbox stuck rows

- Detect: `send_notification_email_complete` log shows `failed > 0`; rows
  stuck in `notification_dispatch` status `sending` > 10 min
- Meaning: provider down or DB error
- Recovery: the reclaim query re-claims stale `sending` rows (attempts < 3);
  if attempts exhausted, the row stays `failed` — inspect
  `./infra/ops.sh db "SELECT id, status, attempts, last_error FROM notification_dispatch WHERE status='failed'"` (use `OPS_DB_NAME=postgres`)

## 2. Scheduler failures

### 2.1 Job failed (transient)

- Detect: `scheduler_job_failed` log; BullMQ retries
- Meaning: transient error — the job retries 3× with backoff, and the
  repeatable scheduler re-fires on the next tick regardless
- Recovery: none — verify the next `scheduler_job_completed` log

### 2.2 Job in the DLQ (permanent)

- Detect: `./infra/ops.sh dlq` (parsed entries); `/health` `dlqDepth > 0`
  (fresh only)
- Meaning: attempts exhausted. The DLQ is a **ledger, not a retry queue** —
  the next tick re-fires the job fresh
- Recovery: `./infra/ops.sh dlq` → read `failedReason` → fix root cause
  (code bug / dead dependency) → deploy → `./infra/ops.sh dlq-clear`
- Verification: `/health` `dlqDepth == 0` after the window

### 2.3 Scheduler silently dead

- Detect: `/health` `checks.scheduler` != `ok`; boot aborts when
  `SCHEDULER_ENABLED=true` + Redis unreachable (fail-loud)
- Meaning: booking expiry/hold-release/email/SLA jobs not running
- Recovery: check Redis (`./infra/ops.sh redis PING`); if Redis is up and
  the check still fails, restart the API container (Coolify UI → cogito-api
  → Restart)

### 2.4 Stale DLQ ledger (noise, not an alert)

- Detect: `./infra/ops.sh dlq` shows old entries; `dlqDepth` is 0
- Meaning: pre-`failedAt` entries (pre-2026-08-31) never count toward the
  alert
- Recovery: `./infra/ops.sh dlq-clear` (safe — ledger only)

## 3. Dependency failures

### 3.1 Circuit breaker open (Resend / Google Meet / Xendit)

- Detect: `./infra/ops.sh logs | grep circuit_breaker_state_change` (state
  `open` = error level); `./infra/ops.sh cb` (new command, Task 4);
  `/health` `checks.circuitBreakers` (Task 2)
- Meaning: provider failing repeatedly (thresholds: Resend 3, Meet 5,
  Xendit 5; resets: 120s/60s/30s; half-open probe: 1 attempt)
- Recovery: it self-heals after the reset timeout (half-open probe). If it
  stays open: check provider status/credentials → fix → the breaker closes
  on the next successful call. Force-close (only after fixing the root
  cause): `./infra/ops.sh redis DEL cogito:cb:resend`
- Verification: `./infra/ops.sh cb` shows `closed`

### 3.2 Resend down

- Detect: breaker open; `send_notification_email_complete` `failed > 0`
- Meaning: emails queue in the outbox (no data loss)
- Recovery: wait for Resend status; emails drain on the next 60s tick

### 3.3 Google Meet down / token expired

- Detect: breaker open; `retry_failed_meetings_complete` `failed > 0`;
  bookings stuck `confirmed` with meeting retry
- Meaning: automatic Meet creation failing; manual-link fallback available
- Recovery: refresh the OAuth token (`docs/GOOGLE-MEET-SETUP.md`); or
  tutors/admins enter manual links; `retry-failed-meetings` re-tries every
  5 min (3 attempts per booking)

### 3.4 Xendit down

- Detect: breaker open; payment webhooks failing
- Meaning: purchases fail loudly (no silent stub)
- Recovery: check Xendit status; verify `XENDIT_MODE` + keys; webhook
  idempotency (120s claim + 24h processed record) prevents double-credit

### 3.5 R2 down

- Detect: upload failures; backup log errors
- Meaning: uploads fail; backups fail (nightly cron logs to
  `/var/log/cogito-backup.log`)
- Recovery: check Cloudflare status; re-run `./infra/ops.sh backup` after
  recovery

### 3.6 Sanity down

- Detect: content proxy 502s (host allowlist + 10s timeout + 5MB cap)
- Meaning: calendar/Knowledge Bank content unavailable
- Recovery: none needed — read-only CDN; retry on next request

## 4. Infra failures

### 4.1 Disk full (the 2026-08-31 incident class)

- Detect: `./infra/ops.sh disk`; Discord warn ≥85% / CRITICAL ≥92% after
  auto-prune; Redis `MISCONF stop-writes-on-bgsave-error`; failed image
  extraction
- Meaning: dangling Docker images in `/var/lib/containerd` (31G of 38G on
  2026-09-02)
- Recovery ladder (watchdog does this automatically at ≥92%):
  1. `docker image prune -f` (dangling only)
  2. `docker image prune -af --filter until=48h` (unused > 48h; never
     volumes/active/postgres data; rollback images kept via
     `rollback-keep-*` tags)
  3. re-check `df -h /`; still ≥92% → Discord CRITICAL → operator:
     `./infra/ops.sh disk` → inspect `/var/log/cogito-disk-gc.log` →
     manual `sudo docker image prune -af` → consider
     `sudo journalctl --vacuum-time=7d` if logs contribute
- Verification: `df -h /` below 85%

### 4.2 Redis down / MISCONF

- Detect: `/health` `checks.redis`/`checks.scheduler` = `error` (503);
  `./infra/ops.sh redis PING`
- Meaning: idempotency/rate-limit/circuit-breaker/BullMQ all degraded;
  in-memory fallbacks engage (per-process, defensive)
- Recovery: `sudo docker restart qyzco4bhefhtet1luvpfwsnx` (Coolify UI →
  cogito-prod-redis → Restart); verify `/health` back to 200

### 4.3 Postgres down

- Detect: `/health` `checks.database` = `error` (503); API 500s on queries
- Meaning: everything data-backed fails
- Recovery: Coolify UI → cogito-prod-db → Restart; verify `/health`; if
  data corruption → DR-2 (restore from R2 backup — see §6)

### 4.4 Cert expiry

- Detect: Kuma `api-cert`/`app-cert` monitors (once wired); browser warnings
- Meaning: Let's Encrypt renewal failed (Traefik auto-renews)
- Recovery: check Traefik logs; force renewal via Coolify UI → domain
  settings; verify with `curl -vI https://api.cogitoacademy.id 2>&1 | grep -i expire`

### 4.5 Tailnet/SSH lockout

- Detect: `ssh -i ~/.ssh/cogito_vps ubuntu@100.124.43.19` fails
- Meaning: tailscale down on the VPS, or UFW misconfig
- Recovery: OVH console (out-of-band) → `sudo tailscale up` /
  `sudo ufw status`; the tailnet ACL (`infra/tailscale/acl.hujson`) is the
  declarative source

### 4.6 Coolify/Traefik down

- Detect: all domains fail; `status.cogitoacademy.id` down
- Meaning: the proxy or Coolify itself is down
- Recovery: `sudo docker ps` on the VPS → restart `coolify-proxy` /
  `coolify` containers; verify `curl -sI https://api.cogitoacademy.id`

## 5. Deployment failures

### 5.1 CD red at build/push

- Detect: `gh run watch $(gh run list --workflow cd-prod.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
- Meaning: image build or GHCR push failed
- Recovery: fix the code → push again; no prod impact (nothing deployed)

### 5.2 CD red at backup/migrate

- Detect: CD log shows the failing step; `PROD_DATABASE_URL is unset` error
- Meaning: snapshot or migration failed — **deploy did not happen**
- Recovery: fix the cause (secret missing → add GitHub secret; migration
  broken → fix in a new commit) → re-run `./infra/ops.sh deploy-retry`
  (safe: snapshot/migrate/deploy are idempotent)

### 5.3 CD red at health poll (deploy verification failed)

- Detect: CD log "deployed image did not report version == <sha>"
- Meaning: the new image is not serving within 20×15s
- Recovery: the script already attempted best-effort auto-rollback
  (PATCH `docker_registry_image_tag` to `v<PREV_GIT_SHA>` + redeploy).
  Verify: `curl -s https://api.cogitoacademy.id/health | jq -r .version`
  == the old sha. If not rolled back: Coolify UI → cogito-api → Rollback to
  previous release. DB is NEVER auto-restored — the pre-migrate snapshot
  (`s3://cogito-backups/pre-migrate-<sha>.sql.gz`) is the recovery artifact
  for DR-2 only

### 5.4 Web deploy broken (no version marker)

- Detect: CD `--poll-web` timeout (HTTP 200 poll, 20×15s)
- Meaning: the static nginx image is broken or wrong-origin
- Recovery: manual rollback — Coolify UI → cogito-web → Rollback to
  previous release (or point at `ghcr.io/cogitoacademy/app/web:v<PREV_GIT_SHA>`)

### 5.5 Migration broke at deploy time

- Detect: CD exits before deploy; migration error in the log
- Meaning: schema change failed against prod
- Recovery: **never auto-restore with live traffic** — take a maintenance
  window → DR-2 (restore the pre-migrate snapshot into scratch → verify
  counts → restore into prod)

## 6. Disaster recovery (DR)

### DR-1 Bad deploy / app down

- Detect: `/health` 503 or wrong version; Kuma `api-health` down
- Recovery: Coolify UI → Rollback to previous release; verify
  `/health.version` == old sha. Code-only rollback — DB unchanged

### DR-2 Bad migration / DB corruption

- Detect: data anomalies; migration failure
- Recovery:
  1. `./infra/ops.sh backup` (current state first)
  2. Restore target: newest `cogito-backups/backups/YYYY-MM-DD.sql.gz`
     (nightly) or `pre-migrate-<sha>.sql.gz` (CD snapshot)
  3. `ssh ubuntu@100.124.43.19` → `aws s3 cp s3://cogito-backups/... .`
     (creds in `/etc/cogito/backup.env`)
  4. Restore into scratch → verify counts → maintenance window → restore
     into prod
- Verification: row counts match the pre-restore audit; `/health` 200

### DR-3 VPS unreachable

- Detect: SSH fails; all domains down
- Recovery: OVH console → reboot → if disk full: `./infra/ops.sh disk`
  (watchdog auto-prunes ≥92%). If the box is lost: rebuild = Terraform
  bootstrap (`infra/provision.sh`) + `./infra/apply.sh all` + restore the
  latest backup. RPO = 24h (nightly) + pre-migrate snapshots; RTO ≈ 1–2h

### DR-4 Secrets compromised

- Detect: suspicion of exposure (log leak, repo leak)
- Recovery: rotate at the provider → `sops set` each key →
  `./infra/apply.sh resources` → re-run affected playbooks. The Age key is
  NOT rotatable in place — new key = `sops updatekeys` re-encrypt

## 7. Detection matrix (one-glance)

| Failure        | Log action / field             | Kuma monitor            | ops.sh command       |
| -------------- | ------------------------------ | ----------------------- | -------------------- |
| 500s           | `"level":"error"`              | api-health              | `logs \| grep error` |
| DLQ fresh      | `scheduler_dlq_job`            | dlq-depth               | `dlq`                |
| Breaker open   | `circuit_breaker_state_change` | — (Task 2 adds /health) | `cb`                 |
| Disk ≥85%      | watchdog log                   | —                       | `disk`               |
| Backup failed  | `/var/log/cogito-backup.log`   | —                       | `backup`             |
| API down       | —                              | api-health              | `health`             |
| Cert expiring  | —                              | api-cert/app-cert       | `curl -vI`           |
| Scheduler dead | `checks.scheduler`             | api-health (503)        | `health`             |
| Redis down     | `checks.redis`                 | api-health (503)        | `redis PING`         |
| Postgres down  | `checks.database`              | api-health (503)        | `db "SELECT 1"`      |

## 8. The daily operator rhythm

1. Morning: check Discord (alerts), `./infra/ops.sh status`, verify
   `/var/log/cogito-backup.log` has a fresh success line, `df -h /` < 85%.
2. After any deploy: `curl -s https://api.cogitoacademy.id/health | jq -r .version`
   == the merged sha.
3. Weekly: `./infra/ops.sh dlq` — clear stale entries; spot-check
   `./infra/ops.sh logs | grep -E '"(error|warn)"'`.
4. Monthly: verify a backup restore drill (DR-2) — a backup that has never
   been restored is an assumption.
```

- [ ] **Step 2: Verify the guide's commands against the live system**

Run (read-only):

```bash
./infra/ops.sh health
./infra/ops.sh dlq | head -12
./infra/ops.sh logs | grep -c circuit_breaker_state_change
```

Expected: commands work; note any output that contradicts the guide and fix the guide (the guide must match reality — it is the operator's source of truth).

- [ ] **Step 3: Commit**

```bash
git add docs/FAILURES.md
git commit -m "docs: add comprehensive failure and recovery guide (FAILURES.md)"
```

---

### Task 2: Surface circuit breakers in `/health`

**Files:**

- Modify: `packages/api/src/lib/db-health.ts`
- Test: `packages/api/src/tests/unit/db-health.test.ts`

**Interfaces:**

- Consumes: `RedisClient` (`hgetall`, `eval`), existing `healthCheck(redis, db)` shape
- Produces: `checkCircuitBreakers(redis?): Promise<Record<string, "closed"|"open"|"half-open">>` and a new `checks.circuitBreakers` field in the `/health` response (informational — never flips overall status, mirroring `dlq`)

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/tests/unit/db-health.test.ts`:

```ts
import { checkCircuitBreakers } from "../../lib/db-health";

describe("checkCircuitBreakers", () => {
  it("reports closed when no breaker keys exist", async () => {
    const redis = new InMemoryRedis();
    const result = await checkCircuitBreakers(redis);
    expect(result).toEqual({});
  });

  it("reports open/half-open/closed states from cogito:cb:* keys", async () => {
    const redis = new InMemoryRedis();
    await redis.hset(
      "cogito:cb:resend",
      ["state", "open"],
      ["failureCount", "5"],
    );
    await redis.hset(
      "cogito:cb:google_meet",
      ["state", "half-open"],
      ["failureCount", "5"],
    );
    await redis.hset(
      "cogito:cb:xendit",
      ["state", "closed"],
      ["failureCount", "0"],
    );
    const result = await checkCircuitBreakers(redis);
    expect(result).toEqual({
      resend: "open",
      google_meet: "half-open",
      xendit: "closed",
    });
  });

  it("returns {} when redis is unavailable", async () => {
    const result = await checkCircuitBreakers(undefined);
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/api/src/tests/unit/db-health.test.ts`
Expected: FAIL — `checkCircuitBreakers` is not exported.

- [ ] **Step 3: Implement `checkCircuitBreakers`**

In `packages/api/src/lib/db-health.ts`, add:

```ts
/**
 * Reports the state of every Redis-backed circuit breaker (Resend, Google
 * Meet, Xendit). Reads the `cogito:cb:*` HSET keys; a missing key means the
 * breaker has never tripped (closed). Informational only — never flips the
 * overall health status (mirrors `dlq`): an open breaker means the app is
 * deliberately failing fast, not that the instance cannot serve.
 */
export async function checkCircuitBreakers(
  redis?: RedisClient,
): Promise<Record<string, "closed" | "open" | "half-open">> {
  if (!redis) return {};
  try {
    const keys = await redis.keys("cogito:cb:*");
    const result: Record<string, "closed" | "open" | "half-open"> = {};
    for (const key of keys) {
      const name = key.replace(/^cogito:cb:/, "");
      const state = (await redis.hget(key, "state")) ?? "closed";
      if (state === "open" || state === "half-open" || state === "closed") {
        result[name] = state;
      }
    }
    return result;
  } catch {
    return {};
  }
}
```

> **Note:** if `RedisClient` lacks a `keys(pattern)` method, add it to the
> interface (`packages/api/src/lib/redis.ts:3`) and to both implementations
> (real client wraps `client.keys`, `InMemoryRedis` scans its Map). Check
> the existing interface first — the plan's Task 4 `ops.sh cb` uses
> `redis-cli --scan` on the VPS, which is independent of this.

- [ ] **Step 4: Wire into `healthCheck`**

In `healthCheck`, after the `dlq` block, add:

```ts
const circuitBreakers = await checkCircuitBreakers(redis);
```

and include it in the returned object:

```ts
return {
  status: overall,
  checks: { ...checks, dlq: dlqStatus, circuitBreakers },
  dlqDepth,
  timestamp: new Date().toISOString(),
};
```

`circuitBreakers` must NOT participate in the `readiness` computation (it is informational, like `dlq`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/api/src/tests/unit/db-health.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 6: Run the full coverage gate**

Run: `bun run test:coverage`
Expected: 100% lines/functions/branches for `packages/api` (the new function is fully covered by the three tests; the `catch` path is covered by the `undefined` test only if the code path is reachable — if the coverage gate flags the `catch`, add a test that makes `hgetall` throw, e.g. a stub redis whose `keys` rejects).

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/lib/db-health.ts packages/api/src/tests/unit/db-health.test.ts
git commit -m "feat: surface circuit breaker states in /health"
```

---

### Task 3: Bound the DLQ queue's job retention

**Files:**

- Modify: `packages/api/src/modules/scheduler/scheduler.service.ts`
- Test: `packages/api/src/tests/unit/scheduler.service.test.ts`

**Interfaces:**

- Consumes: `JOB_RETENTION` (already exported from the same file)
- Produces: DLQ queue created with `defaultJobOptions: JOB_RETENTION`

- [ ] **Step 1: Write the failing test**

In `packages/api/src/tests/unit/scheduler.service.test.ts`, add a test that asserts the DLQ queue is created with the retention defaults. If the test file mocks `bullmq`, assert on the `Queue` constructor call for `cogito-jobs-dlq`:

```ts
it("creates the DLQ queue with bounded job retention", () => {
  // The Queue constructor for "cogito-jobs-dlq" must receive
  // defaultJobOptions: JOB_RETENTION (removeOnComplete 24h/100,
  // removeOnFail 7d/50) so permanent-failure records cannot accumulate
  // unbounded in Redis.
  const dlqCall = queueMock.mock.calls.find(
    ([name]) => name === "cogito-jobs-dlq",
  );
  expect(dlqCall).toBeDefined();
  expect(dlqCall![1].defaultJobOptions).toEqual(JOB_RETENTION);
});
```

(Adapt to the file's existing mock style — read the test file first.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/api/src/tests/unit/scheduler.service.test.ts`
Expected: FAIL — the DLQ queue is created without `defaultJobOptions`.

- [ ] **Step 3: Implement**

In `createSchedulerService`, change the DLQ queue creation:

```ts
const dlqQueue = new Queue(DLQ_QUEUE_NAME, {
  connection,
  defaultJobOptions: JOB_RETENTION,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/api/src/tests/unit/scheduler.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the coverage gate**

Run: `bun run test:coverage`
Expected: 100% (no new uncovered branches — the change is a constructor option).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/modules/scheduler/scheduler.service.ts packages/api/src/tests/unit/scheduler.service.test.ts
git commit -m "fix: bound DLQ queue job retention in Redis"
```

---

### Task 4: Fix `ops.sh` DB name + add `cb` command

**Files:**

- Modify: `infra/ops.sh`

**Interfaces:**

- Consumes: existing SSH/container-resolution helpers
- Produces: `./infra/ops.sh db` works out of the box; `./infra/ops.sh cb` prints breaker states

- [ ] **Step 1: Fix the default DB name**

In `infra/ops.sh`, change:

```bash
dbname="${OPS_DB_NAME:-cogito}"
```

to:

```bash
dbname="${OPS_DB_NAME:-postgres}"
```

(Verified live: the production database is `postgres`; `cogito` does not exist. `OPS_DB_NAME` remains the override.)

- [ ] **Step 2: Add the `cb` command**

Add a function (mirroring the `dlq` function's style — resolve the redis container + password on the VPS, never echo the password):

```bash
cb() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  echo "=== circuit breaker states (cogito:cb:*) ==="
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" --scan --pattern 'cogito:cb:*' 2>/dev/null | while read -r k; do echo \"\$k: \$(sudo -n docker exec $rc redis-cli -a \"$pass\" HGET \"\$k\" state 2>/dev/null)\"; done"
  echo "(no keys = all breakers closed/never tripped)"
}
```

Add `cb) cb ;;` to the `case` dispatch and a usage line in the header comment.

- [ ] **Step 3: Verify against the live VPS**

Run:

```bash
./infra/ops.sh db "SELECT 1"
./infra/ops.sh cb
```

Expected: `SELECT 1` succeeds (no `database "cogito" does not exist`); `cb` prints breaker states or the no-keys message.

- [ ] **Step 4: Commit**

```bash
git add infra/ops.sh
git commit -m "fix: correct ops.sh db default and add circuit breaker inspection"
```

---

### Task 5: Bound pre-migrate snapshots in `backup.sh`

**Files:**

- Modify: `infra/backup.sh`

**Interfaces:**

- Consumes: existing R2 env vars (`R2_BACKUP_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), `RETENTION_DAYS`
- Produces: new `PRE_MIGRATE_KEEP` env (default 7) — the nightly cron prunes `pre-migrate-*.sql.gz` objects beyond the newest N

- [ ] **Step 1: Add the keep-count variable and prune step**

In `infra/backup.sh`:

1. After `RETENTION_DAYS="${RETENTION_DAYS:-30}"` add:

   ```bash
   # Keep only the newest N CD pre-migrate snapshots (pre-migrate-<sha>.sql.gz).
   # These are uploaded by scripts/migrate-and-deploy.sh on every deploy and
   # were previously never pruned (50+ accumulated). The nightly backup cron
   # prunes them alongside the daily dumps.
   PRE_MIGRATE_KEEP="${PRE_MIGRATE_KEEP:-7}"
   ```

2. In the `--dry-run` block, add the prune command print:

   ```bash
   echo "# 4. Prune pre-migrate snapshots, keeping the newest ${PRE_MIGRATE_KEEP}"
   echo "aws s3 ls 's3://${R2_BACKUP_BUCKET}/' --endpoint-url '${R2_ENDPOINT}' --region auto"
   echo "for each pre-migrate-*.sql.gz beyond the newest ${PRE_MIGRATE_KEEP}:"
   echo "  aws s3 rm 's3://${R2_BACKUP_BUCKET}/<key>' --endpoint-url '${R2_ENDPOINT}' --region auto"
   ```

3. After the existing prune loop (step 3), add:
   ```bash
   echo "==> Pruning pre-migrate snapshots, keeping the newest ${PRE_MIGRATE_KEEP}"
   pruned_pm=0
   while IFS= read -r line; do
     key="$(awk '{print $4}' <<<"${line}")"
   done < <(eval "aws s3 ls 's3://${R2_BACKUP_BUCKET}/' --endpoint-url '${R2_ENDPOINT}' --region auto" | grep -E 'pre-migrate-[0-9a-f]{40}\.sql\.gz$' | sort -k1,2 | head -n -${PRE_MIGRATE_KEEP})
   ```
   > **Implementation note:** the exact loop must (a) list the bucket root, (b) filter `pre-migrate-<40-hex>.sql.gz`, (c) sort by date, (d) delete everything except the newest `PRE_MIGRATE_KEEP`. Write it in the same style as the existing prune loop (which uses `aws s3 ls` + `awk '{print $4}'` + `aws s3 rm`). Verify with `--dry-run` first.

- [ ] **Step 2: Dry-run verify**

Run: `./infra/backup.sh --dry-run` (locally — no credentials needed)
Expected: prints the new step-4 commands with `PRE_MIGRATE_KEEP=7`.

- [ ] **Step 3: Update the header comment**

Update the script header to document `PRE_MIGRATE_KEEP` (default 7) and the new prune step.

- [ ] **Step 4: Commit**

```bash
git add infra/backup.sh
git commit -m "fix: prune CD pre-migrate snapshots beyond the newest 7"
```

---

### Task 6: Add `infra/secrets/**` to the infra-apply paths filter

**Files:**

- Modify: `.github/workflows/infra-apply.yml`

**Interfaces:**

- Consumes: the existing `dorny/paths-filter` block
- Produces: vault-only merges trigger the Ansible job (env re-apply), matching INFRA-PLAYBOOK §1's claim

- [ ] **Step 1: Add the path**

In the `detect` job's `paths-filter` filters, add a `vault` entry and include it in `any`:

```yaml
vault:
  - "infra/secrets/**"
any:
  - "infra/ansible/coolify-resources.yml"
  - "infra/ansible/backup-cron.yml"
  - "infra/ansible/disk-watchdog.yml"
  - "infra/disk-watchdog.sh"
  - "infra/ansible/uptime-kuma.yml"
  - "infra/secrets/**"
```

- [ ] **Step 2: Add the apply step**

In the `ansible` job, after the `Apply — coolify-resources` step, add:

```yaml
- name: Apply — coolify-resources (vault/env change)
  if: github.event_name == 'workflow_dispatch' || needs.detect.outputs.vault == 'true'
  run: |
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/coolify-resources.yml \
      -e coolify_api_url="http://127.0.0.1:8000/api/v1"
```

> **Note:** `coolify-resources.yml` is the playbook that pushes env vars to the Coolify API — a vault change must re-run it. If the vault also feeds `backup-cron`/`disk-watchdog` env files, those playbooks already run on their own file changes; a vault-only change should re-run them too — add the same `vault` condition to those steps (the playbooks are idempotent and filter the vault to the keys they need).

- [ ] **Step 3: Verify the workflow parses**

Run: `bunx yaml-lint .github/workflows/infra-apply.yml` (or `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/infra-apply.yml'))"`)
Expected: parses without error.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/infra-apply.yml
git commit -m "fix: trigger infra-apply on vault changes (infra/secrets/**)"
```

---

### Task 7: Kuma status sync (operator wiring DONE 2026-09-02)

> **Status: the operator completed the Kuma UI pass on 2026-09-02 using
> `docs/KUMA-RUNBOOK.md`** (monitors configured with retries + keyword +
> Discord attached; kill-container drill optional). This task is now a
> **docs status sync only** — no operator steps remain.

**Files:**

- Create: `docs/KUMA-RUNBOOK.md` (the click-by-click operator runbook — **already written 2026-09-02**, verify it matches the live state)
- Modify: `docs/INFRA-PLAYBOOK.md` (§3b — link the runbook, add retry guidance + Discord attach)
- Modify: `docs/RUNBOOK.md` (monitoring section)
- Modify: `docs/plans/active/MONITORING-ALERTING.md` (status log)

**Interfaces:**

- Consumes: the live Kuma DB facts (monitor #1 config, notification #1 exists, `monitor_notification` empty — **now fixed**)
- Produces: docs that record the wiring as done, with the root causes preserved for future operators

- [ ] **Step 1: Verify the live Kuma state matches the runbook**

Read-only check (the operator's pass should have produced these):

```bash
# From the VPS: confirm monitors exist and the notification is attached
sudo -n cp /var/lib/docker/volumes/*uptime-kuma-data*/_data/kuma.db /tmp/kuma.db && sudo -n chmod 644 /tmp/kuma.db
python3 -c "
import sqlite3
db = sqlite3.connect('/tmp/kuma.db')
print('monitors:', [r[1] for r in db.execute('SELECT id, name FROM monitor')])
print('notifications:', [r[1] for r in db.execute('SELECT id, name FROM notification')])
print('attachments:', list(db.execute('SELECT * FROM monitor_notification')))
print('api-health retries:', db.execute('SELECT maxretries, retry_interval, keyword FROM monitor WHERE id=1').fetchone())
"
```

Expected: 5 monitors (`api-health`, `web-app`, `api-cert`, `app-cert`, `dlq-depth`), 1 notification, non-empty `monitor_notification`, `maxretries=2`, keyword `"status":"ok"`. If any differ, note the actual state in the docs instead of the expected state (docs must match reality).

- [ ] **Step 2: Update the docs to record the wiring as done**

In `docs/INFRA-PLAYBOOK.md` §3b: keep the runbook link and the root-cause notes (they are the "why"), but change the framing from "one-time UI pass pending" to "wired 2026-09-02; revisit only when adding a monitor". In `docs/plans/active/MONITORING-ALERTING.md` status log: record the wiring date, the 503-flap root cause (deploy restarts + maxretries=0), the Discord-attach fix, and the kill-container drill result (done or pending). In `docs/RUNBOOK.md` monitoring section: same.

- [ ] **Step 3: Commit**

```bash
git add docs/INFRA-PLAYBOOK.md docs/RUNBOOK.md docs/plans/active/MONITORING-ALERTING.md docs/KUMA-RUNBOOK.md
git commit -m "docs: record Kuma wiring as done (2026-09-02) with root causes"
```

---

### Task 8: Disk-watchdog verification + swap/memory-limits recommendation doc

**Files:**

- Modify: `docs/RUNBOOK.md` (monitoring section)
- Modify: `docs/plans/active/MONITORING-ALERTING.md` (status log)

**Interfaces:**

- Consumes: the live disk state (99% used, 31G containerd, watchdog installed 2026-09-02, first run 03:30 WIB)
- Produces: a documented verification procedure + a deferred recommendation

- [ ] **Step 1: Document the verification procedure**

In `docs/RUNBOOK.md` monitoring section, add:

```markdown
### Disk watchdog verification (after first install)

The watchdog (`/usr/local/bin/cogito-disk-watchdog.sh`, cron 03:30 WIB) was
installed 2026-09-02 while the disk was at 99% (31G of 38G in
`/var/lib/containerd` — dangling Docker images, 25.8G reclaimable). Verify
it works:

1. `./infra/ops.sh disk` — record `df -h /` usage.
2. After 03:30 WIB: `sudo cat /var/log/cogito-disk-gc.log` — expect a
   `check:` line and, if ≥92%, a `prune ladder` run with the post-prune
   usage.
3. `./infra/ops.sh disk` again — usage should be below 85% if the prune
   ran. If not: run the ladder manually
   (`sudo /usr/local/bin/cogito-disk-watchdog.sh --force-prune`) and check
   the log for errors.
4. If the watchdog never ran (no log file): check the cron entry
   (`sudo crontab -l -u root`) and that `/etc/cogito/disk.env` exists with
   `DISCORD_WEBHOOK_URL` (the playbook writes it; a missing key logs
   "webhook not set" but the watchdog still runs).

### Memory headroom (recommended, not yet applied)

The VPS has 3.8G RAM, **no swap**, and **no container memory limits**
(verified 2026-09-02: all containers `Memory: 0`). Recommended hardening
(deferred — operator decision):

- Add 2G swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
&& sudo mkswap /swapfile && sudo swapon /swapfile` (+ fstab entry).
- Set Coolify per-resource memory limits: API 512M, Redis 256M, Postgres
  512M, Kuma 256M (Coolify UI → resource → Advanced → Memory limit).
```

- [ ] **Step 2: Update MONITORING-ALERTING status log**

Record the 2026-09-02 disk state, the watchdog first-run verification result, and the memory recommendation.

- [ ] **Step 3: Commit**

```bash
git add docs/RUNBOOK.md docs/plans/active/MONITORING-ALERTING.md
git commit -m "docs: disk watchdog verification procedure and memory headroom recommendation"
```

---

### Task 9: Doc corrections — INFRA-PLAYBOOK vault claim + CONTEXT + plans index

**Files:**

- Modify: `docs/INFRA-PLAYBOOK.md` (§1)
- Modify: `docs/CONTEXT.md` (deployment wave state)
- Modify: `docs/plans/README.md` (index row)

**Interfaces:**

- Consumes: Task 6's workflow change (vault path now in the filter)
- Produces: docs that match reality

- [ ] **Step 1: Correct the vault-apply claim**

In `docs/INFRA-PLAYBOOK.md` §1, the row currently says:

> Apply | **automatic**: commit the vault via PR → merge → `infra-apply.yml` re-applies `coolify-resources.yml` on the VPS runner (env patch + restart).

After Task 6 merges, this becomes true — but add the caveat that the apply runs only when the merge touches `infra/secrets/**` (the paths filter), and that `workflow_dispatch` is the manual fallback. Update the note accordingly.

- [ ] **Step 2: Update CONTEXT.md + plans index**

In `docs/CONTEXT.md` deployment-wave section, add a line for this wave: FAILURES.md added, circuit breakers in /health, DLQ retention, ops.sh fixes, pre-migrate pruning, vault-triggered infra-apply, Kuma wired (operator). In `docs/plans/README.md`, add the row for this plan (active).

- [ ] **Step 3: Commit**

```bash
git add docs/INFRA-PLAYBOOK.md docs/CONTEXT.md docs/plans/README.md
git commit -m "docs: correct vault-apply claim and sync wave state"
```

---

### Task 10: Sync docs to the immutable-tag deploy flow (#175–#177)

> **Context:** #175–#177 (merged 2026-09-02) changed the CD deploy from
> "webhook + PATCH image tag" to "pull immutable `v<GIT_SHA>` onto the VPS
> runner, then activate it via Coolify's native image endpoint
> (`POST /api/v1/applications/<uuid>/rollback` with `{"commit":"v<GIT_SHA>"}`)
> using deploy-only access". `docs/RUNBOOK.md` was updated in those PRs, but
> `docs/DEPLOYMENT.md:341` and `docs/INFRA-PLAYBOOK.md` DR-1 still describe
> the old PATCH flow. This task syncs the stale docs and folds the new flow
> into `docs/FAILURES.md` (Task 1) and the plan's constraints.

**Files:**

- Modify: `docs/DEPLOYMENT.md` (§5 pipeline description, Rollback section)
- Modify: `docs/INFRA-PLAYBOOK.md` (DR-1, §2 deploy section)
- Modify: `docs/FAILURES.md` (§5.3/DR-1 — the deploy-failure recovery text must describe the native rollback endpoint, not the PATCH)

**Interfaces:**

- Consumes: the merged script behavior (verified in `scripts/migrate-and-deploy.sh` on main: `deploy_release()`, `attempt_rollback()`, `resolve_app_uuid()`, `force_deploy_url()`)
- Produces: docs that describe the real deploy/rollback mechanics

- [ ] **Step 1: Fix `docs/DEPLOYMENT.md` §5 pipeline text**

Replace the stale auto-rollback description (currently: "resolve the app UUID by `COOLIFY_APP_UUID` or domain match, `PATCH` the resource image tag to `v<prev-sha>`, trigger the redeploy") with the current mechanics:

```markdown
On timeout the script first attempts a **best-effort auto-rollback** via the
Coolify API (`COOLIFY_API_TOKEN` set: resolve the app UUID from
`COOLIFY_APP_UUID` or the deploy webhook's `uuid` query parameter, then
`POST /api/v1/applications/<uuid>/rollback` with `{"commit":"v<prev-sha>"}` —
Coolify's native rollback, which does not mutate the configured image tag and
needs deploy access only; Databases are NEVER restored automatically), then
prints the rollback hint and exits 1.
```

Also update the deploy step description (step 5) to mention: the VPS runner logs into GHCR (`packages: read`), pulls `server:v<GIT_SHA>` into the host image store, and activates it via the same native endpoint with `{"commit":"v<GIT_SHA>"}` (fallback: `force=true` webhook when token/UUID unavailable).

- [ ] **Step 2: Fix `docs/INFRA-PLAYBOOK.md` DR-1 and §2**

DR-1 currently says "the CD script's auto-rollback already repointed the tag on health-poll timeout". Change to: "the CD script's auto-rollback already queued Coolify's native rollback to `v<prev-sha>` on health-poll timeout". In §2 (deploy), update the pipeline summary line to mention the immutable-tag activation.

- [ ] **Step 3: Fold the new flow into `docs/FAILURES.md`**

In Task 1's §5.3 (deploy verification failed) and DR-1, replace the PATCH-based rollback description with the native-endpoint description (same wording as Step 1). Also add a note in §5.2 that a failed `docker pull` of `server:v<GIT_SHA>` on the runner is a new failure class (GHCR auth/network) — detect via CD log, recover by re-running the job.

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOYMENT.md docs/INFRA-PLAYBOOK.md docs/FAILURES.md
git commit -m "docs: sync deploy/rollback docs to the immutable-tag flow (#175-#177)"
```

---

### Task 11: Fix CD — `COOLIFY_API_BASE_URL` unbound + re-trigger after disk-full

> **Context (2026-09-02, live):** CD failed on #174–#178. Root cause: **disk
> 99% full** — Coolify's image pull died mid-extraction
> (`failed to extract layer ... no space left on device` in
> `application_deployment_queues.logs`). The deploy webhook was accepted
> (`deployment queued`) but the container never switched from `bb1ccb9a`
> (still serving, healthy). **Fixed by the operator:** `docker image prune -f`
> reclaimed 25.3GB (99% → 36%). The watchdog (03:30 WIB) now keeps it under
> control. **Secondary bug found in the failed run's log:** after the revert
> (#178), `scripts/migrate-and-deploy.sh` uses `COOLIFY_API_BASE_URL` in
> `coolify_api()` (lines 131/139) but never initializes it — the rollback
> path crashed with `COOLIFY_API_BASE_URL: unbound variable` instead of
> attempting rollback. This task fixes that bug; the wave PR's squash-merge
> to main re-triggers CD (the workflow has no paths filter), which is the
> recovery procedure.

**Files:**

- Modify: `scripts/migrate-and-deploy.sh`
- Modify: `docs/FAILURES.md` (§5 — add the disk-full deploy-failure class and the CD-recovery procedure) — **owned by the docs worker (Task 1) to avoid file overlap; the text is specified below for reference**
- Modify: `docs/RUNBOOK.md` (monitoring section — CD recovery procedure) — **owned by the docs worker (Task 1)**

**Interfaces:**

- Consumes: the current script state on main (post-revert #178: `coolify_api()` references `COOLIFY_API_BASE_URL` uninitialized)
- Produces: a script whose rollback path works, and docs that record the disk-full failure class + the "CD does not auto-retry" recovery procedure

- [ ] **Step 1: Write the failing test (shell-level)**

The script has no test harness; verify the bug by running the script's env-init in isolation:

```bash
bash -c 'set -euo pipefail; echo "${COOLIFY_API_BASE_URL}${path}"' 2>&1
```

Expected: `COOLIFY_API_BASE_URL: unbound variable` (reproduces the bug).

- [ ] **Step 2: Fix the unbound variable**

In `scripts/migrate-and-deploy.sh`, immediately after `set -euo pipefail` (line 90), add:

```bash
# Keep the documented optional override safe under `set -u`. This must be
# initialized before coolify_api() can be called from the failure path.
COOLIFY_API_BASE_URL="${COOLIFY_API_BASE_URL:-https://cl.cogitoacademy.id}"
# Avoid accidental double slashes when an operator supplies a trailing slash.
COOLIFY_API_BASE_URL="${COOLIFY_API_BASE_URL%/}"
```

- [ ] **Step 3: Verify the fix**

```bash
bash -c 'set -euo pipefail; COOLIFY_API_BASE_URL="${COOLIFY_API_BASE_URL:-https://cl.cogitoacademy.id}"; COOLIFY_API_BASE_URL="${COOLIFY_API_BASE_URL%/}"; echo "${COOLIFY_API_BASE_URL}${path}"' 2>&1
```

Expected: prints `https://cl.cogitoacademy.id` (no unbound error).

- [ ] **Step 4: Commit (no direct push — the wave PR's squash-merge re-triggers CD)**

> **Convention note (2026-09-03):** `cd-prod.yml` triggers on **any push to
> main** (no paths filter — verified), so the wave PR's squash-merge is the
> CD re-trigger. Do NOT `git push origin main` from a worker branch. The
> `docs/FAILURES.md` §5.6/5.7 text is owned by the docs worker (Task 1) —
> this task commits the script fix only.

```bash
git add scripts/migrate-and-deploy.sh
git commit -m "fix(cd): initialize COOLIFY_API_BASE_URL for the rollback path"
```

---

## Self-Review

**Spec coverage:**

- FAILURES.md (Q6/Q8-16) → Task 1 ✅
- Circuit breakers in /health (Q4/Q8-5) → Task 2 ✅
- DLQ queue retention (Q8-13) → Task 3 ✅
- ops.sh DB name (Q8-9) + cb command (Q4) → Task 4 ✅
- Pre-migrate snapshot bound (Q2/Q8-6) → Task 5 ✅
- Vault-triggered infra-apply (Q1/Q8-4) → Task 6 ✅
- Kuma 503-flap + Discord wiring (user's live question) → Task 7 (operator runbook — **DONE 2026-09-02**, task reduced to status sync) ✅
- Disk watchdog verification + memory (Q3/Q8-1/Q8-8) → Task 8 ✅
- Doc corrections (Q8-16) → Task 9 ✅
- Immutable-tag deploy doc sync (#175–#177) → Task 10 ✅
- CD failure (disk-full root cause + `COOLIFY_API_BASE_URL` unbound) → Task 11 ✅
- DLQ stale ledger clear (Q8-7) → operator action documented in FAILURES.md §2.4 (not automated — destructive) ✅
- Restore drill (Q8-11) → documented in FAILURES.md §6 DR-2 as a monthly operator task ✅
- Metrics persistence (Q8-12) → **out of scope** — deferred, noted in MONITORING-ALERTING as a follow-up (needs a product decision: Prometheus+Grafana vs hosted) ✅
- Branch protection + secret scanning (Q8-14/15) → operator console actions, already tracked in CI-SANITY F10 / DEFERRED-OPS-TASKS §4.4 — referenced in FAILURES.md §8, not re-planned ✅

**Placeholder scan:** Task 5's prune loop has an implementation note instead of final code because the exact `aws s3 ls` output format must be matched against the existing loop style — the note gives the exact algorithm and verification step. Task 2's `keys()` note flags a possible interface addition with the exact fallback. Task 3's test adapts to the existing mock style (read the file first). All other steps contain concrete code.

**Type consistency:** `checkCircuitBreakers(redis?: RedisClient): Promise<Record<string, "closed"|"open"|"half-open">>` is used consistently in Task 2; `PRE_MIGRATE_KEEP` (default 7) is consistent between Task 5's steps; `cb` command name is consistent between Task 4 and FAILURES.md §3.1/§7.
