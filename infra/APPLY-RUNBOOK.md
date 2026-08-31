# Infra Apply Runbook — Terraform + Ansible

Operator guide for applying the Cogito production infrastructure. Read fully
before running anything. Companion to `docs/DEPLOYMENT.md`,
`docs/RUNBOOK.md`, and `docs/plans/active/DEPLOYMENT-PLAN.md`.

---

## 1. Credentials (never commit these)

| File (gitignored)         | Contains                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `infra/terraform_key.txt` | Cloudflare API token line: `CLOUDFLARE_API_TOKEN=...` (Zone:DNS:Edit + R2 Admin)                                 |
| `infra/ansible_key.txt`   | `VAULT_PASSWORD=...` (the SOPS Age key is used directly; this file holds anything the operator wants kept local) |

These are in `.gitignore` — never commit them.

### Required env vars at apply time

**Terraform** (from `infra/terraform/`):

```bash
export CLOUDFLARE_API_TOKEN=...          # from infra/terraform_key.txt
export AWS_ACCESS_KEY_ID=...              # R2 state-bucket token (vault: R2_ACCESS_KEY_ID)
export AWS_SECRET_ACCESS_KEY=...          # R2 state-bucket token (vault: R2_SECRET_ACCESS_KEY)
```

The R2 state backend reads `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
(s3-compatible). `terraform_key.txt` may also carry these.

**Ansible** (from repo root):

```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"   # required by sops 3.13
```

The vault (`infra/secrets/prod.env`) is decrypted by sops on the control node
using the local Age private key — no password file needed. The Tailscale
auth key comes from the vault (`TS_AUTH_KEY`) passed via `-e`.

---

## 2. Terraform

```bash
cd infra/terraform

# init with the R2 state backend (credential env vars from section 1)
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
terraform init

# import pre-created resources BEFORE apply (else Terraform tries to
# duplicate them — the bucket + custom domain already exist in the dashboard)
terraform import cloudflare_r2_bucket.uploads cogito-bucket
terraform import cloudflare_r2_custom_domain.uploads r2bucket.cogitoacademy.id

# plan (review the diff — the R2 buckets + DNS records + custom domain)
export CLOUDFLARE_API_TOKEN=...
terraform plan -out=tfplan

# apply
terraform apply tfplan
```

**What it creates:** `cogito-infra-state`, `cogito-backups`,
`cogito-bucket` (R2), the `api./app./status./coolify.` DNS records, and the
`r2bucket.cogitoacademy.id` custom domain. **Data impact: none** — R2
buckets/DNS are metadata only.

---

## 3. Ansible

```bash
# from repo root
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"

# 1. Tailscale join FIRST (before hardening — otherwise SSH becomes
#    tailnet-only and you lock yourself out)
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/tailscale.yml \
  --ask-become-pass \
  -e "ts_auth_key=$(sops -d infra/secrets/prod.env | grep TS_AUTH_KEY | cut -d= -f2-)"

# 2. VERIFY tailnet SSH works before hardening:
ssh -i ~/.ssh/cogito_vps ubuntu@<tailscale-ip-or-hostname>

# 3. Host hardening (ufw/fail2ban/sshd) — SSH becomes tailnet-only
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/host-hardening.yml \
  --ask-become-pass

# 4. Coolify resources — the env switch (maintenance window; API restarts)
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/coolify-resources.yml \
  --ask-become-pass
#    → prints the Traefik dynamic config; paste into Coolify UI → Servers →
#      cogito-vps → Proxy → Custom Configuration, then re-run to see the
#      probe flip from 404 → 401/405

# 5. Backup cron (needs DATABASE_URL resolvable from the VPS host)
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/backup-cron.yml \
  --ask-become-pass

# verify
curl -s https://api.cogitoacademy.id/health
```

---

## 4. Verification after each step

| Step           | Verify                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Tailscale join | `tailscale status` on the VPS shows `cogito-vps`; SSH via tailnet IP works                              |
| Host hardening | public SSH refused; tailnet SSH works; `ufw status` shows 80/443 public, 22+8000/6001/6002 tailnet-only |
| Coolify sync   | `/health` returns `version == <deployed sha>`; `dlqDepth: 0`; env in Coolify UI matches the vault       |
| Backup cron    | `infra/ops.sh dlq` / `ls /var/log/cogito-backup.log`; an R2 object appears                              |

## 5. Rollback

- **Env switch broke boot?** The env schema fails loudly (a misconfigured
  vault = refused boot, not silent degradation). Rollback: revert the vault
  value(s), re-run `coolify-resources.yml`, redeploy.
- **Migration broke?** Restore the `pre-migrate-<sha>.sql.gz` snapshot under a
  maintenance window (RUNBOOK → Backup & Restore). Never auto-restore with
  live traffic.

---

## 6. Common mistakes

| Mistake                                                        | Fix                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Running hardening before Tailscale join                        | Lockout — join first, then harden                                                  |
| `terraform apply` without importing the existing bucket/domain | Import first                                                                       |
| Forgetting `SOPS_AGE_KEY_FILE`                                 | sops cannot find the Age key — export it                                           |
| `--ask-become-pass` on a non-interactive shell                 | Use `-e ansible_become_password=...` from `ansible_key.txt` (or run interactively) |
| Expecting the deployed sha on `/health` before the CD runs     | The CD pipeline owns deploys — the playbook only syncs state                       |
