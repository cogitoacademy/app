# Backup CRLF Hardening

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Status     | Active — fix applied 2026-09-30, PR open; follow-ups below remain |
| Created    | 2026-09-30                             |
| Depends on | #278 (vault edit that introduced CRLF) |
| Scope      | Backup cron + disk watchdog (infra only; no app code, RPC, schema, or persistence change) |

## Root cause

The nightly backup failed Sep 28/29/30 during `dump` (rc=1):
`pg_dump: error: connection to server at "10.0.1.8", port 5432 failed:
FATAL: database "postgres\r" does not exist`.

`/etc/cogito/backup.env` on the VPS had CRLF line endings (mtime
2026-09-27 02:38 UTC — the Infra Apply run 36288165752 for PR #278, which
touched `infra/secrets/prod.env`, rewrote it). Bash `source` keeps the
trailing `\r` in values, so `pg_dump` asked for DB `postgres\r`. The
playbook pipe `sops -d | grep -E ...` preserves `\r`.

NOT a container-IP problem: `noxeaeuxfreq0axa9unpew5r -> 10.0.1.8`
resolution works (container Up 5 weeks, disk 64%, `/health` DB ok). The
vault correctly keeps the stable hostname + runtime `docker inspect`
resolution — that mechanism stays.

## Fix (this plan)

1. `infra/ansible/backup-cron.yml`: decrypt pipe is now
   `sops -d … | tr -d '\r' | grep -E …` so the cron env file is always LF-only.
2. `infra/ansible/disk-watchdog.yml`: same hardening (same unhardened pattern).
3. `infra/backup.sh`: defense-in-depth — one-spot trailing-`\r` strip of all
   env-derived values before any use (AWS mapping, required-env check,
   defaults, `R2_ENDPOINT`), so a future CRLF file can never poison
   `pg_dump`/AWS again.
4. `infra/disk-watchdog.sh`: same one-spot guard for `DISCORD_WEBHOOK_URL` /
   `WARN_THRESHOLD` / `PRUNE_THRESHOLD` (a `\r` there breaks integer
   comparisons and the Discord post).

## Verification (2026-09-30)

- VPS: `/etc/cogito/backup.env` CRLF confirmed (5 of 6 keys `\r`-terminated;
  key names + lengths only, no values printed), fixed via
  `sed -i 's/\r$//'`, re-verified CR-free (`file`: ASCII text).
- VPS manual run (cron-equivalent wrapper: `set -a; . backup.env; set +a;
  cogito-backup.sh >> log`): green — `==> Done: uploaded
  backups/2026-09-30.sql.gz`, 27K dump, prune deleted 4 stale
  `pre-migrate-*` snapshots (newest 7 kept), 0 daily objects pruned.
- R2: `head-object backups/2026-09-30.sql.gz` → 26725 bytes, ETag present.
- Repo: `bash -n` clean (both scripts), `shellcheck -S warning` clean,
  `ansible-playbook --syntax-check` clean (both playbooks; inventory
  warnings only, expected without `-i`).
- Regression proof (`/tmp/crlf-proof.sh`, throwaway — repo has no shell-test
  infra): CRLF fixture poisons plain sourcing (negative control); the exact
  sanitize blocks extracted from both scripts strip trailing `\r` with values
  intact; watchdog thresholds compare as integers post-sanitize; the playbook
  `tr -d '\r' | grep` stage keeps all 8 backup keys LF-only. All checks passed.

## Follow-ups (out of scope for this PR — do NOT expand)

Remaining `sops -d | grep` / `| cut` sites with the same unhardened pattern
(no `\r` stripping): `infra/apply.sh:276,369`, `infra/ops.sh:172`,
`.github/workflows/infra-apply.yml:219,225`, `infra/ansible/observability.yml`
(4 sites), `infra/ansible/coolify-resources.yml`, `studio.yml`,
`uptime-kuma.yml`, plus doc copy-paste commands (`docs/RUNBOOK.md:1130`,
`docs/KUMA-RUNBOOK.md:58`, skill docs). Most consume single values via
`cut -d= -f2-` (trailing `\r` would poison tokens/hosts the same way).
Recommended: a shared `tr -d '\r'` convention or a control-node-side
`.env` normalization helper, applied wave-by-wave with the same
source-plus-script defense-in-depth used here.

## RUNBOOK check

`docs/RUNBOOK.md` Backup & Restore already documents hostname + runtime
resolution truth (no hand-maintained IP) — no change needed.
`docs/CONTEXT.md` stale vault-IP note corrected + incident recorded (2026-09-30).
