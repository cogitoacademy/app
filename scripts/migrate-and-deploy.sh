#!/usr/bin/env bash
#
# migrate-and-deploy.sh — production CD pipeline: backup → migrate → deploy →
# sha-verified health poll, with best-effort auto-rollback and a clear
# rollback hint on failure.
#
# Usage:
#   scripts/migrate-and-deploy.sh [--dry-run]     # full pipeline (API)
#   scripts/migrate-and-deploy.sh --poll-web      # verification-only (web)
#
# Modes:
#   --dry-run     Print every step without executing anything.
#   --poll-web    Verification-only mode used by cd-prod.yml immediately
#                 after it POSTs the Coolify web deploy webhook: poll
#                 HEALTH_URL_WEB for plain HTTP 200 the same bounded way
#                 as the API poll. The backup/migrate/deploy steps are
#                 skipped. A timeout exits 1 with the web rollback hint,
#                 turning CD red on a broken web image.
#
# Env inputs (all required unless noted):
#   COOLIFY_WEBHOOK        Full Coolify deploy webhook URL (server resource)
#   COOLIFY_API_TOKEN      (optional) Coolify API token. When set, the deploy
#                          curl sends `Authorization: Bearer <token>` — some
#                          Coolify versions label the deploy endpoint "Deploy
#                          Webhook (auth required)" and 401 requests without
#                          it (docs/DEPLOYMENT.md §5). When unset, no header
#                          is sent and the deploy behaves exactly as before.
#                          Also required for the F4 auto-rollback (below).
#   COOLIFY_APP_UUID       (optional) Coolify application UUID of the API
#                          resource; when set, the auto-rollback skips the
#                          applications-list domain matching below.
#   COOLIFY_API_BASE_URL   (optional) Coolify public API host used for the
#                          rollback API calls. Default:
#                          https://cl.cogitoacademy.id (canonical Coolify
#                          host since 2026-08-31).
#   PROD_DATABASE_URL      Production PostgreSQL connection string
#   R2_ACCOUNT_ID          Cloudflare account id (R2 S3 endpoint host)
#   R2_ACCESS_KEY_ID       R2 API token access key id
#   R2_SECRET_ACCESS_KEY   R2 API token secret access key
#   R2_BACKUP_BUCKET       PRIVATE bucket for the pre-migrate snapshot
#                          (deliberately separate from the app's public
#                          R2_BUCKET uploads bucket)
#   GIT_SHA                Full commit sha being deployed
#   HEALTH_URL             Health endpoint to poll
#                          (e.g. https://api.cogitoacademy.id/health)
#   HEALTH_URL_WEB         (optional) Web app URL the --poll-web mode polls.
#                          Default: https://app.cogitoacademy.id
#   PREV_GIT_SHA           (optional) Previous deployed sha; drives the
#                          rollback image tag v<PREV_GIT_SHA>
#
# Steps (full mode):
#   1. pg_dump snapshot of the production database, gzipped.
#   2. Upload to R2 as pre-migrate-<GIT_SHA>.sql.gz (aws CLI, S3 endpoint).
#   3. bun run db:migrate against PROD_DATABASE_URL.
#   4. POST the Coolify deploy webhook (API resource).
#   5. Poll HEALTH_URL until `version == GIT_SHA` (bounded 20 x 15s).
#      On timeout: best-effort Coolify API rollback (below), then exit 1.
#
# Web verification (F3, CI-SANITY plan): the web image is static nginx and
# has NO version marker — `GET /health` (with its `version` field) exists
# only on the API image, and the Vite bundle exposes no runtime sha
# endpoint. cd-prod.yml therefore runs this script in --poll-web mode right
# after the Coolify web webhook POST and polls HEALTH_URL_WEB for plain
# HTTP 200 (bounded 20 x 15s). A crash-looping image, a broken nginx config
# or a bundle built with the wrong origin fails the poll and turns CD red
# instead of deploying silently.
#
# Auto-rollback (F4, CI-SANITY plan): when the API health poll times out,
# the script attempts a BEST-EFFORT rollback through the Coolify API:
#
#   1. Resolve the application UUID: env COOLIFY_APP_UUID when set,
#      otherwise GET /api/v1/applications and match the app whose domains
#      (fqdn/domains field) contain the HEALTH_URL host (api.cogitoacademy.id).
#   2. PATCH /api/v1/applications/<uuid> with
#      {"docker_registry_image_tag": "v<PREV_GIT_SHA>"} — the previous
#      immutable GHCR tag.
#   3. POST /api/v1/deploy?uuid=<uuid>&force=false to trigger the redeploy.
#
# Locked decisions & invariants:
#   - Rollback is best-effort and never throws: every step prints its
#     outcome and the script ALWAYS falls through to the manual rollback
#     hint, then still exits 1. A rollback failure never masks the
#     original deploy failure.
#   - The rollback is skipped (with a printed reason) when COOLIFY_API_TOKEN
#     or PREV_GIT_SHA is unset — the manual hint below is the only path then.
#   - Database snapshots are NEVER restored automatically: migration
#     rollback is a reviewed, operator-driven decision. The pre-migrate
#     snapshot is only uploaded (s3://<R2_BACKUP_BUCKET>/pre-migrate-<sha>.sql.gz),
#     never consumed by this script.
set -euo pipefail

# Keep the documented optional override safe under `set -u`. This must be
# initialized before coolify_api() can be called from the failure path.
COOLIFY_API_BASE_URL="${COOLIFY_API_BASE_URL:-https://cl.cogitoacademy.id}"
# Avoid accidental double slashes when an operator supplies a trailing slash.
COOLIFY_API_BASE_URL="${COOLIFY_API_BASE_URL%/}"

DRY_RUN=0
MODE="full"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --poll-web) MODE="poll-web" ;;
    *)
      printf '[migrate-and-deploy] ERROR: unknown argument %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

log() { printf '[migrate-and-deploy] %s\n' "$*"; }
die() { printf '[migrate-and-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    die "$name is unset — required by the CD pipeline. Add it as a GitHub Actions secret."
  fi
}

# ---------------------------------------------------------------------------
# Best-effort Coolify API call (F4). Always returns 0; the caller inspects
# COOLIFY_API_HTTP_CODE/COOLIFY_API_BODY. Args: METHOD PATH [JSON_BODY]
# ---------------------------------------------------------------------------
COOLIFY_API_HTTP_CODE="000"
COOLIFY_API_BODY=""
coolify_api() {
  COOLIFY_API_HTTP_CODE="000"
  COOLIFY_API_BODY=""
  local method="$1" path="$2" body="${3:-}" out
  if [[ -n "$body" ]]; then
    out="$(curl --silent --show-error --max-time 30 -X "$method" \
      -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -w $'\n__HTTP_CODE__%{http_code}' \
      "${COOLIFY_API_BASE_URL}${path}" 2>/dev/null)" || {
      log "coolify-api: ${method} ${path} curl failed (network/timeout)"
      return 0
    }
  else
    out="$(curl --silent --show-error --max-time 30 -X "$method" \
      -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
      -w $'\n__HTTP_CODE__%{http_code}' \
      "${COOLIFY_API_BASE_URL}${path}" 2>/dev/null)" || {
      log "coolify-api: ${method} ${path} curl failed (network/timeout)"
      return 0
    }
  fi
  COOLIFY_API_HTTP_CODE="${out##*__HTTP_CODE__}"
  COOLIFY_API_BODY="${out%$'\n'__HTTP_CODE__*}"
  # A body may legitimately be empty on 2xx (rare) — only code matters.
  return 0
}

# Find the application UUID matching the API public domain. Prints the UUID
# on stdout (empty when no unique match). Reads the list from stdin as JSON.
find_app_uuid() {
  API_HOST="$1" python3 -c '
import json, os, sys
host = os.environ["API_HOST"].strip().lower()
try:
    apps = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if not isinstance(apps, list):
    sys.exit(0)
matches = []
for app in apps:
    if not isinstance(app, dict):
        continue
    domains = str(app.get("fqdn") or app.get("domains") or "")
    for domain in domains.split(","):
        d = domain.strip().lower().rstrip("/")
        if "://" in d:
            d = d.split("://", 1)[1]
        d = d.split("/", 1)[0]
        if d == host:
            matches.append(str(app.get("uuid") or ""))
            break
if len(matches) == 1 and matches[0]:
    print(matches[0])
'
}

# Best-effort auto-rollback (F4): repoint the Coolify API resource at the
# previous immutable image tag and trigger a redeploy. NEVER throws, NEVER
# masks the deploy failure, NEVER touches the database. The caller always
# prints the manual hint afterwards.
attempt_rollback() {
  if [[ -z "${COOLIFY_API_TOKEN:-}" ]]; then
    log "rollback: COOLIFY_API_TOKEN unset — skipping auto-rollback (use the manual hint below)"
    return 0
  fi
  if [[ -z "${PREV_GIT_SHA:-}" ]]; then
    log "rollback: PREV_GIT_SHA unset — cannot determine the previous image tag (use the manual hint below)"
    return 0
  fi
  local prev_tag="v${PREV_GIT_SHA}"
  local uuid="${COOLIFY_APP_UUID:-}"

  if [[ -n "$uuid" ]]; then
    log "rollback: using COOLIFY_APP_UUID=${uuid}"
  else
    local api_host
    api_host="$(printf '%s' "$HEALTH_URL" | sed -n 's#^[A-Za-z][A-Za-z0-9+.\-]*://\([^/?#]*\)/.*#\1#p')"
    if [[ -z "$api_host" ]]; then
      log "rollback: could not derive the API host from HEALTH_URL='${HEALTH_URL}' — set COOLIFY_APP_UUID to enable matching"
      return 0
    fi
    log "rollback: no COOLIFY_APP_UUID — matching the application by domain '${api_host}' (GET /api/v1/applications)"
    coolify_api GET /api/v1/applications
    if [[ "$COOLIFY_API_HTTP_CODE" != 2* || -z "$COOLIFY_API_BODY" ]]; then
      log "rollback: GET /api/v1/applications failed (HTTP ${COOLIFY_API_HTTP_CODE}) — skipping auto-rollback (set COOLIFY_APP_UUID, use the manual hint below)"
      return 0
    fi
    uuid="$(printf '%s' "$COOLIFY_API_BODY" | find_app_uuid "$api_host" || true)"
    if [[ -z "$uuid" ]]; then
      log "rollback: no unique application matched domain '${api_host}' — skipping auto-rollback (set COOLIFY_APP_UUID, use the manual hint below)"
      return 0
    fi
    log "rollback: matched application uuid=${uuid}"
  fi

  log "rollback: PATCH /api/v1/applications/${uuid} → docker_registry_image_tag=${prev_tag}"
  coolify_api PATCH "/api/v1/applications/${uuid}" "{\"docker_registry_image_tag\":\"${prev_tag}\"}"
  if [[ "$COOLIFY_API_HTTP_CODE" != 2* ]]; then
    log "rollback: PATCH failed (HTTP ${COOLIFY_API_HTTP_CODE}) — ${COOLIFY_API_BODY:0:300} — use the manual hint below"
    return 0
  fi
  log "rollback: resource repointed at image tag ${prev_tag} (HTTP ${COOLIFY_API_HTTP_CODE})"

  log "rollback: POST /api/v1/deploy?uuid=${uuid} (trigger redeploy)"
  coolify_api POST "/api/v1/deploy?uuid=${uuid}&force=false"
  if [[ "$COOLIFY_API_HTTP_CODE" != 2* ]]; then
    log "rollback: redeploy trigger failed (HTTP ${COOLIFY_API_HTTP_CODE}) — ${COOLIFY_API_BODY:0:300} — use the manual hint below"
    return 0
  fi
  log "rollback: redeploy queued: ${COOLIFY_API_BODY:0:300}"
  return 0
}

# Bounded HTTP 200 poll for the web surface (F3). Mirrors the API poll's
# attempts x interval shape; returns 1 on timeout (caller decides exit).
poll_web() {
  local url="${HEALTH_URL_WEB:-https://app.cogitoacademy.id}"
  local i code
  for i in $(seq 1 "$POLL_ATTEMPTS"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true)"
    if [[ "$code" == "200" ]]; then
      log "web verified: ${url} returned HTTP 200 (attempt ${i}/${POLL_ATTEMPTS})"
      return 0
    fi
    log "web attempt ${i}/${POLL_ATTEMPTS}: ${url} returned ${code:-unreachable}, waiting ${POLL_INTERVAL_SECONDS}s"
    sleep "$POLL_INTERVAL_SECONDS"
  done
  return 1
}

POLL_ATTEMPTS=20
POLL_INTERVAL_SECONDS=15

MANUAL_WEB_ROLLBACK_HINT="ROLLBACK (manual — the web image has no version marker so the poll only proves HTTP 200): if the new web bundle is wrong/broken, point the Coolify web resource (cogito-web) at the previous immutable image tag"

# --- poll-web mode: verification-only (web deploy POST happened upstream) --
if [[ "$MODE" == "poll-web" ]]; then
  if [[ -z "${HEALTH_URL_WEB:-}" ]]; then
    log "HEALTH_URL_WEB unset — using default https://app.cogitoacademy.id"
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    log "[dry-run] poll ${HEALTH_URL_WEB:-https://app.cogitoacademy.id} for HTTP 200 (bounded ${POLL_ATTEMPTS} x ${POLL_INTERVAL_SECONDS}s)"
    log "dry-run complete — no commands executed"
    exit 0
  fi
  if poll_web; then
    exit 0
  fi
  if [[ -n "${PREV_GIT_SHA:-}" ]]; then
    die "${MANUAL_WEB_ROLLBACK_HINT} ghcr.io/cogitoacademy/app/web:v${PREV_GIT_SHA} (or use Coolify 'Rollback to previous release'), then re-verify ${HEALTH_URL_WEB:-https://app.cogitoacademy.id}. Auto-rollback of the web resource is not automated (it needs a COOLIFY_WEB_APP_UUID secret that does not exist) — the web rollout must be rolled back manually."
  else
    die "${MANUAL_WEB_ROLLBACK_HINT} (previous immutable web image — see GHCR tags), then re-verify ${HEALTH_URL_WEB:-https://app.cogitoacademy.id}."
  fi
fi

# --- full mode: the production API pipeline --------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  log "[dry-run] full pipeline: backup → migrate → deploy → sha-verified health poll"
else
  require_env COOLIFY_WEBHOOK
  require_env PROD_DATABASE_URL
  require_env R2_ACCOUNT_ID
  require_env R2_ACCESS_KEY_ID
  require_env R2_SECRET_ACCESS_KEY
  require_env R2_BACKUP_BUCKET
  require_env GIT_SHA
  require_env HEALTH_URL
fi

R2_ENDPOINT="https://${R2_ACCOUNT_ID:-<account-id>}.r2.cloudflarestorage.com"
BACKUP_KEY="pre-migrate-${GIT_SHA:-<sha>}.sql.gz"

# --- 1. Backup: pg_dump snapshot, gzipped --------------------------------
log "1/6 snapshotting production database (pg_dump | gzip)"
if [[ "$DRY_RUN" == "0" ]]; then
  pg_dump --no-owner --no-privileges "$PROD_DATABASE_URL" | gzip > "/tmp/${BACKUP_KEY}"
else
  log "    [dry-run] pg_dump --no-owner --no-privileges \"\$PROD_DATABASE_URL\" | gzip > /tmp/${BACKUP_KEY}"
fi

# --- 2. Upload snapshot to R2 -------------------------------------------
log "2/6 uploading snapshot to R2 (${R2_BACKUP_BUCKET:-<bucket>}/${BACKUP_KEY})"
if [[ "$DRY_RUN" == "0" ]]; then
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 cp "/tmp/${BACKUP_KEY}" "s3://${R2_BACKUP_BUCKET}/${BACKUP_KEY}" \
    --endpoint-url "$R2_ENDPOINT"
else
  log "    [dry-run] aws s3 cp /tmp/${BACKUP_KEY} s3://${R2_BACKUP_BUCKET:-<bucket>}/${BACKUP_KEY} --endpoint-url ${R2_ENDPOINT}"
fi

# --- 3. Migrate ----------------------------------------------------------
log "3/6 applying database migrations (bun run db:migrate)"
if [[ "$DRY_RUN" == "0" ]]; then
  DATABASE_URL="$PROD_DATABASE_URL" bun run db:migrate
else
  log "    [dry-run] DATABASE_URL=\"\$PROD_DATABASE_URL\" bun run db:migrate"
fi

# --- 4. Deploy: trigger Coolify ------------------------------------------
log "4/6 triggering Coolify deploy"
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
log "5/6 polling ${HEALTH_URL:-https://api.cogitoacademy.id/health} until version == ${GIT_SHA:-<sha>} (${POLL_ATTEMPTS} x ${POLL_INTERVAL_SECONDS}s)"
if [[ "$DRY_RUN" == "0" ]]; then
  poll_ok=0
  for i in $(seq 1 "$POLL_ATTEMPTS"); do
    body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
    version="$(printf '%s' "$body" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    if [[ "$version" == "$GIT_SHA" ]]; then
      log "deploy verified: /health version == ${GIT_SHA} (attempt ${i}/${POLL_ATTEMPTS})"
      poll_ok=1
      break
    fi
    log "attempt ${i}/${POLL_ATTEMPTS}: version=${version:-unreachable}, waiting ${POLL_INTERVAL_SECONDS}s"
    sleep "$POLL_INTERVAL_SECONDS"
  done
  if [[ "$poll_ok" == "0" ]]; then
    # F4: best-effort auto-rollback via the Coolify API. Never throws,
    # never masks the deploy failure, NEVER touches DB snapshots. Manual
    # hint below is always printed regardless of the rollback outcome.
    log "deploy verification FAILED — attempting best-effort auto-rollback to the previous image tag (no DB snapshot is restored automatically)"
    attempt_rollback || true
    if [[ -n "${PREV_GIT_SHA:-}" ]]; then
      die "deployed image did not report version == ${GIT_SHA} within the timeout. ROLLBACK: point the Coolify server resource at the previous immutable image ghcr.io/cogitoacademy/app/server:v${PREV_GIT_SHA} (the auto-rollback above was best-effort — verify it actually took effect in Coolify), then re-verify /health. The pre-migrate snapshot is at s3://${R2_BACKUP_BUCKET}/${BACKUP_KEY} (DB snapshots are NEVER restored automatically)."
    else
      die "deployed image did not report version == ${GIT_SHA} within the timeout. ROLLBACK: point the Coolify server resource at the previous immutable image (or use Coolify 'Rollback to previous release'), then re-verify /health. The pre-migrate snapshot is at s3://${R2_BACKUP_BUCKET}/${BACKUP_KEY} (DB snapshots are NEVER restored automatically)."
    fi
  fi
else
  log "    [dry-run] poll ${HEALTH_URL:-https://api.cogitoacademy.id/health} until version == ${GIT_SHA:-<sha>} (bounded ${POLL_ATTEMPTS} x ${POLL_INTERVAL_SECONDS}s)"
  log "    [dry-run] (6/6 web poll runs in cd-prod.yml via --poll-web after the web webhook POST)"
  log "dry-run complete — no commands executed"
fi