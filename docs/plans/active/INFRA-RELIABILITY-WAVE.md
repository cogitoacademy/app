# Infra Reliability Wave

| Field    | Value                                                                                 |
| -------- | ------------------------------------------------------------------------------------- |
| Status   | **Active** (created 2026-09-07)                                                       |
| Branch   | `w/infra-reliability-docs`                                                            |
| Workers  | 3 (docs worker = this branch; prod/obs workers touch no docs)                         |
| Entry    | Operator commands live in [INFRA-PLAYBOOK.md](../../INFRA-PLAYBOOK.md); detail behind it in [RUNBOOK.md](../../RUNBOOK.md) |

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

> Source: lead brief ID ranges (P1–P15 platform, O1–O7 observability, D1–D9
> docs, V1–V7 verification). The full brief text was not present in this
> worktree (UNVERIFIED — lead to confirm wording); the mapping below ties each
> range to its concrete task in this wave.

| Concerns  | Task (this wave)                                                                                          | Where it lands                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P1–P5     | Coolify facts sync: DB names `cogito-prod-db`/`cogito-prod-redis`, project `cogito-prod`, Kuma `cogito-uptime-kuma` (`louislam/uptime-kuma:2`), `is_auto_deploy_enabled: false`, tailnet-only Coolify | `infra/coolify-setup.md` (§§ Prerequisites, 2–5, 8–9)                          |
| P6–P9     | Staging removal: delete Step 7 + staging Kuma monitor (staging removed per CI-SANITY F7); delete `infra/.env.staging.example` (no live refs) | `infra/coolify-setup.md`, deleted `infra/.env.staging.example`                 |
| P10–P12   | Ansible inventory → MagicDNS `cogito-vps.tail674634.ts.net` (match `ops.sh` default)                        | `infra/ansible/inventory.ini`                                                  |
| P13–P15   | Origin-bypass groundwork + SOPS_AGE_KEY posture (§5 risks recorded, no secret changes)                      | This file §5; `infra-apply.yml` header comment fix                             |
| O1–O4     | DEPLOYMENT-PLAN Phase 4 status: PLG APPLIED live 2026-09-05                                                 | `docs/plans/active/DEPLOYMENT-PLAN.md` (Phase 4)                               |
| O5–O7     | Deep-dive gap table: R2-created, vault-encrypted, coolify-resources-applied → DONE with dates                | `docs/INFRA-ARCHITECTURE-DEEP-DIVE.md` (§7)                                    |
| D1–D4     | Ghost-row removal: `active/OBSERVABILITY-DECLARATIVE.md` never existed as active; keep Completed row        | `docs/plans/README.md`                                                         |
| D5–D7     | Phase 1 Task 1.2 status: coolify-resources applied 08-31, 47 vars                                           | `docs/plans/active/DEPLOYMENT-PLAN.md` (Task 1.2)                              |
| D8–D9     | RUNBOOK header date + INFRA-PLAYBOOK entry pointer (minimal diff)                                            | `docs/RUNBOOK.md`                                                              |
| V1–V4     | Verification: zero `active/OBSERVABILITY-DECLARATIVE.md`-as-active refs, zero live staging-example refs, sane headings/links | Greps + `git diff --stat` (see WORKER-REPORT.md)                               |
| V5–V7     | Restore-drill checklist staged for NEXT session (not executed)                                               | This file §6                                                                   |

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
