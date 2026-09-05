#!/bin/bash
# r2-upload-audit.sh — nightly R2 upload-bucket content-type audit (U3).
#
# Lists objects in the public upload bucket (default: cogito-bucket), HEADs
# each object's ContentType, and compares it against the key's extension
# class (image extensions must serve image/*, .pdf must serve
# application/pdf). Mismatches (wrong ContentType, or unexpected extensions
# from before the per-flow allowlist hardening) are posted to Discord and
# make the script exit 1 so cron surfaces the failure.
#
# This is READ-ONLY against the bucket (list + HEAD). It never uploads,
# deletes, or changes bucket policy/CORS.
#
# Client tools: aws (AWS CLI v2, S3-compatible against R2). Same R2_* env
# mapping as infra/backup.sh.
#
# Env:
#   R2_ACCOUNT_ID         Cloudflare account id (endpoint host).
#   R2_ACCESS_KEY_ID      R2 API token access key id.
#   R2_SECRET_ACCESS_KEY  R2 API token secret access key.
#   R2_BUCKET             Upload bucket to audit (default: cogito-bucket).
#                         Deliberately NOT cogito-backups (private dumps).
#   R2_AUDIT_MAX_KEYS     Max keys to audit per run (default: 1000).
#   DISCORD_WEBHOOK_URL   Discord webhook URL (bearer secret — never echoed).
#                         When unset, mismatches are printed but not posted.
#
# Usage:
#   infra/r2-upload-audit.sh            # run the audit
#   infra/r2-upload-audit.sh --dry-run  # print the exact commands without executing
set -euo pipefail

# The VPS AWS CLI v2 lives at /opt/cogito-actions-tools/bin (noble dropped
# the apt package); root cron PATH does not include it.
export PATH="${PATH}:/opt/cogito-actions-tools/bin"

# The AWS CLI reads AWS_* names; the vault/env file uses R2_* (same mapping
# as infra/backup.sh and infra/apply.sh).
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# --- Required environment ---------------------------------------------------
for var in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is not set" >&2
    exit 1
  fi
done

R2_BUCKET="${R2_BUCKET:-cogito-bucket}"
R2_AUDIT_MAX_KEYS="${R2_AUDIT_MAX_KEYS:-1000}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

list_cmd="aws s3api list-objects-v2 --bucket '${R2_BUCKET}' --max-keys '${R2_AUDIT_MAX_KEYS}' --query 'Contents[].Key' --output text --endpoint-url '${R2_ENDPOINT}' --region auto"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "DRY RUN — commands that would be executed:"
  echo
  echo "# 1. List keys"
  echo "${list_cmd}"
  echo
  echo "# 2. HEAD each key for its ContentType"
  echo "aws s3api head-object --bucket '${R2_BUCKET}' --key '<key>' --query ContentType --output text --endpoint-url '${R2_ENDPOINT}' --region auto"
  echo
  echo "# 3. Compare extension class (png/jpg/jpeg/webp/gif -> image/*, pdf -> application/pdf) and post mismatches to Discord"
  exit 0
fi

command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not found (install awscli v2)" >&2; exit 1; }

echo "==> Auditing s3://${R2_BUCKET} (max ${R2_AUDIT_MAX_KEYS} keys)"
keys="$(eval "${list_cmd}")"
if [[ -z "${keys}" || "${keys}" == "None" ]]; then
  echo "==> No objects found; nothing to audit"
  exit 0
fi

mismatches=0
checked=0
mismatch_lines=()
while IFS= read -r key; do
  [[ -n "${key}" ]] || continue
  checked=$((checked + 1))
  content_type="$(aws s3api head-object --bucket "${R2_BUCKET}" --key "${key}" --query ContentType --output text --endpoint-url "${R2_ENDPOINT}" --region auto 2>/dev/null || echo "HEAD-FAILED")"
  ext="${key##*.}"
  # shellcheck disable=SC2001
  ext="$(printf '%s' "${ext}" | tr '[:upper:]' '[:lower:]')"
  expected=""
  case "${ext}" in
    png|jpg|jpeg|webp|gif) expected="image/" ;;
    pdf) expected="application/pdf" ;;
    *) expected="UNEXPECTED-EXTENSION" ;;
  esac
  ok=0
  if [[ "${expected}" == "image/" && "${content_type}" == image/* ]]; then
    ok=1
  elif [[ "${expected}" != "image/" && "${expected}" != "UNEXPECTED-EXTENSION" && "${content_type}" == "${expected}" ]]; then
    ok=1
  fi
  if [[ "${ok}" -eq 0 ]]; then
    mismatches=$((mismatches + 1))
    mismatch_lines+=("${key} (ext .${ext}, ContentType: ${content_type})")
  fi
done <<<"${keys}"

echo "==> Checked ${checked} object(s), ${mismatches} mismatch(es)"
if [[ "${mismatches}" -eq 0 ]]; then
  exit 0
fi

printf '  MISMATCH: %s\n' "${mismatch_lines[@]}"
summary="R2 upload audit: ${mismatches}/${checked} object(s) in ${R2_BUCKET} have ContentType vs key-class mismatches (first: ${mismatch_lines[0]})"
if [[ -z "${DISCORD_WEBHOOK_URL:-}" ]]; then
  echo "WARN: DISCORD_WEBHOOK_URL not set — cannot post: ${summary}" >&2
  exit 1
fi
# The URL is fed to curl via a stdin config file (-K -), never argv, so it
# cannot appear in `ps` output.
printf 'url = "%s"\n' "${DISCORD_WEBHOOK_URL}" | \
  curl --fail --silent --show-error --max-time 15 -K - \
  -H "Content-Type: application/json" \
  -d "{\"content\": $(printf '%s' "${summary}" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" \
  >/dev/null 2>&1 \
  && echo "==> Discord alert posted" \
  || { echo "ERROR: Discord post failed (curl rc=$?)" >&2; exit 1; }
exit 1
