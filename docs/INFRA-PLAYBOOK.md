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
ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@100.124.43.19
#   ↑ the Coolify API is loopback-only; this tunnel makes it localhost:8000.
#     "Address already in use" = a tunnel already runs; that's fine.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/health  # expect 200
```

## 1. "I changed an env var / secret in the vault"

| Step   | Command                                                                                                                                                                                                                                                                                                                                                                     | Proves                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Edit   | `sops infra/secrets/prod.env` (or `sops set infra/secrets/prod.env '["KEY"]' "value"`)                                                                                                                                                                                                                                                                                      | —                     |
| Apply  | **automatic**: commit the vault via PR → merge → `infra-apply.yml` re-applies `coolify-resources.yml` (env patch + restart) **when the merge touches `infra/secrets/**`** (the paths filter — added by the OPS-VISIBILITY-WAVE; a vault-only merge now triggers the Ansible job). Manual fallback: `./infra/apply.sh resources` or `workflow_dispatch` on `infra-apply.yml` | workflow run green    |
| Verify | `curl -s https://api.cogitoacademy.id/health \| jq -r .version`                                                                                                                                                                                                                                                                                                             | sha matches main HEAD |

Notes: new keys must be added to `.sops.yaml` `encrypted_regex` or they save
as plaintext (this bit us once — #149). The pre-commit `sops-plaintext-guard`
hook is your safety net. Webhook/GitHub-secret values (GH secrets) are
separate from the vault — update in repo Settings too. Automation
prerequisites (one-time): `SOPS_AGE_KEY` GitHub secret +
`sudo bash infra/runner-prep.sh` on the VPS (INFRA-AUTOMATION plan).
The auto-apply fires only on merges that touch `infra/secrets/**`; if the
runner is down or the workflow did not trigger, use the manual fallback.

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

**Default: automatic.** A merge to `main` touching `infra/**` triggers
`infra-apply.yml`: Terraform applies only on real plan drift (exit 2), and
the Ansible job runs **only the playbooks whose files changed** on the
self-hosted VPS runner (drift-check reports first, post-apply `/health`
verify last). `host-hardening.yml` and `tailscale.yml` are **excluded** from
auto-apply (lockout risk / one-time semantics) — they remain manual phases
of `./infra/apply.sh`.

| You touched                                                                      | What happens on merge                                                 | Manual fallback                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `infra/terraform/**` (DNS/R2)                                                    | `terraform plan -detailed-exitcode` → apply only on real drift        | `./infra/apply.sh tf-plan` → review → `tf-apply`                       |
| `coolify-resources.yml` / env shape                                              | re-applied + API restart (seconds of downtime)                        | `./infra/apply.sh resources`                                           |
| `backup-cron.yml` / `disk-watchdog.yml` / `disk-watchdog.sh` / `uptime-kuma.yml` | that playbook runs on the runner                                      | run it directly from the operator machine (tunnel up)                  |
| after any manual Coolify-UI fiddling                                             | — (push a no-op commit or `workflow_dispatch` infra-apply to re-sync) | `ansible-playbook ... drift-check.yml ...` (read-only; exit 1 = drift) |

Break-glass (runner down, key rotation, DR): run `./infra/apply.sh` from the
operator machine as before — §0 prerequisites still apply.

## 3b. Uptime Kuma (wired 2026-09-02 — revisit only when adding a monitor)

Kuma's monitors/notifications live in its own SQLite DB — the Coolify API
cannot express them. The one-time UI pass was **completed by the operator on
2026-09-02** (see `docs/KUMA-RUNBOOK.md` for the click-by-click runbook and
the live state). Current live state: 4 monitors (`api-health` with keyword
`"status":"ok"` and `maxretries=2`, `web-app`, `DLQ DEPTH` with keyword
`"dlqDepth":0` and `maxretries=3`, plus the `COGITO ACADEMY` group), the
`COGITO ALERT` Discord notification attached to **all** of them, and the
`cogito` status page published at `status.cogitoacademy.id`.

Two root causes were found and fixed during that pass — keep them in mind
when touching Kuma:

- **503-flap:** `api-health` recorded DOWN on every CD deploy because
  `maxretries=0` — the API container restarts during a deploy and `/health`
  returns 503 while the new image boots. The monitor was correctly detecting
  deploy restarts, not flapping. Fix: `maxretries=2` + `retry_interval=60`.
- **Discord silent:** the `COGITO ALERT` notification existed but
  `monitor_notification` was empty — no monitor was attached, so nothing
  ever posted. Fix: attach the notification to every monitor (and to any
  new monitor you add).

**Adding a monitor** (the only recurring step): Kuma UI → Add New Monitor →
configure → **attach the `COGITO ALERT` notification** (the step that was
missed before 2026-09-02) → Test (a Discord post must arrive) → optionally
add it to the `cogito` status page. Recommended follow-up: `api-cert` /
`app-cert` certificate monitors (not yet created).

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
image tag on health-poll timeout (the restored `bb1ccb9a` flow: PATCH
`docker_registry_image_tag` to `v<PREV_GIT_SHA>` + redeploy — the #175–#177
native-endpoint flow was reverted by #178 after the 2026-09-02 disk-full
incident). Verify: `/health.version` == the old sha. DB
unchanged (code-only rollback).

**DR-2 — bad migration / DB corruption.**

```bash
./ops.sh backup                 # current state first
# restore target: newest cogito-backups dump (nightly) or pre-migrate-<sha> snapshot
ssh ubuntu@100.124.43.19   # then: aws s3 cp s3://cogito-backups/... (creds in /etc/cogito/backup.env)
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
