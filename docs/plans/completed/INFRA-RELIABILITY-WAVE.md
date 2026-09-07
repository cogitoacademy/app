# Infra Reliability Wave

| Field   | Value                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Status  | **Completed (merged #226, 2026-09-07)** — 3 workers (prod/obs/docs), zero file overlap, CI green, squash-merged; operator live-verify + restore drill carry to next session (see §6) |
| Branch  | `w/infra-reliability-wave` (merges `w/infra-reliability-prod`, `-obs`, `-docs`)                                            |
| Workers | 3 (docs worker = this branch; prod/obs workers touch no docs)                                                              |
| Entry   | Operator commands live in [INFRA-PLAYBOOK.md](../../INFRA-PLAYBOOK.md); detail behind it in [RUNBOOK.md](../../RUNBOOK.md) |

Docs follow code — no stale page left. This wave syncs every stale doc to the
applied 2026-08-31 → 2026-09-05 reality and records the wave plan plus accepted
risks in one place.

## 1. User decisions (locked)

- **Drizzle Studio = gateway path.** Studio stays behind the SSH gateway
  (`ssh -L 4983:127.0.0.1:4983`); writes only in maintenance windows
  (RUNBOOK → Monitoring & Alerting → Drizzle Studio ownership).
- **Retention = lean-fallback approved on evidence.** Loki 30d + Prometheus 15d
  ride the observability playbook; if the box runs hot, drop Prometheus first,
  never Loki (DEPLOYMENT-PLAN → Risks).
- **Scrape = dual public + internal approved.** Prometheus scrapes the public
  `/metrics` plus internal targets; all three targets UP, verified live 2026-09-05.
- **Origin-bypass groundwork included.** Posture work lands in this wave; the
  Cloudflare allowlist itself is still pending (see §5 accepted risks).
- **SOPS_AGE_KEY in CI = accepted risk.** The Age private key lives as the
  `SOPS_AGE_KEY` GitHub secret (INFRA-AUTOMATION exception: collaborators are
  internal-only); **secret scanning + push protection must be enabled** as the
  compensating operator console step (see §5).
- **Restore drill = NEXT session.** Not executed in this wave; checklist in §6.
- **Alerts → existing Discord-ops.** DLQFresh/DiskWarn/DiskCrit/ApiErrors fire
  into the existing `Discord-ops` channel; no new channel.

## 2. Concern-to-task table

> IDs match the lead dispatch briefs: P = prod worker (`w/infra-reliability-prod`),
> O = obs worker (`w/infra-reliability-obs`), D = docs worker
> (`w/infra-reliability-docs`), V = operator verify (Phase 6 of the wave plan).

| ID      | Task                                                                                                                                                           | Lands in                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| P1      | Studio = gateway path (`ssh -L 4983`, preflight, trap cleanup)                                                                                                 | `infra/ops.sh`                                                  |
| P2      | `cl.` verify = 404 on `/` + 401/405 on deploy probe (was 302)                                                                                                  | `infra/apply.sh`                                                |
| P3      | Resource bounds (api 512m / web 256m intent), Loki/Grafana/Alloy healthchecks, scrape 30s                                                                      | `coolify-resources.yml`, `observability.yml`, `prometheus.yml`  |
| P4      | `.sops.yaml` regex covers all 53 `app_env_keys` + ops keys (0 missing)                                                                                         | `.sops.yaml`                                                    |
| P5      | Drift truth: DB names, 53 env names, webhook fill-or-skip                                                                                                      | `drift-check.yml`                                               |
| P6      | `app_info{version}` gauge in `/metrics` + unit test                                                                                                            | `metrics.ts`, `metrics-exposition.test.ts`                      |
| P7–P10  | Web-version note, dual-scrape design, port hygiene, prune/rotation policy                                                                                      | `WORKER-REPORT.md` + Coolify comment (prod worktree)            |
| P11–P15 | Scanning/risk record, origin-bypass sketch, DB-URL/ACL/runner notes                                                                                            | `host-hardening.yml` comments + `WORKER-REPORT.md` (+ §5 below) |
| O1      | App RED v2: per-path top-10 rate / 5xx% / p95, 4xx-vs-5xx                                                                                                      | `app-red.json` (panels 5–8)                                     |
| O2      | Infra v2: per-mode CPU, swap, disk forecast, container CPU/restarts                                                                                            | `infra.json` (panels 5–9)                                       |
| O3      | Delivery v2: `app_info` stat (NoData-safe), backup heartbeat (Loki)                                                                                            | `delivery.json` (panels 5–6)                                    |
| O4      | NEW Saturation board: burn rates + retention-vs-disk math (no cuts)                                                                                            | `saturation.json`                                               |
| O5      | 7 new alerts (CPU/mem/disk-forecast/restarts/backup-stale), Discord-ops                                                                                        | `rules.yaml` (5 → 12 rules)                                     |
| O6–O7   | Kuma cert click-path + Alloy/log-shipping caveats                                                                                                              | `WORKER-REPORT.md` (obs worktree)                               |
| D1–D9   | Ghost-row removal, DEPLOYMENT-PLAN phases, DEEP-DIVE §7, coolify-setup rewrite, infra-apply header, MagicDNS inventory, staging-example deletion, RUNBOOK date | `*.md`, `inventory.ini` (docs worktree)                         |
| V1–V7   | Operator live verify: health sha, boards UP, studio connects, Kuma certs, UI password, mem-bounds, internal-scrape attach (restore drill → next session §6)    | Operator session (not in git)                                   |

## 3. Scope

- `*.md` doc sync + `infra/ansible/inventory.ini` + delete `infra/.env.staging.example` only.
- No `*.yml`/`*.json`/`*.ts`/`*.sh` behavior changes (the `infra-apply.yml` header comment path fix is comment-only).
- No secrets in any edit.

## 4. Out of scope

- Off-box runner, point-in-time recovery (PITR), OpenTelemetry SDK, HA — all
  deferred, not this wave.
- Restore drill execution (next operator session, §6).
- Grafana UI password alignment (operator console step, §5).

## 5. Accepted risks

1. **SOPS_AGE_KEY in CI** — Age private key as a GitHub secret is the
   documented INFRA-AUTOMATION exception (internal-only collaborators).
   Compensation: operator enables secret scanning + push protection in the
   repo console; branch protection stays on. Pointer: `infra-apply.yml` header.
2. **Origin-bypass posture until allowlist lands** — direct-to-origin remains
   possible until the Cloudflare allowlist is applied; groundwork only in this wave.
3. **Sentry dormant** — no SDK consumes `SENTRY_DSN`; logs + Discord are the
   error path until a tracking decision is made.
4. **OTel deferred** — W3C `traceId` propagation + PLG covers correlation; no
   OpenTelemetry SDK in this wave.
5. **Restore drill scheduled next session** — backups run nightly + pre-migrate
   snapshots exist, but a scratch restore has not been demonstrated since the
   wave (§6 checklist).
6. **Grafana UI password pending alignment** — vault rotated 2026-09-06 and
   live reset verified; the Coolify `GF_SECURITY_ADMIN_PASSWORD` UI value still
   needs the operator update.

## 6. Restore-drill checklist (NEXT operator session — not executed)

1. Pick the newest nightly `pg_dump -Fc` from `cogito-backups`
   (`backups/$(date +%F).sql.gz`).
2. Restore into a **scratch** database (never the live one):
   `pg_restore` to a fresh DB/container per RUNBOOK → Backup & Restore.
3. Verify table counts match the live DB (bookings, users, wallets, ledger —
   exact queries in RUNBOOK).
4. Record pass/fail + date back into DEPLOYMENT-PLAN Phase 5 and close the drill.
