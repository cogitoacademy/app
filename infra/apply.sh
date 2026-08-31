#!/usr/bin/env bash
# apply.sh — one-command operator wrapper for the production apply flow
# (Terraform + Ansible) described in infra/APPLY-RUNBOOK.md.
#
# The operator brings the credentials (infra/terraform_key.txt, the SOPS Age
# key, and the VPS sudo password) and runs ONE command instead of the manual
# chains. Nothing here prompts for credentials — missing credential files/
# vars fail fast with a precise message. Secret values are never echoed.
#
# Usage (from the repo root):
#   ./infra/apply.sh [--dry-run] <subcommand>
#
# Subcommands:
#   import          terraform init + import the two pre-created resources
#   tf-plan         terraform plan -out=tfplan (needs import first)
#   tf-apply        terraform apply tfplan (needs the plan file + y/N)
#   tailscale       tailscale.yml playbook (auth key decrypted from the vault)
#   tailscale-verify  print the tailnet SSH command, then create the
#                   verified marker after the operator confirms exit 0
#   harden          host-hardening.yml — REFUSES without tailscale-verified
#   resources       coolify-resources.yml (+ Traefik paste reminder)
#   backup-cron     backup-cron.yml (DATABASE_URL reachability check + y/N)
#   verify          /health (version field) + cl. 302 + :8000 lock-down print
#   status          current marker / credential presence at a glance
#   all             phases in runbook order, pausing between phases, skipping
#                   phases whose markers show completion, aborting on failure
#   help            this text
#
# Markers live in infra/.apply-state/ (gitignored; runbook-verifiable):
#   tf-imported, tailscale-joined, tailscale-verified, hardened,
#   resources-synced, backup-cron-installed, tf-applied
# tf-plan completion is the plan file itself: infra/terraform/tfplan.
#
# --dry-run prints every command the run would execute (secret values
# redacted) and executes nothing — safe to run without any credentials.
set -euo pipefail

DRY=0
CMD=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

TERRAFORM_DIR="infra/terraform"
PLAN_FILE="$TERRAFORM_DIR/tfplan"
STATE_DIR="infra/.apply-state"
TERRAFORM_KEY_TXT="infra/terraform_key.txt"
AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
VAULT_FILE="infra/secrets/prod.env"

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

say() { printf '%s\n' "$*"; }

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

# die_multi <prefix> <line...> — multi-line precise errors (one message per arg).
die_multi() {
  local prefix="$1"
  shift
  printf '%s\n' "$prefix$1" >&2
  shift
  for line in "$@"; do printf '%s\n' "$line" >&2; done
  exit 1
}

# run_exec <display-text> <cmd...> — print the (redacted) display text, then
# execute <cmd...> in real mode. Dry-run never executes anything.
run_exec() {
  local disp="$1"
  shift
  if [[ "$DRY" == 1 ]]; then
    say "  would run: $disp"
    return 0
  fi
  say "  -> $disp"
  "$@"
}

# confirm <prompt> — interactive y/N (explicit N default). Returns 0 on y.
confirm() {
  local prompt="$1" ans
  if [[ "$DRY" == 1 ]]; then
    say "  [confirm] $prompt [y/N]"
    return 0
  fi
  while true; do
    if ! read -r -p "$prompt [y/N] " ans; then say ""; return 1; fi
    case "$ans" in
      [yY]* ) return 0 ;;
      [nN]* | "" ) return 1 ;;
      * ) say "  (answer y or n)" ;;
    esac
  done
}

# pause_before <phase-label> — explicit pause between `all` phases.
pause_before() {
  local label="$1"
  if [[ "$DRY" == 1 ]]; then
    say "  [pause] would wait for confirmation before next phase: $label"
    return 0
  fi
  read -r -p "Press Enter to continue with: $label (Ctrl+C to abort) " || { say ""; die "aborted by operator"; }
}

marker_done() { [[ -f "$STATE_DIR/$1" ]]; }
marker_set() { [[ "$DRY" == 1 ]] || { mkdir -p "$STATE_DIR" && : >"$STATE_DIR/$1" && say "  marker: $STATE_DIR/$1"; }; }

# --------------------------------------------------------------------------
# credentials — never echo values, fail with precise create-me messages
# --------------------------------------------------------------------------

require_terraform_key() {
  if [[ ! -f "$TERRAFORM_KEY_TXT" ]]; then
    if [[ "$DRY" == 1 ]]; then
      say "  [creds] would fail without $TERRAFORM_KEY_TXT (currently missing)"
      return 0
    fi
    die_multi "ERROR: " "$TERRAFORM_KEY_TXT not found. Create it with one line:" \
      "  CLOUDFLARE_API_TOKEN=<token>   (Zone:DNS:Edit + R2 Admin)" \
      "plus the R2 state-bucket creds as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY" \
      "(or R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) if the backend needs them. See APPLY-RUNBOOK.md §1."
  fi
  # shellcheck source=/dev/null
  . "$TERRAFORM_KEY_TXT"
  if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
    die_multi "ERROR: " "$TERRAFORM_KEY_TXT exists but does not set CLOUDFLARE_API_TOKEN. Add a line:" \
      "  CLOUDFLARE_API_TOKEN=<token>   (Zone:DNS:Edit + R2 Admin)"
  fi
  export CLOUDFLARE_API_TOKEN
  # R2 state-backend vars: map the R2_* convention onto the AWS_* names the
  # s3 backend reads, only when the AWS_* name is absent.
  for v in ACCESS_KEY_ID SECRET_ACCESS_KEY; do
    local aws_var="AWS_$v" r2_var="R2_$v"
    if [[ -z "${!aws_var:-}" && -n "${!r2_var:-}" ]]; then
      export "$aws_var=${!r2_var}"
    fi
  done
  [[ -z "${AWS_ENDPOINT_URL_S3:-}" && -n "${R2_ENDPOINT:-}" ]] && export AWS_ENDPOINT_URL_S3="$R2_ENDPOINT"
  if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
    say "  note: no R2 state-bucket credentials (AWS/R2 ACCESS_KEY_ID + SECRET_ACCESS_KEY)" \
      "in $TERRAFORM_KEY_TXT — terraform init/plan will fail at the state backend" \
      "until you add them (APPLY-RUNBOOK.md §1)."
  fi
}

require_sops() {
  command -v sops >/dev/null 2>&1 || die "sops is not on PATH. Install it (e.g. brew install sops) — it decrypts $VAULT_FILE."
  if [[ ! -f "$AGE_KEY_FILE" ]]; then
    if [[ "$DRY" == 1 ]]; then
      say "  [creds] would fail without SOPS Age key at $AGE_KEY_FILE (currently missing)"
      return 0
    fi
    die_multi "ERROR: " "SOPS Age key not found at $AGE_KEY_FILE (export SOPS_AGE_KEY_FILE if it lives elsewhere)." \
      "Create it from your Age private key: mkdir -p $(dirname "$AGE_KEY_FILE") && sops ... >" \
      "$AGE_KEY_FILE, or follow the Age key setup in APPLY-RUNBOOK.md §1."
  fi
  export SOPS_AGE_KEY_FILE="$AGE_KEY_FILE"
}

require_tool() { # require_tool <name> <hint> — dry-run prints instead of failing
  local name="$1" hint="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    if [[ "$DRY" == 1 ]]; then
      say "  [tool] would fail: $name is not on PATH.$hint"
      return 0
    fi
    die "$name is not on PATH.$hint"
  fi
}

# --------------------------------------------------------------------------
# phases
# --------------------------------------------------------------------------

ensure_tf_init() {
  if [[ ! -d "$TERRAFORM_DIR/.terraform" ]]; then
    run_exec "terraform -chdir=$TERRAFORM_DIR init  (first run; R2 state backend)" \
      terraform -chdir="$TERRAFORM_DIR" init
  fi
}

phase_import() {
  say ""
  say "=== import: R2 bucket + custom domain (pre-created) ==="
  require_terraform_key
  require_tool terraform " Install it (brew install terraform / hashicorp/tap)."
  ensure_tf_init
  if ! run_exec "terraform -chdir=$TERRAFORM_DIR import cloudflare_r2_bucket.uploads cogito-bucket" \
      terraform -chdir="$TERRAFORM_DIR" import cloudflare_r2_bucket.uploads cogito-bucket 2>"$STATE_DIR/import-bucket.log"; then
    if grep -qiE "already (managed by terraform|in state|exists)" "$STATE_DIR/import-bucket.log"; then
      say "  bucket already in state — nothing to do (noted)."
    else
      die_multi "ERROR: " "cloudflare_r2_bucket.uploads import failed:" \
        "$(tail -5 "$STATE_DIR/import-bucket.log")"
      return 1
    fi
  fi
  if ! run_exec "terraform -chdir=$TERRAFORM_DIR import cloudflare_r2_custom_domain.uploads r2bucket.cogitoacademy.id" \
      terraform -chdir="$TERRAFORM_DIR" import cloudflare_r2_custom_domain.uploads r2bucket.cogitoacademy.id 2>"$STATE_DIR/import-domain.log"; then
    if grep -qiE "already (managed by terraform|in state|exists)" "$STATE_DIR/import-domain.log"; then
      say "  custom domain already in state — nothing to do (noted)."
    else
      die_multi "ERROR: " "cloudflare_r2_custom_domain.uploads import failed:" \
        "$(tail -5 "$STATE_DIR/import-domain.log")"
      return 1
    fi
  fi
  marker_set tf-imported
  return 0
}

phase_tf_plan() {
  say ""
  say "=== tf-plan ==="
  require_terraform_key
  require_tool terraform " Install it (brew install terraform / hashicorp/tap)."
  ensure_tf_init
  run_exec "terraform -chdir=$TERRAFORM_DIR plan -out=tfplan  (review the R2 + DNS diff)" \
    terraform -chdir="$TERRAFORM_DIR" plan -out=tfplan
  say "  tfplan written to $PLAN_FILE"
}

phase_tf_apply() {
  say ""
  say "=== tf-apply ==="
  if [[ ! -f "$PLAN_FILE" ]]; then
    if [[ "$DRY" == 1 ]]; then
      say "  [gate] would refuse: no plan file at $PLAN_FILE — run 'infra/apply.sh tf-plan' first."
      return 0
    fi
    die "no plan file at $PLAN_FILE — run 'infra/apply.sh tf-plan' first."
  fi
  confirm "Apply the existing $PLAN_FILE now?" || die "terraform apply cancelled by operator (no changes made)."
  require_terraform_key
  require_tool terraform " Install it (brew install terraform / hashicorp/tap)."
  run_exec "terraform -chdir=$TERRAFORM_DIR apply tfplan" \
    terraform -chdir="$TERRAFORM_DIR" apply "$PLAN_FILE"
  marker_set tf-applied
}

phase_tailscale() {
  say ""
  say "=== tailscale: join the VPS to the tailnet ==="
  require_sops
  require_tool ansible-playbook " Install ansible-core (e.g. brew install ansible)."
  if [[ "$DRY" == 1 ]]; then
    say "  would run: ansible-playbook -i infra/ansible/inventory.ini infra/ansible/tailscale.yml \\"
    say "               --ask-become-pass -e \"ts_auth_key=<redacted: decrypted from SOPS vault at run time>\""
    say "  [creds] requires: $AGE_KEY_FILE (age key) + TS_AUTH_KEY set in $VAULT_FILE"
    return 0
  fi
  local ts_key
  ts_key="$(sops -d "$VAULT_FILE" | grep '^TS_AUTH_KEY=' | cut -d= -f2-)" \
    || die "could not decrypt $VAULT_FILE with sops (is the Age key loaded?)."
  [[ -n "$ts_key" ]] || die "TS_AUTH_KEY is not set in $VAULT_FILE — set it (vault: TS_AUTH_KEY) before joining the tailnet."
  say "  -> ansible-playbook -i infra/ansible/inventory.ini infra/ansible/tailscale.yml --ask-become-pass -e ts_auth_key=<redacted>"
  ansible-playbook -i infra/ansible/inventory.ini infra/ansible/tailscale.yml \
    --ask-become-pass -e "ts_auth_key=$ts_key"
  marker_set tailscale-joined
}

phase_tailscale_verify() {
  say ""
  say "=== tailscale-verify: prove tailnet SSH works BEFORE hardening ==="
  local ssh_cmd='ssh -i ~/.ssh/cogito_vps ubuntu@<tailscale-ip-or-hostname>'
  say "  run this in a separate terminal (the tailnet IP is in 'tailscale status' on the VPS,"
  say "  or from the tailscale phase output above):"
  say "    $ssh_cmd"
  if [[ "$DRY" == 1 ]]; then
    say "  [confirm] did that SSH session exit 0? (creates $STATE_DIR/tailscale-verified)"
    return 0
  fi
  # Optional: run the ssh itself. The tailnet IP is unknown from the control
  # node, so ask the operator for it if they want the wrapper to connect.
  if confirm "Should I run the tailnet SSH for you (needs the tailnet IP/host) and create the marker on exit 0?"; then
    local host
    read -r -p "tailnet IP or hostname of cogito-vps: " host
    [[ -n "$host" ]] || die "no host given — run ssh manually and re-run tailscale-verify."
    if ssh -i ~/.ssh/cogito_vps "ubuntu@$host"; then
      marker_set tailscale-verified
      return 0
    fi
    die "tailnet SSH to $host did not exit 0 — hardening stays REFUSED."
  fi
  confirm "Confirmed: the tailnet SSH command above exited 0?" \
    || die "tailnet SSH not confirmed — hardening stays REFUSED. Re-run tailscale-verify when it works."
  marker_set tailscale-verified
}

phase_harden() {
  say ""
  say "=== harden: host hardening (SSH becomes tailnet-only!) ==="
  if ! marker_done tailscale-verified; then
    if [[ "$DRY" == 1 ]]; then
      say "  [gate] would REFUSE: $STATE_DIR/tailscale-verified is missing —" \
        "(tailscale-verify must confirm tailnet SSH first, see APPLY-RUNBOOK.md §3.2)"
      return 0
    fi
    die "refusing to harden: $STATE_DIR/tailscale-verified is missing." \
      "Run './infra/apply.sh tailscale-verify' first — hardening locks SSH to the tailnet and" \
      "running it without verified tailnet access is an operator lockout (APPLY-RUNBOOK.md §3)."
  fi
  require_tool ansible-playbook " Install ansible-core (e.g. brew install ansible)."
  run_exec "ansible-playbook -i infra/ansible/inventory.ini infra/ansible/host-hardening.yml --ask-become-pass" \
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/host-hardening.yml --ask-become-pass
  marker_set hardened
}

phase_resources() {
  say ""
  say "=== resources: coolify-resources.yml (env switch — maintenance window, API restarts) ==="
  require_sops
  require_tool ansible-playbook " Install ansible-core (e.g. brew install ansible)."
  run_exec "ansible-playbook -i infra/ansible/inventory.ini infra/ansible/coolify-resources.yml --ask-become-pass" \
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/coolify-resources.yml --ask-become-pass
  say "  reminder: if the playbook's probe printed 404 (no Traefik route yet), paste the printed"
  say "  Traefik dynamic config into Coolify UI -> Servers -> cogito-vps -> Proxy -> Custom"
  say "  Configuration, then re-run './infra/apply.sh resources' to flip the probe 404 -> 401/405."
  marker_set resources-synced
}

phase_backup_cron() {
  say ""
  say "=== backup-cron: nightly PostgreSQL backup to R2 ==="
  require_sops
  require_tool ansible-playbook " Install ansible-core (e.g. brew install ansible)."
  if [[ "$DRY" == 1 ]]; then
    say "  [creds] DATABASE_URL host would be decrypted from $VAULT_FILE at run time (credentials redacted)"
    say "  [gate]  operator must confirm DATABASE_URL resolves from the VPS host before the playbook runs"
    say "  would run: ansible-playbook -i infra/ansible/inventory.ini infra/ansible/backup-cron.yml --ask-become-pass"
    return 0
  fi
  local db_url db_host
  db_url="$(sops -d "$VAULT_FILE" | grep '^DATABASE_URL=' | head -1 | cut -d= -f2-)" \
    || die "could not decrypt $VAULT_FILE with sops."
  [[ -n "$db_url" ]] || die "DATABASE_URL is not set in $VAULT_FILE — set it to a host-reachable endpoint first."
  db_host="$(printf '%s' "$db_url" | sed -E 's#^[^:/]+://[^@]*@?([^:/]+).*#\1#')"
  say "  DATABASE_URL host: $db_host (credentials from the vault not shown)"
  say "  reachability: on the VPS, 'getent hosts $db_host' must succeed — the host cannot reach"
  say "  Coolify's private 'postgres-prod' Docker network unless the port is published"
  say "  (APPLY-RUNBOOK.md §3 / backup-cron.yml header)."
  confirm "Is DATABASE_URL reachable from the VPS host (checked with the command above)?" \
    || die "backup-cron cancelled by operator — fix DATABASE_URL (vault) first."
  run_exec "ansible-playbook -i infra/ansible/inventory.ini infra/ansible/backup-cron.yml --ask-become-pass" \
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/backup-cron.yml --ask-become-pass
  marker_set backup-cron-installed
}

phase_verify() {
  say ""
  say "=== verify: public endpoints ==="
  local body
  if [[ "$DRY" == 1 ]]; then
    say "  would run: curl -fsS --max-time 10 https://api.cogitoacademy.id/health   (assert \"version\" field present)"
    say "  would run: curl -sI --max-time 10 https://cl.cogitoacademy.id            (expect HTTP 302)"
    say "  would print: public :8000 lock-down check for the operator to run (below)"
    return 0
  fi
  say "  -> curl -fsS --max-time 10 https://api.cogitoacademy.id/health"
  body="$(curl -fsS --max-time 10 https://api.cogitoacademy.id/health)" \
    || die "https://api.cogitoacademy.id/health failed (is the API up? see RUNBOOK)."
  if ! grep -q '"version"' <<<"$body"; then
    die "health payload has no \"version\" field — expected it; got: $body"
  fi
  say "  health OK — $(grep -o '"version":"[^"]*"' <<<"$body" | head -1)"
  say "  -> curl -sI --max-time 10 https://cl.cogitoacademy.id  (expect 302)"
  local headers
  headers="$(curl -sI --max-time 10 https://cl.cogitoacademy.id)" \
    || die "https://cl.cogitoacademy.id did not answer (expected HTTP 302 redirect)."
  if ! grep -qi '^HTTP/.* 302' <<<"$headers"; then
    die "expected HTTP 302 from https://cl.cogitoacademy.id — got: $(printf '%s' "$headers" | head -1)"
  fi
  say "  cl. redirect OK (302)."
  say ""
  say "  === public :8000 lock-down check (operate this yourself) ==="
  say "  The Coolify dashboard binds localhost/tailnet-only after hardening. From a NON-tailnet"
  say "  network (e.g. phone hotspot), run:"
  say "      curl -sS --max-time 5 http://15.235.186.159:8000/ && echo LEAK || echo \"no-answer (good: locked down)\""
  say "  Expected: timeout/no-answer. Anything else = dashboard exposed publicly — fix UFW immediately."
}

phase_status() {
  say ""
  say "=== apply wrapper status ==="
  [[ -f "$TERRAFORM_KEY_TXT" ]] && say "  credentials: $TERRAFORM_KEY_TXT present (values never shown)" \
                                    || say "  credentials: $TERRAFORM_KEY_TXT MISSING"
  [[ -f "$AGE_KEY_FILE" ]] && say "  credentials: SOPS Age key present at $AGE_KEY_FILE" \
                             || say "  credentials: SOPS Age key MISSING at $AGE_KEY_FILE"
  say "  tfplan: $([[ -f "$PLAN_FILE" ]] && echo present || echo absent)"
  local m
  for m in tf-imported tailscale-joined tailscale-verified hardened resources-synced backup-cron-installed tf-applied; do
    marker_done "$m" && say "  [x] $m" || say "  [ ] $m"
  done
}

# --------------------------------------------------------------------------
# all — runbook order (APPLY-RUNBOOK.md §2-3), pause between phases, skip
# completed (marker) phases, abort on first failure
# --------------------------------------------------------------------------

phase_import_if_pending() {
  if marker_done tf-imported; then say "  skip import — marker $STATE_DIR/tf-imported present"; return 0; fi
  pause_before "import (terraform init + imports)"
  phase_import
}
phase_tf_plan_if_pending() {
  if [[ -f "$PLAN_FILE" ]]; then say "  skip tf-plan — $PLAN_FILE exists (run 'infra/apply.sh tf-plan' again to refresh)"; return 0; fi
  pause_before "tf-plan"
  phase_tf_plan
}
phase_tf_apply_if_pending() {
  if marker_done tf-applied; then say "  skip tf-apply — marker $STATE_DIR/tf-applied present"; return 0; fi
  pause_before "tf-apply (y/N confirmation)"
  phase_tf_apply
}
phase_tailscale_if_pending() {
  if marker_done tailscale-joined; then say "  skip tailscale — marker $STATE_DIR/tailscale-joined present"; return 0; fi
  pause_before "tailscale (join)"
  phase_tailscale
}
phase_tailscale_verify_if_pending() {
  if marker_done tailscale-verified; then say "  skip tailscale-verify — marker $STATE_DIR/tailscale-verified present"; return 0; fi
  pause_before "tailscale-verify (tailnet SSH proof)"
  phase_tailscale_verify
}
phase_harden_if_pending() {
  if marker_done hardened; then say "  skip harden — marker $STATE_DIR/hardened present"; return 0; fi
  pause_before "harden (host hardening)"
  phase_harden
}
phase_resources_if_pending() {
  if marker_done resources-synced; then say "  skip resources — marker $STATE_DIR/resources-synced present (re-run infra/apply.sh resources to re-sync)"; return 0; fi
  pause_before "resources (coolify-resources.yml)"
  phase_resources
}
phase_backup_cron_if_pending() {
  if marker_done backup-cron-installed; then say "  skip backup-cron — marker $STATE_DIR/backup-cron-installed present"; return 0; fi
  pause_before "backup-cron (DATABASE_URL reachability check)"
  phase_backup_cron
}

cmd_all() {
  say "Full apply plan (runbook order) — aborting on first failure."
  say "Skip logic: a phase is skipped when its marker shows completion."
  [[ "$DRY" == 1 ]] && say "[dry-run] nothing will be executed; commands below are redacted."
  say ""

  phase_import_if_pending
  phase_tf_plan_if_pending
  phase_tf_apply_if_pending
  phase_tailscale_if_pending
  phase_tailscale_verify_if_pending
  phase_harden_if_pending
  phase_resources_if_pending
  phase_backup_cron_if_pending

  if [[ "$DRY" == 1 ]]; then
    say ""
    say "=== verify phase (always runs) ==="
  else
    say ""
    say "=== final verification ==="
  fi
  phase_verify
  say ""
  say "Apply flow complete."
}

# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

usage() {
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run ) DRY=1; shift ;;
      -h | --help | help ) usage; exit 0 ;;
      -* ) die "unknown flag: $1 (see ./infra/apply.sh help)" ;;
      * )
        [[ -z "$CMD" ]] && CMD="$1" || die "unexpected argument: $1"
        shift ;;
    esac
  done
  [[ -n "$CMD" ]] || { usage; exit 1; }

  mkdir -p "$STATE_DIR"

  case "$CMD" in
    import ) phase_import ;;
    tf-plan ) phase_tf_plan ;;
    tf-apply ) phase_tf_apply ;;
    tailscale ) phase_tailscale ;;
    tailscale-verify ) phase_tailscale_verify ;;
    harden ) phase_harden ;;
    resources ) phase_resources ;;
    backup-cron ) phase_backup_cron ;;
    verify ) phase_verify ;;
    status ) phase_status ;;
    all ) cmd_all ;;
    * ) die "unknown subcommand: $CMD (see ./infra/apply.sh help)" ;;
  esac
}

main "$@"
