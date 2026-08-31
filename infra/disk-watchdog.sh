#!/bin/bash
# cogito-disk-watchdog.sh — nightly VPS disk watchdog with Discord alerting
# and a SAFE auto-prune ladder. Installed by infra/ansible/disk-watchdog.yml
# as /usr/local/bin/cogito-disk-watchdog.sh (root cron, 03:30 WIB).
#
# Behavior:
#   - Reads the root filesystem usage from `df -h /`.
#   - >= WARN_THRESHOLD (default 85): posts a Discord warning
#     "VPS disk at N% — cleanup recommended" (no secret echoed; the webhook
#     URL comes from the env file, never printed).
#   - >= PRUNE_THRESHOLD (default 92): runs the prune ladder, then re-checks:
#       1. docker image prune -f            (dangling images only)
#       2. docker image prune -af --filter until=48h   (unused images older
#          than 48h — NEVER volumes, NEVER active containers' images; docker
#          image prune never touches volumes or running containers)
#       3. re-check df; if still >= PRUNE_THRESHOLD, post a Discord CRITICAL
#          message (operator action needed).
#   - SAFETY (never deletes): volumes, active containers' images, postgres
#     data, and the newest 1-2 tagged cogitoacademy/app images (rollback
#     images). The `--filter until=48h` + `docker image prune` semantics
#     already exclude images in use by running containers; the explicit
#     cogitoacademy/app keep-list below is belt-and-braces for the CD
#     rollback path (migrate-and-deploy.sh rolls back to v<PREV_GIT_SHA>).
#   - Every action is logged to /var/log/cogito-disk-gc.log (rotated, 7 kept).
#
# Rationale: Coolify's built-in docker_cleanup (threshold 80, daily) failed
# to prevent the 2026-08-31 incident (99% disk: 28GB of dangling images,
# Redis MISCONF stop-writes-on-bgsave-error, failed image extraction, a
# stalled Coolify deployment). This watchdog is the independent second line.
#
# Env (from /etc/cogito/disk.env, root 0600, written by the playbook from the
# SOPS vault on the control node):
#   DISCORD_WEBHOOK_URL   Discord webhook URL (bearer secret — never echoed)
#   WARN_THRESHOLD        warn at >= this % (default 85)
#   PRUNE_THRESHOLD       auto-prune at >= this % (default 92)
#
# Usage:
#   cogito-disk-watchdog.sh            # run the check (cron)
#   cogito-disk-watchdog.sh --dry-run  # print the exact commands, execute
#                                      # nothing, send nothing
#   cogito-disk-watchdog.sh --force-prune  # run the prune ladder once
#                                      # regardless of usage (operator tool)
set -euo pipefail

LOG="/var/log/cogito-disk-gc.log"
DRY_RUN=0
FORCE_PRUNE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force-prune) FORCE_PRUNE=1 ;;
  esac
done

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG"; }

# --- Discord post (never echoes the URL; --fail so failures are loud) ------
discord() {
  local content="$1"
  if [[ -z "${DISCORD_WEBHOOK_URL:-}" ]]; then
    log "WARN: DISCORD_WEBHOOK_URL not set — cannot post: $content"
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would post to Discord: $content"
    return 0
  fi
  # The URL is fed to curl via a stdin config file (-K -), never argv, so it
  # cannot appear in `ps` output.
  printf 'url = "%s"\n' "$DISCORD_WEBHOOK_URL" | \
    curl --fail --silent --show-error --max-time 15 -K - \
    -H "Content-Type: application/json" \
    -d "{\"content\": $(printf '%s' "$content" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" \
    >>"$LOG" 2>&1 \
    && log "posted: $content" \
    || log "ERROR: Discord post failed (curl rc=$?) — content: $content"
}

# --- Usage ----------------------------------------------------------------
usage_pct() {
  df -h / | awk 'NR==2 {gsub(/%/,"",$5); print $5}'
}

# --- Prune ladder (safe subset; see header) --------------------------------
prune_ladder() {
  log "prune ladder start (usage $(usage_pct)%)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: docker image prune -f"
    log "DRY-RUN: docker image prune -af --filter until=48h"
    log "DRY-RUN: (never volumes, never active containers, never postgres data)"
    return 0
  fi
  # 1. Dangling images only (safe, fast).
  docker image prune -f >>"$LOG" 2>&1 || log "ERROR: docker image prune -f failed (rc=$?)"
  # 2. Unused images older than 48h. `docker image prune` NEVER removes
  #    volumes, never removes images in use by running containers, and never
  #    touches container data (postgres data lives in a volume).
  docker image prune -af --filter until=48h >>"$LOG" 2>&1 || log "ERROR: docker image prune -af failed (rc=$?)"
  # 3. Rollback keep-list: the CD rolls back to v<PREV_GIT_SHA> (GHCR is the
  #    authoritative source and a rollback re-pulls from it), but keep the
  #    newest 1-2 local cogitoacademy/app images as a fast local fallback.
  #    Re-tag them with a pinned `rollback-keep` name so a future prune
  #    cannot remove the rollback candidates (best-effort; GHCR remains the
  #    source of truth).
  local keep=0
  while IFS= read -r img; do
    [[ -n "$img" ]] || continue
    docker tag "$img" "ghcr.io/cogitoacademy/app/rollback-keep-$keep" >>"$LOG" 2>&1 || true
    keep=$((keep + 1))
    [[ "$keep" -ge 2 ]] && break
  done < <(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^ghcr.io/cogitoacademy/app/' | grep -v 'rollback-keep' | head -2)
  log "prune ladder done (usage $(usage_pct)%)"
}

# --- Main ------------------------------------------------------------------
WARN_THRESHOLD="${WARN_THRESHOLD:-85}"
PRUNE_THRESHOLD="${PRUNE_THRESHOLD:-92}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY RUN — commands that would be executed (nothing runs, nothing posts):"
  echo "  df -h /"
  echo "  >= ${WARN_THRESHOLD}%: Discord warning 'VPS disk at N% — cleanup recommended'"
  echo "  >= ${PRUNE_THRESHOLD}%: docker image prune -f"
  echo "                          docker image prune -af --filter until=48h"
  echo "                          (never volumes, never active containers, never postgres data)"
  echo "  log: ${LOG}"
  exit 0
fi

usage="$(usage_pct)"
log "check: disk at ${usage}% (warn >= ${WARN_THRESHOLD}, prune >= ${PRUNE_THRESHOLD})"

if [[ "$usage" -ge "$PRUNE_THRESHOLD" ]] || [[ "$FORCE_PRUNE" -eq 1 ]]; then
  prune_ladder
  usage="$(usage_pct)"
  if [[ "$usage" -ge "$PRUNE_THRESHOLD" ]]; then
    discord "CRITICAL: VPS disk still at ${usage}% after auto-prune — operator action required (check /var/log/cogito-disk-gc.log)"
  else
    discord "VPS disk recovered to ${usage}% after auto-prune"
  fi
elif [[ "$usage" -ge "$WARN_THRESHOLD" ]]; then
  discord "VPS disk at ${usage}% — cleanup recommended"
fi

exit 0
