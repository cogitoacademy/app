# Monitoring & DLQ Alerting — Plan

| Field      | Value                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | **Active — items 1–2 DONE (playbooks delivered 2026-09-01, `ops/monitoring-discord`); operator console bits remain (vault webhook + Kuma UI paste)**; item 3 (DLQ age-aware health) DONE + merged 2026-08-31 (#130) |
| Created    | 2026-08-31                                                                                                                                                      |
| Depends on | DEPLOYMENT-WAVE-2 (#121/#122) merged; infra apply (Terraform + Ansible) in progress                                                                             |
| Scope      | Uptime Kuma + Discord alerting, DLQ age-aware health, ops visibility                                                                                            |

## Why

- The DLQ (`cogito:dlq`) is a **bounded ledger with no TTL and no age
  awareness** — verified in `packages/api/src/modules/scheduler/
scheduler.service.ts` (`DLQ_PUSH_LUA` = LPUSH + LTRIM only). Failures from
  days ago (the 2026-08-25 batch, all `Failed query` on scheduler jobs) sit
  in the list forever, so `/health` reports `dlq: error, dlqDepth: 100`
  indefinitely even though every scheduler job has completed successfully
  since (verified in live logs, 2026-08-31).
- No monitoring/alerting is wired at all (Uptime Kuma was deferred).
- User preference: **Discord**, not Telegram, for alerts.

## Scope

1. **Uptime Kuma** (Ansible-declared Coolify service, port 3001):
   `louislam/uptime-kuma:2` (one-click template in this Coolify build),
   domain `status.cogitoacademy.id`, volume `uptime-kuma-data:/app/data`,
   Discord webhook notifications → owner channel. ✅ **DONE (2026-09-01,
   `ops/monitoring-discord`)** — `infra/ansible/uptime-kuma.yml` declares the
   service declaratively via the Coolify API (`POST /api/v1/services`,
   `type: uptime-kuma`, `urls: [{name: uptime-kuma, url: https://status...}]`,
   `instant_deploy`), drift-PATCHes, probes the domain, and prints the Kuma
   UI runbook steps (monitors + Discord notification — the Coolify API cannot
   express Kuma's monitors). The API surface was verified live 2026-09-01
   (routes/api.php + ServicesController.php + the pre-existing
   `cogito-studio` service). **Operator console bit:** paste the webhook URL
   into the Kuma UI (Notifications → Discord) once `DISCORD_WEBHOOK_URL` is
   in the vault.
   Monitors (Kuma UI, printed by the playbook): `api./health` (60s, keyword
   `"status":"ok"`), `app.` (60s), HTTPS cert expiry for `api.`/`app.`,
   `dlqDepth` (keyword `"dlqDepth":0` — fails only on FRESH failures).
2. **Discord webhook** (operator console bit — not declarative): create a
   webhook in the ops Discord channel; store the URL in the SOPS vault as
   `DISCORD_WEBHOOK_URL` (read by the playbooks; never echoed). ✅ playbooks
   delivered 2026-09-01 — both `uptime-kuma.yml` and `disk-watchdog.yml`
   print a loud operator instruction when the key is absent. **Operator
   action pending:** add the key to the vault (and optionally as a GitHub
   secret for CD failure posts — noted, not wired).
3. **DLQ age-aware health (code, small PR): ✅ DONE (2026-08-31,
   `f/dlq-age-health`)**
   - `checkDlqHealth` in `packages/api/src/lib/db-health.ts` reports the
     depth of **fresh** failures only: the DLQ push now stamps every entry
     with `failedAt` (epoch ms, added by the DLQ worker at push time) and
     the depth is computed atomically in Lua (LRANGE + cjson + cutoff
     compare) counting entries with `failedAt > now − window`.
   - Window: `DLQ_FRESH_WINDOW_MS` = 24h default, overridable via
     `DLQ_FRESH_WINDOW_HOURS` (plain parseInt; invalid/`<=0`/>1y values fall
     back to 24h).
   - **Backward compatibility:** ledger entries without `failedAt` (the
     entire pre-2026-08-31 ledger, e.g. the 2026-08-25 batch) are treated as
     STALE and never count — a stale list goes quiet instead of tripping the
     monitor forever. `/health` shape unchanged (`dlq` + `dlqDepth`, both
     alert-only); semantics only.
   - `/health` stays alert-only (excluded from overall status), and a stale
     ledger no longer trips the monitor forever.
4. **`ops.sh`** (delivered in the apply-runbook wave): `dlq`, `dlq-clear`,
   `status`, `health` already provide manual visibility while Kuma is not
   live. ✅ **2026-09-01 additions:** `disk` (df -h /, docker system df, top
   containers by size) + `deploy-retry` (re-run the last CD via `gh run
   rerun`, else POST the Coolify deploy webhook with the vault Bearer token —
   never echoed).
5. **Disk watchdog** (new, 2026-09-01 — the 2026-08-31 disk incident
   follow-up): `infra/ansible/disk-watchdog.yml` installs
   `/usr/local/bin/cogito-disk-watchdog.sh` + nightly cron (03:30 WIB).
   Warns at ≥ 85% (Discord), auto-prunes at ≥ 92% (`docker image prune -f`
   → `docker image prune -af --filter until=48h` → re-check; never volumes,
   never active containers, never postgres data; newest 1–2
   cogitoacademy/app images kept as `rollback-keep-*`). Log
   `/var/log/cogito-disk-gc.log` (rotated 7). `--dry-run` mode prints the
   commands without executing or posting. Rationale: Coolify's built-in
   docker_cleanup (80%, daily) failed to prevent the 99% disk event.

## Files (worker-brief sketch)

- `infra/ansible/uptime-kuma.yml` (new) ✅
- `infra/ansible/disk-watchdog.yml` + `infra/disk-watchdog.sh` (new) ✅
- `infra/ops.sh` (disk + deploy-retry) ✅
- `packages/api/src/lib/db-health.ts` + tests (DLQ staleness) ✅ (item 3)
- `docs/RUNBOOK.md` (monitoring section) ✅, `docs/plans/README.md` (row) ✅,
  `docs/DEPLOYMENT.md` (pointer) ✅, `docs/CONTEXT.md` (1-line state) ✅

## Decision: Discord channel

Create the webhook in the ops Discord server → **#cogito-alerts** (or the
channel the operator chooses). The URL is a bearer secret — store in GitHub
secrets (`DISCORD_WEBHOOK_URL`) and read by the Kuma container env via the
Ansible playbook (decrypted from the vault on the control node).

## Exit gates

- Uptime Kuma live at `status.cogitoacademy.id`, alerts posted to Discord
  (kill-container drill posts a Discord message). **Playbooks delivered
  2026-09-01; the live gate needs the operator console bits (vault webhook +
  Kuma UI paste) — see Status log.**
- `/health` `dlqDepth` returns 0 while only stale (pre-`failedAt`) entries
  exist, and becomes > 0 only when a _fresh_ failure lands (age-aware —
  implemented in `f/dlq-age-health`; the currently-stale-100 ledger reports
  0 without clearing anything). ✅ verified live 2026-08-31 (`dlqDepth: 0`).
- `ops.sh status` shows everything at a glance. ✅

## Status log

- 2026-08-31: plan created; scope item 3 (DLQ age-aware health) implemented
  on `f/dlq-age-health` — `failedAt` stamped at DLQ push, Lua fresh-depth in
  `checkDlqHealth`, 24h window with `DLQ_FRESH_WINDOW_HOURS` override, 53
  unit tests green (`db-health` + `scheduler.service`), check-types clean.
  Items 1–2 (Uptime Kuma + Discord webhook) remain deferred as planned.
- 2026-09-01 (`ops/monitoring-discord`): items 1–2 + new item 5 delivered.
  `infra/ansible/uptime-kuma.yml` declares the Kuma service via the Coolify
  API (verified live: `/api/v1/services` endpoint set exists in v4.3.14, the
  `uptime-kuma` one-click template exists pinning `louislam/uptime-kuma:2`,
  port 3001, volume `uptime-kuma-data:/app/data`); `instant_deploy` starts
  it; the playbook probes `status.cogitoacademy.id` and prints the Kuma UI
  monitor + Discord steps (not API-expressible — honest fallback, same
  pattern as the Traefik route). `infra/ansible/disk-watchdog.yml` +
  `infra/disk-watchdog.sh` install the nightly disk watchdog (03:30 WIB,
  warn ≥ 85%, prune ≥ 92%, dry-run mode, logrotate 7). `infra/ops.sh` gains
  `disk` + `deploy-retry`. Docs updated (RUNBOOK monitoring section,
  DEPLOYMENT pointer, plans README row, CONTEXT 1-line). **Operator
  follow-ups (never done by the worker):** add `DISCORD_WEBHOOK_URL` to the
  SOPS vault; paste the webhook into the Kuma UI + create the monitors;
  optional GitHub secret for CD failure posts.
