# Midtrans UAT Gate — Payment Observability + Env-Uniqueness Guard

| Field   | Value                                                                                 |
| ------- | ------------------------------------------------------------------------------------- |
| Status  | **Active (2026-09-11)** — pay-obs worker, branch `w/midtrans-uat-obs`                 |
| Branch  | `w/midtrans-uat-obs` (from `origin/main`)                                             |
| Workers | 1 (pay-obs: Grafana dashboard + alerts, env-dupe guard, docs)                         |
| Entry   | Operator commands live in [INFRA-PLAYBOOK.md](../../INFRA-PLAYBOOK.md); detail in [RUNBOOK.md](../../RUNBOOK.md) |

One sentence: ship a Payment Logs dashboard, two alerts, a playbook
uniqueness guard, this wave plan file, and all doc updates — so payment
operations is observable without Grafana Explore and duplicate Coolify env
rows can never pass silently again.

## Goal

1. Make payment operations observable without Grafana Explore: a provisioned
   **Payment Logs** dashboard answering "which provider/mode is live, did the
   boot line land, who hit the test-mode gate, what happened to this
   `traceId`?" plus two alerts (prod-on-stub, test-gate abuse spike).
2. Make duplicate Coolify env rows impossible to pass silently: a fail-loud
   uniqueness assert in `infra/ansible/tasks/env.yml` (no auto-delete — the
   Coolify DELETE endpoint semantics are unverified).
3. Record the wave plan (this file) and update every affected doc in the same
   change (AGENTS.md rule 11).

Non-goals: backend metric emission (separate backend worker guarantees the
`app_info{version,provider,provider_mode}` contract), provider logic changes,
auto-remediation of dupes, new notification channels (routing stays on the
default `Discord-ops` policy).

## Architecture

```
cogito-api boot ──log──▶ {service="cogito-api"} |= "payment_provider_configured"
      │                        (Alloy loki.source.docker → Loki → Grafana)
      │                   ┌─ Payment Logs dashboard (new, provisioned file)
      │                   │   boot line · traceId trail · FORBIDDEN stream ·
      │                   │   app_info{provider,provider_mode} stat
      └─ /metrics ─▶ Prometheus ─┴─ alerts: ProdOnStub (critical) ·
                                      TestModeRestrictedSpike (warning)
                                      → default policy → Discord-ops

SOPS vault ──▶ env.yml ──GET envs──▶ PATCH first-match by key / POST when missing
                              └── NEW: uniqueness assert (exactly-once per
                                   declared key; names dupes; points at RUNBOOK)
```

- **Source of truth is files, not UI clicks:** Grafana access is
  loopback/tailnet-only; `infra/grafana/provisioning/**` is provisioned with
  `allowUiUpdates: false`. Iterate in git, not in the UI.
- **Root decision (locked): option (a)** — `XENDIT_TEST_ALLOWED_EMAILS` is the
  provider-agnostic test-mode UAT list, not "Xendit-only". Every doc touched
  by this wave says that.
- **Metric contract (owned by the backend worker, not this wave):**
  `app_info{version="<sha|dev>",provider="<stub|xendit|midtrans>",provider_mode="<test|live|none>"}`
  value `1`. Panels/alerts below build on exactly that; if the series is
  absent, the dashboard stat shows its NoData-safe text and the stub alert
  stays `KeepLast`-held (never silent-OK).
- **Reliability posture:** stateless dashboard/alert definitions (replaceable
  files); stateful truth stays in Coolify env rows + SOPS vault + Loki/Pro-
  metheus retention. No new SPOF: alerts reuse the existing Prometheus/Loki
  datasources and the existing `Discord-ops` receiver.

## Concern register

| ID | Concern | Handling |
| -- | ------- | -------- |
| C1 | **Prod silently on stub** — `PAYMENT_PROVIDER=stub` in production takes no money and the failure looks like "no purchases" | `ProdOnStub` critical alert on `app_info{provider="stub"} == 1` (`for: 5m`, `KeepLast`); Payment Logs `app_info` stat shows live provider/mode at a glance |
| C2 | **Test-mode gate abuse / misconfig** — non-UAT purchases on a production domain, or UAT confusion during Midtrans sandbox E2E | `TestModeRestrictedSpike` warning alert on the `PAYMENT_TEST_MODE_RESTRICTED` log rate; dashboard FORBIDDEN-stream panel shows exactly who hit the gate |
| C3 | **Log-spike alert noise** — one curious user should not page anyone | Spike threshold is a rate over 10m (`for: 10m`, severity `warning`, Discord-ops like every other warn rule); single hits stay visible on the dashboard without firing |
| C4 | **Duplicate Coolify env rows** — Coolify permits duplicate keys; `env.yml` PATCHes first-match by key and the F14 count-assertion is blind to dupes, so a stale second row can shadow the intended value after a restart/redeploy | Fail-loud uniqueness assert: every `app_env_keys` entry must occur **exactly once** in the Coolify GET list. No auto-delete (DELETE semantics unverified) — the failure names the duplicated keys and points at the RUNBOOK dedupe procedure |
| C5 | **CPU-transient false alarms** — brief ~80% CPU during deploys is normal (container recreate + health polls, same class as the Kuma 503-flap fixed with `maxretries=2`) | Documented operator rule, repeated in RUNBOOK: brief ~80% CPU during deploys is normal; investigate only if sustained >5 min outside deploy/backup windows. No new CPU alert in this wave; `CpuHigh`/`CpuCrit` windows already absorb the gap |
| C6 | **Dashboard provisioning drift** — a hand-edited board diverges from git, or a schema field breaks provisioning | New board copies `logs-traces.json` schema/panel conventions exactly (`schemaVersion: 39`, `{type,uid}` datasource refs, `gridPos`, Loki uid `loki`); provisioned with `allowUiUpdates: false` so git stays truth |
| C7 | **Alert routing sprawl** — per-rule receivers drift from the Discord-ops default and secrets leak into git | Both new rules carry no receiver (default policy → `Discord-ops`, vault webhook URL never in git) and match existing severity conventions (`critical` for prod-on-stub, `warning` for the log spike) |
| C8 | **Rollback safety** — a bad board/rule/playbook edit must be revertible without touching prod | All changes are additive files or guarded asserts: revert = `git revert` + `./infra/apply.sh observability` (Grafana restart re-loads rules); the env assert fails closed (blocks a dupe-shadowed apply) and never mutates Coolify state |

## Tasks

| ID | Task | Files |
| -- | ---- | ----- |
| T1 | Wave plan file (this document): Goal, Architecture, C1–C8, T1–T6, Verification, Rollback | `docs/plans/active/MIDTRANS-UAT-GATE.md` (create) |
| T2 | Payment Logs dashboard (valid JSON, `logs-traces.json` schema/panel conventions): boot-line logs panel (`payment_provider_configured`), `traceId` trail panel, `PAYMENT_TEST_MODE_RESTRICTED`/FORBIDDEN stream panel, `app_info{provider,provider_mode}` stat panel | `infra/grafana/provisioning/dashboards/payment-logs.json` (create) |
| T3 | Two alert rules in the existing `cogito-1m` group format: (1) prod `app_info{provider="stub"} == 1` (critical), (2) `PAYMENT_TEST_MODE_RESTRICTED` log-spike over Loki (warning); `KeepLast` + `Error` like every other rule, no per-rule receiver | `infra/grafana/provisioning/alerting/rules.yaml` (modify) |
| T4 | Coolify env-dupe uniqueness guard after the existing apply/assert tasks, same `ansible.builtin.assert` style: every `app_env_keys` entry occurs exactly once in the GET list; fail message names duplicated keys + points at the RUNBOOK dedupe procedure; no auto-delete | `infra/ansible/tasks/env.yml` (modify) |
| T5 | Surgical doc updates, same style: `MIDTRANS-MIGRATION.md` §3 shared-list row/note; `API-REFERENCE.md` Midtrans block one sentence on the shared allowlist; `RUNBOOK.md` LogQL queries + Coolify dedupe procedure + dashboard pointer + CPU-transient line; `CONTEXT.md` payment section touch-up only if stale | `docs/MIDTRANS-MIGRATION.md`, `docs/API-REFERENCE.md`, `docs/RUNBOOK.md`, `docs/CONTEXT.md` (modify) |
| T6 | Validate (`python3 -m json.tool`, `ansible-playbook --syntax-check` if available, `bun run lint` zero-new), Conventional Commits on `w/midtrans-uat-obs`, push to `origin/w/midtrans-uat-obs`, write `WORKER-REPORT.md` | `WORKER-REPORT.md` (create, worktree root; never commit `BRIEF.md`) |

## Verification

1. `python3 -m json.tool infra/grafana/provisioning/dashboards/payment-logs.json`
   passes (valid JSON, no secrets).
2. `ansible-playbook --syntax-check` on the playbook if ansible exists;
   otherwise report unavailable (do not install toolchains).
3. `bun run lint` shows zero NEW issues in touched files (docs/yml-only
   changes should be lint-silent; confirm).
4. No changes outside Scope; no secrets added; no stale "Xendit-only
   allowlist" claims in touched sections.
5. Operator live-verify (next session, not this worker): Grafana shows the
   Payment Logs board in the Cogito folder; boot line
   `{service="cogito-api"} |= "payment_provider_configured"` renders with
   `provider=midtrans midtransMode=test`; `app_info` stat shows the live
   provider/mode; both new alerts evaluate (stub alert Normal while on
   midtrans); a duplicate env row fails the playbook with the dupe keys
   named; RUNBOOK dedupe procedure resolves it.
6. Conventional Commits pushed to `origin/w/midtrans-uat-obs`; `WORKER-REPORT.md`
   records files + SHAs, validation evidence, conventions, remains/blocked.
   Never merge, never touch prod, never handle secrets.

## Rollback

- **Dashboard/alerts:** `git revert` the board/rules commits and re-run
  `./infra/apply.sh observability` (tunnels up). Grafana file provisioning
  only re-saves changed content; the restart handler reloads alert rules.
  Until re-applied, the old boards/rules keep serving — no outage path.
- **env.yml guard:** `git revert`; re-running the playbook without the assert
  restores the previous (dupe-blind) behavior. The assert itself never writes
  to Coolify, so there is nothing to un-apply on the VPS.
- **Docs/plan:** `git revert`; no runtime effect.
- **Provider rollback (unchanged, owned by `docs/MIDTRANS-MIGRATION.md` §6):**
  `PAYMENT_PROVIDER=xendit` + matching `XENDIT_MODE`/keys; Xendit path stays
  wired. This wave adds no new rollback dependency.
