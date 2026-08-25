# Terraform VPS bootstrap

This stack bootstraps an **already-created** OVH VPS. It does not order or
reinstall a VPS, so `terraform apply` cannot accidentally create a second
billable server.

It uploads and runs [`../provision.sh`](../provision.sh), which installs Docker
and Coolify, configures UFW and fail2ban, disables SSH password/root login, and
creates the `deploy` user.

## Prerequisites

- Terraform 1.6 or newer
- Ubuntu LTS or Debian on the VPS
- SSH key login already working for the OVH-provided initial user
- `sudo -n true` succeeds for that user (Terraform is non-interactive)

Verify the last two items before applying:

```powershell
ssh -i "$env:USERPROFILE\.ssh\cogito_ovh" ubuntu@<VPS_IP>
sudo -n true
exit
```

## Apply

From the repository root in PowerShell:

```powershell
Copy-Item infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# Edit infra/terraform/terraform.tfvars with the real IP and key path.

terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan
terraform -chdir=infra/terraform apply
```

The first apply takes a few minutes. Keep an existing SSH session open until
the new `deploy` login has been verified:

```powershell
ssh -i "$env:USERPROFILE\.ssh\cogito_ovh" deploy@<VPS_IP>
```

## Open Coolify safely

Coolify's dashboard, realtime channel, and web terminal are bound to
localhost on the VPS rather than exposed publicly. Create a local tunnel for
all three control ports:

```powershell
ssh -i "$env:USERPROFILE\.ssh\cogito_ovh" -N `
  -L 8000:127.0.0.1:8000 `
  -L 6001:127.0.0.1:6001 `
  -L 6002:127.0.0.1:6002 `
  ubuntu@<VPS_IP>
```

Keep that terminal open and visit <http://localhost:8000> to create the first
Coolify admin account immediately.

## Scope boundary

Terraform handles the one-time host bootstrap. Coolify still owns the
PostgreSQL/Redis services, GHCR image resources, domains, environment
variables, deploy webhooks, and application rollouts; see
[`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

The authoritative DNS zone is currently hosted by Hostinger, so create the
`api` and `app` A records there. Do not add an OVH DNS resource unless the
domain's authoritative nameservers are moved to OVH.

Terraform state and `terraform.tfvars` are intentionally local and ignored.
Use a protected remote backend before multiple operators or CI run this stack.
