# WORKER REPORT — obs-mon / Task 4 (PLG monitoring stack, declarative only)

Worker: `worker-prod` (production-reliability skill only). Worktree
`~/cogito/wt-obs-mon`, branch `f/obs-monitor`, cut from `origin/main` at
`5b762c76` (verified `git rev-parse HEAD == origin/main` before starting;
never rebased). No SSH, no Coolify API writes, no secrets invented or echoed.

## Commits (2, sequential, Conventional Commits)

- `5e33b2b0` `feat(infra): tailnet-only Loki+Prometheus+Grafana observability stack`
  (11 files: playbook + provisioned configs + dashboards)
- `ef1787a9` `feat(infra): observability ops helper, swap/limits docs, Task 4 status`
  (4 files: `infra/ops.sh`, `docs/RUNBOOK.md`, `docs/CONTEXT.md`, plan Task 4 checkboxes)

Pre-existing `M .opencode/agents/worker-*.md` modifications were left untouched
(not mine, never staged). `WORKER-BRIEF.md` (lead-placed, untracked) left
untouched. Nothing under `apps/` or `packages/` was touched.

## What changed

Phase 1 — playbook + configs (all new, declarative only):
- `infra/ansible/observability.yml` — control-node driven (`hosts: localhost`),
  modeled structurally on `uptime-kuma.yml`: SOPS vault decrypt+parse on the
  control node, `COOLIFY_API_TOKEN` required, `METRICS_TOKEN` /
  `DISCORD_WEBHOOK_URL` presence-asserted by NAME only (never echoed, `no_log`
  on secret-bearing calls), project/env/server lookup, per-service
  create-when-missing + PATCH-drift via `tasks/observability-service.yml`,
  `--check`-mode early exit. Declares `cogito-loki` (volume `loki-data`,
  300M), `cogito-prometheus` (`prometheus-data`, 256M, retention
  `--storage.tsdb.retention.time=15d` from `prom_retention_days=15`),
  `cogito-grafana` (`grafana-data`, 256M, `urls: []` — tailnet-only, no
  public domain, drift-checked back to `[]`), `cogito-alloy` bundle (Alloy
  128M + node_exporter 64M + cAdvisor 128M, stateless). Prints exact
  config-placement, verification, and Grafana→Discord runbook steps.
- `infra/ansible/tasks/observability-service.yml` — shared per-service
  declare loop (mirrors `tasks/database.yml` drift discipline: never
  recreate, create only when missing with `instant_deploy`, PATCH name drift).
- `infra/prometheus/prometheus.yml` — 15s scrape / 10s timeout; api
  `/metrics` via `https://api.cogitoacademy.id:443` with Bearer from the
  vault **token file** (`credentials_file`, never a value); node_exporter +
  cAdvisor jobs.
- `infra/loki/loki-config.yml` — single-binary, 30d retention
  (`retention_period: 720h` + compactor `retention_enabled`, in sync with
  `LOKI_RETENTION_DAYS=30`).
- `infra/alloy/config.alloy` — `loki.source.docker_logs` over the read-only
  Docker socket (Docker API discovery; A3: no `local.file_match` /
  `loki.source.file`, no globs under `/var/lib/docker`).
- `infra/grafana/provisioning/datasources/loki-prom.yml` + `dashboards/dashboards.yml`
  + 4 dashboards: App RED (`app-red.json`), Logs & Traces with
  traceId/userId search (`logs-traces.json`), Infra with 85%/92% disk lines
  matching the watchdog (`infra.json`), Delivery with deploys/backups/DLQ/breakers
  (`delivery.json`). UI edits disabled (`allowUiUpdates: false`).

Phase 2 — swap + limits + ops helper (docs only, nothing applied):
- `docs/RUNBOOK.md` — Memory-headroom section now lists the 2G swap command
  (+ fstab + verify) and the full limits table (existing API 512M/Redis
  256M/Postgres 512M/Kuma 256M + new Loki 300M/Prometheus 256M/Grafana
  256M/Alloy bundle), marked operator-only; new “Observability stack (PLG,
  tailnet-only)” subsection (access, provisioned files, retention vars +
  lean fallback 30s/7d, trace helper, Discord wiring).
- `infra/ops.sh` — `trace <traceId>` prints the tailnet Grafana Explore URL
  (+ raw LogQL); usage text, `GRAFANA_URL` override
  (default `http://100.124.43.19:3000`), `help` range updated.
- `docs/CONTEXT.md` — one “declared, NOT yet applied” bullet (rule-11,
  my changes only).
- Plan `docs/plans/active/OBSERVABILITY-STABILITY-WAVE.md` Task 4: Steps 1
  and 3 checked with status notes; Step 2 stays open as operator-owned.

Design notes / assumptions (for the operator + reviewers):
- Compose blocks bind-mount host paths under `/etc/cogito/observability/`
  (same `/etc/cogito/...` convention as the watchdog env); the playbook
  prints the exact one-time `scp` + token-pipe commands.
- Internal URLs use Compose service names on the shared Coolify Docker
  network; each file notes the tailnet-IP fallback if Coolify isolates
  service networks.
- Image tags pinned at authoring time (Loki 3.4.0, Prometheus v3.2.1,
  Grafana 11.5.2, Alloy v1.7.4, node-exporter v1.9.0, cAdvisor v0.52.1);
  operator confirms they resolve on first apply.
- `coolify-resources.yml` was intentionally NOT modified: the new services
  are declared by `observability.yml` itself (the “API-expressible” branch
  of the task); no UI-fallback note was needed there.
- cAdvisor’s read-only `/var/lib/docker` mount is its documented metadata
  requirement, not log shipping — log collection stays Docker-API-only (A3).

## Verification (all green, verbatim)

- `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml --syntax-check`
  → `playbook: infra/ansible/observability.yml` (clean)
- `python3 yaml.safe_load` over the 6 YAML files → `YAML: OK`;
  `json.load` over the 4 dashboards → `JSON: OK`
- `bash -n infra/ops.sh` → `OK`
- `./infra/ops.sh trace req_abc123` → Explore URL + LogQL line (local only,
  no network); `./infra/ops.sh trace` (no arg) → usage, rc=1
- Self-checks: no webhook URLs / Bearer values / emails in any new file;
  no `loki.source.file` / `file_match` components (only the A3 prohibition
  comments match)
- `bun run check` → exit code 0 (warnings only, pre-existing)
- Full test suite deliberately NOT run per brief (shared test DB owned by
  sibling verification)
- Alloy config has no local validator available here — UNVERIFIED beyond
  careful authoring; the operator’s apply + Loki-target check covers it
  (see checklist item 4)

## OPERATOR-APPLY checklist (exact commands, operator machine only)

1. Tunnel: `ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@<tailnet-ip>`
2. (Optional, structure only — already verified by this worker):
   `ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/observability.yml`
3. Ensure vault keys (values never leave the vault):
   `sops infra/secrets/prod.env` → must contain `METRICS_TOKEN` (hex from
   `openssl rand -hex 32`, same value already applied to `cogito-api` env)
   and `DISCORD_WEBHOOK_URL`.
4. Place provisioned files (prints from the playbook; secret via pipe, never argv):
   `ssh ubuntu@<tailnet-ip> 'sudo mkdir -p /etc/cogito/observability/{loki,prometheus,alloy,grafana/provisioning} && sudo chown -R ubuntu:ubuntu /etc/cogito/observability'`
   `scp infra/loki/loki-config.yml ubuntu@<tailnet-ip>:/etc/cogito/observability/loki/loki-config.yml`
   `scp infra/prometheus/prometheus.yml ubuntu@<tailnet-ip>:/etc/cogito/observability/prometheus/prometheus.yml`
   `scp infra/alloy/config.alloy ubuntu@<tailnet-ip>:/etc/cogito/observability/alloy/config.alloy`
   `scp -r infra/grafana/provisioning/. ubuntu@<tailnet-ip>:/etc/cogito/observability/grafana/provisioning/`
   `sops -d infra/secrets/prod.env | grep '^METRICS_TOKEN=' | cut -d= -f2- | ssh ubuntu@<tailnet-ip> 'cat > /etc/cogito/observability/prometheus/metrics_token && chmod 600 /etc/cogito/observability/prometheus/metrics_token'`
5. Apply: `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml`
   (idempotent; re-runs are no-ops). In the Coolify UI set
   `GF_SECURITY_ADMIN_PASSWORD` on `cogito-grafana`, then redeploy
   `cogito-prometheus` + `cogito-alloy` so the new mounts take effect.
6. Verify: Grafana tailnet login (`ssh -L 3000:127.0.0.1:3000 ...`, port
   3000); LogQL `{service="cogito-app-server"} |= "traceId"` (or
   `./infra/ops.sh trace <traceId>`); Prometheus `targets` UP (tunnel 9090);
   Loki 30d / Prometheus 15d retention flags; Grafana Alerting → Discord
   contact point → Test (suggested rules DLQFresh/DiskWarn/DiskCrit/ApiErrors
   per the playbook output). Kuma + watchdog alerting unchanged.
7. Swap (VPS, operator decision): `sudo fallocate -l 2G /swapfile &&
   sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
   + fstab entry + `free -m`. Memory limits in Coolify UI → resource →
   Advanced: API 512M, Loki 300M, Prometheus 256M, Grafana 256M
   (Alloy 128M / node_exporter 64M / cAdvisor 128M already in compose).

## What remains / blocked

- Nothing blocked. Remaining work is all operator-owned: apply (Step 2),
  swap + limits, Grafana admin password + Discord contact point + alert
  rules, and the Task 4 live verification (trace search, targets UP,
  retention flags, test alert). No worker-side ambiguity encountered —
  no guesses taken; every unverifiable-here point is labeled above.
