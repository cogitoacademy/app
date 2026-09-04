# infra/ansible — VPS playbooks

Ansible playbooks for the Cogito production VPS, driven from the operator
machine (control node) against the single-server inventory group
`[cogito_vps]` (`inventory.ini` → `100.124.43.19`, user `ubuntu`, key
`~/.ssh/cogito_vps`). Secrets are decrypted from the SOPS vault
(`infra/secrets/prod.env`) on the control node — the Age key never reaches
the VPS.

## Apply order

Run in this order (the same order `infra/apply.sh all` enforces):

1. **`tailscale.yml`** — install Tailscale and join the tailnet
   (`ts_auth_key` from the vault). **Must run before hardening** — hardening
   locks SSH to the tailnet, so joining first prevents an operator lockout.
2. **`host-hardening.yml`** — UFW (tailnet-only control ports), fail2ban,
   unattended-upgrades, sshd lockdown. Run only after tailnet SSH is
   verified (`infra/apply.sh tailscale-verify`).
3. **`coolify-resources.yml`** — declare the production resources via the
   Coolify API (Postgres, Redis, API, web, env vars from the vault).
   Control-node driven (`hosts: localhost`); needs the SSH tunnel
   `ssh -L 8000:127.0.0.1:8000` because Coolify publishes :8000 on loopback
   only. **Prints the Traefik dynamic config** for the deploy-webhook route
   (`cl.cogitoacademy.id`) — paste it into Coolify UI → **Servers →
   cogito-vps → Proxy → Custom Configuration**, then re-run to flip the
   probe from 404 → 401/405.
4. **`backup-cron.yml`** — install the nightly backup cron
   (`/usr/local/bin/cogito-backup.sh` from `../backup.sh`, env at
   `/etc/cogito/backup.env`, 02:00 WIB). `DATABASE_URL` in the vault must
   resolve from the VPS host.
5. **`drift-check.yml`** — read-only verification half of
   `coolify-resources.yml`: diffs live Coolify API state against the
   declared state and **fails on drift**. Safe to re-run anytime.

## Other playbooks

| Playbook                                   | What it does                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`disk-watchdog.yml`](./disk-watchdog.yml) | Installs the nightly disk watchdog (`/usr/local/bin/cogito-disk-watchdog.sh` from `../disk-watchdog.sh`, env at `/etc/cogito/disk.env`, 03:30 WIB) |
| [`uptime-kuma.yml`](./uptime-kuma.yml)     | Declares the Uptime Kuma monitoring service via the Coolify API (`status.cogitoacademy.id`), control-node driven                                   |

## Tasks

`tasks/` holds the shared task files (`application.yml`, `database.yml`,
`env.yml`) used by the Coolify API playbooks.

## Running

From the repo root, with `SOPS_AGE_KEY_FILE` exported (see
`../APPLY-RUNBOOK.md` §1):

```bash
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/<playbook>.yml --ask-become-pass
```

Or use `infra/apply.sh` for the gated, ordered flow.
