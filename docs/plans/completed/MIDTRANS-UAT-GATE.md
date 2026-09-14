# Midtrans UAT Gate — Important Logs Payment Panels + Env-Uniqueness Guard

| Field   | Value                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | **Completed (merged #252, 2026-09-14)** — 10-panel Important Logs board with payment panels live in git; operator live-verify carries forward |
| Branch  | main (merged #252)                                                                                                                            |
| Workers | 1 (docs-ops: Important Logs payment panels, plan rewrite, surgical docs)                                                                      |
| Entry   | Operator commands live in [INFRA-PLAYBOOK.md](../../INFRA-PLAYBOOK.md); detail in [RUNBOOK.md](../../RUNBOOK.md)                              |

One sentence: extend the provisioned **Important Logs** board with three
payment panels, record the already-merged alert + env-guard evidence, and
surgically update docs — so payment operations is observable without Grafana
Explore and duplicate Coolify env rows can never pass silently again.

## Goal

1. Make payment operations observable without Grafana Explore: three payment
   panels on the provisioned **Important Logs** board answering "which
   provider/mode is live, did the boot line land, who hit the test-mode
   gate?" — boot-line logs (`payment_provider_configured`),
   `PAYMENT_TEST_MODE_RESTRICTED`/FORBIDDEN stream, `app_info`
   provider-mode stat — alongside the existing traceId/userId, errors,
   bookings, webhooks, scheduler/DLQ and meetings panels.
2. Record evidence (not rebuild) that duplicate Coolify env rows already fail
   loud via the uniqueness assert in `infra/ansible/tasks/env.yml`, and that
   the two payment alerts already exist with OK semantics in
   `infra/grafana/provisioning/alerting/rules.yaml`.
3. Record the wave plan (this file) and update every affected doc in the same
   change (AGENTS.md rule 11), with RPC facts per AGENTS.md rule 12
   (`/rpc/<router>/<proc>` slash paths, `{"json": <input>}` envelope).

Non-goals: backend metric emission (owned by a sibling worker — do NOT touch
`packages/api`, `packages/db`, `apps/server`; this wave only consumes the
`app_info{version,provider,provider_mode}` contract), provider logic changes,
auto-remediation of dupes, new notification channels (routing stays on the
default `Discord-ops` policy). Never use `KeepLast` — it was the latch root
cause (see OBS-ALERT-LATCH). Never touch prod, Coolify, SOPS, or run infra
apply.

## Architecture

```
cogito-api boot ──log──▶ {service="cogito-api"} |= "payment_provider_configured"
      │                        (Alloy loki.source.docker → Loki → Grafana)
      │                   ┌─ Important Logs board (existing, extended this wave)
      │                   │   traceId · userId · errors · bookings · webhooks ·
      │                   │   scheduler-DLQ · meetings · NEW: boot line ·
      │                   │   test-gate/FORBIDDEN stream · app_info stat
      └─ /metrics ─▶ Prometheus ─┴─ alerts (EXISTING, evidence only):
                                      ProdOnStub (critical) ·
                                      TestModeRestrictedSpike (warning)
                                      → default policy → Discord-ops

SOPS vault ──▶ env.yml ──GET envs──▶ PATCH first-match by key / POST when missing
                              └── EXISTING: uniqueness assert (exactly-once per
                                   declared key; names dupes; points at RUNBOOK)
```

- **Source of truth is files, not UI clicks:** Grafana access is
  loopback/tailnet-only; `infra/grafana/provisioning/**` is provisioned with
  `allowUiUpdates: false`. Iterate in git, not in the UI.
- **Root decision (locked): option (a)** — `XENDIT_TEST_ALLOWED_EMAILS` is the
  provider-agnostic test-mode UAT list, not "Xendit-only". Every doc touched
  by this wave says that.
- **Metric contract (owned by the sibling backend worker, not this wave):**
  `app_info{version="<sha|dev>",provider="<stub|xendit|midtrans>",provider_mode="<test|live|none>"}`
  value `1`. Panels below build on exactly that; if the series is absent, the
  dashboard stat shows its NoData-safe text and the stub alert stays OK-safe
  (never `KeepLast`-held, never silent-OK confusion — OK means Normal state).
- **Alert semantics (locked by OBS-ALERT-LATCH, merged):** all 14 rules use
  zero-safe queries (thresholds in the C step) with `noDataState: OK`
  (= Normal; file-provisioning enum is `NoData`/`Alerting`/`OK` — `Normal` is
  invalid and crash-loops Grafana). `KeepLast` is forbidden everywhere.
- **Reliability posture:** stateless dashboard/alert definitions (replaceable
  files); stateful truth stays in Coolify env rows + SOPS vault + Loki/Pro-
  metheus retention. No new SPOF: panels reuse the existing Loki/Prometheus
  datasources and the existing `Discord-ops` receiver.

## Concern register

| ID  | Concern                                                                                                                                                                                                                           | Handling                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Prod silently on stub** — `PAYMENT_PROVIDER=stub` in production takes no money and the failure looks like "no purchases"                                                                                                        | `ProdOnStub` critical alert on `(app_info{provider="stub"} == 1) or vector(0)` (`for: 5m`, `noDataState: OK`, never `KeepLast` — EVIDENCE, exists in `rules.yaml` uid `prod-on-stub`); Important Logs `app_info` stat (new panel 10) shows live provider/mode at a glance                           |
| C2  | **Test-mode gate abuse / misconfig** — non-UAT purchases on a production domain, or UAT confusion during Midtrans sandbox E2E                                                                                                     | `TestModeRestrictedSpike` warning alert on the `PAYMENT_TEST_MODE_RESTRICTED` log rate (`or vector(0)`, `for: 10m`, `noDataState: OK` — EVIDENCE, exists in `rules.yaml` uid `test-mode-restricted-spike`); new FORBIDDEN-stream panel shows exactly who hit the gate                               |
| C3  | **Log-spike alert noise** — one curious user should not page anyone                                                                                                                                                               | Spike threshold is a rate over 10m (`for: 10m`, severity `warning`, Discord-ops like every other warn rule); single hits stay visible on the dashboard without firing                                                                                                                               |
| C4  | **Duplicate Coolify env rows** — Coolify permits duplicate keys; `env.yml` PATCHes first-match by key and the F14 count-assertion is blind to dupes, so a stale second row can shadow the intended value after a restart/redeploy | Fail-loud uniqueness assert: every `app_env_keys` entry must occur **exactly once** in the Coolify GET list — EVIDENCE, exists in `infra/ansible/tasks/env.yml` (`Fail loud on duplicate Coolify env rows`, names dupes + missing, points at RUNBOOK). No auto-delete (DELETE semantics unverified) |
| C5  | **CPU-transient false alarms** — brief ~80% CPU during deploys is normal (container recreate + health polls, same class as the Kuma 503-flap fixed with `maxretries=2`)                                                           | Documented operator rule, repeated in RUNBOOK: brief ~80% CPU during deploys is normal; investigate only if sustained >5 min outside deploy/backup windows. No new CPU alert in this wave; `CpuHigh`/`CpuCrit` windows already absorb the gap                                                       |
| C6  | **Dashboard provisioning drift** — a hand-edited board diverges from git, or a schema field breaks provisioning                                                                                                                   | Extended board copies `logs-traces.json` schema/panel conventions exactly (`schemaVersion: 39`, `{type,uid}` datasource refs, `gridPos`, Loki uid `loki`); provisioned with `allowUiUpdates: false` so git stays truth                                                                              |
| C7  | **Alert routing sprawl** — per-rule receivers drift from the Discord-ops default and secrets leak into git                                                                                                                        | Both payment rules carry no receiver (default policy → `Discord-ops`, vault webhook URL never in git) and match existing severity conventions (`critical` for prod-on-stub, `warning` for the log spike)                                                                                            |
| C8  | **Rollback safety** — a bad board/rule/playbook edit must be revertible without touching prod                                                                                                                                     | All changes are additive panels or recorded evidence: revert = `git revert` + `./infra/apply.sh observability` (Grafana restart re-loads rules); the env assert fails closed (blocks a dupe-shadowed apply) and never mutates Coolify state                                                         |

## Tasks

| ID  | Task                                                                                                                                                                                                                                                                                                                                       | Files                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| T1  | Wave plan rewrite (this document): Goal, Architecture, C1–C8, T1–T6, Verification, Rollback — Important Logs framing, T3/T4 as evidence, `KeepLast` ban                                                                                                                                                                                    | `docs/plans/active/MIDTRANS-UAT-GATE.md` (rewrite)                                                                           |
| T2  | Important Logs payment panels (valid JSON, `logs-traces.json` conventions): boot-line logs panel (`payment_provider_configured`, id 8), `PAYMENT_TEST_MODE_RESTRICTED`/FORBIDDEN stream panel (id 9), `app_info{provider,provider_mode}` stat panel (id 10); `schemaVersion: 39`, Loki uid `loki`, `gridPos`, `allowUiUpdates: false` kept | `infra/grafana/provisioning/dashboards/important-logs.json` (modify)                                                         |
| T3  | Evidence only (DO NOT rebuild): `ProdOnStub` (critical, uid `prod-on-stub`) + `TestModeRestrictedSpike` (warning, uid `test-mode-restricted-spike`) already exist in the `cogito-1m` group with zero-safe `or vector(0)` queries and `noDataState: OK`; record uids + semantics in this plan                                               | `infra/grafana/provisioning/alerting/rules.yaml` (read-only evidence)                                                        |
| T4  | Evidence only (DO NOT rebuild): Coolify env-dupe uniqueness guard already exists in `env.yml` (`Fail loud on duplicate Coolify env rows`, exactly-once assert, names dupes + missing, RUNBOOK pointer, no auto-delete); record in this plan                                                                                                | `infra/ansible/tasks/env.yml` (read-only evidence)                                                                           |
| T5  | Surgical doc updates: `plans/README.md` Active entry; `MIDTRANS-MIGRATION.md` / `API-REFERENCE.md` / `RUNBOOK.md` / `CONTEXT.md` — remove stale Payment Logs board claims, point payment observability at the Important Logs board                                                                                                         | `docs/plans/README.md`, `docs/MIDTRANS-MIGRATION.md`, `docs/API-REFERENCE.md`, `docs/RUNBOOK.md`, `docs/CONTEXT.md` (modify) |
| T6  | Validate (`python3 -m json.tool` on the board, `bun run lint` zero-new), Conventional Commits on `w/docs-ops-important-logs`, push to `origin/w/docs-ops-important-logs`, write `WORKER-REPORT.md`                                                                                                                                         | `WORKER-REPORT.md` (create, worktree root; never commit `BRIEF.md`)                                                          |

## Verification

1. `python3 -m json.tool infra/grafana/provisioning/dashboards/important-logs.json`
   passes (valid JSON, no secrets, 10 panels).
2. `bun run lint` shows zero NEW issues in touched files (docs/json-only
   changes should be lint-silent; confirm).
3. No changes outside Scope (`packages/api`, `packages/db`, `apps/server`
   untouched); no secrets added; no stale "Payment Logs board" claims in
   touched sections (historical mentions in completed plans untouched).
4. No `KeepLast` in touched alert/board content; `schemaVersion: 39`, Loki
   uid `loki`, `allowUiUpdates: false` preserved.
5. Operator live-verify (next session, not this worker): Grafana shows the
   Important Logs board in the Cogito folder with 10 panels; boot line
   `{service="cogito-api"} |= "payment_provider_configured"` renders with
   `provider=midtrans midtransMode=test`; `app_info` stat shows the live
   provider/mode; both payment alerts evaluate (stub alert OK while on
   midtrans); a duplicate env row fails the playbook with the dupe keys
   named; RUNBOOK dedupe procedure resolves it.
6. Conventional Commits pushed to `origin/w/docs-ops-important-logs`;
   `WORKER-REPORT.md` records files + SHAs, validation evidence,
   conventions, remains/blocked. Never merge, never touch prod, never
   handle secrets.

## Rollback

- **Dashboard:** `git revert` the board commit and re-run
  `./infra/apply.sh observability` (tunnels up). Grafana file provisioning
  only re-saves changed content. Until re-applied, the old 7-panel board
  keeps serving — no outage path.
- **Alerts/env guard:** evidence-only — nothing to revert in this wave
  (`rules.yaml` T3 and `env.yml` T4 unchanged). Their own reverts live with
  their owning waves.
- **Docs/plan:** `git revert`; no runtime effect.
- **Provider rollback (unchanged, owned by `docs/MIDTRANS-MIGRATION.md` §6):**
  `PAYMENT_PROVIDER=xendit` + matching `XENDIT_MODE`/keys; Xendit path stays
  wired. This wave adds no new rollback dependency.
