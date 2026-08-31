# Monitoring & DLQ Alerting — Plan

| Field      | Value                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | **Active — item 3 (DLQ age-aware health) DONE + merged 2026-08-31 (#130)**; Uptime Kuma + Discord alerting next (box is now wired — apply completed 2026-08-31) |
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

1. **Uptime Kuma** (Ansible-declared Coolify service, port 3002):
   `louislam/uptime-kuma:1`, domain `status.cogitoacademy.id`, volume,
   Discord webhook notifications → owner channel.
   Monitors: `api./health` (60s), `app.` (60s), HTTPS cert expiry,
   `dlqDepth` (via a small HTTP monitor on `/health` + JSONPath or a
   heartbeat that fails when `"dlqDepth":0` is not in the body).
2. **Discord webhook** (operator console bit — not declarative): create a
   webhook in the ops Discord channel; store the URL as a GitHub secret
   `DISCORD_WEBHOOK_URL` (used by Uptime Kuma via the Ansible playbook) —
   and optionally in the SOPS vault if the monitoring host needs it.
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
   live.

## Files (worker-brief sketch)

- `infra/ansible/uptime-kuma.yml` (new)
- `infra/ansible/monitoring.yml` (new — Discord webhook env for Kuma)
- `packages/api/src/lib/db-health.ts` + tests (DLQ staleness)
- `docs/RUNBOOK.md` (monitoring section), `docs/plans/README.md` (row)

## Decision: Discord channel

Create the webhook in the ops Discord server → **#cogito-alerts** (or the
channel the operator chooses). The URL is a bearer secret — store in GitHub
secrets (`DISCORD_WEBHOOK_URL`) and read by the Kuma container env via the
Ansible playbook (decrypted from the vault on the control node).

## Exit gates

- Uptime Kuma live at `status.cogitoacademy.id`, alerts posted to Discord
  (kill-container drill posts a Discord message).
- `/health` `dlqDepth` returns 0 while only stale (pre-`failedAt`) entries
  exist, and becomes > 0 only when a _fresh_ failure lands (age-aware —
  implemented in `f/dlq-age-health`; the currently-stale-100 ledger reports
  0 without clearing anything).
- `ops.sh status` shows everything at a glance.

## Status log

- 2026-08-31: plan created; scope item 3 (DLQ age-aware health) implemented
  on `f/dlq-age-health` — `failedAt` stamped at DLQ push, Lua fresh-depth in
  `checkDlqHealth`, 24h window with `DLQ_FRESH_WINDOW_HOURS` override, 53
  unit tests green (`db-health` + `scheduler.service`), check-types clean.
  Items 1–2 (Uptime Kuma + Discord webhook) remain deferred as planned.
