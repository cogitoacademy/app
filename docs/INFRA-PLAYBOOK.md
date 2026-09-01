# Infra Playbook — when to run what

> Single decision table for the operator: "I want to change X" → exact
> commands, in order, with the verification that proves it worked. For deep
> detail see the linked docs; for incidents jump straight to §DR.

**Golden rule:** _code deploys itself; infra changes apply only when you run
them._ If you edited the vault, a playbook, or anything under `infra/`,
production has NOT changed until you apply (§1).

## 0. Prerequisites (every session)

```bash
cd ~/cogito/app && git pull                      # work from latest main
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"   # vault decrypt
ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@15.235.186.159
#   ↑ the Coolify API is loopback-only; this tunnel makes it localhost:8000.
#     "Address already in use" = a tunnel already runs; that's fine.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/health  # expect 200
```

## 1. "I changed an env var / secret in the vault"

| Step   | Command                                                                                | Proves                                                  |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Edit   | `sops infra/secrets/prod.env` (or `sops set infra/secrets/prod.env '["KEY"]' "value"`) | —                                                       |
| Apply  | `./infra/apply.sh resources`                                                           | playbook patches env via Coolify API + restarts the app |
| Verify | `curl -s https://api.cogitoacademy.id/health \| jq -r .version`                        | sha matches main HEAD                                   |

Notes: new keys must be added to `.sops.yaml` `encrypted_regex` or they save
as plaintext (this bit us once — #149). Commit the vault with
`git add -f infra/secrets/prod.env` (the pre-commit `sops-plaintext-guard`
hook is your safety net). Webhook/GitHub-secret values (GH secrets) are
separate from the vault — update in repo Settings too.

## 2. Deploy code (merge to main)

**Nothing to run.** CD does: build → GHCR → pre-migrate R2 snapshot →
`db:migrate` → Coolify deploy → sha-verified `/health` poll (webhook POST +
HTTP-200 poll for web). Watch it:

```bash
gh run watch $(gh run list --workflow cd-prod.yml --limit 1 --json databaseId --jq '.[0].databaseId')
curl -s https://api.cogitoacademy.id/health | jq -r .version   # == merged sha
./ops.sh status                                                 # containers/RAM/DLQ at a glance
```

Deploy failed or stuck? `./ops.sh deploy-retry` (re-runs the last CD run —
safe: snapshot/migrate/deploy are idempotent). Bad release live?
→ §DR-1.

## 3. Infra code changed under `infra/`

| You touched                                                 | Run                                                                                                                                                                                                                                 | Notes                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `infra/terraform/**` (DNS/R2)                               | `./infra/apply.sh tf-plan` → **review diff** → `./infra/apply.sh tf-apply`                                                                                                                                                          | rare; CI also runs a read-only plan on PRs           |
| any playbook under `infra/ansible/`                         | the matching `./infra/apply.sh <phase>` or `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/<file>.yml` (add `--ask-become-pass` for host playbooks)                                                                  | all playbooks are idempotent                         |
| `coolify-resources.yml` / env shape                         | `./infra/apply.sh resources`                                                                                                                                                                                                        | restarts the API — expect a few seconds of downtime  |
| `uptime-kuma.yml` / `disk-watchdog.yml` / `backup-cron.yml` | run that playbook directly (tunnel up; kuma/disk read the vault)                                                                                                                                                                    | kuma is control-node only; disk/backup touch the VPS |
| after any manual Coolify-UI fiddling                        | `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/drift-check.yml -e coolify_api_base=http://localhost:8000/api/v1 -e coolify_api_token="$(sops -d infra/secrets/prod.env \| grep COOLIFY_API_TOKEN \| cut -d= -f2-)"` | read-only; exit 1 = drift found                      |

## 4. Database changes (migrations)

Drizzle migrations are **up-only**; policy = additive-only releases,
destructive changes two-step (backfill in N, drop in N+1). Migrations run
inside CD automatically before each deploy, with an R2 snapshot taken first
(`pre-migrate-<sha>`).

```bash
bun run db:generate            # create migration locally (PR)
# merge → CD migrates automatically; do NOT run db:migrate against prod by hand
./ops.sh db "SELECT ..."       # inspect prod data (read)
./ops.sh studio                # Drizzle Studio over an SSH tunnel (read-write — care)
```

Migration broke at deploy time? CD exits before the deploy; **never
auto-restore with live traffic** — take a maintenance window, then §DR-2.

## 5. Disasters (DR)

**DR-1 — bad deploy / app down (most common).**
Coolify UI (via tailnet: `http://<tailnet-ip>:8000`) → resource → **Rollback
to previous release**; or the CD script's auto-rollback already repointed the
tag on health-poll timeout. Verify: `/health.version` == the old sha. DB
unchanged (code-only rollback).

**DR-2 — bad migration / DB corruption.**

```bash
./ops.sh backup                 # current state first
# restore target: newest cogito-backups dump (nightly) or pre-migrate-<sha> snapshot
ssh ubuntu@15.235.186.159   # then: aws s3 cp s3://cogito-backups/... (creds in /etc/cogito/backup.env)
# restore into scratch → verify counts → maintenance window → restore into prod
```

Full procedure: `docs/RUNBOOK.md` → backup/restore. Never restore blind with
live traffic.

**DR-3 — VPS unreachable.**
OVH console → reboot → if disk full: `./ops.sh disk` (watchdog auto-prunes
≥92%; manual: `docker image prune -af --filter until=48h`). If the box is
lost: rebuild = Terraform bootstrap (`infra/provision.sh`) + `./infra/apply.sh
all` + restore latest backup (DR-2). RPO = 24h (nightly) + pre-migrate
snapshots; RTO ≈ 1–2h.

**DR-4 — secrets compromised.** Rotate at the provider → `sops set` each key
→ `./infra/apply.sh resources` → re-run affected playbooks (tailscale/disk
read the vault at apply time). The Age key itself is NOT recoverable or
rotatable in place — new key means re-encrypting the vault for the new
recipient (`sops updatekeys`).

## 6. Nightly & unattended (already running, for awareness)

| Job                                            | When                         | Where it lives                     |
| ---------------------------------------------- | ---------------------------- | ---------------------------------- |
| Postgres backup → R2 (30-day retention)        | 02:00 WIB cron               | `infra/ansible/backup-cron.yml`    |
| Disk watchdog (warn 85% / prune 92% → Discord) | 03:30 WIB cron               | `infra/ansible/disk-watchdog.yml`  |
| CD migrate+deploy                              | every merge to main          | `.github/workflows/cd-prod.yml`    |
| CI audit on infra PRs                          | every PR touching `infra/**` | `.github/workflows/infra-plan.yml` |

## 7. Verification sweep (after any infra change)

```bash
./infra/apply.sh verify                 # health sha + cl. route + lock-down hints
curl -s https://api.cogitoacademy.id/health | jq -c '.checks, .dlqDepth'
curl -s -o /dev/null -w "%{http_code}\n" https://app.cogitoacademy.id
./ops.sh status                         # RAM/containers
```
