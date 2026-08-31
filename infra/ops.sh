#!/usr/bin/env bash
# ops.sh — Cogito production ops toolbox: DB, Redis, Drizzle Studio, DLQ,
# backups, logs, health — all through a single command. No long command
# chains to remember; credentials are resolved from the live environment on
# the VPS, never hardcoded and never logged.
#
# Usage (all commands run against production via SSH):
#   ./ops.sh health           # /health + scheduler + DLQ summary
#   ./ops.sh status           # containers, RAM, health, DLQ at a glance
#   ./ops.sh db               # psql shell into the production database
#   ./ops.sh db "SELECT 1"    # run one SQL query
#   ./ops.sh redis            # redis-cli shell (no auth prompt)
#   ./ops.sh redis LLEN cogito:dlq   # run one redis command
#   ./ops.sh dlq              # show the DLQ entries (what failed)
#   ./ops.sh dlq-clear        # clear the DLQ ledger (DEL cogito:dlq)
#   ./ops.sh studio           # Drizzle Studio GUI via SSH tunnel
#   ./ops.sh logs [lines]     # tail the API container logs
#   ./ops.sh backup           # run the nightly backup script manually
#   ./ops.sh disk             # disk usage at a glance (df, docker system df,
#                             # top containers by size)
#   ./ops.sh deploy-retry     # re-run the last CD deploy (gh run rerun, or
#                             # POST the Coolify deploy webhook with Bearer)
#   ./ops.sh tunnel 5433      # forward a port (default 5433→5432 local)
#
# Env (optional overrides):
#   OPS_VPS       VPS host (default: 15.235.186.159)
#   OPS_SSH_KEY   SSH private key (default: ~/.ssh/cogito_vps)
#   OPS_SSH_USER  SSH user (default: ubuntu)
set -euo pipefail

OPS_VPS="${OPS_VPS:-15.235.186.159}"
OPS_SSH_KEY="${OPS_SSH_KEY:-$HOME/.ssh/cogito_vps}"
OPS_SSH_USER="${OPS_SSH_USER:-ubuntu}"
SSH=(ssh -i "$OPS_SSH_KEY" -o ConnectTimeout=8 -o BatchMode=yes "$OPS_SSH_USER@$OPS_VPS")

# Container names — resolved live so drift doesn't break the toolbox.
api_container() { "${SSH[@]}" "sudo -n docker ps --format '{{.Names}}' | grep -E '^6ophpbzmsblhvetxi47gqd7e' | head -1"; }
redis_container() { "${SSH[@]}" "sudo -n docker ps --format '{{.Names}}' | grep -E '^qyzco4bhefhtet1luvpfwsnx' | head -1"; }
db_container() { "${SSH[@]}" "sudo -n docker ps --format '{{.Names}}' | grep -E '^noxeaeuxfreq0axa9unpew5r' | head -1"; }

redis_auth() {
  # Redis password lives in the container env — resolve it on the VPS, never show it.
  "${SSH[@]}" "sudo -n docker exec $(redis_container) env 2>/dev/null | grep -iE 'REDIS_PASSWORD|requirepass' | head -1 | cut -d= -f2-"
}

health() {
  echo "=== /health ==="
  curl -s --max-time 8 https://api.cogitoacademy.id/health | python3 -m json.tool 2>/dev/null || curl -s --max-time 8 https://api.cogitoacademy.id/health
}

status() {
  health
  echo ""
  echo "=== containers ==="
  "${SSH[@]}" "sudo -n docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | head -15"
  echo ""
  echo "=== RAM ==="
  "${SSH[@]}" "free -m | head -3"
  echo ""
  echo "=== DLQ ==="
  local pass
  pass="$(redis_auth)"
  "${SSH[@]}" "sudo -n docker exec $(redis_container) redis-cli -a \"$pass\" LLEN cogito:dlq 2>/dev/null"
}

db() {
  local dbc dbname
  dbc="$(db_container)"
  dbname="${OPS_DB_NAME:-cogito}"
  if [[ $# -eq 0 ]]; then
    "${SSH[@]}" "sudo -n docker exec -it $dbc psql -U postgres -d $dbname"
  else
    "${SSH[@]}" "sudo -n docker exec $dbc psql -U postgres -d $dbname -c \"$*\""
  fi
}

redis() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  if [[ $# -eq 0 ]]; then
    "${SSH[@]}" "sudo -n docker exec -it $rc redis-cli -a \"$pass\" 2>/dev/null"
  else
    "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" $* 2>/dev/null"
  fi
}

dlq() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  echo "=== DLQ depth ==="
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" LLEN cogito:dlq 2>/dev/null"
  echo "=== entries (most recent first) ==="
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" LRANGE cogito:dlq 0 -1 2>/dev/null | python3 -c \"
import json,sys
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    try:
        j=json.loads(line)
        print('job:', j.get('originalJobId','?'), '| attempts:', j.get('attemptsMade','?'))
        print('  reason:', (j.get('failedReason','') or '')[:200])
    except Exception:
        print(line[:200])
\""
}

dlq_clear() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  echo "Clearing cogito:dlq"
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" DEL cogito:dlq 2>/dev/null"
}

logs() {
  local lines="${1:-200}"
  "${SSH[@]}" "sudo -n docker logs --tail $lines $(api_container) 2>&1"
}

backup() {
  "${SSH[@]}" "sudo -n /usr/local/bin/cogito-backup.sh 2>/dev/null || echo 'backup script not installed yet — run the backup-cron playbook first (see ops/README.md or docs/RUNBOOK.md)'"
}

disk() {
  echo "=== df -h / ==="
  "${SSH[@]}" "df -h /"
  echo ""
  echo "=== docker system df ==="
  "${SSH[@]}" "sudo -n docker system df 2>/dev/null"
  echo ""
  echo "=== top containers by size ==="
  "${SSH[@]}" "sudo -n docker ps -a --format '{{.Names}}\t{{.Size}}' 2>/dev/null | sort -k2 -hr | head -10"
}

deploy_retry() {
  # Re-run the last CD deploy. Two paths:
  #   1. gh run rerun for the most recent failed CD run (the 'CD red but box
  #      recovered' case — re-running is SAFE: snapshot/migrate/deploy are
  #      idempotent, see docs/RUNBOOK.md → Monitoring → Redeploy/retry).
  #   2. If no CD run is available (or gh is not authed), POST the Coolify
  #      deploy webhook directly with the Bearer token from the SOPS vault.
  #      The webhook URL is a GitHub secret (COOLIFY_PROD_SERVER_WEBHOOK) —
  #      resolve it from the vault COOLIFY_API_TOKEN + the resource UUID via
  #      the Coolify API; never echo the token.
  local run_id
  run_id="$(gh run list --workflow=cd-prod.yml --limit 1 --json databaseId,conclusion --jq '.[0].databaseId' 2>/dev/null || true)"
  if [[ -n "$run_id" ]]; then
    echo "Re-running the last CD run (id=$run_id) — snapshot/migrate/deploy are idempotent, safe to re-run."
    gh run rerun "$run_id"
    return 0
  fi
  echo "No CD run found via gh — falling back to the Coolify deploy webhook."
  local token uuid
  token="$(sops -d infra/secrets/prod.env 2>/dev/null | grep '^COOLIFY_API_TOKEN=' | cut -d= -f2- || true)"
  if [[ -z "$token" ]]; then
    echo "ERROR: COOLIFY_API_TOKEN not in the SOPS vault — cannot retry the deploy." >&2
    return 1
  fi
  # Resolve the cogito-api resource UUID live (never hardcode it).
  uuid="$(curl -s --max-time 8 http://localhost:8000/api/v1/applications -H "Authorization: Bearer $token" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print([a['uuid'] for a in d if a.get('name')=='cogito-api'][0])" 2>/dev/null || true)"
  if [[ -z "$uuid" ]]; then
    echo "ERROR: could not resolve the cogito-api UUID (is the Coolify tunnel up? ssh -L 8000:127.0.0.1:8000 ...)." >&2
    return 1
  fi
  echo "POSTing the deploy webhook for cogito-api (uuid=$uuid) — token never echoed."
  curl --fail --silent --show-error --max-time 30 \
    -X POST "https://cl.cogitoacademy.id/api/v1/deploy?uuid=$uuid&force=false" \
    -H "Authorization: Bearer $token"
  echo ""
  echo "Deploy queued — verify: curl -s https://api.cogitoacademy.id/health (version must match the intended sha)."
}

studio() {
  local port="${1:-5433}"
  local dbc pass
  dbc="$(db_container)"
  # Resolve the postgres password on the VPS (never shown locally)
  pass="$("${SSH[@]}" "sudo -n docker exec $dbc env 2>/dev/null | grep '^POSTGRES_PASSWORD=' | cut -d= -f2-")"
  [[ -n "$pass" ]] || { echo "ERROR: could not resolve POSTGRES_PASSWORD on the VPS" >&2; exit 1; }
  echo "=== Starting Drizzle Studio via SSH tunnel ==="
  echo "Tunneling: localhost:$port → VPS → $dbc:5432"
  # 1. start the tunnel in the background
  ssh -i "$OPS_SSH_KEY" -o ConnectTimeout=8 -o BatchMode=yes -N -L "$port:localhost:5432" "$OPS_SSH_USER@$OPS_VPS" &
  local tunnel_pid=$!
  trap 'kill $tunnel_pid 2>/dev/null' EXIT
  sleep 2
  # 2. run drizzle studio pointing at the tunnel
  echo "Open http://localhost:4983 in your browser once studio starts."
  DATABASE_URL="postgresql://postgres:$pass@localhost:$port/cogito" bun run db:studio
}

tunnel() {
  local port="${1:-5433}"
  echo "Tunneling localhost:$port → VPS → postgres:5432 (Ctrl+C to stop)"
  ssh -i "$OPS_SSH_KEY" -o ConnectTimeout=8 "$OPS_SSH_USER@$OPS_VPS" -N -L "$port:localhost:5432"
}

usage() {
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
}

case "${1:-}" in
  health) health ;;
  status) status ;;
  db) shift; db "$@" ;;
  redis) shift; redis "$@" ;;
  dlq) dlq ;;
  dlq-clear) dlq_clear ;;
  logs) shift; logs "${1:-}" ;;
  backup) backup ;;
  disk) disk ;;
  deploy-retry) deploy_retry ;;
  studio) shift; studio "${1:-}" ;;
  tunnel) shift; tunnel "${1:-}" ;;
  help|-h|--help) usage ;;
  *) echo "Unknown command: ${1:-}"; usage; exit 1 ;;
esac
