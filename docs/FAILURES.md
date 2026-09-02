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
  `open` = error level); `./infra/ops.sh cb` (new command, added by this
  wave); `/health` `checks.circuitBreakers` (added by this wave)
- Meaning: provider failing repeatedly (thresholds: Resend 3, Meet 5,
  Xendit 5; resets: 120s/60s/30s; half-open probe: 1 attempt)
- Note: the Resend and Google Meet breakers share the Redis key
  `cogito:cb:default` (neither sets a `name`); Xendit keys are
  `cogito:cb:xendit-test` / `cogito:cb:xendit-live` (mode-scoped). The
  `cb` command scans `cogito:cb:*` so it shows the real keys.
- Recovery: it self-heals after the reset timeout (half-open probe). If it
  stays open: check provider status/credentials → fix → the breaker closes
  on the next successful call. Force-close (only after fixing the root
  cause): `./infra/ops.sh redis DEL cogito:cb:default` (or
  `cogito:cb:xendit-test` / `cogito:cb:xendit-live`)
- Verification: `./infra/ops.sh cb` shows `closed` (or no keys)

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

- Detect: Kuma `api-cert`/`app-cert` monitors (not yet created — add via
  the Kuma UI, see `docs/KUMA-RUNBOOK.md`); browser warnings
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
  (PATCH `docker_registry_image_tag` to `v<PREV_GIT_SHA>` + redeploy —
  the flow restored by #178; the #175–#177 native-endpoint flow
  `POST /api/v1/applications/<uuid>/rollback` with `{"commit":"v<sha>"}`
  was reverted after the 2026-09-02 disk-full incident). Verify:
  `curl -s https://api.cogitoacademy.id/health | jq -r .version`
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

### 5.6 Disk-full image pull failure (the 2026-09-02 incident class)

- Detect: CD log shows `failed to extract layer ... no space left on
device` (Coolify `application_deployment_queues.logs`); the deploy
  webhook was accepted (`deployment queued`) but `/health` version never
  changes; `./infra/ops.sh disk` shows ≥92%
- Meaning: the host disk filled up and Coolify's image pull died
  mid-extraction. The old container keeps serving (healthy) — the deploy
  is stuck, not broken
- Recovery: free disk first (the watchdog auto-prunes at ≥92%:
  `docker image prune -f` → `docker image prune -af --filter until=48h`;
  manual: `./infra/ops.sh disk` → inspect → `sudo docker image prune -f`),
  verify `df -h /` < 85%, then re-run the CD run (see §5.7)
- Verification: `curl -s https://api.cogitoacademy.id/health | jq -r .version`
  == the merged sha

### 5.7 CD does not auto-retry

- Detect: a red CD run stays red; no new run is scheduled
- Meaning: `cd-prod.yml` has no retry — a failed run requires an explicit
  re-run, or the next merge to main (the workflow has no paths filter, so
  any push to main re-triggers CD)
- Recovery: fix the root cause → re-run the failed run
  (`gh run rerun <id>` or `./infra/ops.sh deploy-retry` — safe:
  snapshot/migrate/deploy are idempotent) → or merge the fix to main (the
  wave PR's squash-merge is the re-trigger)
- Verification: the run goes green and `/health` version == the merged sha

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

| Failure        | Log action / field             | Kuma monitor                        | ops.sh command            |
| -------------- | ------------------------------ | ----------------------------------- | ------------------------- |
| 500s           | `"level":"error"`              | api-health                          | `logs \| grep error`      |
| DLQ fresh      | `scheduler_dlq_job`            | DLQ DEPTH                           | `dlq`                     |
| Breaker open   | `circuit_breaker_state_change` | — (this wave adds /health)          | `cb` (added by this wave) |
| Disk ≥85%      | watchdog log                   | —                                   | `disk`                    |
| Backup failed  | `/var/log/cogito-backup.log`   | —                                   | `backup`                  |
| API down       | —                              | api-health                          | `health`                  |
| Cert expiring  | —                              | api-cert/app-cert (not yet created) | `curl -vI`                |
| Scheduler dead | `checks.scheduler`             | api-health (503)                    | `health`                  |
| Redis down     | `checks.redis`                 | api-health (503)                    | `redis PING`              |
| Postgres down  | `checks.database`              | api-health (503)                    | `db "SELECT 1"`           |

## 8. The daily operator rhythm

1. Morning: check Discord (alerts), `./infra/ops.sh status`, verify
   `/var/log/cogito-backup.log` has a fresh success line, `df -h /` < 85%.
2. After any deploy: `curl -s https://api.cogitoacademy.id/health | jq -r .version`
   == the merged sha.
3. Weekly: `./infra/ops.sh dlq` — clear stale entries; spot-check
   `./infra/ops.sh logs | grep -E '"(error|warn)"'`.
4. Monthly: verify a backup restore drill (DR-2) — a backup that has never
   been restored is an assumption.
