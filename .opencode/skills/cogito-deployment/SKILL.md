---
name: cogito-deployment
description: Use when deploying the Cogito app to production, applying infrastructure changes (Terraform/Ansible), managing the SOPS vault, wiring GitHub secrets, or troubleshooting the Coolify deploy webhook / CD pipeline. Covers the operator steps after a deployment wave merges.
---

# Cogito Deployment

Operational reference for the Cogito single-VPS production setup. Read this
before any production apply, vault edit, or CD troubleshooting. Companion to
`docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`, and `docs/plans/active/DEPLOYMENT-PLAN.md`.

## Architecture (30-second mental model)

```
Code plane (git)          Control plane (operator machine)     Data plane (VPS)
  CI/CD (Actions)   →      Terraform (DNS/R2, rare)      →      Coolify (Traefik)
  cd-prod.yml              Ansible (everything in box)          API :3001 · web :80
                           SOPS vault (secrets)                 Postgres · Redis
```

- **Code deploys are automatic** (merge to main → build → push → backup →
  migrate → deploy → sha-verified health poll). Only merges to main deploy.
- **Infra/env changes are manual** (operator machine): Terraform for DNS/R2,
  Ansible for everything inside the box. The Age private key NEVER enters CI
  or the VPS.
- **The proxy is Traefik v3.6** (Coolify's bundled proxy), NOT Caddy. Any doc
  saying "Caddy" is stale — fix it.

## The vault (SOPS + Age)

- **Encrypted file**: `infra/secrets/prod.env` — committed via
  `git add -f` (gitignored for plaintext safety; pre-commit guard blocks
  plaintext commits).
- **Private key**: `~/.config/sops/age/keys.txt` — never in git, never in CI.
  Export `SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"` (sops 3.13
  does not auto-discover it).
- **Edit** (never re-encrypt from scratch, never keep a plaintext copy):
  ```bash
  sops infra/secrets/prod.env                          # in-memory decrypt → $EDITOR → re-encrypt
  sops set infra/secrets/prod.env '["KEY"]' "value"    # single-key edit
  ```
- **First fill**: `cp infra/secrets/prod.env.example infra/secrets/prod.env`
  → fill → `sops -e -i` → `git add -f` → commit.
- **Verify**: `sops -d infra/secrets/prod.env | grep -c "="` (expect ~44).
- The lead never reads/writes/encrypts the vault — the operator does.

## Operator apply sequence (after a wave merges)

1. **Vault**: fill + encrypt + commit (above).
2. **GitHub secrets** (repo → Settings → Secrets → Actions): 8 values —
   `COOLIFY_PROD_SERVER_WEBHOOK`, `COOLIFY_PROD_WEBHOOK`, `COOLIFY_API_TOKEN`
   (Bearer for auth-required webhooks), `PROD_DATABASE_URL`, `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`.
3. **Terraform** (from `infra/terraform`):
   ```bash
   terraform init
   # import pre-created resources BEFORE apply (else duplicate creation):
   terraform import cloudflare_r2_bucket.uploads cogito-bucket
   terraform import cloudflare_r2_custom_domain.uploads r2bucket.cogitoacademy.id
   CLOUDFLARE_API_TOKEN=... terraform apply
   ```
4. **Ansible** (from repo root, in order):
   ```bash
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/host-hardening.yml --ask-become-pass
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/tailscale.yml --ask-become-pass -e "ts_auth_key=$(sops -d infra/secrets/prod.env | grep TS_AUTH_KEY | cut -d= -f2-)"
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/coolify-resources.yml --ask-become-pass
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/backup-cron.yml --ask-become-pass
   ```
   `coolify-resources.yml` prints the Traefik dynamic config for the
   deploy-webhook route — paste it into Coolify UI → Servers → cogito-vps →
   Proxy → Custom Configuration, then re-run to see the probe flip 404 → 401/405.
5. **Verify**: `curl https://api.cogitoacademy.id/health` (version == sha),
   webhook 401 resolved, Xendit Test Mode E2E.

## R2 buckets (never mix)

| Bucket           | Purpose                                  | Access                                                                 |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `cogito-bucket`  | App uploads (avatars, evidence)          | PUBLIC via `r2bucket.cogitoacademy.id` (`R2_BUCKET` + `R2_PUBLIC_URL`) |
| `cogito-backups` | Nightly dumps + CD pre-migrate snapshots | PRIVATE, API-token only (`R2_BACKUP_BUCKET`)                           |

Never put dumps in the public bucket — a guessable URL leaks the whole DB.

## CD troubleshooting

- **`PROD_DATABASE_URL is unset`** → GitHub secret missing; add it.
- **Webhook 401** → two causes: (a) Traefik route for
  `cl.cogitoacademy.id/api/v1/deploy/*` not applied (paste the dynamic
  config from the playbook output), (b) endpoint is "auth required" — set
  `COOLIFY_API_TOKEN` secret (Bearer header).
- **Deploy fails after push** → rollback: Coolify → resource → Rollback to
  previous release; verify `/health` `version` matches the old sha.
- **Coverage gate red** → 100% lines required; check the coverage comment for
  the file; Bun lcov misattribution is a known quirk (CONVENTIONS) — add a
  test for genuinely uncovered branches.

## Common mistakes

| Mistake                                          | Fix                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Editing the vault from scratch each time         | Use `sops` editor mode / `sops set`                              |
| Committing plaintext vault                       | Pre-commit guard blocks it; `git add -f` only after `sops -e -i` |
| `sops` fails with "no matching creation rules"   | Run from repo root (`.sops.yaml` matches relative paths)         |
| `sops` fails "failed to get the data key"        | `SOPS_AGE_KEY_FILE` not exported                                 |
| Terraform tries to recreate the R2 bucket/domain | `terraform import` first (they pre-exist in the dashboard)       |
| Docs say "Caddy"                                 | Traefik — fix the doc                                            |
| Putting dumps in the public bucket               | Never — use `R2_BACKUP_BUCKET`                                   |
