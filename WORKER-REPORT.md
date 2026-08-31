# WORKER-REPORT — ops/monitoring-discord (worker-prod)

Branch: `ops/monitoring-discord` (cut from `origin/main` 2a4bfad). Not pushed — lead integrates.

## What changed

| File | Change |
| --- | --- |
| `infra/ansible/uptime-kuma.yml` (new) | Declares the Uptime Kuma service **via the Coolify API** (control-node driven, same pattern as `coolify-resources.yml`): `POST /api/v1/services` with the built-in one-click template `uptime-kuma`, name `cogito-uptime-kuma`, project `cogito` / env `production`, `urls: [{name: uptime-kuma, url: https://status.cogitoacademy.id}]`, `instant_deploy: true`. Idempotent (create-when-missing, drift-PATCH, no re-deploy on drift), probes the domain, prints the Kuma UI runbook steps (monitors + Discord notification). Reads `DISCORD_WEBHOOK_URL` from the SOPS vault by key name only; prints a loud operator instruction when absent — never invents/echoes a URL. |
| `infra/ansible/disk-watchdog.yml` (new) | Installs `infra/disk-watchdog.sh` as `/usr/local/bin/cogito-disk-watchdog.sh` + nightly 03:30 WIB root cron (CRON_TZ Asia/Jakarta), env `/etc/cogito/disk.env` (root 0600, decrypted from the SOPS vault on the control node), logrotate 7 for `/var/log/cogito-disk-gc.log`. Same decrypt pattern as `backup-cron.yml`. |
| `infra/disk-watchdog.sh` (new) | Warn ≥ 85% (Discord "VPS disk at N% — cleanup recommended"); at ≥ 92% runs `docker image prune -f` → `docker image prune -af --filter until=48h` → re-check → CRITICAL Discord if still ≥ 92%. **Never** volumes, active containers' images, postgres data; newest 1–2 `ghcr.io/cogitoacademy/app` images re-tagged `rollback-keep-*` (GHCR remains the authoritative rollback source). `--dry-run` prints commands without executing/posting; `--force-prune` operator tool. Webhook URL fed to curl via stdin config (`-K -`) so it never appears in argv/`ps`. |
| `infra/ops.sh` | Added `disk` (df -h /, docker system df, top containers by size) and `deploy-retry` (`gh run rerun` for the last `cd-prod.yml` run; fallback: POST `https://cl.cogitoacademy.id/api/v1/deploy?uuid=<live-resolved>&force=false` with the vault `COOLIFY_API_TOKEN` Bearer — never echoed). Usage block extended (2,26p). |
| `docs/RUNBOOK.md` | New **Monitoring & Alerting** section: setup steps, alert table, disk thresholds + auto-prune behavior, redeploy/retry procedure (re-run failed CD run is safe — snapshot/migrate/deploy idempotent, verified in the 2026-08-31 disk event), operator follow-ups. |
| `docs/DEPLOYMENT.md` | Pointer to the monitoring section. |
| `docs/plans/active/MONITORING-ALERTING.md` | Items 1–2 + new item 5 (disk watchdog) marked delivered 2026-09-01; operator console bits listed as pending; status log entry. |
| `docs/plans/README.md` | MONITORING-ALERTING row updated. |
| `docs/CONTEXT.md` | 1-line monitoring state + deployment-wave bullet. |

## Verified (acceptance criteria)

- `ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/uptime-kuma.yml` → **0 warnings/errors**.
- `ansible-playbook --syntax-check -i infra/ansible/inventory.ini infra/ansible/disk-watchdog.yml` → **0 warnings/errors**.
- `bash -n infra/ops.sh` + `bash -n infra/disk-watchdog.sh` → clean; `--dry-run` output verified.
- Inventory group `[cogito_vps]` respected: `disk-watchdog.yml` targets `hosts: cogito_vps`; `uptime-kuma.yml` is control-node (`hosts: localhost`) like `coolify-resources.yml` — **nothing is installed on the VPS host by the Kuma playbook** (scope addition honored).
- `no_log: true` on every secret-bearing call in both playbooks (vault decrypt, temp write, parse, all `Authorization: Bearer` uri calls, env file write, grep check). Debug output prints key names only, never values.
- Dry-run mode exists for the disk watchdog (`--dry-run`).

## Live API facts (verified read-only, 2026-09-01)

- Coolify v4.3.14 `routes/api.php` has the full `/api/v1/services` endpoint set (GET/POST/PATCH/…); the pre-existing `cogito-studio` service proves it works.
- The `uptime-kuma` one-click template **exists** in this build (`templates/compose/uptime-kuma.yaml`): `louislam/uptime-kuma:2`, port 3001, volume `uptime-kuma-data:/app/data`, healthcheck. The plan's "port 3002 / :1" sketch was superseded by the live template — the playbook declares what the template actually provides.
- `POST /api/v1/services` body verified from `ServicesController.php`: `type` (one-click) XOR `docker_compose_raw`, `urls[].name` must match the compose service name (`uptime-kuma`), `instant_deploy`, `force_domain_override`.
- Vault has `COOLIFY_API_TOKEN`; **no `DISCORD_WEBHOOK_URL`** — both playbooks print the loud operator instruction (verified the key-name check path).
- `/health` live shape: `{"status":"ok","checks":{...,"dlq":"ok"},"dlqDepth":0,...}` — the `"dlqDepth":0` keyword monitor is valid.

## Honest-fallback note (per escalation rule)

The Coolify API **can** express the Kuma *service* (declared declaratively — no UI paste needed for the resource itself). It **cannot** express Kuma's *monitors* or the Discord notification (they live in Kuma's own DB). Per the established Traefik-route pattern, the playbook prints the exact Kuma UI steps (monitors + Discord webhook paste) and the probe verifies the domain — documented in the playbook header, RUNBOOK, and the plan. No fake success: the playbook's summary states exactly what is declared vs. what remains a UI step.

## Operator follow-ups (never done by the worker)

1. Add `DISCORD_WEBHOOK_URL` to the SOPS vault (`sops infra/secrets/prod.env`), then re-run both playbooks to refresh `/etc/cogito/disk.env` and confirm the Kuma summary shows the webhook present.
2. Kuma UI paste: first-run admin at `https://status.cogitoacademy.id` → create the 4 monitors (api /health keyword, app URL, cert expiry ×2, dlqDepth keyword) + Discord notification with the vault URL (exact steps printed by the playbook and in RUNBOOK).
3. Optional: add `DISCORD_WEBHOOK_URL` as a GitHub secret if the CD should post deploy failures to Discord (noted only, not wired).

## Not touched

`apps/`, `packages/`, `.github/workflows` (CD retry flow documented in RUNBOOK only), `infra/terraform`, `infra/secrets/prod.env` (values), `.github/lint/baseline.txt`.

## Commits

- `0823668` feat(infra): declare Uptime Kuma via Coolify API + install disk watchdog
- `46a230a` docs(monitoring): RUNBOOK monitoring section, plan status, pointers
