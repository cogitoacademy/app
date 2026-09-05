#!/bin/bash
# Nightly PostgreSQL backup to Cloudflare R2 with retention pruning.
#
# Dumps the database referenced by $DATABASE_URL, gzip-compresses it, uploads
# it to R2 under backups/YYYY-MM-DD.sql.gz, then deletes R2 objects older than
# $RETENTION_DAYS. Also prunes the CD pre-migrate snapshots
# (pre-migrate-<sha>.sql.gz at the bucket root) beyond the newest
# $PRE_MIGRATE_KEEP — they were previously never pruned and accumulated
# unbounded.
#
# Client tools: pg_dump (PostgreSQL client) + aws (AWS CLI v2, S3-compatible
# against R2). No new dependencies beyond standard CLI tools.
#
# Dump format: custom format (-Fc) so the restore drill can use pg_restore
# (plain SQL dumps cannot be consumed by pg_restore). The file is named
# backups-YYYY-MM-DD.sql.gz: gzip-compressed custom-format dump.
#
# Env:
#   DATABASE_URL          PostgreSQL connection string WITH credentials
#                         (cron has no TTY, pg_dump will not prompt).
#   R2_ACCOUNT_ID         Cloudflare account id (endpoint host).
#   R2_ACCESS_KEY_ID      R2 API token access key id.
#   R2_SECRET_ACCESS_KEY  R2 API token secret access key.
#   R2_BACKUP_BUCKET      Private bucket for backups (default: cogito-backups).
#                         Deliberately separate from the app's public
#                         R2_BUCKET (uploads) so database dumps are never
#                         reachable via the public custom domain.
#   RETENTION_DAYS        Keep backups younger than this many days (default: 30).
#   PRE_MIGRATE_KEEP      Keep only the newest N CD pre-migrate snapshots
#                         (default: 7). Pruned by the nightly cron alongside
#                         the daily dumps.
#   DISCORD_WEBHOOK_URL   Optional Discord webhook URL for the failure
#                         self-check: dump/upload/verify failures post a
#                         CRITICAL alert (bearer secret — never echoed).
#                         When unset, failures are loud on stderr + exit 1.
#
# Failure self-check: any failing step (dump, upload, verify, prune) posts a
# Discord CRITICAL alert naming the step, so a silent cron failure cannot go
# unnoticed. Preflight problems (missing env, unresolvable DB host, empty
# dump) abort loudly before any snapshot/upload via fail() below.
#
# Usage:
#   infra/backup.sh            # run the backup
#   infra/backup.sh --dry-run  # print the exact commands without executing
#
# Requires GNU date + GNU head (Ubuntu VPS; `head -n -N` is a GNU extension).
# Run as root or the backup user (see infra/ansible/backup-cron.yml); the
# backup user only needs read access to the database and write access to the
# R2 bucket.
set -euo pipefail

# The VPS AWS CLI v2 lives at /opt/cogito-actions-tools/bin (noble dropped
# the apt package); root cron PATH does not include it.
export PATH="${PATH}:/opt/cogito-actions-tools/bin"

# The AWS CLI reads AWS_* names; the vault/env file uses R2_* (same mapping
# as infra/apply.sh). Without this the upload silently fails auth.
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# --- Failure self-check ------------------------------------------------------
# STEP names the phase for the Discord alert. The ERR trap catches failing
# commands (dump/upload/verify/prune); fail() covers the explicit preflight
# exits, which `exit` would otherwise take past the trap silently.
STEP="preflight"
discord_alert() {
  local content="$1"
  if [[ -z "${DISCORD_WEBHOOK_URL:-}" ]]; then
    return 0
  fi
  # The URL is fed to curl via a stdin config file (-K -), never argv, so it
  # cannot appear in `ps` output.
  printf 'url = "%s"\n' "${DISCORD_WEBHOOK_URL}" | \
    curl --fail --silent --show-error --max-time 15 -K - \
    -H "Content-Type: application/json" \
    -d "{\"content\": $(printf '%s' "$content" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" \
    >/dev/null 2>&1 \
    || echo "WARN: Discord alert post failed (curl rc=$?)" >&2
}
backup_failed() {
  local rc=$?
  trap - ERR
  echo "ERROR: nightly backup FAILED during ${STEP} (rc=${rc})" >&2
  discord_alert "CRITICAL: nightly backup FAILED during ${STEP} (rc=${rc}) — operator action required (check cron output / R2 bucket)"
  exit "${rc}"
}
trap 'backup_failed' ERR
fail() {
  echo "ERROR: $*" >&2
  discord_alert "CRITICAL: nightly backup FAILED during ${STEP}: $*"
  exit 1
}

# --- Required environment ---------------------------------------------------
for var in DATABASE_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    fail "$var is not set"
  fi
done

R2_BACKUP_BUCKET="${R2_BACKUP_BUCKET:-cogito-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
# Keep only the newest N CD pre-migrate snapshots (pre-migrate-<sha>.sql.gz).
# These are uploaded by scripts/migrate-and-deploy.sh on every deploy and
# were previously never pruned (50+ accumulated). The nightly backup cron
# prunes them alongside the daily dumps.
PRE_MIGRATE_KEEP="${PRE_MIGRATE_KEEP:-7}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

TODAY="$(date +%F)"
LOCAL_FILE="backups-${TODAY}.sql.gz"
R2_KEY="backups/${TODAY}.sql.gz"

# --- Fail loud if the CLI tools are missing ---------------------------------
if [[ "${DRY_RUN}" -eq 0 ]]; then
  command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found (install postgresql-client)"
  command -v aws >/dev/null 2>&1 || fail "aws CLI not found (install awscli v2)"
fi

# --- 0. Resolve the DB host (Coolify-private hostname -> container IP) ------
# The vault DATABASE_URL uses the app's private-network hostname (e.g.
# noxeaeuxfreq0axa9unpew5r) which the VPS host cannot resolve. Same logic as
# scripts/resolve-private-db-url.sh: if the hostname does not resolve, look
# up the container IP on the coolify network and rewrite the URL.
db_host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:/]+://[^@]*@?([^:/]+).*#\1#')"
if ! (command -v getent >/dev/null 2>&1 && getent hosts "$db_host" >/dev/null 2>&1); then
  db_ip="$(docker inspect --format '{{with index .NetworkSettings.Networks "coolify"}}{{.IPAddress}}{{end}}' "$db_host" 2>/dev/null || sudo -n docker inspect --format '{{with index .NetworkSettings.Networks "coolify"}}{{.IPAddress}}{{end}}' "$db_host" 2>/dev/null)"
  if [[ -n "$db_ip" ]]; then
    DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed "s#@${db_host}:#@${db_ip}:#")"
    echo "==> resolved private DB host ${db_host} -> ${db_ip}"
  else
    fail "cannot resolve DB host '${db_host}' (getent + docker inspect both failed)"
  fi
fi

# --- 1. Dump + compress -------------------------------------------------------
# pg_dump streams to stdout; gzip compresses on the fly. The archive stays
# local only long enough to be uploaded (temp dir, cleaned up on exit).
dump_cmd="pg_dump --no-owner --no-acl -Fc '${DATABASE_URL}' | gzip -9 > '${LOCAL_FILE}'"

# --- 2. Upload to R2 ----------------------------------------------------------
# S3-compatible R2 endpoint; region is 'auto' for R2.
upload_cmd="aws s3 cp '${LOCAL_FILE}' 's3://${R2_BACKUP_BUCKET}/${R2_KEY}' --endpoint-url '${R2_ENDPOINT}' --region auto"
verify_cmd="aws s3api head-object --bucket '${R2_BACKUP_BUCKET}' --key '${R2_KEY}' --endpoint-url '${R2_ENDPOINT}' --region auto"

# --- 3. Retention prune --------------------------------------------------------
# List backups/, keep only keys matching backups/YYYY-MM-DD.sql.gz, compute age
# with GNU date, delete anything strictly older than RETENTION_DAYS.
prune_cmd="aws s3 ls 's3://${R2_BACKUP_BUCKET}/backups/' --endpoint-url '${R2_ENDPOINT}' --region auto"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "DRY RUN — commands that would be executed:"
  echo
  echo "# 1. Dump + compress"
  echo "${dump_cmd}"
  echo
  echo "# 2. Upload to R2 (s3://${R2_BACKUP_BUCKET}/${R2_KEY})"
  echo "${upload_cmd}"
  echo "${verify_cmd}"
  echo
  echo "# 3. Prune objects older than ${RETENTION_DAYS} days"
  echo "${prune_cmd}"
  echo "for each key older than ${RETENTION_DAYS} days:"
  echo "  aws s3 rm 's3://${R2_BACKUP_BUCKET}/<key>' --endpoint-url '${R2_ENDPOINT}' --region auto"
  echo
  echo "# 4. Prune pre-migrate snapshots, keeping the newest ${PRE_MIGRATE_KEEP}"
  echo "aws s3 ls 's3://${R2_BACKUP_BUCKET}/' --endpoint-url '${R2_ENDPOINT}' --region auto"
  echo "for each pre-migrate-*.sql.gz beyond the newest ${PRE_MIGRATE_KEEP}:"
  echo "  aws s3 rm 's3://${R2_BACKUP_BUCKET}/<key>' --endpoint-url '${R2_ENDPOINT}' --region auto"
  exit 0
fi

echo "==> Dumping database and compressing (${TODAY})"
STEP="dump"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
cd "${WORK_DIR}"
eval "${dump_cmd}"

if [[ ! -s "${LOCAL_FILE}" ]]; then
  fail "backup file is empty; aborting before any upload"
fi
ls -lh "${LOCAL_FILE}"

echo "==> Uploading to s3://${R2_BACKUP_BUCKET}/${R2_KEY}"
STEP="upload"
eval "${upload_cmd}"
eval "${verify_cmd}" >/dev/null

echo "==> Pruning backups older than ${RETENTION_DAYS} days"
STEP="prune"
# s3 ls line format: "2026-08-27 02:00:00     123456 backups/2026-08-26.sql.gz"
now_epoch="$(date +%s)"
pruned=0
while IFS= read -r line; do
  key="$(awk '{print $4}' <<<"${line}")"
  [[ "${key}" =~ ^backups/[0-9]{4}-[0-9]{2}-[0-9]{2}\.sql\.gz$ ]] || continue
  d="$(basename "${key}" .sql.gz)"
  d_epoch="$(date -d "${d}" +%s)"
  age_days=$(( (now_epoch - d_epoch) / 86400 ))
  if (( age_days > RETENTION_DAYS )); then
    echo "  deleting ${key} (${age_days} days old)"
    aws s3 rm "s3://${R2_BACKUP_BUCKET}/${key}" --endpoint-url "${R2_ENDPOINT}" --region auto >/dev/null
    pruned=$((pruned + 1))
  fi
done < <(eval "${prune_cmd}")

echo "==> Pruning pre-migrate snapshots, keeping the newest ${PRE_MIGRATE_KEEP}"
# s3 ls line format: "2026-08-27 02:00:00     123456 pre-migrate-<sha>.sql.gz"
# List the bucket root, keep only CD pre-migrate snapshots, sort by date, and
# delete everything except the newest PRE_MIGRATE_KEEP (head -n -N = all but
# the last N lines).
pruned_pm=0
while IFS= read -r line; do
  key="$(awk '{print $4}' <<<"${line}")"
  echo "  deleting ${key} (beyond the newest ${PRE_MIGRATE_KEEP})"
  aws s3 rm "s3://${R2_BACKUP_BUCKET}/${key}" --endpoint-url "${R2_ENDPOINT}" --region auto >/dev/null
  pruned_pm=$((pruned_pm + 1))
done < <(eval "aws s3 ls 's3://${R2_BACKUP_BUCKET}/' --endpoint-url '${R2_ENDPOINT}' --region auto" | grep -E 'pre-migrate-[0-9a-f]{40}\.sql\.gz$' | sort -k1,2 | head -n -${PRE_MIGRATE_KEEP})
echo "==> Done: uploaded ${R2_KEY}, pruned ${pruned} object(s), pruned ${pruned_pm} pre-migrate snapshot(s)"
