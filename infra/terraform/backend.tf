# Terraform state backend — Cloudflare R2 (S3-compatible).
#
# Two-phase bootstrap:
#   1. FIRST apply with `backend "local"` (comment the r2 block below) to
#      create the R2 bucket + DNS records the backend depends on.
#   2. THEN switch to this backend, `terraform init -migrate-state`, and
#      every subsequent apply stores state in R2 (locked by the `-lock`
#      flag; R2 has no native locking — keep applies single-operator).
#
# Credentials come from env: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
# (an R2 API token scoped to this bucket).

terraform {
  backend "s3" {
    bucket                      = "cogito-infra-state"
    key                         = "terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    endpoints = {
      s3 = "https://f43b8a87deeed597ecd8b4a1119d09b5.r2.cloudflarestorage.com"
    }
  }
}
