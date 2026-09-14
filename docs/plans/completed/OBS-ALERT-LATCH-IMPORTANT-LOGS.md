# OBS Alert-Latch Fix + Important Logs Board (2026-09-14)

One sentence: un-latch the 14 Grafana alerts (CpuHigh firing at 28–45% CPU)
and replace the payment-only logs board with a general Important Logs board.

## Symptom

`CpuHigh` (VPS CPU > 80% for 10m) stayed firing for days while Prometheus
showed live CPU 28.5% and a 24h max of 45.6%. VPS itself healthy: 2 vCPU,
mem available 1.8/3.8GB, disk 54%, all obs targets UP except
`cogito-api-internal` (DOWN by design).

## Root cause

Two compounding defects in `infra/grafana/provisioning/alerting/rules.yaml`:

1. Every rule filtered inside the query (e.g. `100*(1-avg(...)) > 80`).
   A false comparison returns an EMPTY vector, not 0 → reduce-last gives
   NoData → threshold gives NoData. Healthy was indistinguishable from a gap.
2. Blanket `noDataState: KeepLast` on all rules (added 2026-09-07, #228, to
   survive Prometheus-restart gaps) held the firing state through that
   healthy-NoData forever. Only real data could resolve; healthy never
   produced any.

Latent never-fire bugs found while fixing (same file):

| Rule         | Bug                                                                                                                                    | Fix                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| TargetDown   | `up == 0` yields value 0, `0 > 0` false — could never fire; also no job filter so the by-design-DOWN internal job fired it permanently | `count(up{job!="cogito-api-internal"} == 0) or vector(0)`, C `gt 0` |
| DiskForecast | negative forecast vs C `gt 0` — never fired                                                                                            | `< bool 0` 0/1 mapping + `or vector(0)`                             |
| BackupStale  | `count<1` empty when zero lines, and C was `gt 0`                                                                                      | `sum(...) or vector(0)`, C `lt 1`                                   |

## Change

- `rules.yaml`: all 14 queries zero-safe (`or vector(0)` idiom, matching the
  dashboard panels), thresholds moved to the C step (raw CPU/Mem/Disk %,
  5xx ratio, restart count, heartbeat count), `noDataState: Normal` on all
  14 with a per-rule WHY comment. Uids/titles/for-windows/severities/
  summaries/datasources unchanged; no per-rule receiver (default
  Discord-ops). `for` windows (5m/10m/30m) still absorb the ~60s
  restart/cAdvisor gaps; TargetDown + Kuma cover dead scrapers.
- Deleted `payment-logs.json`, added `important-logs.json`
  (uid `cogito-important-logs`, schema 39, Asia/Jakarta, now-6h, textbox
  traceId/userId/action, 7 Loki panels with maxLines and healthy/action
  descriptions, `|~` alternation — `|=` chaining is AND-semantics).
  Every `action=` string grep-verified against `apps/server/src` +
  `packages/api/src`. `dashboards.yml` comment updated.
- RUNBOOK + CONTEXT synced in the same wave (rule 11).

## Verification

- `python3 -c yaml.safe_load` → 14 rules, thresholds
  (85/92 disk, 0.01 errors, 80/90 CPU, 85/90 mem, 2 restarts, lt 1 backup,
  10 gate) all Normal; uid/title/for/severity/summary/datasource identical
  to HEAD.
- `python3 -m json.tool important-logs.json` → OK; `git status` scope =
  rules.yaml, dashboards.yml, payment-logs.json (D),
  important-logs.json (new), RUNBOOK, CONTEXT, this plan.
- Truth tables per rule in the alerts worker report (CpuHigh Normal at 28%,
  firing at 85%+).

## Operator remaining (post-merge)

1. Merge → Infra Apply pipeline syncs the provisioning tree and
   auto-restarts Grafana (Play 2 handler). Confirm latched CpuHigh returns
   to Normal within two `for` windows.
2. Manually `DELETE /api/dashboards/uid/cogito-payment-logs`
   (`disableDeletion: true` leaves the old board stale).
3. Explore spot-checks: `{service="cogito-backup"}` heartbeat,
   `PAYMENT_TEST_MODE_RESTRICTED` counter, `container_start_time_seconds`
   presence, `app_info{provider}` values.

## Status

**Completed (merged #249, 2026-09-14).** Incidental
finding carried forward: `logs-traces.json` panel 3
(`|= "rpc_error" or "request_error"`) is invalid LogQL — fix to
`|~ "rpc_error|request_error"` in a follow-up (left untouched: out of scope).
