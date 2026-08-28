#!/usr/bin/env bash
#
# migrate-and-deploy.sh — production CD pipeline: backup → migrate → deploy →
# sha-verified health poll, with a clear rollback hint on failure.
#
# Usage:
#   scripts/migrate-and-deploy.sh [--dry-run]
#
# Env inputs (all required unless noted):
#   COOLIFY_WEBHOOK        Full Coolify deploy webhook URL (server resource)
#   COOLIFY_API_TOKEN      (optional) Coolify API token. When set, the deploy
#                          curl sends `Authorization: Bearer <token>` — some
#                          Coolify versions label the deploy endpoint "Deploy
#                          Webhook (auth required)" and 401 requests without
#                          it (docs/DEPLOYMENT.md §5). When unset, no header
#                          is sent and behavior is exactly as before.
#   PROD_DATABASE_URL      Production PostgreSQL connection string
#   R2_ACCOUNT_ID          Cloudflare account id (R2 S3 endpoint host)
#   R2_ACCESS_KEY_ID       R2 API token access key id
#   R2_SECRET_ACCESS_KEY   R2 API token secret access key
#   R2_BUCKET              R2 bucket name
#   GIT_SHA                Full commit sha being deployed
#   HEALTH_URL             Health endpoint to poll (e.g. https://api.cogitoacademy.id/health)
#   PREV_GIT_SHA           (optional) Previous deployed sha for the rollback hint
#
# Steps:
#   1. pg_dump snapshot of the production database, gzipped.
#   2. Upload to R2 as pre-migrate-<GIT_SHA>.sql.gz (aws CLI, S3 endpoint).
#   3. bun run db:migrate against PROD_DATABASE_URL.
#   4. POST the Coolify deploy webhook.
#   5. Poll HEALTH_URL until `version == GIT_SHA` (bounded 20 x 15s).
#   6. On failure, print a clear rollback hint (previous v<prev-sha> image).
#
# --dry-run prints the steps without executing anything.
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

log() { printf '[migrate-and-deploy] %s\n' "$*"; }
die() { printf '[migrate-and-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    die "$name is unset — required by the CD pipeline. Add it as a GitHub Actions secret."
  fi
}

require_env COOLIFY_WEBHOOK
require_env PROD_DATABASE_URL
require_env R2_ACCOUNT_ID
require_env R2_ACCESS_KEY_ID
require_env R2_SECRET_ACCESS_KEY
require_env R2_BUCKET
require_env GIT_SHA
require_env HEALTH_URL

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
BACKUP_KEY="pre-migrate-${GIT_SHA}.sql.gz"
POLL_ATTEMPTS=20
POLL_INTERVAL_SECONDS=15

# --- 1. Backup: pg_dump snapshot, gzipped --------------------------------
log "1/5 snapshotting production database (pg_dump | gzip)"
if [[ "$DRY_RUN" == "0" ]]; then
  pg_dump --no-owner --no-privileges "$PROD_DATABASE_URL" | gzip > "/tmp/${BACKUP_KEY}"
else
  log "    [dry-run] pg_dump --no-owner --no-privileges \"\$PROD_DATABASE_URL\" | gzip > /tmp/${BACKUP_KEY}"
fi

# --- 2. Upload snapshot to R2 -------------------------------------------
log "2/5 uploading snapshot to R2 (${R2_BUCKET}/${BACKUP_KEY})"
if [[ "$DRY_RUN" == "0" ]]; then
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 cp "/tmp/${BACKUP_KEY}" "s3://${R2_BUCKET}/${BACKUP_KEY}" \
    --endpoint-url "$R2_ENDPOINT"
else
  log "    [dry-run] aws s3 cp /tmp/${BACKUP_KEY} s3://${R2_BUCKET}/${BACKUP_KEY} --endpoint-url ${R2_ENDPOINT}"
fi

# --- 3. Migrate ----------------------------------------------------------
log "3/5 applying database migrations (bun run db:migrate)"
if [[ "$DRY_RUN" == "0" ]]; then
  DATABASE_URL="$PROD_DATABASE_URL" bun run db:migrate
else
  log "    [dry-run] DATABASE_URL=\"\$PROD_DATABASE_URL\" bun run db:migrate"
fi

# --- 4. Deploy: trigger Coolify ------------------------------------------
log "4/5 triggering Coolify deploy"
# Optional Bearer auth: some Coolify versions label the deploy endpoint
# "Deploy Webhook (auth required)" and 401 requests without the header
# (docs/DEPLOYMENT.md §5). Only send the header when COOLIFY_API_TOKEN is
# set — unset behaves exactly as before (no header).
if [[ "$DRY_RUN" == "0" ]]; then
  if [[ -n "${COOLIFY_API_TOKEN:-}" ]]; then
    log "    sending Authorization: Bearer <COOLIFY_API_TOKEN> (set)"
    curl --fail --max-time 30 -X POST \
      -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
      "$COOLIFY_WEBHOOK"
  else
    log "    COOLIFY_API_TOKEN unset — no Authorization header (endpoint must not require auth)"
    curl --fail --max-time 30 -X POST "$COOLIFY_WEBHOOK"
  fi
else
  if [[ -n "${COOLIFY_API_TOKEN:-}" ]]; then
    log "    [dry-run] curl --fail --max-time 30 -X POST -H \"Authorization: Bearer <token>\" \"\$COOLIFY_WEBHOOK\""
  else
    log "    [dry-run] curl --fail --max-time 30 -X POST \"\$COOLIFY_WEBHOOK\""
  fi
fi

# --- 5. Health poll: verify the deployed sha -----------------------------
log "5/5 polling ${HEALTH_URL} until version == ${GIT_SHA} (${POLL_ATTEMPTS} x ${POLL_INTERVAL_SECONDS}s)"
if [[ "$DRY_RUN" == "0" ]]; then
  for i in $(seq 1 "$POLL_ATTEMPTS"); do
    body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
    version="$(printf '%s' "$body" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    if [[ "$version" == "$GIT_SHA" ]]; then
      log "deploy verified: /health version == ${GIT_SHA} (attempt ${i}/${POLL_ATTEMPTS})"
      exit 0
    fi
    log "attempt ${i}/${POLL_ATTEMPTS}: version=${version:-unreachable}, waiting ${POLL_INTERVAL_SECONDS}s"
    sleep "$POLL_INTERVAL_SECONDS"
  done
  if [[ -n "${PREV_GIT_SHA:-}" ]]; then
    die "deployed image did not report version == ${GIT_SHA} within the timeout. ROLLBACK: point the Coolify server resource at the previous immutable image ghcr.io/cogitoacademy/app/server:v${PREV_GIT_SHA} (or use Coolify 'Rollback to previous release'), then re-verify /health. The pre-migrate snapshot is at s3://${R2_BUCKET}/${BACKUP_KEY}."
  else
    die "deployed image did not report version == ${GIT_SHA} within the timeout. ROLLBACK: point the Coolify server resource at the previous immutable image (or use Coolify 'Rollback to previous release'), then re-verify /health. The pre-migrate snapshot is at s3://${R2_BUCKET}/${BACKUP_KEY}."
  fi
else
  log "    [dry-run] poll ${HEALTH_URL} until version == ${GIT_SHA} (bounded ${POLL_ATTEMPTS} x ${POLL_INTERVAL_SECONDS}s)"
  log "dry-run complete — no commands executed"
fi
