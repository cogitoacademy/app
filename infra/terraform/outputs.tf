output "server_ip" {
  description = "The bootstrapped VPS address."
  value       = var.server_ip
}

output "coolify_url" {
  description = "Use the SSH tunnel below; port 8000 is intentionally not public."
  value       = "http://localhost:8000"
}

output "coolify_ssh_tunnel" {
  description = "Run this command in a second local terminal, then open http://localhost:8000."
  value       = "ssh -i \"${pathexpand(var.ssh_private_key_path)}\" -N -L 8000:127.0.0.1:8000 -L 6001:127.0.0.1:6001 -L 6002:127.0.0.1:6002 ${var.ssh_user}@${var.server_ip}"
}

output "r2_infra_state_bucket" {
  description = "R2 bucket holding the Terraform state backend."
  value       = cloudflare_r2_bucket.infra_state.name
}

output "r2_backups_bucket" {
  description = "R2 bucket for nightly DB backups (30-day retention)."
  value       = cloudflare_r2_bucket.backups.name
}

