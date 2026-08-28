locals {
  provision_script = abspath("${path.module}/../provision.sh")
}

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0" # cloudflare_r2_custom_domain requires >= 5.13.0
    }
  }
}

# ---------------------------------------------------------------------------
# Cloudflare provider — DNS is declarative here. The zone
# (cogitoacademy.id) is proxied; the apex stays on Hostinger.
# ---------------------------------------------------------------------------
provider "cloudflare" {
  # CLOUDFLARE_API_TOKEN env var (token scoped to Zone:DNS:Edit for the zone).
}

data "cloudflare_zone" "cogito" {
  filter = {
    name = "cogitoacademy.id"
  }
}

resource "cloudflare_dns_record" "api" {
  zone_id = data.cloudflare_zone.cogito.id
  name    = "api"
  content = var.server_ip
  type    = "A"
  ttl     = 1 # automatic (Cloudflare-proxied)
  proxied = true
}

resource "cloudflare_dns_record" "app" {
  zone_id = data.cloudflare_zone.cogito.id
  name    = "app"
  content = var.server_ip
  type    = "A"
  ttl     = 1 # automatic (Cloudflare-proxied)
  proxied = true
}

resource "cloudflare_dns_record" "status" {
  zone_id = data.cloudflare_zone.cogito.id
  name    = "status"
  content = var.server_ip
  type    = "A"
  ttl     = 1 # automatic (Cloudflare-proxied)
  proxied = true
}

# coolify.cogitoacademy.id — exposes ONLY the Coolify deploy-webhook path
# (https://coolify.cogitoacademy.id/api/v1/deploy/*) so GitHub Actions can
# trigger deployments; the Coolify UI itself stays tailnet-only. The
# per-resource UUID in the webhook URL is the bearer secret. (DEPLOYMENT-PLAN
# Task 0.2, Option A — locked 2026-08-27.)
resource "cloudflare_dns_record" "coolify" {
  zone_id = data.cloudflare_zone.cogito.id
  name    = "coolify"
  content = var.server_ip
  type    = "A"
  ttl     = 1 # automatic (Cloudflare-proxied)
  proxied = true
}

# ---------------------------------------------------------------------------
# R2 — infrastructure state bucket (tfstate backend) + backup bucket.
#
# The S3 API token for the state backend is created MANUALLY in the Cloudflare
# dashboard (one-time): Dashboard → R2 → Manage R2 API Tokens → Create token,
# scoped to the `cogito-infra-state` bucket with Object Read/Write, and the
# resulting Access Key ID + Secret go into the SOPS vault (used as
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY by the s3 backend + backup cron).
# Terraform owns the bucket lifecycle; the token is a credential, not state.
# ---------------------------------------------------------------------------
resource "cloudflare_r2_bucket" "infra_state" {
  account_id = var.cloudflare_account_id
  name       = "cogito-infra-state"
  location   = "APAC"
}

resource "cloudflare_r2_bucket" "backups" {
  account_id = var.cloudflare_account_id
  name       = "cogito-backups"
  location   = "APAC"
}

# PUBLIC bucket for app uploads (profile images, achievement evidence, etc.).
# Served via the r2bucket.cogitoacademy.id custom domain. Database backups
# live in cogito-backups (private, API-token only) — never mix dumps into a
# bucket with a public custom domain (the nightly dump URL would be
# guessable).
#
# NOTE: this bucket + custom domain were created manually in the Cloudflare
# dashboard (2026-08-28) with the values already in the SOPS vault
# (R2_BUCKET=cogito-bucket, R2_PUBLIC_URL=https://r2bucket.cogitoacademy.id).
# The operator must `terraform import` them before the first apply, otherwise
# Terraform will try to create a second bucket/domain:
#   terraform import cloudflare_r2_bucket.uploads <bucket-name>
#   terraform import cloudflare_r2_custom_domain.uploads <domain>
resource "cloudflare_r2_bucket" "uploads" {
  account_id = var.cloudflare_account_id
  name       = "cogito-bucket"
  location   = "APAC"
}

resource "cloudflare_r2_custom_domain" "uploads" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.uploads.name
  domain      = "r2bucket.cogitoacademy.id"
  enabled     = true
  zone_id     = data.cloudflare_zone.cogito.id
}

# NOTE: no separate DNS record for r2.cogitoacademy.id is created here. For a
# zone hosted on Cloudflare, the R2 custom domain provisions its own DNS route
# (CNAME into Cloudflare's R2 infrastructure) automatically when the custom
# domain is enabled. An A record pointing at the VPS would route r2.* traffic
# to the origin instead of R2 — do NOT add one.

# This resource intentionally bootstraps an existing VPS instead of ordering
# one. The OVH VPS product is billable infrastructure; adding an ovh_vps
# resource here without an explicit import/plan could create a second server.
resource "terraform_data" "coolify_bootstrap" {
  triggers_replace = {
    server_ip     = var.server_ip
    ssh_user      = var.ssh_user
    script_sha256 = filesha256(local.provision_script)
  }

  connection {
    type        = "ssh"
    host        = var.server_ip
    user        = var.ssh_user
    private_key = file(pathexpand(var.ssh_private_key_path))
    timeout     = var.ssh_timeout
  }

  provisioner "file" {
    source      = local.provision_script
    destination = "/tmp/cogito-provision.sh"
  }

  provisioner "remote-exec" {
    inline = [
      "chmod 700 /tmp/cogito-provision.sh",
      "sudo -n bash /tmp/cogito-provision.sh",
      "rm -f /tmp/cogito-provision.sh",
    ]
  }
}
