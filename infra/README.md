# infra/ — Cogito production infrastructure

Operator-facing scripts, playbooks, and Terraform for the Cogito production
VPS. The authoritative apply walkthrough is
[`APPLY-RUNBOOK.md`](./APPLY-RUNBOOK.md) — read it before running anything.

## Script map

| Script | What it does | When to run |
| ------ | ------------ | ----------- |
| [`provision.sh`](./provision.sh) | One-time VPS bootstrap: system update, Docker, UFW + fail2ban, SSH hardening, Coolify install, control-port lockdown, `deploy` user | Once, on a fresh VPS (also invoked by Terraform over SSH) |
| [`runner-prep.sh`](./runner-prep.sh) | One-time prep of the `cogito-prod` GitHub Actions runner: sops, pinned ansible-core venv, passwordless sudo, PATH | Once, on the VPS, before the infra-apply workflow runs unattended |
| [`apply.sh`](./apply.sh) | One-command wrapper for the full Terraform + Ansible apply chain (`import` → `tf-plan` → `tf-apply` → `tailscale` → `tailscale-verify` → `harden` → `resources` → `backup-cron` → `verify`), with dry-run, markers, and gates | Operator apply runs (see APPLY-RUNBOOK.md §0) |
| [`ops.sh`](./ops.sh) | Day-2 ops toolbox over SSH: `health`, `status`, `db`, `redis`, `dlq`, `dlq-clear`, `cb`, `logs`, `backup`, `disk`, `deploy-retry`, `studio`, `tunnel` | Ad-hoc production ops |
| [`backup.sh`](./backup.sh) | Nightly PostgreSQL dump → R2 (`backups/YYYY-MM-DD.sql.gz`) with retention pruning + CD pre-migrate snapshot pruning | Nightly via cron (installed by `ansible/backup-cron.yml`); manual: `infra/backup.sh [--dry-run]` |
| [`disk-watchdog.sh`](./disk-watchdog.sh) | Nightly disk-pressure check with Discord alerting and a safe auto-prune ladder (never volumes/active images/postgres data) | Nightly via cron (installed by `ansible/disk-watchdog.yml`); manual: `--dry-run` / `--force-prune` |

Supporting files:

- [`lib/common.sh`](./lib/common.sh) — shared shell helpers (`log_info` /
  `log_warn` / `log_error` / `assert_command` / `require_env`) for scripts
  that run from the repo checkout. **Not** sourced by `backup.sh` /
  `disk-watchdog.sh` — those are deployed to the VPS standalone.
- [`coolify-setup.md`](./coolify-setup.md) — manual Coolify service setup
  guide (registry, resources, domains).
- [`monitoring.md`](./monitoring.md) — structured logging, `/health`, and
  monitoring notes.
- [`APPLY-RUNBOOK.md`](./APPLY-RUNBOOK.md) — the operator runbook for the
  Terraform + Ansible apply chain.

## Directories

| Directory | Contents |
| --------- | -------- |
| [`ansible/`](./ansible/) | Playbooks + inventory for the VPS (see `ansible/README.md` for the apply order) |
| [`terraform/`](./terraform/) | Terraform stack: R2 buckets + DNS records + custom domain (see its own `README.md`) |
| [`secrets/`](./secrets/) | SOPS-encrypted vault (`prod.env`) — never commit plaintext, never edit by hand |
| [`tailscale/`](./tailscale/) | Tailnet ACL policy (`acl.hujson`) |

## Credentials

Never commit: `infra/terraform_key.txt`, `infra/ansible_key.txt`, and the
SOPS Age key. See APPLY-RUNBOOK.md §1 for what each holds and the env vars
required at apply time.
