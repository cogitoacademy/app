# Observability Declarative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tailnet-only PLG stack (Loki + Prometheus + Grafana + Alloy) fully declarative through the existing Ansible pipeline — no manual `scp`/`ssh` config placement, no unwired playbook, no silent drift.

**Architecture:** Keep the verified control-node pattern from `uptime-kuma.yml` for Coolify API declares. Add a second SSH playbook (`hosts: cogito_vps`, become) for `/etc/cogito/observability/` file placement modeled on `backup-cron.yml`. Fix `tasks/observability-service.yml` drift to compare full declaration. Wire both playbooks into `apply.sh`, `infra-apply.yml`, `drift-check`, and the runbooks.

**Tech Stack:** Ansible-core 2.21.3 (`ansible.builtin.*` only), Coolify API v4.3.14 (`/api/v1/services`), SOPS 3.13 + Age (control-node decrypt only), Bash (`infra/apply.sh`, `infra/ops.sh`), GitHub Actions (`infra-apply.yml`, `infra-plan.yml` glob picks up new playbooks automatically).

---

## Reconciliation against live reality (2026-09-06, `agent/obs-reconcile` — read-only, no behavior changed)

This plan was written pre-#200 and is partly stale. It was reconciled against
two live-verified inputs — prefer them over this plan where they conflict:

- **#200** (`1d761b43`, = `origin/main` base of this branch): PLG applied live.
  Fixed in git: base64 `docker_compose_raw`, `loki.source.docker` (not
  `docker_logs`), shared `cogito-obs` network, **0644 metrics token**
  (Prometheus runs as nobody — the `0600` values quoted in Task 2 below are
  stale), file-provisioned alert rules. `docs/CONTEXT.md` PLG bullet already
  reads **APPLIED live 2026-09-05** (Task 4 Step 4's "operator apply pending"
  wording must NOT be re-applied — that would regress the docs).
- **A) `origin/f/obs-declarative` (`1b669846`, purely additive: 463+/0- across
  4 files):** appends Plays 2–3 to `infra/ansible/observability.yml`
  (Play 2 `hosts: cogito_vps`: shared-network ensure, checksummed file sync,
  vault `METRICS_TOKEN` → 0644, Grafana admin-password reset; Play 3
  `hosts: localhost`: fail-loud `:3000` tunnel gate, `Cogito` folder,
  `Discord-ops` contact create-only + default-policy receiver; alert rules
  stay file-provisioned), new verify-only `infra/ansible/studio.yml`
  (existence + `running` + loopback `:4983` probe; never restarts),
  `declared_services` existence gate for all 5 services in
  `infra/ansible/drift-check.yml`, and `docs/INFRA-PLAYBOOK.md` §3c + §3 table
  rows (operator-machine run; "the runner cannot open your tunnels").

| Task                                                         | Verdict   | Covering commit + file, or remaining delta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — pipeline wiring (`apply.sh` + `infra-apply.yml`)         | **MERGE** | INFRA-PLAYBOOK §3-table step SUPERSEDED by `1b669846` (`docs/INFRA-PLAYBOOK.md` §3c + table rows, live-verified wording). `apply.sh` subcommands/markers/`all`-order, `infra-apply.yml` detect/filters/steps, `infra/ansible/README.md` apply order, `infra/APPLY-RUNBOOK.md` — still needed: zero `observability` mentions in all four files at base (verified 2026-09-06). Open question: §3c prescribes operator-machine runs — confirm whether `infra-apply.yml` wiring should still proceed (esp. Play 3's `:3000` gate on the self-hosted runner) before implementing.     |
| 2 — `observability-config.yml` (new file, SSH placement)     | **MERGE** | Placement mechanism SUPERSEDED by `1b669846` Play 2 in `infra/ansible/observability.yml` (single-file, `root:root`, 0644 token, + network/admin-password extras) — do NOT create a second competing playbook. Remaining delta: replace the stale imperative `scp` debug block (base `observability.yml:480-489`, retained verbatim on `f/obs-declarative`) with a Play-2 pointer; fix stale `0600` header comment (`observability.yml:33`) and `infra/prometheus/prometheus.yml:12-13` (`root 0600`) → live `0644`; fix stale `ubuntu:ubuntu` ownership note → live `root:root`. |
| 3 — `tasks/observability-service.yml` full-declaration drift | **KEEP**  | Untouched by `1b669846` (not in its file set). Gap live at base: `obs_drift` compares `name` only (`tasks/observability-service.yml:55-60`); PATCH body already sends the full declaration (`:68-72`). Implement as written.                                                                                                                                                                                                                                                                                                                                                     |
| 4 — `drift-check-observability.yml` (new) + docs sync        | **MERGE** | Existence gate SUPERSEDED by `1b669846` (`infra/ansible/drift-check.yml` `declared_services`, 5 services). Remaining delta: `urls == []` tailnet-only invariant + image pins + retention flags (recommend extending `drift-check.yml` per the branch-A direction, drop the new-file preference); docs: `INFRA-PLAYBOOK.md` §3c done, `docs/CONTEXT.md` already APPLIED (Step 4 wording stale — rewrite, do not regress), `docs/RUNBOOK.md` command refresh + `infra/APPLY-RUNBOOK.md` §3/§4 rows + `docs/plans/README.md` index row still needed.                                |

Implementers: execute the KEEP/MERGE deltas above; treat SUPERSEDED steps as
do-not-implement (they would duplicate or regress live-verified state).

## Implementation record (2026-09-06, `agent/obs-declarative-wave`, single worker)

Tasks 1–4 implemented in one commit (`feat(infra): declarative PLG pipeline
wiring + drift gates`) under the operator-approved Q-decisions (do not
re-litigate):

- **Q1 — `infra-apply.yml` wired:** single `Apply — observability` step runs
  the full 3-play `observability.yml` on the runner with
  `-e coolify_api_url="http://127.0.0.1:8000/api/v1" --connection=local`
  (loopback like uptime-kuma, local-connection like backup-cron; Play 3's
  `:3000` gate reaches VPS loopback directly on the runner — no operator
  tunnel needed in the box). `workflow_dispatch` break-glass kept (step
  `if:` includes it, like every other apply step). Single `observability`
  filter output; vault changes also trigger the step (vault-owned token +
  webhook flow through the declares).
- **Q2 — single-file Play 2, no `observability-config.yml`:** one
  `apply.sh observability` phase + `observability-declared` marker, `all`
  slot after `resources`. Config placement lives in-playbook (Play 2); the
  stale imperative `scp`/sops-pipe debug block is now a Play-2 pointer.
- **Q3 — extended `drift-check.yml`, no new drift file:** `urls == []`
  tailnet gate + image-pin checks for all 5 PLG/studio services beside the
  existing `declared_services` existence gate. Retention stays a
  Manual-checks comment (service-detail endpoint exposes no retention
  fields).
- **Q4 — token state is 0644 root:root:** fixed the stale `0600` comments in
  `observability.yml` header and `prometheus.yml:12-13` only; no secret
  material touched (`no_log` kept on all secret-bearing calls; compose
  carries no secrets).
- **Docs:** `CONTEXT.md` left untouched (PLG bullet already APPLIED live
  2026-09-05 — rewriting it would regress). Per-task step boxes below are
  checked where implemented; SUPERSEDED / single-commit-subsumed steps stay
  unchecked with the reason in parentheses.

## Global Constraints

- Grafana is TAILNET-ONLY forever — `urls: []` on all four PLG services, no public domain, no anonymous auth (`GF_AUTH_ANONYMOUS_ENABLED=false`).
- The SOPS Age private key NEVER enters CI (`infra-plan.yml` is syntax-check only) and NEVER reaches the VPS — decrypt on the control node / runner in-memory only.
- `hosts: localhost` playbooks never SSH themselves; `hosts: cogito_vps` playbooks use `--ask-become-pass` (operator) or `--connection=local` on the self-hosted runner.
- Secret values are never echoed, never in argv — pipe via stdin or lookup, `no_log: true` on every secret-bearing task.
- Alloy ships logs via `loki.source.docker_logs` (Docker API) ONLY — never add `local.file_match` / `loki.source.file` globs under `/var/lib/docker`.
- Logs carry `userId`, never email.
- Docs follow code (AGENTS.md rule 11): same PR updates `docs/CONTEXT.md`, `docs/RUNBOOK.md`, `docs/INFRA-PLAYBOOK.md`, `infra/ansible/README.md`, `infra/APPLY-RUNBOOK.md`, `docs/DEPLOYMENT.md` (if pipeline semantics change), and this plan + `docs/plans/README.md` index.
- CI gates: `ansible-playbook --syntax-check` on every `infra/ansible/*.yml` must stay green; Conventional Commits; PRs only, squash-merge, wait for `gh pr checks --watch`.

---

## File Structure

| File                                                                                                      | Responsibility                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/ansible/observability.yml`                                                                         | Declares the 4 Coolify services via API (existing — Task 1 wires it, Task 3 fixes its drift include). No file placement after Task 2 (prints a pointer to the config playbook instead).                          |
| `infra/ansible/observability-config.yml` **(new)**                                                        | Places provisioned files on the VPS via SSH+become: `loki-config.yml`, `prometheus.yml`, `config.alloy`, `grafana/provisioning/**`, `metrics_token` (0600 from vault). Idempotent, modeled on `backup-cron.yml`. |
| `infra/ansible/tasks/observability-service.yml`                                                           | Per-service create-if-missing + PATCH drift (existing — Task 3 fixes `obs_drift` to compare `docker_compose_raw` + `urls` + `description`, not just `name`).                                                     |
| `infra/ansible/drift-check.yml` **or** `infra/ansible/drift-check-observability.yml` **(new, preferred)** | Read-only GET verification for the 4 PLG services (names + `urls == []` + image tags + retention flags). Fails on drift, safe to re-run.                                                                         |
| `infra/apply.sh`                                                                                          | Adds `observability` + `observability-config` subcommands, markers, and `all`-order slots (existing — Task 1 extends).                                                                                           |
| `.github/workflows/infra-apply.yml`                                                                       | Adds `observability` + `observability-config` paths-filter outputs and apply steps (existing — Task 1 extends).                                                                                                  |
| `infra/ansible/README.md`, `docs/INFRA-PLAYBOOK.md`, `infra/APPLY-RUNBOOK.md`                             | Operator docs: apply order, scenario→command table, credential/verify steps (existing — Task 1 + Task 4 update).                                                                                                 |
| `docs/CONTEXT.md`, `docs/RUNBOOK.md`, `docs/plans/README.md`                                              | Live-state + ops detail + plan index (existing — Task 4 syncs).                                                                                                                                                  |

---

### Task 1: Wire observability into the existing pipeline

> **Reconciliation verdict: MERGE** (2026-09-06). Steps 1–6, 8–9 still needed
> (`apply.sh`, `infra-apply.yml`, `README.md` apply order have zero
> `observability` mentions at base). Step 7 (INFRA-PLAYBOOK §3 table) is
> SUPERSEDED by `1b669846` §3c + table rows — do not re-apply the plan's row
> text; wire code first, then align docs to §3c. Open question: §3c mandates
> operator-machine runs — confirm `infra-apply.yml` wiring is still wanted
> (esp. Play 3's `:3000` gate on the self-hosted runner) before Step 5.

**Files:**

- Modify: `infra/apply.sh`
- Modify: `.github/workflows/infra-apply.yml`
- Modify: `infra/ansible/README.md`
- Modify: `docs/INFRA-PLAYBOOK.md`

**Interfaces:**

- Consumes: existing `infra/ansible/observability.yml` vars (`coolify_api_url`, `vault_path`, `project_name: cogito-prod`, `environment_name: production`) and existing `phase_resources` / `uptime-kuma` apply-step patterns.
- Produces: `./infra/apply.sh observability` + `./infra/apply.sh observability-config` subcommands with markers `observability-declared` / `observability-configured`; `infra-apply.yml` outputs `observability`, `observability-config` consumed by Task 2 and Task 4.

- [x] **Step 1: Add `observability` case to `apply.sh` usage header** (implemented 2026-09-06 — single phase per Q2, no `observability-config` subcommand)

In `infra/apply.sh` lines 13-24, extend the subcommand comment block so `--dry-run` help advertises the new phases:

```bash
#   resources       coolify-resources.yml (+ Traefik paste reminder)
#   observability   observability.yml (declare Loki/Prometheus/Grafana/Alloy services via Coolify API)
#   observability-config observability-config.yml (place /etc/cogito/observability/ files via SSH+become)
#   backup-cron     backup-cron.yml (DATABASE_URL reachability check + y/N)
```

- [x] **Step 2: Add `phase_observability` function to `apply.sh`** (implemented 2026-09-06 — single phase covering declare + Play-2 host files + Play-3 wiring per Q2)

Insert after `phase_resources` (ends line 340, `marker_set resources-synced`), before `phase_backup_cron` (line 342):

```bash
phase_observability() {
  say ""
  say "=== observability: declare Loki/Prometheus/Grafana/Alloy via Coolify API (tailnet-only, no public domain) ==="
  require_sops
  require_tool ansible-playbook " Install ansible-core (e.g. brew install ansible)."
  run_exec "ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml --ask-become-pass" \
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml --ask-become-pass
  say "  next: run './infra/apply.sh observability-config' to place /etc/cogito/observability/ files, then verify Prometheus targets UP over the tailnet."
  marker_set observability-declared
}

phase_observability_config() {
  say ""
  say "=== observability-config: place provisioned files on the VPS (SSH+become, idempotent) ==="
  require_sops
  require_tool ansible-playbook " Install ansible-core (e.g. brew install ansible)."
  run_exec "ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability-config.yml --ask-become-pass" \
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability-config.yml --ask-become-pass
  say "  then: redeploy cogito-prometheus + cogito-alloy in Coolify UI (config consumers), verify targets UP."
  marker_set observability-configured
}
```

- [x] **Step 3: Wire the new case into `apply.sh` main dispatch + `all` order + `status` markers** (implemented 2026-09-06 — single `observability-declared` marker, `all` slot after `resources`)

In `main()` case block (lines 513-524), add:

```bash
    observability ) phase_observability ;;
    observability-config ) phase_observability_config ;;
```

In `phase_status` marker loop (line 411), extend the list:

```bash
  for m in tf-imported tailscale-joined tailscale-verified hardened resources-synced observability-declared observability-configured backup-cron-installed tf-applied; do
```

Add pending-phase helpers before `cmd_all` (after `phase_resources_if_pending`, ~line 455):

```bash
phase_observability_if_pending() {
  if marker_done observability-declared; then say "  skip observability — marker $STATE_DIR/observability-declared present (re-run infra/apply.sh observability to re-sync)"; return 0; fi
  pause_before "observability (observability.yml)"
  phase_observability
}
phase_observability_config_if_pending() {
  if marker_done observability-configured; then say "  skip observability-config — marker $STATE_DIR/observability-configured present"; return 0; fi
  pause_before "observability-config (observability-config.yml)"
  phase_observability_config
}
```

In `cmd_all` (lines 468-476), insert after `phase_resources_if_pending`:

```bash
  phase_observability_if_pending
  phase_observability_config_if_pending
```

- [x] **Step 4: Verify `apply.sh` still parses + dry-runs** (implemented 2026-09-06 — `bash -n` + `--dry-run all` show the `observability` phase; see wave acceptance)

Run:

```bash
bash -n infra/apply.sh
./infra/apply.sh help
./infra/apply.sh --dry-run all
```

Expected: `help` lists `observability` + `observability-config`; `--dry-run all` prints the full ordered plan including the two new phases with `[pause]` lines and `would run:` lines, exits 0, executes nothing.

- [x] **Step 5: Add `observability` detection + apply step to `infra-apply.yml`** (implemented 2026-09-06 — single `observability` output/filter, loopback `-e` + `--connection=local`, vault-triggered, `workflow_dispatch` kept per Q1)

In `.github/workflows/infra-apply.yml` `detect` job outputs (lines 60-67), add:

```yaml
observability: ${{ steps.filter.outputs.observability }}
observability-config: ${{ steps.filter.outputs.observability-config }}
```

In the `filters:` block (lines 75-95), add:

```yaml
observability:
  - "infra/ansible/observability.yml"
  - "infra/ansible/tasks/observability-service.yml"
  - "infra/prometheus/**"
  - "infra/loki/**"
  - "infra/alloy/**"
  - "infra/grafana/**"
observability-config:
  - "infra/ansible/observability-config.yml"
  - "infra/prometheus/**"
  - "infra/loki/**"
  - "infra/alloy/**"
  - "infra/grafana/**"
```

Extend the `any:` list (lines 89-95) with the same seven paths plus `infra/ansible/observability-config.yml`.

After the `Apply — uptime-kuma` step (lines 241-245), insert before `Post-apply verification`:

```yaml
- name: Apply — observability (Coolify API declares)
  if: github.event_name == 'workflow_dispatch' || needs.detect.outputs.observability == 'true' || needs.detect.outputs.vault == 'true'
  run: |
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml \
      -e coolify_api_url="http://127.0.0.1:8000/api/v1"

- name: Apply — observability-config (local connection — the runner IS the host)
  if: github.event_name == 'workflow_dispatch' || needs.detect.outputs.observability-config == 'true' || needs.detect.outputs.observability == 'true' || needs.detect.outputs.vault == 'true'
  run: ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability-config.yml --connection=local
```

Note: `observability.yml` is `hosts: localhost` control-node driven (same as `uptime-kuma.yml`), so it takes `-e coolify_api_url` loopback override. `observability-config.yml` is `hosts: cogito_vps` (Task 2), so on the runner it uses `--connection=local` exactly like `backup-cron.yml` / `disk-watchdog.yml`.

- [x] **Step 6: Update `infra/ansible/README.md` apply order + playbook table** (implemented 2026-09-06 — `observability.yml` item 4 after `resources`, tunnel note, drift-check PLG coverage)

In the `## Apply order` numbered list (currently ends at 5. `drift-check.yml`), insert as new items 4-5 and renumber `backup-cron`/`drift-check` down:

```markdown
4. **`observability.yml`** — declare the 4 PLG services via the Coolify API
   (`cogito-loki` / `cogito-prometheus` / `cogito-grafana` tailnet-only /
   `cogito-alloy` bundle). Control-node driven (`hosts: localhost`); needs the
   SSH tunnel `ssh -L 8000:127.0.0.1:8000` like `coolify-resources.yml`.
5. **`observability-config.yml`** — place provisioned files on the VPS
   (`/etc/cogito/observability/{loki,prometheus,alloy,grafana/provisioning}`
   - `metrics_token` 0600 from the vault). SSH+become (`hosts: cogito_vps`).
     Then redeploy `cogito-prometheus` + `cogito-alloy` in Coolify UI.
6. **`backup-cron.yml`** — (existing text unchanged)
7. **`drift-check.yml`** — (existing text unchanged, plus PLG coverage in Task 4)
```

In the `## Other playbooks` table, the `uptime-kuma.yml` row stays; the table needs no change for this task beyond the ordered list (observability is ordered, not "other").

- [ ] **Step 7: Update `docs/INFRA-PLAYBOOK.md` §3 change table** (SUPERSEDED — §3c + table rows live-verified in `1b669846`, not re-applied)

In the `| You touched | What happens on merge | Manual fallback |` table (lines 65-70), add one row after the `coolify-resources.yml` row:

```markdown
| `observability.yml` / `observability-config.yml` / `infra/{prometheus,loki,alloy,grafana}/**` | observability services re-declared + config files re-placed on the runner, post-apply `/health` verify last | `./infra/apply.sh observability` then `./infra/apply.sh observability-config` |
```

- [x] **Step 8: Syntax-check everything this task touched** (implemented 2026-09-06 — see wave acceptance: all playbooks syntax-check 0, `bash -n`, YAML parse)

Run:

```bash
ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/observability.yml
bash -n infra/apply.sh
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/infra-apply.yml')); print('infra-apply.yml YAML OK')"
```

Expected: all three exit 0. (`infra-plan.yml` globs `infra/ansible/*.yml`, so the new `observability-config.yml` from Task 2 will be picked up automatically — no workflow change needed for syntax-check.)

- [ ] **Step 9: Commit** (subsumed — wave ships as one commit `feat(infra): declarative PLG pipeline wiring + drift gates`)

```bash
git add infra/apply.sh .github/workflows/infra-apply.yml infra/ansible/README.md docs/INFRA-PLAYBOOK.md
git commit -m "feat(infra): wire observability into apply.sh and infra-apply pipeline"
```

---

### Task 2: Declarative config placement (`observability-config.yml`)

> **Reconciliation verdict: MERGE** (2026-09-06). Do NOT execute Steps 1–4 +
> 7 as written (new `observability-config.yml` file): the mechanism is
> SUPERSEDED by `1b669846` Play 2 inside `infra/ansible/observability.yml`
> (single-file, checksummed sync, shared-network ensure, vault token →
> **0644** `root:root`, Grafana admin-password reset — live-verified; the
> `0600` / `ubuntu:ubuntu` values in the steps below are stale). Remaining
> delta: Step 5 retargeted — replace the stale `scp` debug block (base
> `observability.yml:480-489`, retained on `f/obs-declarative`) with a Play-2
> pointer; fix the stale `0600` header (`observability.yml:33`) and
> `infra/prometheus/prometheus.yml:12-13` comments → `0644`; then Step 6
> syntax-check. Keep the `apply.sh observability-config` naming decision open
> until the Task 1 open question (single-file Play 2 vs split file) is
> resolved with the operator.

**Files:**

- Create: `infra/ansible/observability-config.yml`
- Modify: `infra/ansible/observability.yml` (replace the printed `scp` block with a pointer to the new playbook)

**Interfaces:**

- Consumes: git source-of-truth `infra/loki/loki-config.yml`, `infra/prometheus/prometheus.yml`, `infra/alloy/config.alloy`, `infra/grafana/provisioning/**`; vault keys `METRICS_TOKEN` (file 0600) — same `sops -d` + tempfile + python3-parse idiom as `observability.yml:232-272` and `backup-cron.yml:1-48`.
- Produces: `/etc/cogito/observability/{loki/loki-config.yml,prometheus/prometheus.yml,alloy/config.alloy,grafana/provisioning/**}` (0644 / dirs 0755, `ubuntu:ubuntu` so Coolify bind-mounts read cleanly — see current manual `chown` in the printed step) + `/etc/cogito/observability/prometheus/metrics_token` (0600, `root:root`); handler-equivalent note to redeploy `cogito-prometheus` + `cogito-alloy` (Coolify UI redeploy — API redeploy is out of scope, print the reminder like today).

- [ ] **Step 1: Create `infra/ansible/observability-config.yml` with the header + vars** (SUPERSEDED — Play 2 in `observability.yml` owns placement per Q2, no second file)

Create the file with this exact header and play opening (modeled on `backup-cron.yml:1-48` for the SSH+become shape and on `observability.yml:27-35` for the path contract):

```yaml
# observability-config.yml — place PLG provisioned files on the VPS, idempotently.
#
# WHAT THIS PLAYBOOK PLACES (git is the source of truth):
#   infra/loki/loki-config.yml        -> /etc/cogito/observability/loki/loki-config.yml (0644)
#   infra/prometheus/prometheus.yml   -> /etc/cogito/observability/prometheus/prometheus.yml (0644)
#   infra/alloy/config.alloy          -> /etc/cogito/observability/alloy/config.alloy (0644)
#   infra/grafana/provisioning/**     -> /etc/cogito/observability/grafana/provisioning/ (0644, dirs 0755)
#   vault METRICS_TOKEN               -> /etc/cogito/observability/prometheus/metrics_token (0600, root:root)
#
# Owns ONLY file placement. Service declares live in observability.yml (Coolify API).
# After placement, redeploy the two config consumers (cogito-prometheus, cogito-alloy)
# in the Coolify UI — the playbook prints the reminder, it never calls the Coolify API.
#
# RUN (from the repository root):
#   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability-config.yml --ask-become-pass
# On the self-hosted runner (which IS the host): append --connection=local (see infra-apply.yml).
---
- name: Place PLG provisioned files on the VPS
  hosts: cogito_vps
  become: true
  gather_facts: false

  vars:
    obs_root: /etc/cogito/observability
    vault_path_local: "{{ playbook_dir }}/../secrets/prod.env"
```

- [ ] **Step 2: Add the directory + file-copy tasks (idempotent `copy`, no shell)** (SUPERSEDED — same reason as Step 1)

Append these tasks to the play (uses `ansible.builtin.copy` directory mode exactly like the manual `mkdir -p ... && chown -R ubuntu:ubuntu` step it replaces):

```yaml
tasks:
  - name: Create the observability config tree
    ansible.builtin.file:
      path: "{{ obs_root }}/{{ item }}"
      state: directory
      owner: ubuntu
      group: ubuntu
      mode: "0755"
    loop:
      - loki
      - prometheus
      - alloy
      - grafana/provisioning

  - name: Place loki-config.yml
    ansible.builtin.copy:
      src: "{{ playbook_dir }}/../loki/loki-config.yml"
      dest: "{{ obs_root }}/loki/loki-config.yml"
      owner: ubuntu
      group: ubuntu
      mode: "0644"

  - name: Place prometheus.yml
    ansible.builtin.copy:
      src: "{{ playbook_dir }}/../prometheus/prometheus.yml"
      dest: "{{ obs_root }}/prometheus/prometheus.yml"
      owner: ubuntu
      group: ubuntu
      mode: "0644"

  - name: Place alloy config
    ansible.builtin.copy:
      src: "{{ playbook_dir }}/../alloy/config.alloy"
      dest: "{{ obs_root }}/alloy/config.alloy"
      owner: ubuntu
      group: ubuntu
      mode: "0644"

  - name: Place Grafana provisioning tree
    ansible.builtin.copy:
      src: "{{ playbook_dir }}/../grafana/provisioning/"
      dest: "{{ obs_root }}/grafana/provisioning/"
      owner: ubuntu
      group: ubuntu
      mode: "0644"
      directory_mode: "0755"
```

`copy` with identical content reports `ok` (no change) — re-runs are no-ops, satisfying the idempotence requirement without any `changed_when` hacks.

- [ ] **Step 3: Add the vault-decrypt-on-control-node + `metrics_token` 0600 tasks** (SUPERSEDED — Play 2 already places the token 0644 root:root per Q4)

Append after the copy tasks (same delegate pattern `backup-cron.yml` uses: decrypt with `sops -d` on the control node via `delegate_to: localhost`, then write the single value with `copy content:` + `no_log: true`):

```yaml
- name: Decrypt the SOPS vault on the control node
  ansible.builtin.command: sops -d {{ vault_path_local }}
  changed_when: false
  no_log: true
  register: vault_plaintext
  delegate_to: localhost
  become: false
  environment:
    PATH: "{{ lookup('env', 'PATH') }}:/opt/homebrew/bin:/usr/local/bin"
    SOPS_AGE_KEY_FILE: "{{ lookup('env', 'SOPS_AGE_KEY_FILE') | default(lookup('env', 'HOME') + '/.config/sops/age/keys.txt', true) }}"

- name: Extract METRICS_TOKEN (fail loud when missing)
  ansible.builtin.set_fact:
    metrics_token_value: "{{ (vault_plaintext.stdout_lines | select('match', '^METRICS_TOKEN=') | list | first | default('')) | regex_replace('^METRICS_TOKEN=', '') }}"
  no_log: true

- name: Require METRICS_TOKEN in the vault
  ansible.builtin.assert:
    that:
      - metrics_token_value | length > 0
    fail_msg: >-
      METRICS_TOKEN is missing from the SOPS vault — generate with
      `openssl rand -hex 32`, add via `sops infra/secrets/prod.env`,
      apply METRICS_TOKEN to cogito-api (coolify-resources.yml), then
      re-run this playbook.

- name: Place the Prometheus metrics token file (0600, root-only)
  ansible.builtin.copy:
    dest: "{{ obs_root }}/prometheus/metrics_token"
    content: "{{ metrics_token_value }}"
    owner: root
    group: root
    mode: "0600"
  no_log: true
```

Why `delegate_to: localhost` + `become: false`: the Age key lives on the operator machine, never on the VPS — identical constraint to `backup-cron.yml:6-8`. The value travels inside the Ansible SSH session and lands 0600, never in argv, never in logs.

- [ ] **Step 4: Add the redeploy-reminder + verify-instruction debug task** (SUPERSEDED — Play 1 keeps its reminder + retention notes; see retargeted Step 5)

Append as the final task:

```yaml
- name: Print the config-consumer redeploy reminder
  ansible.builtin.debug:
    msg: |-
      Provisioned files placed under {{ obs_root }}.
      Redeploy the two config consumers in the Coolify UI
      (cogito-prometheus, cogito-alloy) or redeploy those services.
      Retention: Loki 30d (loki-config.yml, keep in sync with
      loki_retention_days=30 in observability.yml), Prometheus 15d
      (--storage.tsdb.retention.time=15d, from prom_retention_days=15).
      Verify over the tailnet: Prometheus targets UP
      (tunnel 9090), LogQL {service="cogito-app-server"} |= "traceId",
      or ./infra/ops.sh trace <traceId>.
```

- [x] **Step 5: Replace the imperative `scp` block in `observability.yml` with a pointer** (implemented 2026-09-06 — retargeted to a Play-2 pointer per Q2; stale `0600` header → `0644 root:root` per Q4; retention/redeploy notes kept)

In `infra/ansible/observability.yml`, replace the `Print the config-placement steps` debug `msg:` body (lines 426-442, the `ssh ... mkdir`, four `scp` lines, and the `sops -d ... | ssh ... metrics_token` pipe) with:

```yaml
          The compose blocks above bind-mount host paths under
          /etc/cogito/observability/. Place them declaratively:

            ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability-config.yml --ask-become-pass
            # or: ./infra/apply.sh observability-config

          (The old manual scp/sops-pipe steps are superseded by that
          playbook — same paths, same 0600 on metrics_token.)
```

Keep the retention note and the restart-consumers note that follow — only the transport mechanism changes.

- [x] **Step 6: Syntax-check the new + edited playbooks** (implemented 2026-09-06 — see wave acceptance)

Run:

```bash
ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/observability-config.yml
ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/observability.yml
```

Expected: both exit 0 with no output beyond the playbook names.

- [ ] **Step 7: Commit** (subsumed — wave ships as one commit `feat(infra): declarative PLG pipeline wiring + drift gates`)

```bash
git add infra/ansible/observability-config.yml infra/ansible/observability.yml
git commit -m "feat(infra): declarative PLG config placement via observability-config.yml"
```

---

### Task 3: Fix `observability-service.yml` drift (compare full declaration)

> **Reconciliation verdict: KEEP** (2026-09-06). Untouched by `1b669846`
> (file not in its set; verified via `git diff --numstat
origin/main..origin/f/obs-declarative`). Name-only `obs_drift` still live
> at base (`tasks/observability-service.yml:55-60`); PATCH body already full
> (`:68-72`). The `drift-check.yml` existence gate from `1b669846` is a
> different layer (read-only verify) and does not substitute this
> declare-time PATCH trigger. Implement as written.

**Files:**

- Modify: `infra/ansible/tasks/observability-service.yml`

**Interfaces:**

- Consumes: loop var `obs_spec` (`name`, `description`, `docker_compose_raw`, `urls`) and registered `obs_detail.json` from `GET /api/v1/services/{uuid}` — same fields the PATCH body already sends.
- Produces: `obs_drift` string that is non-empty whenever `name`, `description`, `docker_compose_raw`, or `urls` diverge, so the existing `when: obs_drift | length > 0` PATCH actually fires.

- [x] **Step 1: Extend the drift comparison to cover `description` + `docker_compose_raw` + `urls`** (implemented 2026-09-06 as written — trimmed-string compose compare, urls by length; PATCH body already full)

Replace the `Build the drift comparison` task (current lines 53-58, name-only) with:

```yaml
- name: Build the drift comparison for {{ obs_spec.name }}
  ansible.builtin.set_fact:
    obs_drift: >-
      {%- set ns = namespace(parts=[]) -%}
      {%- if obs_detail.json.name is defined and obs_detail.json.name != obs_spec.name -%}{%- set ns.parts = ns.parts + ['name: ' ~ obs_detail.json.name ~ ' != ' ~ obs_spec.name] -%}{%- endif -%}
      {%- if obs_detail.json.description is defined and obs_detail.json.description != obs_spec.description -%}{%- set ns.parts = ns.parts + ['description drift'] -%}{%- endif -%}
      {%- if obs_detail.json.docker_compose_raw is defined and (obs_detail.json.docker_compose_raw | string | trim) != (obs_spec.docker_compose_raw | string | trim) -%}{%- set ns.parts = ns.parts + ['docker_compose_raw drift'] -%}{%- endif -%}
      {%- if obs_detail.json.urls is defined and (obs_detail.json.urls | default([]) | length) != (obs_spec.urls | default([]) | length) -%}{%- set ns.parts = ns.parts + ['urls drift: live has ' ~ (obs_detail.json.urls | default([]) | length | string) ~ ' url(s), declared ' ~ (obs_spec.urls | default([]) | length | string)] -%}{%- endif -%}
      {{- ns.parts | join('; ') -}}
```

Design notes (do not simplify away): `docker_compose_raw` is compared as trimmed strings — Coolify may re-serialize whitespace, so the operator confirms on first apply whether the API echoes the raw verbatim; if it normalizes, follow up by comparing a hash of the normalized form (whitespace-collapsed) in the same task. `urls` compares by length (tailnet-only invariant is `0 vs >0`) rather than deep-comparing URL objects, so attaching ANY public domain to Grafana trips drift without brittle fqdn-format coupling. Values are never echoed beyond the `drift`/`length` labels — no secret leakage (compose contains no secrets; image tags and mounts only).

- [x] **Step 2: Verify the PATCH task already sends the full declaration (no change needed, confirm by reading)** (implemented 2026-09-06 — all four keys present, no edit needed)

Confirm `tasks/observability-service.yml` lines 60-74 PATCH body still contains all four keys:

```yaml
body:
  name: "{{ obs_spec.name }}"
  description: "{{ obs_spec.description }}"
  docker_compose_raw: "{{ obs_spec.docker_compose_raw }}"
  urls: "{{ obs_spec.urls }}"
```

If any key is missing, add it. No other edit in this step.

- [x] **Step 3: Syntax-check + dry structural test** (implemented 2026-09-06 — see wave acceptance; `--check` live-run not executed from the worker)

Run:

```bash
ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/observability.yml
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml --check
```

Expected: syntax-check exits 0; `--check` prints `Running with --check: the Coolify API flow is skipped ... structure only` and ends cleanly (the `uri` module performs no requests in check mode — existing behavior, lines 218-230).

- [ ] **Step 4: Commit** (subsumed — wave ships as one commit `feat(infra): declarative PLG pipeline wiring + drift gates`)

```bash
git add infra/ansible/tasks/observability-service.yml
git commit -m "fix(infra): compare full PLG declaration in observability drift check"
```

---

### Task 4: PLG drift-check coverage + docs-follow-code

> **Reconciliation verdict: MERGE** (2026-09-06). Step 1's existence check is
> SUPERSEDED by `1b669846` (`drift-check.yml` `declared_services`, 5
> services) — extend that block with the `urls == []` tailnet invariant +
> image pins + retention flags instead of creating
> `drift-check-observability.yml` (drop the new-file preference; Step 2
> retargeted to `drift-check.yml`). Docs: Step 3 (`APPLY-RUNBOOK.md`),
> Step 5 (`RUNBOOK.md`), Step 6 (`plans/README.md`) still needed (zero
> observability coverage at base); Step 4 (`CONTEXT.md`) wording is stale —
> CONTEXT already reads APPLIED live 2026-09-05, so rewrite the step to a
> no-regression alignment check instead of writing "operator apply pending".

**Files:**

- Create: `infra/ansible/drift-check-observability.yml`
- Modify: `docs/CONTEXT.md` (Deployment wave state → PLG bullet)
- Modify: `docs/RUNBOOK.md` (Monitoring & Alerting → Observability stack section)
- Modify: `docs/plans/README.md` (add this plan row)
- Modify: `infra/APPLY-RUNBOOK.md` (§3 add observability steps, §4 verify row)

**Interfaces:**

- Consumes: Task 1 markers + Task 2 paths + Task 3 drift semantics; existing `drift-check.yml` idiom (GET-only, `drift_check_dry_run`, exit 1 = drift).
- Produces: `ansible-playbook ... drift-check-observability.yml` exit 0 = no drift / 1 = drift; docs stating PLG is pipeline-managed, tailnet-only, with operator verify commands.

- [x] **Step 1: Create `infra/ansible/drift-check-observability.yml` (read-only, fails on drift)** (implemented 2026-09-06 — retargeted per Q3: extended `drift-check.yml` with `urls == []` + image pins for all 5 services, no new file)

Create the file with this content (mirrors `drift-check.yml:59-60` exit contract and the `coolify_api_base` / `coolify_api_token` var convention so the same tunnel + `-e` invocation works):

```yaml
# Drift-check the PLG observability services — read-only, fails on drift.
#
# Checks (Coolify API-expressible):
#   1. All four services exist: cogito-loki / cogito-prometheus /
#      cogito-grafana / cogito-alloy.
#   2. Tailnet-only invariant: each service has zero public urls.
#      (Attaching ANY public domain — especially to Grafana — is drift.)
#   3. Expected images are present in docker_compose_raw
#      (grafana/loki:3.4.0, prom/prometheus:v3.2.1,
#      grafana/grafana:11.5.2, grafana/alloy:v1.7.4).
#
# Run (tunnel up, same as drift-check.yml):
#   ansible-playbook -i infra/ansible/inventory.ini \
#     infra/ansible/drift-check-observability.yml \
#     -e coolify_api_base=http://localhost:8000/api/v1 \
#     -e coolify_api_token="$(sops -d infra/secrets/prod.env | grep COOLIFY_API_TOKEN | cut -d= -f2-)"
# Dry-run (report without failing): append -e drift_check_dry_run=true
# Exit code: 0 = no drift, 1 = drift found, 2 = API/connection failure.
---
- name: Drift-check PLG observability services
  hosts: localhost
  connection: local
  gather_facts: false

  vars:
    coolify_api_base: "http://localhost:8000/api/v1"
    coolify_api_token: "{{ lookup('env', 'COOLIFY_API_TOKEN') | default('', true) }}"
    drift_check_dry_run: false
    declared_plg_services:
      - name: cogito-loki
        image: "grafana/loki:3.4.0"
      - name: cogito-prometheus
        image: "prom/prometheus:v3.2.1"
      - name: cogito-grafana
        image: "grafana/grafana:11.5.2"
      - name: cogito-alloy
        image: "grafana/alloy:v1.7.4"

  tasks:
    - name: Require a Coolify API token
      ansible.builtin.fail:
        msg: >-
          coolify_api_token is empty — pass
          -e coolify_api_token=... (from the SOPS vault: COOLIFY_API_TOKEN)
      when: coolify_api_token | length == 0

    - name: List Coolify services
      ansible.builtin.uri:
        url: "{{ coolify_api_base }}/services"
        method: GET
        headers:
          Authorization: "Bearer {{ coolify_api_token }}"
        return_content: true
        status_code: [200]
      register: services_resp

    - name: Fail on missing PLG services
      ansible.builtin.set_fact:
        plg_drift: "{{ plg_drift | default([]) + ['service ' + item.name + ' not found in Coolify'] }}"
      loop: "{{ declared_plg_services }}"
      when: services_resp.json | selectattr('name', 'equalto', item.name) | list | length == 0

    - name: Fetch each PLG service detail
      ansible.builtin.uri:
        url: "{{ coolify_api_base }}/services/{{ (services_resp.json | selectattr('name', 'equalto', item.name) | first).uuid }}"
        method: GET
        headers:
          Authorization: "Bearer {{ coolify_api_token }}"
        return_content: true
        status_code: [200]
      loop: "{{ declared_plg_services }}"
      register: plg_details
      when: services_resp.json | selectattr('name', 'equalto', item.name) | list | length > 0

    - name: Fail on public urls (tailnet-only invariant)
      ansible.builtin.set_fact:
        plg_drift: "{{ plg_drift | default([]) + ['service ' + item.item.name + ' has public urls (must be tailnet-only, urls: [])'] }}"
      loop: "{{ plg_details.results | default([]) }}"
      when: item.json is defined and (item.json.urls | default([]) | length) > 0

    - name: Fail on image drift
      ansible.builtin.set_fact:
        plg_drift: "{{ plg_drift | default([]) + ['service ' + item.item.name + ' compose does not contain declared image ' + item.item.image] }}"
      loop: "{{ plg_details.results | default([]) }}"
      when: item.json is defined and item.item.image not in (item.json.docker_compose_raw | default('') | string)

    - name: Report drift findings
      ansible.builtin.debug:
        var: plg_drift
      when: plg_drift | default([]) | length > 0

    - name: Fail on drift
      ansible.builtin.fail:
        msg: >-
          DRIFT DETECTED: {{ plg_drift | length }} finding(s) — see plg_drift
          above. Re-run ./infra/apply.sh observability (then
          observability-config for file drift), fix the Coolify UI, and re-run
          this check.
      when: plg_drift | default([]) | length > 0 and not drift_check_dry_run

    - name: No drift
      ansible.builtin.debug:
        msg: "No drift: all four PLG services match the declared tailnet-only state"
      when: plg_drift | default([]) | length == 0
```

Keep image pins in sync with `observability.yml:112-117` when bumping tags — the two files are the same declaration viewed two ways (declare vs verify), exactly like `coolify-resources.yml` ↔ `drift-check.yml`.

- [x] **Step 2: Syntax-check the new drift playbook** (implemented 2026-09-06 — `drift-check.yml` syntax-check in the wave acceptance sweep)

Run:

```bash
ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/drift-check-observability.yml
```

Expected: exit 0.

- [x] **Step 3: Update `infra/APPLY-RUNBOOK.md` §3 + §4** (implemented 2026-09-06 — 4b step, verify row, subcommand-table row; single-phase commands)

After the `backup-cron` step-5 block (§3, ends ~line 150 `# verify`), insert the operator sequence between the `resources` step and the `backup-cron` step to match the new `apply.sh all` order:

```markdown
# 4b. Observability services (Coolify API declare — tailnet-only, no public domain)

ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml \
--ask-become-pass

# 4c. Observability config (SSH+become file placement — replaces the old scp steps)

ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability-config.yml \
--ask-become-pass

# → redeploy cogito-prometheus + cogito-alloy in Coolify UI (config consumers)
```

In the §4 verification table, add one row:

```markdown
| Observability | `ansible-playbook ... drift-check-observability.yml -e ...` exits 0; Prometheus targets UP (tunnel 9090); LogQL `{service="cogito-app-server"} |= "traceId"` returns rows; `./infra/ops.sh trace <traceId>` prints the tailnet Explore URL |
```

- [ ] **Step 4: Update `docs/CONTEXT.md` PLG bullet (Deployment wave state)** (SKIPPED per operator instruction — CONTEXT already reads APPLIED live 2026-09-05; left untouched, no regression)

Replace the parenthetical `(declared 2026-09-05, NOT yet applied — operator apply pending)` in the `Observability stack PLG` bullet with the post-wave state this plan delivers once applied (write the declaration as pipeline-managed, keep the operator-apply-pending flag until the operator actually runs it — do not claim applied before the apply):

```markdown
**Observability stack PLG (declared 2026-09-05, pipeline-managed by OBSERVABILITY-DECLARATIVE — operator apply pending):** `infra/ansible/observability.yml` (Coolify API declares) + `infra/ansible/observability-config.yml` (SSH file placement, supersedes manual scp) + `infra/ansible/drift-check-observability.yml` (tailnet-only + image drift gate), all wired into `infra/apply.sh` (`observability`, `observability-config`) and `infra-apply.yml` (changed-path auto-apply). ... (keep the existing service/volume/retention/swap/ops.sh-trace sentences unchanged)
```

- [x] **Step 5: Update `docs/RUNBOOK.md` Monitoring & Alerting → Observability stack** (implemented 2026-09-06 — declarative-pipeline bullet in the LIVE section: `apply.sh observability`, auto-apply paths, `drift-check.yml` verify command)

Append (or extend, if the section exists by merge time) the declarative operator flow — no new semantics, just the new command names:

```markdown
### Observability stack (PLG, tailnet-only)

Declare: `./infra/apply.sh observability` (Coolify API). Place config:
`./infra/apply.sh observability-config` (replaces manual scp). Verify:
`ansible-playbook -i infra/ansible/inventory.ini infra/ansible/drift-check-observability.yml -e coolify_api_base=http://localhost:8000/api/v1 -e coolify_api_token="$(sops -d infra/secrets/prod.env | grep COOLIFY_API_TOKEN | cut -d= -f2-)"`
(tunnel up; exit 0 = no drift). Prometheus targets UP via `ssh -L 9090:...`;
logs via LogQL `{service="cogito-app-server"} |= "traceId"` or `./infra/ops.sh trace <traceId>`.
Grafana stays tailnet-only (`urls: []` — drift-checked back to empty).
```

- [x] **Step 6: Register this plan in `docs/plans/README.md`** (implemented 2026-09-06 — active-table row added)

Add to the `## Active` table:

```markdown
| [OBSERVABILITY-DECLARATIVE.md](active/OBSERVABILITY-DECLARATIVE.md) | — | — | Active — PLG fully declarative via Ansible pipeline (services + config placement + drift gates); operator apply pending |
```

- [x] **Step 7: Final verification sweep for the whole plan** (implemented 2026-09-06 — see wave acceptance in WORKER-REPORT.md)

Run:

```bash
for pb in infra/ansible/*.yml; do ansible-playbook -i infra/ansible/inventory.ini "$pb" --syntax-check; done
bash -n infra/apply.sh
./infra/apply.sh --dry-run all
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/infra-apply.yml')); print('infra-apply.yml YAML OK')"
```

Expected: every syntax-check exits 0; `--dry-run all` shows `observability` + `observability-config` phases in runbook order; YAML loads clean.

- [ ] **Step 8: Commit** (subsumed — wave ships as one commit `feat(infra): declarative PLG pipeline wiring + drift gates`)

```bash
git add infra/ansible/drift-check-observability.yml infra/APPLY-RUNBOOK.md docs/CONTEXT.md docs/RUNBOOK.md docs/plans/README.md docs/plans/active/OBSERVABILITY-DECLARATIVE.md
git commit -m "feat(infra): PLG drift gates and declarative observability docs"
```

---

## Operator Apply (not part of the code PR — runs after merge)

1. `./infra/apply.sh --dry-run all` (review), then `./infra/apply.sh observability` (tunnel up, `SOPS_AGE_KEY_FILE` exported).
2. `./infra/apply.sh observability-config` → redeploy `cogito-prometheus` + `cogito-alloy` in Coolify UI.
3. `drift-check-observability.yml` (tunnel up) → exit 0; Prometheus targets UP; LogQL trace search returns rows; `./infra/ops.sh trace <traceId>` prints the Explore URL.
4. Grafana UI (tailnet): Discord contact point + DLQ/Disk/ApiErrors alert rules per the playbook reminder; dashboards pre-provisioned, `allowUiUpdates: false` — iterate in `infra/grafana/provisioning/dashboards/`.
5. Update `docs/CONTEXT.md` PLG bullet from `operator apply pending` to `applied <date>` + move this plan to `docs/plans/completed/` (wave-finalization).

## Self-Review (ran before saving)

1. **Spec coverage:** imperative-`scp` → Task 2 playbook; unwired pipeline → Task 1 (`apply.sh` + `infra-apply` + README + playbook table); name-only drift → Task 3 full-declaration compare; missing PLG drift gate + stale docs → Task 4 (new drift playbook + CONTEXT/RUNBOOK/APPLY-RUNBOOK/README-index). Tailnet-only, SOPS-in-CI-never, Alloy-API-only, no-email-logs constraints each appear in Global Constraints + the task that enforces them.
2. **Placeholder scan:** no TBD/TODO/later/appropriate/edge-case pass-throughs — every step names exact files, exact lines/blocks, exact commands with expected outputs and exact commit messages.
3. **Type consistency:** playbook names (`observability.yml`, `observability-config.yml`, `drift-check-observability.yml`), `apply.sh` subcommands/markers (`observability`/`observability-declared`, `observability-config`/`observability-configured`), workflow outputs (`observability`, `observability-config`), Coolify project/env (`cogito-prod`/`production`), image pins (`loki:3.4.0`, `prometheus:v3.2.1`, `grafana:11.5.2`, `alloy:v1.7.4`), and paths (`/etc/cogito/observability/...`) are identical across all tasks.
